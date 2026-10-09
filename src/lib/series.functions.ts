import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify } from "@/lib/pdga-data";
import {
  DEFAULT_SERIES_POINTS,
  pointsForPosition,
  pointsForResult,
  seriesStandings,
  type SeriesSettings,
  type SeriesStandingRow,
} from "@/lib/competition-model";
import type { SeriesStopStats } from "@/lib/series-results.server";

export type SeriesSummary = {
  id: string;
  name: string;
  slug: string;
  season: string | null;
  year: number | null;
  status: string;
  visibility: string;
  sanction_level: string;
  points_system: string;
  counting_events: number | null;
  drop_worst: number;
  stop_count: number;
};

const pointsTable = z.array(z.coerce.number().int().min(0)).min(1).max(64);

/** Series a director owns, for the wizard picker and the director list. */
export const listMySeries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SeriesSummary[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("event_series")
      .select(
        "id, name, slug, season, year, status, visibility, sanction_level, points_system, counting_events, drop_worst",
      )
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (!rows.length) return [];

    const ids = rows.map((r) => r.id);
    const [{ data: tRows }, { data: lRows }] = await Promise.all([
      supabase.from("tournaments").select("series_id").in("series_id", ids),
      supabase.from("leagues").select("series_id").in("series_id", ids),
    ]);
    const counts = new Map<string, number>();
    for (const r of [...(tRows ?? []), ...(lRows ?? [])]) {
      if (r.series_id) counts.set(r.series_id, (counts.get(r.series_id) ?? 0) + 1);
    }
    return rows.map((r) => ({ ...r, stop_count: counts.get(r.id) ?? 0 }));
  });

export const createSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(140),
        description: z.string().trim().max(2000).optional().nullable(),
        season: z.string().trim().max(40).optional().nullable(),
        sanction_level: z.enum(["pdga", "unsanctioned", "casual"]).default("unsanctioned"),
        points_system: z.enum(["standard", "pdga_points", "custom", "field_size"]).default("standard"),
        points_table: pointsTable.optional(),
        counting_events: z.coerce.number().int().min(1).max(60).optional().nullable(),
        drop_worst: z.coerce.number().int().min(0).max(20).default(0),
        visibility: z.enum(["public", "private"]).default("public"),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const slug = `${slugify(data.name)}-${Math.random().toString(36).slice(2, 6)}`;
    const { data: created, error } = await supabase
      .from("event_series")
      .insert({
        owner_id: userId,
        name: data.name,
        slug,
        description: data.description ?? null,
        season: data.season ?? null,
        year: new Date().getFullYear(),
        sanction_level: data.sanction_level,
        points_system: data.points_system,
        points_table: (data.points_table ?? DEFAULT_SERIES_POINTS) as never,
        counting_events: data.counting_events ?? null,
        drop_worst: data.drop_worst,
        visibility: data.visibility,
        status: "active",
      })
      .select("id, slug")
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export type SeriesStopRow = {
  id: string;
  kind: "tournament" | "league";
  name: string;
  slug: string;
  date: string | null;
  status: string;
  /** Tournament end date or league season end. */
  end_date?: string | null;
  /** League nights, each with its own schedule and details. */
  nights?: Array<{
    id: string;
    week_number: number;
    name: string | null;
    event_date: string;
    start_time: string | null;
    details: string | null;
    status: string;
    course_name: string | null;
  }>;
  /** "none" | "single" | "multiple" courses across the stop's nights. */
  venue?: { kind: "none" | "single" | "multiple"; name: string | null };
  /** Winner per division once results post. */
  winners?: Array<{ division: string | null; player_id: string; player_name: string }>;
  /** Where to sign up: external link if set, else the event page. */
  registration?: { url: string | null; opens: string | null; closes: string | null };
};

export type SeriesPlayerResult = {
  player_id: string;
  player_name: string;
  event_id: string;
  event_name: string;
  division: string | null;
  position: number;
  field_size: number | null;
  points: number;
  strokes: number | null;
  par: number | null;
};

export type SeriesDetail = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  season: string | null;
  status: string;
  sanction_level: string;
  settings: SeriesSettings;
  stops: SeriesStopRow[];
  standings: SeriesStandingRow[];
  /** Derived from linked events unless explicit season dates are set. */
  first_date: string | null;
  last_date: string | null;
  event_count: number;
  finale: { id: string; name: string; slug: string; kind: "tournament" | "league"; date: string | null } | null;
  host: string | null;
  owner_id: string | null;
  results: SeriesPlayerResult[];
};

/** Public series page: stops plus computed standings with worst results dropped. */
export const getSeries = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => z.object({ slug: z.string().trim().min(1) }).parse(raw))
  .handler(async ({ data }): Promise<SeriesDetail | null> => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );

    const { data: s, error } = await supabase
      .from("event_series")
      .select(
        "id, name, slug, description, season, status, sanction_level, points_system, points_table, counting_events, drop_worst, field_size_bonus, min_event_points, division_change, finale_event_id, finale_multiplier, participation_bonus, qualify_min_events, award_places, season_start, season_end, club_id, owner_id, host_name",
      )
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!s) return null;

    const settings: SeriesSettings = {
      points_system: (s.points_system as SeriesSettings["points_system"]) ?? "standard",
      points_table: Array.isArray(s.points_table)
        ? (s.points_table as number[])
        : DEFAULT_SERIES_POINTS,
      counting_events: s.counting_events ?? null,
      drop_worst: s.drop_worst ?? 0,
      field_size_bonus: s.field_size_bonus ?? 5,
      min_event_points: s.min_event_points ?? 5,
      division_change: ((s as any).division_change as "separate" | "carry") ?? "separate",
      finale_event_id: s.finale_event_id ?? null,
      finale_multiplier: Number((s as any).finale_multiplier ?? 1),
      participation_bonus: (s as any).participation_bonus ?? 0,
      qualify_min_events: (s as any).qualify_min_events ?? 0,
      award_places: (s as any).award_places ?? 0,
    };

    const [{ data: tours }, { data: leagues }] = await Promise.all([
      supabase
        .from("tournaments")
        .select("id, name, slug, start_date, end_date, status, registration_url, dgs_event_url, registration_opens, registration_closes")
        .eq("series_id", s.id)
        .order("start_date", { ascending: true }),
      supabase
        .from("leagues")
        .select("id, name, slug, start_date, status, registration_opens, registration_closes")
        .eq("series_id", s.id)
        .order("start_date", { ascending: true }),
    ]);

    const leagueIds = (leagues ?? []).map((l) => l.id);
    const { data: nightRows } = leagueIds.length
      ? await supabase
          .from("league_events")
          .select("id, league_id, week_number, name, event_date, start_time, details, status, course_id")
          .in("league_id", leagueIds)
          .order("event_date", { ascending: true })
      : { data: [] };
    const courseIds = [...new Set((nightRows ?? []).map((n) => n.course_id).filter(Boolean))] as string[];
    const { data: courseRows } = courseIds.length
      ? await supabase.from("courses").select("id, name").in("id", courseIds)
      : { data: [] };
    const courseName = new Map((courseRows ?? []).map((c) => [c.id, c.name as string]));
    const nightsByLeague = new Map<string, NonNullable<SeriesStopRow["nights"]>>();
    for (const n of nightRows ?? []) {
      const list = nightsByLeague.get(n.league_id) ?? [];
      list.push({
        id: n.id,
        week_number: n.week_number,
        name: n.name ?? null,
        event_date: n.event_date,
        start_time: n.start_time ?? null,
        details: n.details ?? null,
        status: n.status ?? "scheduled",
        course_name: n.course_id ? (courseName.get(n.course_id) ?? null) : null,
      });
      nightsByLeague.set(n.league_id, list);
    }

    const stops: SeriesStopRow[] = [
      ...(tours ?? []).map((t) => ({
        id: t.id,
        kind: "tournament" as const,
        name: t.name,
        slug: t.slug,
        date: t.start_date ?? null,
        end_date: (t as { end_date?: string | null }).end_date ?? null,
        status: t.status ?? "draft",
        registration: {
          url: (t as any).registration_url ?? (t as any).dgs_event_url ?? null,
          opens: (t as any).registration_opens ?? null,
          closes: (t as any).registration_closes ?? null,
        },
      })),
      ...(leagues ?? []).map((l) => ({
        registration: { url: null, opens: (l as any).registration_opens ?? null, closes: (l as any).registration_closes ?? null },
        id: l.id,
        kind: "league" as const,
        name: l.name,
        slug: l.slug,
        date: l.start_date ?? null,
        status: l.status ?? "draft",
        nights: nightsByLeague.get(l.id) ?? [],
        venue: (() => {
          const names = [
            ...new Set(
              (nightsByLeague.get(l.id) ?? [])
                .filter((n) => n.status !== "cancelled" && n.course_name)
                .map((n) => n.course_name as string),
            ),
          ];
          return names.length === 0
            ? { kind: "none" as const, name: null }
            : names.length === 1
              ? { kind: "single" as const, name: names[0] }
              : { kind: "multiple" as const, name: null };
        })(),
      })),
    ].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

    const { computeSeriesResults } = await import("@/lib/series-results.server");
    const { results } = await computeSeriesResults(
      supabase,
      (tours ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        date: t.start_date ?? null,
        status: t.status ?? "draft",
      })),
      (leagues ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        slug: l.slug,
        date: l.start_date ?? null,
        status: l.status ?? "draft",
      })),
    );

    const scoredResults: SeriesPlayerResult[] = results.map((r) => ({
      player_id: r.player_id,
      player_name: r.player_name,
      event_id: r.event_id,
      event_name: r.event_name,
      division: r.division ?? null,
      position: r.position,
      field_size: r.field_size ?? null,
      points: pointsForResult(r, settings),
      strokes: r.strokes ?? null,
      par: r.par ?? null,
    }));
    for (const stop of stops) {
      stop.winners = scoredResults
        .filter((r) => r.event_id === stop.id && r.position === 1)
        .map((r) => ({ division: r.division, player_id: r.player_id, player_name: r.player_name }));
    }

    return {
      id: s.id,
      owner_id: (s as any).owner_id ?? null,
      results: scoredResults,
      name: s.name,
      slug: s.slug,
      description: s.description ?? null,
      season: s.season ?? null,
      status: s.status ?? "active",
      sanction_level: s.sanction_level ?? "unsanctioned",
      settings,
      stops,
      standings: seriesStandings(results, settings),
      ...(await (async () => {
        const dates = stops.flatMap((x) => [x.date, x.end_date ?? null]).filter(Boolean) as string[];
        dates.sort();
        const f = s.finale_event_id ? stops.find((x) => x.id === s.finale_event_id) : undefined;
        let host: string | null = (s as any).host_name ?? null;
        if (s.club_id) {
          const { data: club } = await supabase.from("clubs").select("name").eq("id", s.club_id).maybeSingle();
          host = club?.name ?? host;
        }
        return {
          first_date: s.season_start ?? dates[0] ?? null,
          last_date: s.season_end ?? dates[dates.length - 1] ?? null,
          event_count: stops.length,
          finale: f ? { id: f.id, name: f.name, slug: f.slug, kind: f.kind, date: f.date } : null,
          host,
        };
      })()),
    };
  });


/* ------------------------------------------------------------------ *
 * Linking existing events into a series
 * ------------------------------------------------------------------ */

export type LinkableEvent = {
  id: string;
  kind: "tournament" | "league";
  name: string;
  slug: string;
  date: string | null;
  status: string;
  series_id: string | null;
};

/** Every tournament and league the signed-in director owns, with its series link. */
export const listLinkableEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LinkableEvent[]> => {
    const { supabase, userId } = context;
    const [{ data: tours, error: tErr }, { data: leagues, error: lErr }] = await Promise.all([
      supabase
        .from("tournaments")
        .select("id, name, slug, start_date, status, series_id")
        .eq("owner_id", userId)
        .order("start_date", { ascending: false }),
      supabase
        .from("leagues")
        .select("id, name, slug, start_date, status, series_id")
        .eq("owner_id", userId)
        .order("start_date", { ascending: false }),
    ]);
    if (tErr) throw new Error(tErr.message);
    if (lErr) throw new Error(lErr.message);

    return [
      ...(tours ?? []).map((t) => ({
        id: t.id,
        kind: "tournament" as const,
        name: t.name,
        slug: t.slug,
        date: t.start_date ?? null,
        status: t.status ?? "draft",
        series_id: t.series_id ?? null,
      })),
      ...(leagues ?? []).map((l) => ({
        id: l.id,
        kind: "league" as const,
        name: l.name,
        slug: l.slug,
        date: l.start_date ?? null,
        status: l.status ?? "draft",
        series_id: l.series_id ?? null,
      })),
    ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  });

/** Attach an existing event to a series, or detach it when series_id is null. */
export const setEventSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        kind: z.enum(["tournament", "league"]),
        event_id: z.string().uuid(),
        series_id: z.string().uuid().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (data.series_id) {
      const { data: series, error: sErr } = await supabase
        .from("event_series")
        .select("id")
        .eq("id", data.series_id)
        .eq("owner_id", userId)
        .maybeSingle();
      if (sErr) throw new Error(sErr.message);
      if (!series) throw new Error("You can only link events to a series you run.");
    }

    const table = data.kind === "tournament" ? "tournaments" : "leagues";
    const { data: updated, error } = await supabase
      .from(table)
      .update({ series_id: data.series_id })
      .eq("id", data.event_id)
      .eq("owner_id", userId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("That event isn't yours to move.");
    return { ok: true as const };
  });

/* ------------------------------------------------------------------ *
 * Series reporting
 * ------------------------------------------------------------------ */

export type SeriesReport = {
  id: string;
  name: string;
  slug: string;
  season: string | null;
  status: string;
  settings: SeriesSettings;
  finale_event_id: string | null;
  stops: SeriesStopStats[];
  standings: SeriesStandingRow[];
  totals: {
    stops: number;
    scored_stops: number;
    entries: number;
    unique_players: number;
    points_awarded: number;
    avg_field: number;
  };
};

/** Owner-only reporting for one series: participation, points, and standings. */
export const getSeriesReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ series_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }): Promise<SeriesReport | null> => {
    const { supabase, userId } = context;
    const { data: s, error } = await supabase
      .from("event_series")
      .select(
        "id, name, slug, season, status, points_system, points_table, counting_events, drop_worst, field_size_bonus, min_event_points, division_change, finale_event_id, finale_multiplier, participation_bonus, qualify_min_events, award_places, season_start, season_end, club_id",
      )
      .eq("id", data.series_id)
      .eq("owner_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!s) return null;

    const settings: SeriesSettings = {
      points_system: (s.points_system as SeriesSettings["points_system"]) ?? "standard",
      points_table: Array.isArray(s.points_table)
        ? (s.points_table as number[])
        : DEFAULT_SERIES_POINTS,
      counting_events: s.counting_events ?? null,
      drop_worst: s.drop_worst ?? 0,
      field_size_bonus: s.field_size_bonus ?? 5,
      min_event_points: s.min_event_points ?? 5,
      division_change: ((s as any).division_change as "separate" | "carry") ?? "separate",
      finale_event_id: s.finale_event_id ?? null,
      finale_multiplier: Number((s as any).finale_multiplier ?? 1),
      participation_bonus: (s as any).participation_bonus ?? 0,
      qualify_min_events: (s as any).qualify_min_events ?? 0,
      award_places: (s as any).award_places ?? 0,
    };

    const [{ data: tours }, { data: leagues }] = await Promise.all([
      supabase
        .from("tournaments")
        .select("id, name, slug, start_date, status")
        .eq("series_id", s.id),
      supabase.from("leagues").select("id, name, slug, start_date, status").eq("series_id", s.id),
    ]);

    const { computeSeriesResults } = await import("@/lib/series-results.server");
    const { results, stops } = await computeSeriesResults(
      supabase,
      (tours ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        date: t.start_date ?? null,
        status: t.status ?? "draft",
      })),
      (leagues ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        slug: l.slug,
        date: l.start_date ?? null,
        status: l.status ?? "draft",
      })),
    );

    // Points awarded per stop, under this series' points table.
    for (const stop of stops) {
      stop.points_awarded = results
        .filter((r) => r.event_id === stop.id)
        .reduce((sum, r) => sum + pointsForResult(r, settings), 0);
    }

    const scoredStops = stops.filter((st) => st.scored_players > 0);
    const entries = stops.reduce((sum, st) => sum + st.entries, 0);
    const standings = seriesStandings(results, settings);

    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      season: s.season ?? null,
      status: s.status ?? "active",
      settings,
      finale_event_id: (s.finale_event_id as string | null) ?? null,
      stops,
      standings,
      totals: {
        stops: stops.length,
        scored_stops: scoredStops.length,
        entries,
        unique_players: standings.length,
        points_awarded: stops.reduce((sum, st) => sum + st.points_awarded, 0),
        avg_field: scoredStops.length
          ? Math.round(
              scoredStops.reduce((sum, st) => sum + st.scored_players, 0) / scoredStops.length,
            )
          : 0,
      },
    };
  });

/** Director: scoring rules + finale for a series. RLS limits this to owners/club managers. */
export const updateSeriesScoring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        points_system: z.enum(["standard", "pdga_points", "custom", "field_size"]),
        field_size_bonus: z.coerce.number().int().min(0).max(50),
        min_event_points: z.coerce.number().int().min(0).max(100),
        division_change: z.enum(["separate", "carry"]).default("separate"),
        drop_worst: z.coerce.number().int().min(0).max(20),
        counting_events: z.coerce.number().int().min(1).max(60).nullable(),
        finale_event_id: z.string().uuid().nullable(),
        finale_multiplier: z.coerce.number().min(1).max(5).default(1),
        participation_bonus: z.coerce.number().int().min(0).max(100).default(0),
        qualify_min_events: z.coerce.number().int().min(0).max(60).default(0),
        award_places: z.coerce.number().int().min(0).max(50).default(0),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.finale_event_id) {
      const [{ data: t }, { data: l }] = await Promise.all([
        supabase.from("tournaments").select("id").eq("id", data.finale_event_id).eq("series_id", data.id).maybeSingle(),
        supabase.from("leagues").select("id").eq("id", data.finale_event_id).eq("series_id", data.id).maybeSingle(),
      ]);
      if (!t && !l) throw new Error("The finale must be an event in this series.");
    }
    const { id, ...patch } = data;
    const { data: row, error } = await supabase
      .from("event_series")
      .update(patch)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Couldn't save the scoring rules.");
    if (!row) throw new Error("Only the series organizer can change its scoring.");
    return { ok: true };
  });

export type PublicSeriesCard = {
  id: string;
  name: string;
  slug: string;
  season: string | null;
  description: string | null;
  host: string | null;
  tournaments: number;
  leagues: number;
  first_date: string | null;
  last_date: string | null;
  finale_name: string | null;
  status: string;
};

/** Public directory of every public series — tournament series and league series. */
export const listPublicSeries = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicSeriesCard[]> => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: rows, error } = await supabase
      .from("event_series")
      .select("id, name, slug, season, description, status, host_name, club_id, finale_event_id, season_start, season_end")
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("Couldn't load series right now.");
    const list = rows ?? [];
    if (!list.length) return [];
    const ids = list.map((s) => s.id);
    const clubIds = [...new Set(list.map((s) => s.club_id).filter(Boolean))] as string[];
    const [{ data: tours }, { data: leagues }, { data: clubs }] = await Promise.all([
      supabase.from("tournaments").select("id, name, series_id, start_date, end_date").in("series_id", ids),
      supabase.from("leagues").select("id, name, series_id, start_date, end_date").in("series_id", ids),
      clubIds.length ? supabase.from("clubs").select("id, name").in("id", clubIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const clubName = new Map((clubs ?? []).map((c) => [c.id, c.name as string]));
    return list.map((s) => {
      const t = (tours ?? []).filter((x) => x.series_id === s.id);
      const l = (leagues ?? []).filter((x) => x.series_id === s.id);
      const dates = [...t, ...l].flatMap((x: any) => [x.start_date, x.end_date]).filter(Boolean).sort() as string[];
      const finale = [...t, ...l].find((x) => x.id === s.finale_event_id);
      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        season: s.season ?? null,
        description: s.description ?? null,
        host: (s.club_id && clubName.get(s.club_id)) || s.host_name || null,
        tournaments: t.length,
        leagues: l.length,
        first_date: s.season_start ?? dates[0] ?? null,
        last_date: s.season_end ?? dates[dates.length - 1] ?? null,
        finale_name: finale?.name ?? null,
        status: s.status ?? "active",
      };
    });
  },
);

/** Director: start next season from an existing series — same rules and host, no events. */
export const copySeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), name: z.string().trim().min(2).max(140), season: z.string().trim().max(40).nullable() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: src } = await supabase.from("event_series").select("*").eq("id", data.id).maybeSingle();
    if (!src) throw new Error("Couldn't find that series.");
    if (src.owner_id !== userId) {
      const ok = src.club_id
        ? (await supabase.rpc("can_manage_club" as never, { _club_id: src.club_id, _user: userId } as never)).data
        : false;
      if (!ok) throw new Error("Only the series organizer can copy it.");
    }
    const yr = Number((data.season ?? "").match(/\d{4}/)?.[0]) || (src.year ? src.year + 1 : new Date().getFullYear());
    const { data: created, error } = await supabase
      .from("event_series")
      .insert({
        owner_id: userId,
        club_id: src.club_id,
        host_name: src.host_name,
        name: data.name,
        slug: `${slugify(data.name)}-${Math.random().toString(36).slice(2, 6)}`,
        description: src.description,
        season: data.season,
        year: yr,
        sanction_level: src.sanction_level,
        points_system: src.points_system,
        points_table: src.points_table,
        counting_events: src.counting_events,
        drop_worst: src.drop_worst,
        field_size_bonus: src.field_size_bonus,
        min_event_points: src.min_event_points,
        division_change: src.division_change,
        finale_multiplier: src.finale_multiplier,
        participation_bonus: src.participation_bonus,
        qualify_min_events: src.qualify_min_events,
        award_places: src.award_places,
        visibility: src.visibility,
        status: "active",
        copied_from_id: src.id,
      })
      .select("id, slug")
      .single();
    if (error) throw new Error("Couldn't copy the series.");
    return created;
  });
