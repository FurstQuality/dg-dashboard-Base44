/**
 * Planner data — every league night, tournament, and community round inside a
 * date window, normalized to mappable occurrences.
 *
 * Recurring league nights are computed from the league's weekday + season range
 * (see `expandWeekly`), with any published dated league night taking priority
 * for that date.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  boundingBox,
  dayOfWeek,
  expandWeekly,
  haversineMiles,
  isISODate,
  type PlannerKind,
  type PlannerOccurrence,
} from "@/lib/planner";

const PlannerQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kinds: z.array(z.enum(["league", "tournament", "casual"])).optional(),
  dows: z.array(z.number().int().min(0).max(6)).optional(),
  state: z.string().max(4).optional(),
  q: z.string().max(200).optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  radiusMiles: z.number().int().min(1).max(500).nullable().optional(),
});

export type PlannerQueryInput = z.infer<typeof PlannerQuery>;

/** Hard caps keep a wide window from pulling the whole national calendar. */
const LIMITS = { leagues: 300, leagueEvents: 800, tournaments: 500, community: 300, pdga: 800 };

type Geo = { latitude: number | null; longitude: number | null };

type CourseRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
};

function dateOnly(value: string | null): string | null {
  if (!value) return null;
  const iso = value.slice(0, 10);
  return isISODate(iso) ? iso : null;
}

export const listPlannerEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => PlannerQuery.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const window = { from: data.from, to: data.to };
    if (window.from > window.to) return { occurrences: [] as PlannerOccurrence[], unmapped: 0 };

    const wantKind = (k: PlannerKind) => !data.kinds?.length || data.kinds.includes(k);
    const needle = (data.q ?? "").trim().toLowerCase();
    const stateFilter = (data.state ?? "").trim().toUpperCase();

    const courseIds = new Set<string>();
    const out: PlannerOccurrence[] = [];

    /* ---------------- leagues (recurring nights) ---------------- */
    type LeagueRow = {
      id: string;
      name: string;
      slug: string;
      status: string | null;
      season: string | null;
      day_of_week: number | null;
      start_time: string | null;
      start_date: string | null;
      end_date: string | null;
      format: string | null;
      format_family: string | null;
      scoring_mode: string | null;
      entry_fee_cents: number | null;
      course_id: string | null;
      club_id: string | null;
    };
    let leagues: LeagueRow[] = [];
    if (wantKind("league")) {
      const { data: rows, error } = await supabase
        .from("leagues")
        .select(
          "id, name, slug, status, season, day_of_week, start_time, start_date, end_date, format, format_family, scoring_mode, entry_fee_cents, course_id, club_id",
        )
        .neq("status", "cancelled")
        .limit(LIMITS.leagues);
      if (error) throw new Error(error.message);
      leagues = (rows ?? []) as LeagueRow[];
      for (const l of leagues) if (l.course_id) courseIds.add(l.course_id);
    }

    /* ---------------- published league nights ---------------- */
    type LeagueEventRow = {
      id: string;
      league_id: string;
      name: string | null;
      event_date: string | null;
      course_id: string | null;
      status: string | null;
    };
    let leagueEvents: LeagueEventRow[] = [];
    if (leagues.length) {
      const { data: rows } = await supabase
        .from("league_events")
        .select("id, league_id, name, event_date, course_id, status")
        .in(
          "league_id",
          leagues.map((l) => l.id),
        )
        .gte("event_date", window.from)
        .lte("event_date", window.to)
        .limit(LIMITS.leagueEvents);
      leagueEvents = (rows ?? []) as LeagueEventRow[];
      for (const e of leagueEvents) if (e.course_id) courseIds.add(e.course_id);
    }

    /* ---------------- tournaments ---------------- */
    type TournamentRow = {
      id: string;
      name: string;
      slug: string;
      start_date: string | null;
      end_date: string | null;
      location: string | null;
      status: string | null;
      pdga_tier: string | null;
      pdga_sanctioned: boolean | null;
      entry_fee_cents: number | null;
      course_id: string | null;
      format: string | null;
      scoring_mode: string | null;
    } & Geo;
    let tournaments: TournamentRow[] = [];
    if (wantKind("tournament")) {
      const { data: rows, error } = await supabase
        .from("tournaments")
        .select(
          "id, name, slug, start_date, end_date, location, status, pdga_tier, pdga_sanctioned, entry_fee_cents, course_id, format, scoring_mode, latitude, longitude",
        )
        .lte("start_date", window.to)
        .gte("end_date", window.from)
        .limit(LIMITS.tournaments);
      if (error) throw new Error(error.message);
      tournaments = (rows ?? []) as TournamentRow[];
      for (const t of tournaments) if (t.course_id) courseIds.add(t.course_id);
    }

    /* ---------------- community events ---------------- */
    type CommunityRow = {
      id: string;
      title: string;
      kind: string | null;
      starts_at: string | null;
      ends_at: string | null;
      location: string | null;
      status: string | null;
      course_id: string | null;
    } & Geo;
    let community: CommunityRow[] = [];
    if (wantKind("casual")) {
      const { data: rows } = await supabase
        .from("community_events")
        .select(
          "id, title, kind, starts_at, ends_at, location, status, course_id, latitude, longitude",
        )
        .gte("starts_at", `${window.from}T00:00:00Z`)
        .lte("starts_at", `${window.to}T23:59:59Z`)
        .limit(LIMITS.community);
      community = (rows ?? []) as CommunityRow[];
      for (const c of community) if (c.course_id) courseIds.add(c.course_id);
    }

    /* ---------------- PDGA mirror ---------------- */
    type PdgaRow = {
      pdga_event_id: string;
      name: string;
      tier: string | null;
      sanctioning: string | null;
      start_date: string | null;
      end_date: string | null;
      location: string | null;
      city: string | null;
      state: string | null;
      url: string | null;
    } & Geo;
    let pdga: PdgaRow[] = [];
    {
      let q = supabase
        .from("pdga_tour_events")
        .select(
          "pdga_event_id, name, tier, sanctioning, start_date, end_date, location, city, state, url, latitude, longitude",
        )
        .lte("start_date", window.to)
        .gte("start_date", window.from);
      if (stateFilter) q = q.eq("state", stateFilter);
      const { data: rows } = await q.limit(LIMITS.pdga);
      pdga = (rows ?? []) as PdgaRow[];
    }

    /* ---------------- course geo lookup ---------------- */
    const courses = new Map<string, CourseRow>();
    if (courseIds.size) {
      const { data: rows } = await supabase
        .from("courses")
        .select("id, name, city, state, latitude, longitude")
        .in("id", Array.from(courseIds));
      for (const c of (rows ?? []) as CourseRow[]) courses.set(c.id, c);
    }

    /* ---------------- club names ---------------- */
    const clubs = new Map<string, string>();
    const clubIds = Array.from(
      new Set(leagues.map((l) => l.club_id).filter((v): v is string => !!v)),
    );
    if (clubIds.length) {
      const { data: rows } = await supabase.from("clubs").select("id, name").in("id", clubIds);
      for (const c of (rows ?? []) as Array<{ id: string; name: string }>) clubs.set(c.id, c.name);
    }

    /* ---------------- build occurrences ---------------- */
    const datedByLeague = new Map<string, Set<string>>();
    for (const e of leagueEvents) {
      const iso = dateOnly(e.event_date);
      if (!iso) continue;
      const set = datedByLeague.get(e.league_id) ?? new Set<string>();
      set.add(iso);
      datedByLeague.set(e.league_id, set);
    }

    function pushLeagueNight(
      league: LeagueRow,
      iso: string,
      courseId: string | null,
      label: string | null,
      recurring: boolean,
    ) {
      const course = courseId ? (courses.get(courseId) ?? null) : null;
      out.push({
        id: `l:${league.id}:${iso}`,
        eventId: `l:${league.id}`,
        kind: "league",
        source: "chainlink",
        sanctioned: false,
        title: label?.trim() ? label : league.name,
        date: iso,
        endDate: iso,
        dow: dayOfWeek(iso),
        startTime: league.start_time ? league.start_time.slice(0, 5) : null,
        recurring,
        location: course ? [course.city, course.state].filter(Boolean).join(", ") || null : null,
        city: course?.city ?? null,
        state: course?.state ?? null,
        latitude: course?.latitude ?? null,
        longitude: course?.longitude ?? null,
        courseName: course?.name ?? null,
        hostName: league.club_id ? (clubs.get(league.club_id) ?? null) : null,
        tier: league.season,
        status: league.status,
        format: league.format_family ?? league.format,
        scoring: league.scoring_mode,
        entryFeeCents: league.entry_fee_cents,
        externalUrl: null,
        slug: league.slug,
      });
    }

    for (const league of leagues) {
      const dated = datedByLeague.get(league.id);
      for (const e of leagueEvents.filter((x) => x.league_id === league.id)) {
        const iso = dateOnly(e.event_date);
        if (!iso) continue;
        pushLeagueNight(league, iso, e.course_id ?? league.course_id, e.name, true);
      }
      if (league.day_of_week == null) continue;
      const nights = expandWeekly({
        dow: league.day_of_week,
        seasonStart: dateOnly(league.start_date),
        seasonEnd: dateOnly(league.end_date),
        window,
      });
      for (const iso of nights) {
        if (dated?.has(iso)) continue;
        pushLeagueNight(league, iso, league.course_id, null, true);
      }
    }

    for (const t of tournaments) {
      const start = dateOnly(t.start_date);
      if (!start) continue;
      const end = dateOnly(t.end_date) ?? start;
      const course = t.course_id ? (courses.get(t.course_id) ?? null) : null;
      out.push({
        id: `t:${t.id}`,
        eventId: `t:${t.id}`,
        kind: "tournament",
        source: "chainlink",
        sanctioned: !!t.pdga_sanctioned,
        title: t.name,
        date: start,
        endDate: end,
        dow: dayOfWeek(start),
        startTime: null,
        recurring: false,
        location: t.location ?? course?.name ?? null,
        city: course?.city ?? null,
        state: course?.state ?? null,
        latitude: t.latitude ?? course?.latitude ?? null,
        longitude: t.longitude ?? course?.longitude ?? null,
        courseName: course?.name ?? null,
        hostName: null,
        tier: t.pdga_tier,
        status: t.status,
        format: t.format,
        scoring: t.scoring_mode,
        entryFeeCents: t.entry_fee_cents,
        externalUrl: null,
        slug: t.slug,
      });
    }

    for (const c of community) {
      const start = dateOnly(c.starts_at);
      if (!start) continue;
      const course = c.course_id ? (courses.get(c.course_id) ?? null) : null;
      out.push({
        id: `c:${c.id}`,
        eventId: `c:${c.id}`,
        kind: "casual",
        source: "chainlink",
        sanctioned: false,
        title: c.title,
        date: start,
        endDate: dateOnly(c.ends_at) ?? start,
        dow: dayOfWeek(start),
        startTime: c.starts_at ? c.starts_at.slice(11, 16) : null,
        recurring: false,
        location: c.location ?? course?.name ?? null,
        city: course?.city ?? null,
        state: course?.state ?? null,
        latitude: c.latitude ?? course?.latitude ?? null,
        longitude: c.longitude ?? course?.longitude ?? null,
        courseName: course?.name ?? null,
        hostName: null,
        tier: c.kind,
        status: c.status,
        format: null,
        scoring: null,
        entryFeeCents: null,
        externalUrl: null,
        slug: c.id,
      });
    }

    for (const p of pdga) {
      const start = dateOnly(p.start_date);
      if (!start) continue;
      const tier = (p.tier ?? "").toUpperCase();
      const isLeague = tier === "L" || tier === "XL" || /league|weekly/i.test(p.name ?? "");
      const kind: PlannerKind = isLeague ? "league" : "tournament";
      if (!wantKind(kind)) continue;
      out.push({
        id: `p:${p.pdga_event_id}`,
        eventId: `p:${p.pdga_event_id}`,
        kind,
        source: "pdga",
        sanctioned: tier !== "XC" && tier !== "",
        title: p.name,
        date: start,
        endDate: dateOnly(p.end_date) ?? start,
        dow: dayOfWeek(start),
        startTime: null,
        recurring: false,
        location: p.location ?? ([p.city, p.state].filter(Boolean).join(", ") || null),
        city: p.city,
        state: p.state,
        latitude: p.latitude,
        longitude: p.longitude,
        courseName: null,
        hostName: null,
        tier: p.tier,
        status: null,
        format: null,
        scoring: null,
        entryFeeCents: null,
        externalUrl: p.url,
        slug: p.pdga_event_id,
      });
    }

    /* ---------------- filters ---------------- */
    let list = out.filter((occ) => occ.date <= window.to && occ.endDate >= window.from);

    if (data.dows?.length) {
      const set = new Set(data.dows);
      list = list.filter((occ) => set.has(occ.dow));
    }
    if (stateFilter) {
      list = list.filter((occ) => {
        const st = (occ.state ?? "").toUpperCase();
        if (st) return st === stateFilter;
        return (occ.location ?? "").toUpperCase().includes(stateFilter);
      });
    }
    if (needle) {
      list = list.filter((occ) =>
        [occ.title, occ.courseName, occ.location, occ.hostName, occ.tier]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle),
      );
    }

    const center =
      data.lat != null && data.lng != null ? { lat: data.lat, lng: data.lng } : null;
    if (center) {
      const radius = data.radiusMiles ?? null;
      const box = radius ? boundingBox(center, radius) : null;
      list = list
        .map((occ) => {
          if (occ.latitude == null || occ.longitude == null) return occ;
          return {
            ...occ,
            distanceMiles: haversineMiles(center, { lat: occ.latitude, lng: occ.longitude }),
          };
        })
        .filter((occ) => {
          if (!radius) return true;
          if (occ.latitude == null || occ.longitude == null) return false;
          if (
            box &&
            (occ.latitude < box.minLat ||
              occ.latitude > box.maxLat ||
              occ.longitude < box.minLng ||
              occ.longitude > box.maxLng)
          ) {
            return false;
          }
          return (occ.distanceMiles ?? Infinity) <= radius;
        });
    }

    list.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.startTime ?? "99").localeCompare(b.startTime ?? "99") ||
        a.title.localeCompare(b.title),
    );

    const unmapped = list.filter((o) => o.latitude == null || o.longitude == null).length;
    return { occurrences: list, unmapped };
  });
