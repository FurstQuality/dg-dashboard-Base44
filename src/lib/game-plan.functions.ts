/**
 * Game Plan server functions — unifies the season planner and action plan.
 *
 * Every function is scoped to the authenticated caller. Sources of truth:
 *   - `scheduled_events` for the user's calendar
 *   - `tournaments`/`tournament_rounds`/`tournament_divisions`/`tournament_registrations`
 *     for in-app events
 *   - `pdga_tour_events` + `pdga_players` for external PDGA events
 *   - `external_rounds` + `round_ratings` for the user's past rated rounds
 *   - `course_layouts` for stored SSA + stroke value
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCourseModel,
  requiredScore,
  courseConfidence,
  type PastCourseRound,
} from "@/lib/course-target";

/* ------------------------------ Types --------------------------------- */

export type GamePlanEvent = {
  id: string;
  source: "internal_tournament" | "internal_league" | "pdga" | "manual";
  title: string;
  starts_on: string | null;
  ends_on: string | null;
  location: string | null;
  tier: string | null;
  division: string | null;
  status: string | null;
  event_url: string | null;
  registration_url: string | null;
  tournament_id: string | null;
  league_id: string | null;
  pdga_event_ref: string | null;
  courses: Array<{
    round_number: number | null;
    course_id: string | null;
    course_name: string | null;
    layout_id: string | null;
    layout_name: string | null;
    starts_at: string | null;
    hole_count: number | null;
    par_total: number | null;
    scratch_rating: number | null;
    stroke_value: number | null;
  }>;
};

export type FieldPlayer = {
  key: string;
  display_name: string;
  pdga_number: string | null;
  rating: number | null;
  synced: boolean;
};

export type OddsResult = {
  eventId: string;
  players: FieldPlayer[];
  meRating: number | null;
  odds: { winPct: number; top3Pct: number; cashPct: number };
  distribution: { bucket: string; count: number }[];
  divisionCode: string | null;
  divisionsAvailable: string[];
  cashLine: number;
  fieldSource: "internal" | "pdga_cache" | "none";
  competition: {
    fieldSize: number;
    avgRating: number | null;
    medianRating: number | null;
    topRating: number | null;
    strengthDelta: number | null;
    prizePurse: number | null;
    top5: Array<{
      name: string;
      pdga_number: string | null;
      rating: number | null;
      place: number | null;
    }>;
    lastSyncedAt: string | null;
  };
};

export type CourseTarget = {
  round_number: number | null;
  course_id: string | null;
  course_name: string;
  layout_id: string | null;
  layout_name: string | null;
  hole_count: number | null;
  par_total: number | null;
  ssa: number;
  stroke_value: number;
  history_n: number;
  history_best_rating: number | null;
  history_median_rating: number | null;
  required_round_rating: number;
  required_score: number;
  required_to_par: number;
  per_hole_pace: number | null;
  hits_at_or_above: number;
  confidence: "very_likely" | "likely" | "stretch" | "unlikely";
  confidence_message: string;
  model_source: "layout" | "fit" | "fallback";
};

/* --------------------------- Elo helpers ------------------------------ */

function winProb(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 90));
}

function monteCarloPlacement(
  meRating: number,
  opponents: number[],
  cashLine: number,
  sims = 400,
): { winPct: number; top3Pct: number; cashPct: number } {
  if (!opponents.length) return { winPct: 100, top3Pct: 100, cashPct: 100 };
  // Deterministic seed so results are stable per event
  let seed = (meRating || 900) * 9301 + opponents.length * 49297;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const noise = 45; // rating standard deviation per round
  const invNormal = (u: number) => {
    // Rough Beasley-Springer inverse via Box-Muller
    const v = Math.max(1e-9, Math.min(1 - 1e-9, u));
    return Math.sqrt(-2 * Math.log(v)) * Math.cos(2 * Math.PI * rand());
  };
  let wins = 0;
  let top3 = 0;
  let cash = 0;
  for (let s = 0; s < sims; s++) {
    const my = meRating + invNormal(rand()) * noise;
    const scores = opponents.map((r) => r + invNormal(rand()) * noise);
    let rank = 1;
    for (const sc of scores) if (sc > my) rank += 1;
    if (rank === 1) wins += 1;
    if (rank <= 3) top3 += 1;
    if (rank <= cashLine) cash += 1;
  }
  return {
    winPct: Math.round((wins / sims) * 100),
    top3Pct: Math.round((top3 / sims) * 100),
    cashPct: Math.round((cash / sims) * 100),
  };
}

function histogram(values: number[]): { bucket: string; count: number }[] {
  const buckets: Array<[number, number]> = [
    [0, 800],
    [800, 850],
    [850, 900],
    [900, 925],
    [925, 950],
    [950, 975],
    [975, 1000],
    [1000, 1025],
    [1025, 1050],
    [1050, 1200],
  ];
  return buckets.map(([lo, hi]) => ({
    bucket: hi >= 1200 ? `${lo}+` : lo === 0 ? `<${hi}` : `${lo}-${hi - 1}`,
    count: values.filter((v) => v >= lo && v < hi).length,
  }));
}

/* ------------------------ 1. List events ------------------------------ */

type SB = { from: (t: string) => unknown } & Record<string, unknown>;

export async function collectEvents(supabaseIn: SB, userId: string): Promise<GamePlanEvent[]> {
  const today = new Date().toISOString().slice(0, 10);
  // The typed helper generics from the Supabase client don't survive through
  // our loose SB alias, so cast to a permissive builder shape.
  const supabase = supabaseIn as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          k: string,
          v: string,
        ) => {
          or: (f: string) => {
            order: (col: string, opts: unknown) => Promise<{ data: unknown[] | null }>;
          };
          in: (k: string, v: string[]) => Promise<{ data: unknown[] | null }>;
        };
        in: (k: string, v: string[]) => Promise<{ data: unknown[] | null }>;
      };
    };
  };

  const [scheduledRes, regsRes] = await Promise.all([
    supabase
      .from("scheduled_events")
      .select("*")
      .eq("user_id", userId)
      .or(`ends_on.gte.${today},starts_on.gte.${today}`)
      .order("starts_on", { ascending: true, nullsFirst: false } as unknown as Record<
        string,
        unknown
      >),
    supabase
      .from("tournament_registrations")
      .select(
        "tournament_id, status, tournaments!inner(id, name, pdga_tier, start_date, end_date, location, slug)",
      )
      .eq("user_id", userId)
      .in("status", ["pending", "confirmed", "waitlist", "checked_in"]),
  ]);

  const scheduled = (scheduledRes.data ?? []) as Array<Record<string, unknown>>;
  type TR = {
    tournament_id: string;
    status: string;
    tournaments: {
      id: string;
      name: string;
      pdga_tier: string | null;
      start_date: string | null;
      end_date: string | null;
      location: string | null;
      slug: string | null;
    } | null;
  };
  const regs = (regsRes.data ?? []) as TR[];

  const internalTournamentIds = new Set<string>();
  for (const r of regs) if (r.tournaments) internalTournamentIds.add(r.tournaments.id);
  for (const s of scheduled) {
    const tid = s.tournament_id as string | null;
    if (tid) internalTournamentIds.add(tid);
  }

  let internalRounds: Array<{
    id: string;
    tournament_id: string;
    round_number: number | null;
    starts_at: string | null;
    holes_played: number | null;
    course: { id: string; name: string | null } | null;
    layout: {
      id: string;
      name: string | null;
      hole_count: number | null;
      par_total: number | null;
      scratch_rating: number | null;
      stroke_value: number | null;
    } | null;
  }> = [];
  if (internalTournamentIds.size) {
    const { data } = (await supabase
      .from("tournament_rounds")
      .select(
        "id, tournament_id, round_number, starts_at, holes_played, course:courses(id, name), layout:course_layouts(id, name, hole_count, par_total, scratch_rating, stroke_value)",
      )
      .in("tournament_id", Array.from(internalTournamentIds))) as unknown as {
      data: typeof internalRounds;
    };
    internalRounds = data ?? [];
  }
  const roundsByTournament = new Map<string, typeof internalRounds>();
  for (const r of internalRounds) {
    const arr = roundsByTournament.get(r.tournament_id) ?? [];
    arr.push(r);
    roundsByTournament.set(r.tournament_id, arr);
  }

  const events: GamePlanEvent[] = [];
  const seenTournamentIds = new Set<string>();

  for (const row of scheduled) {
    const tid = row.tournament_id as string | null;
    const rounds = tid ? (roundsByTournament.get(tid) ?? []) : [];
    const rawRounds = ((row.raw as { rounds?: Array<Record<string, unknown>> } | null)?.rounds ??
      []) as Array<Record<string, unknown>>;
    const rawExternal = row.external_id as string | null;
    const pdgaRef =
      (rawExternal ? rawExternal.replace(/^pdga:/i, "") : null) ??
      ((row.raw as { pdga_event_id?: string | number } | null)?.pdga_event_id != null
        ? String((row.raw as { pdga_event_id: string | number }).pdga_event_id)
        : null);
    const courses = rounds.length
      ? rounds.map((r) => ({
          round_number: r.round_number,
          course_id: r.course?.id ?? null,
          course_name: r.course?.name ?? null,
          layout_id: r.layout?.id ?? null,
          layout_name: r.layout?.name ?? null,
          starts_at: r.starts_at,
          hole_count: r.layout?.hole_count ?? r.holes_played ?? null,
          par_total: r.layout?.par_total ?? null,
          scratch_rating: r.layout?.scratch_rating ?? null,
          stroke_value: r.layout?.stroke_value ?? null,
        }))
      : rawRounds.map((r, idx) => ({
          round_number: (r.round_number as number | null) ?? idx + 1,
          course_id: null,
          course_name: (r.course_name as string | null) ?? (r.course as string | null) ?? null,
          layout_id: null,
          layout_name: (r.layout_name as string | null) ?? null,
          starts_at: (r.starts_at as string | null) ?? null,
          hole_count: (r.hole_count as number | null) ?? null,
          par_total: (r.par_total as number | null) ?? null,
          scratch_rating: null,
          stroke_value: null,
        }));

    const source: GamePlanEvent["source"] = tid
      ? "internal_tournament"
      : row.league_id
        ? "internal_league"
        : row.source === "pdga"
          ? "pdga"
          : "manual";

    events.push({
      id: row.id as string,
      source,
      title: (row.title as string | null) ?? "Untitled event",
      starts_on: (row.starts_on as string | null) ?? null,
      ends_on: (row.ends_on as string | null) ?? null,
      location: (row.location as string | null) ?? null,
      tier: (row.tier as string | null) ?? null,
      division: (row.division as string | null) ?? null,
      status: (row.status as string | null) ?? null,
      event_url: (row.event_url as string | null) ?? null,
      registration_url: (row.registration_url as string | null) ?? null,
      tournament_id: tid,
      league_id: (row.league_id as string | null) ?? null,
      pdga_event_ref: pdgaRef,
      courses,
    });
    if (tid) seenTournamentIds.add(tid);
  }

  for (const r of regs) {
    const t = r.tournaments;
    if (!t || seenTournamentIds.has(t.id)) continue;
    const rounds = roundsByTournament.get(t.id) ?? [];
    events.push({
      id: `reg:${t.id}`,
      source: "internal_tournament",
      title: t.name,
      starts_on: t.start_date,
      ends_on: t.end_date,
      location: t.location,
      tier: t.pdga_tier,
      division: null,
      status: r.status,
      event_url: null,
      registration_url: null,
      tournament_id: t.id,
      league_id: null,
      pdga_event_ref: null,
      courses: rounds.map((rd) => ({
        round_number: rd.round_number,
        course_id: rd.course?.id ?? null,
        course_name: rd.course?.name ?? null,
        layout_id: rd.layout?.id ?? null,
        layout_name: rd.layout?.name ?? null,
        starts_at: rd.starts_at,
        hole_count: rd.layout?.hole_count ?? rd.holes_played ?? null,
        par_total: rd.layout?.par_total ?? null,
        scratch_rating: rd.layout?.scratch_rating ?? null,
        stroke_value: rd.layout?.stroke_value ?? null,
      })),
    });
  }

  events.sort((a, b) => (a.starts_on ?? "9999").localeCompare(b.starts_on ?? "9999"));
  return events;
}

/**
 * Attach the real venue(s) to a PDGA event that has no course rounds yet.
 *
 * Resolution is venue-first: PDGA layout details → Disc Golf Scene course link
 * → UDisc course index, and only then is the venue name used to look up course
 * data (app course row, PDGA directory, rating profile). The event name is
 * never treated as a course.
 */
export async function hydrateEventVenue(
  supabase: SB,
  event: GamePlanEvent,
): Promise<GamePlanEvent> {
  if (event.courses.length > 0 || !event.pdga_event_ref) return event;
  try {
    const { resolveEventVenues } = await import("@/lib/event-course-resolve.server");
    const venues = await resolveEventVenues(
      supabase as unknown as Parameters<typeof resolveEventVenues>[0],
      event.pdga_event_ref,
      { eventTitle: event.title, location: event.location },
    );
    if (venues.length === 0) return event;
    event.courses = venues.map((venue) => ({
      round_number: venue.round_number,
      course_id: venue.course_id,
      course_name: venue.course_name,
      layout_id: null,
      layout_name: venue.layout_name,
      starts_at: event.starts_on,
      hole_count: venue.hole_count,
      par_total: venue.par_total,
      scratch_rating: venue.ssa,
      stroke_value: venue.stroke_value,
    }));
  } catch {
    /* venue lookup is best-effort */
  }
  return event;
}



export const listGamePlanEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const events = await collectEvents(context.supabase as unknown as SB, context.userId);
    return { events };
  });

/* ------------------------- 2. Odds analysis ---------------------------- */

const OddsInput = z.object({ eventId: z.string(), division: z.string().optional() });

function emptyCompetition(): OddsResult["competition"] {
  return {
    fieldSize: 0,
    avgRating: null,
    medianRating: null,
    topRating: null,
    strengthDelta: null,
    prizePurse: null,
    top5: [],
    lastSyncedAt: null,
  };
}

export const analyzeEventOdds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => OddsInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: me } = await supabase
      .from("profiles")
      .select("pdga_rating, pdga_number, preferred_division")
      .eq("id", userId)
      .maybeSingle();
    const meRating = (me?.pdga_rating as number | null) ?? null;
    const myPdgaNumber = (me?.pdga_number as string | null) ?? null;
    const preferredDivision =
      (me as { preferred_division?: string | null } | null)?.preferred_division ?? null;

    const events = await collectEvents(supabase as unknown as SB, userId);
    const event = events.find((e) => e.id === data.eventId) ?? null;
    const emptyResult: OddsResult = {
      eventId: data.eventId,
      players: [],
      meRating,
      odds: { winPct: 0, top3Pct: 0, cashPct: 0 },
      distribution: [],
      divisionCode: null,
      divisionsAvailable: [],
      cashLine: 0,
      fieldSource: "none",
      competition: emptyCompetition(),
    };
    if (!event) return emptyResult;

    const players: FieldPlayer[] = [];
    // Priority: explicit arg → caller's preferred division → event.division → null (resolved per branch below)
    let divisionCode: string | null = data.division ?? preferredDivision ?? event.division ?? null;
    let divisionsAvailable: string[] = [];
    let fieldSource: OddsResult["fieldSource"] = "none";
    let prizePurse: number | null = null;
    let top5: OddsResult["competition"]["top5"] = [];
    let lastSyncedAt: string | null = null;

    if (event.tournament_id) {
      // Gate roster/PII reads: caller must be the tournament owner or a
      // registrant. Otherwise fall back to aggregate-only competition data.
      const { checkTournamentAccess } = await import("@/lib/tournament-access.server");
      const access = await checkTournamentAccess(
        supabase as unknown as SupabaseClient,
        userId,
        event.tournament_id,
      );
      if (!access.allowed) {
        return { ...emptyResult, divisionCode, divisionsAvailable: [], fieldSource: "none" };
      }
      const [{ data: divs }, { data: regs }] = await Promise.all([
        supabaseAdmin
          .from("tournament_divisions")
          .select("id, code, name, min_rating, max_rating")
          .eq("tournament_id", event.tournament_id),
        supabaseAdmin
          .from("tournament_registrations")
          .select("id, division_id, user_id, pdga_number, status")
          .eq("tournament_id", event.tournament_id)
          .in("status", ["confirmed", "checked_in", "pending", "waitlist"]),
      ]);
      const divisions = (divs ?? []) as Array<{
        id: string;
        code: string;
        name: string;
        min_rating: number | null;
        max_rating: number | null;
      }>;
      divisionsAvailable = divisions.map((d) => d.code ?? d.name).filter(Boolean);
      const myReg = (regs ?? []).find((r) => (r as { user_id: string }).user_id === userId) as
        | { division_id: string | null }
        | undefined;
      // Priority: explicit arg → event.division → caller's registered division → preferred → first
      const myDiv =
        divisions.find((d) => (d.code ?? d.name) === divisionCode) ??
        divisions.find((d) => d.id === myReg?.division_id) ??
        divisions.find((d) => (d.code ?? d.name) === preferredDivision) ??
        divisions[0];
      divisionCode = myDiv?.code ?? myDiv?.name ?? divisionCode;

      const inDivision = (regs ?? []).filter(
        (r) => !myDiv || (r as { division_id: string | null }).division_id === myDiv.id,
      );
      const userIds = Array.from(
        new Set(inDivision.map((r) => (r as { user_id: string }).user_id)),
      );
      const { data: profiles } = userIds.length
        ? await supabaseAdmin
            .from("profiles")
            .select("id, display_name, username, pdga_number, pdga_rating")
            .in("id", userIds)
        : { data: [] };
      const byUser = new Map((profiles ?? []).map((p) => [(p as { id: string }).id, p]));

      for (const r of inDivision) {
        const rr = r as { id: string; user_id: string; pdga_number: string | null };
        if (rr.user_id === userId) continue;
        const p = byUser.get(rr.user_id) as
          | {
              display_name: string | null;
              username: string | null;
              pdga_number: string | null;
              pdga_rating: number | null;
            }
          | undefined;
        players.push({
          key: rr.id,
          display_name: p?.display_name ?? p?.username ?? "Player",
          pdga_number: rr.pdga_number ?? p?.pdga_number ?? null,
          rating: p?.pdga_rating ?? myDiv?.min_rating ?? null,
          synced: p?.pdga_rating != null,
        });
      }
      fieldSource = players.length ? "internal" : "none";
    } else if (event.pdga_event_ref) {
      const { data: fieldRows } = await supabaseAdmin
        .from("pdga_event_field")
        .select("pdga_number, name, division, rating, place, prize, synced_at")
        .eq("event_ref", event.pdga_event_ref);
      const rows = (fieldRows ?? []) as Array<{
        pdga_number: string;
        name: string;
        division: string | null;
        rating: number | null;
        place: number | null;
        prize: number | null;
        synced_at: string;
      }>;
      divisionsAvailable = Array.from(
        new Set(rows.map((r) => r.division).filter((d): d is string => !!d)),
      );

      // Priority order for auto-detecting the caller's division on a PDGA event:
      //   1. explicit `data.division` (user picked from the selector)
      //   2. profile.preferred_division (persisted choice — already applied above)
      //   3. caller's own row in the field, matched by pdga_number
      //   4. rating-inferred amateur/pro tier
      //   5. event.division (from the scheduled_events row — already applied above)
      //   6. first division available
      // If the currently-selected divisionCode is not actually present in this
      // event's field, drop it so the auto-detect chain can pick a real one
      // instead of leaving the user staring at an empty (or wrong) roster.
      if (divisionCode && divisionsAvailable.length && !divisionsAvailable.includes(divisionCode)) {
        divisionCode = null;
      }
      if (!divisionCode) {
        const own = myPdgaNumber
          ? rows.find((r) => r.pdga_number === myPdgaNumber && r.division)
          : undefined;
        if (own?.division) divisionCode = own.division;
      }
      if (!divisionCode && meRating != null && divisionsAvailable.length) {
        // Last-resort guess before falling back to the first available
        // division. Amateur caps are exclusive (MA3 under 900, MA2 under 935);
        // MA1 has no cap, so a 970+ am still lands in MA1 when it is offered.
        const ladder =
          meRating >= 935
            ? ["MA1", "MPO"]
            : meRating >= 900
              ? ["MA2", "MA1"]
              : meRating >= 850
                ? ["MA3", "MA2"]
                : ["MA4", "MA3"];
        const inferred = ladder.find((c) => divisionsAvailable.includes(c));
        if (inferred) divisionCode = inferred;
      }
      if (!divisionCode && divisionsAvailable.length) divisionCode = divisionsAvailable[0];

      const scoped = divisionCode ? rows.filter((r) => r.division === divisionCode) : rows;
      for (const r of scoped) {
        players.push({
          key: `${r.pdga_number}:${r.division ?? ""}`,
          display_name: r.name,
          pdga_number: r.pdga_number,
          rating: r.rating,
          synced: r.rating != null,
        });
      }
      prizePurse = scoped.reduce((sum, r) => sum + (r.prize ?? 0), 0) || null;
      top5 = scoped
        .filter((r) => r.place != null)
        .sort((a, b) => (a.place ?? 999) - (b.place ?? 999))
        .slice(0, 5)
        .map((r) => ({
          name: r.name,
          pdga_number: r.pdga_number,
          rating: r.rating,
          place: r.place,
        }));
      lastSyncedAt = rows[0]?.synced_at ?? null;
      fieldSource = rows.length ? "pdga_cache" : "none";
    }

    const ratings = players.map((p) => p.rating).filter((r): r is number => r != null);
    const meR = meRating ?? 900;
    const cashLine = Math.max(1, Math.round((players.length + 1) * 0.4));
    const odds = monteCarloPlacement(meR, ratings, cashLine, 500);

    const sortedRatings = [...ratings].sort((a, b) => a - b);
    const avgRating = ratings.length
      ? Math.round(ratings.reduce((s, r) => s + r, 0) / ratings.length)
      : null;
    const medianRating = sortedRatings.length
      ? Math.round(sortedRatings[Math.floor(sortedRatings.length / 2)])
      : null;
    const topRating = sortedRatings.length ? sortedRatings[sortedRatings.length - 1] : null;
    if (!top5.length) {
      top5 = [...players]
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, 5)
        .map((p) => ({
          name: p.display_name,
          pdga_number: p.pdga_number,
          rating: p.rating,
          place: null,
        }));
    }

    return {
      eventId: event.id,
      players: players.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)),
      meRating,
      odds,
      distribution: histogram([meR, ...ratings]),
      divisionCode,
      divisionsAvailable,
      cashLine,
      fieldSource,
      competition: {
        fieldSize: players.length,
        avgRating,
        medianRating,
        topRating,
        strengthDelta: avgRating != null && meRating != null ? meRating - avgRating : null,
        prizePurse,
        top5,
        lastSyncedAt,
      },
    } satisfies OddsResult;
  });

/* ---------------------- 3. Course scoring targets ---------------------- */

const TargetInput = z.object({
  eventId: z.string(),
  targetRating: z.number().int().min(500).max(1100),
});

export const computeEventTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => TargetInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const events = await collectEvents(supabase as unknown as SB, userId);
    const event = events.find((e) => e.id === data.eventId);
    if (!event)
      return {
        eventId: data.eventId,
        targets: [] as CourseTarget[],
        targetRating: data.targetRating,
      };

    // Pull the player's past rated rounds once, filter per course in memory.
    const { data: ext } = await supabase
      .from("external_rounds")
      .select(
        "played_on, round_rating, score, to_par, ssa, course_name, layout_name, event_name, pdga_event_ref",
      )
      .eq("user_id", userId)
      .not("round_rating", "is", null);
    const externalRows = (ext ?? []) as Array<{
      played_on: string;
      round_rating: number;
      score: number | null;
      to_par: number | null;
      ssa: number | null;
      course_name: string | null;
      layout_name: string | null;
      event_name: string | null;
      pdga_event_ref: string | null;
    }>;

    // Synthesize course entries when the event has none linked yet. First try
    // rounds the user (or PDGA) has already recorded for this event ref; if
    // there are none, fall back to a single generic 18-hole entry so we can
    // still show what the player needs to shoot at target rating.
    await hydrateEventVenue(supabase as unknown as SB, event);
    let workingCourses = event.courses;
    if (workingCourses.length === 0) {
      if (event.pdga_event_ref) {
        const refRows = externalRows.filter((r) => r.pdga_event_ref === event.pdga_event_ref);
        const groups = new Map<
          string,
          { course_name: string | null; layout_name: string | null; count: number }
        >();
        for (const r of refRows) {
          const key = `${r.course_name ?? ""}::${r.layout_name ?? ""}`;
          const cur = groups.get(key) ?? {
            course_name: r.course_name,
            layout_name: r.layout_name,
            count: 0,
          };
          cur.count += 1;
          groups.set(key, cur);
        }
        workingCourses = Array.from(groups.values()).map((g, idx) => ({
          round_number: idx + 1,
          course_id: null,
          course_name: g.course_name ?? "Course to be announced",
          layout_id: null,
          layout_name: g.layout_name,
          starts_at: null,
          hole_count: 18,
          par_total: null,
          scratch_rating: null,
          stroke_value: null,
        }));
      }
      if (workingCourses.length === 0) {
        // No source names the venue yet. Show an explicit placeholder rather
        // than the event name — an event is not a course, and analytics keyed
        // off the event name are meaningless.
        workingCourses = [
          {
            round_number: 1,
            course_id: null,
            course_name: "Course to be announced",
            layout_id: null,
            layout_name: null,
            starts_at: event.starts_on,
            hole_count: 18,
            par_total: null,
            scratch_rating: null,
            stroke_value: null,
          },
        ];
      }
    }

    // Load approved course rating profiles for any linked courses so we can
    // seed SSA / stroke value when the course row itself doesn't carry them.
    // Match by course_id AND by normalized course_name so name-only profiles
    // (e.g. Wildlife Prairie Park ingested from PDGA URLs, no course row) still apply.
    const normalizeName = (s: string | null | undefined) =>
      (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    const courseIds = Array.from(
      new Set(workingCourses.map((c) => c.course_id).filter((v): v is string => !!v)),
    );
    const courseNames = Array.from(
      new Set(
        workingCourses
          .map((c) => c.course_name)
          .filter((v): v is string => !!v && v.trim().length > 0),
      ),
    );
    type ProfileRow = {
      course_id: string | null;
      course_name: string | null;
      ssa: number | null;
      stroke_value: number | null;
      par_total: number | null;
    };
    const profilesById = new Map<string, ProfileRow>();
    const profilesByName = new Map<string, ProfileRow>();
    if (courseIds.length > 0 || courseNames.length > 0) {
      const filters: string[] = [];
      if (courseIds.length > 0) filters.push(`course_id.in.(${courseIds.join(",")})`);
      if (courseNames.length > 0) {
        // ilike each name via OR filter (escape commas/parens defensively).
        for (const nm of courseNames) {
          const safe = nm.replace(/[(),]/g, " ").trim();
          if (safe) filters.push(`course_name.ilike.${safe}`);
        }
      }
      const { data: profs } = await supabase
        .from("course_rating_profiles")
        .select("course_id, course_name, ssa, stroke_value, par_total")
        .eq("status", "approved")
        .or(filters.join(","));
      for (const p of (profs ?? []) as ProfileRow[]) {
        if (p.course_id) profilesById.set(p.course_id, p);
        if (p.course_name) profilesByName.set(normalizeName(p.course_name), p);
      }
    }

    // Cross-user pool of rated rounds (score + rating pairs) from the whole
    // player base — the ONLY reliable way to fit SSA/stroke value per course
    // when this user hasn't played it yet. Uses admin client to bypass RLS on
    // external_rounds; we read only aggregate scoring columns, no PII.
    type PoolRow = {
      course_name: string | null;
      layout_name: string | null;
      round_rating: number | null;
      score: number | null;
      to_par: number | null;
      ssa: number | null;
      played_on: string;
      pdga_event_ref: string | null;
    };
    const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
    let crossUserRows: PoolRow[] = [];
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const nameSet = Array.from(
        new Set(
          workingCourses
            .map((c) => c.course_name)
            .filter((v): v is string => !!v && v.trim().length > 0),
        ),
      );
      const orParts: string[] = [];
      if (event.pdga_event_ref) orParts.push(`pdga_event_ref.eq.${event.pdga_event_ref}`);
      for (const nm of nameSet) {
        const safe = nm.replace(/[(),%*]/g, " ").trim();
        if (safe) orParts.push(`course_name.ilike.%${safe}%`);
      }
      if (orParts.length > 0) {
        const { data: pool } = await supabaseAdmin
          .from("external_rounds")
          .select(
            "course_name, layout_name, round_rating, score, to_par, ssa, played_on, pdga_event_ref",
          )
          .not("round_rating", "is", null)
          .not("score", "is", null)
          .eq("format", "singles")
          .or(orParts.join(","))
          .limit(2000);
        crossUserRows = (pool ?? []) as PoolRow[];
      }
    } catch {
      // Admin client unavailable — fall back silently to user-only history.
    }

    const targets: CourseTarget[] = workingCourses.map((c) => {
      // Match a row to THIS course/layout specifically. The event_ref alone
      // isn't enough because a multi-round event has different courses per
      // round; without a course/layout match we'd pool every round together
      // and every target would collapse to the same SSA/SV.
      const matchesCourseStrict = (row: {
        course_name: string | null;
        layout_name: string | null;
      }) => {
        if (!c.course_name) return false;
        if (norm(row.course_name) !== norm(c.course_name)) return false;
        if (!c.layout_name) return true;
        // Accept exact layout match OR unknown layout (some scraped rows omit layout).
        return norm(row.layout_name) === norm(c.layout_name) || !row.layout_name;
      };

      // 1. This user's own rounds at this course/layout — highest signal.
      let past: PastCourseRound[] = externalRows.filter(matchesCourseStrict).map((r) => ({
        played_on: r.played_on,
        round_rating: r.round_rating,
        score: r.score,
        to_par: r.to_par,
        ssa: r.ssa,
      }));
      const ownRoundCount = past.length;

      // 2. Pool cross-user rated rounds at this course/layout to fit SSA/SV.
      //    This is what lets the tool derive per-round targets when the user
      //    has never played the course: e.g. from Ledbetter 51→1044 and
      //    Brannagan 61→938 in the same round we solve SV≈10.6, SSA≈55.
      const poolMatches = crossUserRows.filter(matchesCourseStrict);
      // Prefer same-event pool first, then broader course pool.
      const sameEventPool = event.pdga_event_ref
        ? poolMatches.filter((r) => r.pdga_event_ref === event.pdga_event_ref)
        : [];
      const fieldRows = (sameEventPool.length >= 4 ? sameEventPool : poolMatches).map((r) => ({
        played_on: r.played_on,
        round_rating: r.round_rating as number,
        score: r.score,
        to_par: r.to_par,
        ssa: r.ssa,
      }));

      // Combine but de-dupe: own rounds count once; then extend with field rows.
      const combined: PastCourseRound[] = past.slice();
      const seen = new Set(combined.map((r) => `${r.played_on}|${r.score}|${r.round_rating}`));
      for (const r of fieldRows) {
        const key = `${r.played_on}|${r.score}|${r.round_rating}`;
        if (!seen.has(key)) {
          combined.push(r);
          seen.add(key);
        }
      }
      const fieldSampleN = combined.length - ownRoundCount;

      // 3. Only if nothing course-specific exists, fall back to the user's
      //    recent overall rated rounds — clearly labeled to the user.
      let usedFallbackHistory = false;
      if (combined.length === 0) {
        past = externalRows
          .slice()
          .sort((a, b) => (b.played_on ?? "").localeCompare(a.played_on ?? ""))
          .slice(0, 20)
          .map((r) => ({
            played_on: r.played_on,
            round_rating: r.round_rating,
            score: r.score,
            to_par: r.to_par,
            ssa: r.ssa,
          }));
        usedFallbackHistory = past.length > 0;
      } else {
        past = combined;
      }

      const profile =
        (c.course_id ? profilesById.get(c.course_id) : undefined) ??
        (c.course_name ? profilesByName.get(norm(c.course_name)) : undefined);
      const model = buildCourseModel(past, {
        // Only pass stored SSA/SV as a hint when they came from the layout row
        // itself. Profile values are used later as a soft fallback, not to
        // override a field fit that comes from real scored rounds.
        scratch_rating:
          c.scratch_rating ?? (ownRoundCount + fieldSampleN === 0 ? (profile?.ssa ?? null) : null),
        stroke_value:
          c.stroke_value ??
          (ownRoundCount + fieldSampleN === 0 ? (profile?.stroke_value ?? null) : null),
        par_total: c.par_total ?? profile?.par_total ?? null,
      });
      const score = requiredScore(model, data.targetRating);
      const par = c.par_total ?? Math.round(model.ssa);
      const conf = courseConfidence(model, data.targetRating);
      const history_n = usedFallbackHistory ? 0 : ownRoundCount;
      const history_best = usedFallbackHistory ? null : model.bestRating;
      const history_median = usedFallbackHistory ? null : model.medianRating;
      const confidence_message = usedFallbackHistory
        ? "No rounds logged at this course yet — using your recent rated rounds as a baseline."
        : fieldSampleN > 0 && ownRoundCount === 0
          ? `Fit from ${fieldSampleN} rated field round${fieldSampleN === 1 ? "" : "s"} at this course. Log a round here to sharpen the target.`
          : fieldSampleN > 0
            ? `Fit from your ${ownRoundCount} round${ownRoundCount === 1 ? "" : "s"} here plus ${fieldSampleN} field round${fieldSampleN === 1 ? "" : "s"} at this course.`
            : conf.message;
      return {
        round_number: c.round_number,
        course_id: c.course_id,
        course_name: c.course_name ?? "Unnamed course",
        layout_id: c.layout_id,
        layout_name: c.layout_name,
        hole_count: c.hole_count,
        par_total: c.par_total,
        ssa: Math.round(model.ssa * 10) / 10,
        stroke_value: Math.round(model.stroke_value * 10) / 10,
        history_n,
        history_best_rating: history_best,
        history_median_rating: history_median,
        required_round_rating: data.targetRating,
        required_score: score,
        required_to_par: score - par,
        per_hole_pace: c.hole_count ? Math.round((score / c.hole_count) * 100) / 100 : null,
        hits_at_or_above: usedFallbackHistory ? 0 : model.hitsAtOrAbove(data.targetRating),
        confidence: usedFallbackHistory ? "stretch" : conf.verdict,
        confidence_message,
        model_source: model.source,
      };
    });

    return { eventId: event.id, targets, targetRating: data.targetRating };
  });

/* -------------------------- 4. Event prep ------------------------------ */

export const getEventPrep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ eventId: z.string() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: items } = await supabase
      .from("action_items")
      .select("*")
      .eq("user_id", userId)
      .like("system_key", `event:${data.eventId}:%`);
    return { items: items ?? [] };
  });

/* -------------------- 5. Data readiness for an event ------------------- */

export type ReadinessLevel = "good" | "partial" | "missing";

export type CourseReadiness = {
  round_number: number | null;
  course_name: string;
  layout_name: string | null;
  has_layout_model: boolean;
  history_at_course: number;
  model_source: "layout" | "fit" | "fallback";
  level: ReadinessLevel;
};

export type EventReadiness = {
  eventId: string;
  hasPdgaProfile: boolean;
  totalRatedRounds: number;
  priorEventResults: number;
  rosterCount: number;
  rosterWithRatings: number;
  courses: CourseReadiness[];
  overall: ReadinessLevel;
  suggestions: Array<{
    key: "sync_pdga" | "import_rounds" | "pull_event_page" | "sync_roster" | "add_course_data";
    label: string;
    reason: string;
  }>;
};

export const getEventDataReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ eventId: z.string() }).parse(raw))
  .handler(async ({ data, context }): Promise<EventReadiness> => {
    const { supabase, userId } = context;
    const events = await collectEvents(supabase as unknown as SB, userId);
    const event = events.find((e) => e.id === data.eventId);
    const empty: EventReadiness = {
      eventId: data.eventId,
      hasPdgaProfile: false,
      totalRatedRounds: 0,
      priorEventResults: 0,
      rosterCount: 0,
      rosterWithRatings: 0,
      courses: [],
      overall: "missing",
      suggestions: [],
    };
    if (!event) return empty;

    // Auto-hydrate course schedule for PDGA events that were imported before
    // the schedule wiring existed. This makes "Course data" reflect reality
    // instead of "0/0" until the user manually clicks a backfill button.
    if (event.pdga_event_ref && event.courses.length === 0) {
      try {
        const { getPdgaEventSchedule } = await import("@/lib/pdga-lab.functions");
        const sched = await getPdgaEventSchedule({ data: { eventRef: event.pdga_event_ref } });
        const dedup = new Map<
          number,
          { round_number: number; course_name: string | null; layout_name: string | null }
        >();
        for (const s of sched) {
          if (!dedup.has(s.round_number) && s.course_name) {
            dedup.set(s.round_number, {
              round_number: s.round_number,
              course_name: s.course_name,
              layout_name: s.course_layout,
            });
          }
        }
        const rounds = Array.from(dedup.values()).sort((a, b) => a.round_number - b.round_number);
        if (rounds.length) {
          event.courses = rounds.map((r) => ({
            round_number: r.round_number,
            course_id: null,
            course_name: r.course_name,
            layout_id: null,
            layout_name: r.layout_name,
            starts_at: null,
            hole_count: null,
            par_total: null,
            scratch_rating: null,
            stroke_value: null,
          }));
          // Persist back into scheduled_events.raw so other tools pick it up.
          try {
            const { data: existingRaw } = await supabase
              .from("scheduled_events")
              .select("raw")
              .eq("id", event.id)
              .eq("user_id", userId)
              .maybeSingle();
            const prevRaw =
              (existingRaw as { raw: Record<string, unknown> | null } | null)?.raw ?? {};
            await supabase
              .from("scheduled_events")
              .update({
                raw: { ...prevRaw, pdga_event_id: event.pdga_event_ref, rounds },
                last_synced_at: new Date().toISOString(),
              } as never)
              .eq("id", event.id)
              .eq("user_id", userId);
          } catch {
            /* best-effort persist */
          }
        }
      } catch {
        /* schedule optional */
      }
    }

    // Still nothing from PDGA? The venue is published on Disc Golf Scene.
    await hydrateEventVenue(supabase as unknown as SB, event);

    const { data: prof } = await supabase
      .from("profiles")
      .select("pdga_number, pdga_rating")
      .eq("id", userId)
      .maybeSingle();
    const hasPdgaProfile = !!(prof?.pdga_number && prof?.pdga_rating);

    const { data: ext } = await supabase
      .from("external_rounds")
      .select("round_rating, course_name, layout_name, event_name, pdga_event_ref")
      .eq("user_id", userId)
      .not("round_rating", "is", null);
    const rows = (ext ?? []) as Array<{
      round_rating: number;
      course_name: string | null;
      layout_name: string | null;
      event_name: string | null;
      pdga_event_ref: string | null;
    }>;
    const norm = (s: string | null) => (s ?? "").trim().toLowerCase();

    // Broaden "prior results here" to also match any imported round played at
    // one of the event's scheduled courses (by normalized course name).
    const eventCourseNames = new Set(
      event.courses.map((c) => norm(c.course_name)).filter((n) => n.length > 2),
    );
    const priorEventResults = rows.filter((r) => {
      if (event.pdga_event_ref && r.pdga_event_ref === event.pdga_event_ref) return true;
      const t = norm(event.title);
      const en = norm(r.event_name);
      if (t && en.length > 3 && (en === t || en.includes(t) || t.includes(en))) return true;
      if (eventCourseNames.size && eventCourseNames.has(norm(r.course_name))) return true;
      return false;
    }).length;

    // Enrich with approved Course Ratings Analyzer profiles so a rated
    // course (e.g. Wildlife Prairie Park) counts as "has model" even when
    // the event's course_layouts row doesn't carry SSA/SV directly.
    const profNorm = (s: string | null | undefined) =>
      (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    const courseIdList = Array.from(
      new Set(event.courses.map((c) => c.course_id).filter((v): v is string => !!v)),
    );
    const courseNameList = Array.from(
      new Set(
        event.courses
          .map((c) => c.course_name)
          .filter((v): v is string => !!v && v.trim().length > 0),
      ),
    );
    const profileById = new Map<string, { ssa: number | null; stroke_value: number | null }>();
    const profileByName = new Map<string, { ssa: number | null; stroke_value: number | null }>();
    if (courseIdList.length || courseNameList.length) {
      const orFilters: string[] = [];
      if (courseIdList.length) orFilters.push(`course_id.in.(${courseIdList.join(",")})`);
      for (const nm of courseNameList) {
        const safe = nm.replace(/[(),]/g, " ").trim();
        if (safe) orFilters.push(`course_name.ilike.${safe}`);
      }
      if (orFilters.length) {
        const { data: profs } = await supabase
          .from("course_rating_profiles")
          .select("course_id, course_name, ssa, stroke_value")
          .eq("status", "approved")
          .or(orFilters.join(","));
        for (const p of (profs ?? []) as Array<{
          course_id: string | null;
          course_name: string | null;
          ssa: number | null;
          stroke_value: number | null;
        }>) {
          if (p.course_id)
            profileById.set(p.course_id, { ssa: p.ssa, stroke_value: p.stroke_value });
          if (p.course_name)
            profileByName.set(profNorm(p.course_name), {
              ssa: p.ssa,
              stroke_value: p.stroke_value,
            });
        }
      }
    }

    const courses: CourseReadiness[] = event.courses.map((c) => {
      const hist = rows.filter((r) => {
        if (event.pdga_event_ref && r.pdga_event_ref === event.pdga_event_ref) return true;
        if (c.course_name && norm(r.course_name) === norm(c.course_name)) {
          if (!c.layout_name) return true;
          return norm(r.layout_name) === norm(c.layout_name) || !r.layout_name;
        }
        return false;
      }).length;
      const prof =
        (c.course_id ? profileById.get(c.course_id) : undefined) ??
        (c.course_name ? profileByName.get(profNorm(c.course_name)) : undefined);
      const ssa = c.scratch_rating ?? prof?.ssa ?? null;
      const sv = c.stroke_value ?? prof?.stroke_value ?? null;
      const hasLayoutModel = ssa != null && sv != null;
      const modelSource: CourseReadiness["model_source"] = hasLayoutModel
        ? "layout"
        : hist >= 3
          ? "fit"
          : "fallback";
      const level: ReadinessLevel =
        hasLayoutModel || hist >= 5 ? "good" : hist >= 2 ? "partial" : "missing";
      return {
        round_number: c.round_number,
        course_name: c.course_name ?? "Unnamed course",
        layout_name: c.layout_name,
        has_layout_model: hasLayoutModel,
        history_at_course: hist,
        model_source: modelSource,
        level,
      };
    });

    let rosterCount = 0;
    let rosterWithRatings = 0;
    if (event.tournament_id) {
      // Aggregate-only, but still gate to owner/registrants to preserve the
      // "who is registered" privacy boundary.
      const { checkTournamentAccess } = await import("@/lib/tournament-access.server");
      const access = await checkTournamentAccess(
        supabase as unknown as SupabaseClient,
        userId,
        event.tournament_id,
      );
      if (access.allowed) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: regs } = await supabaseAdmin
          .from("tournament_registrations")
          .select("user_id, status")
          .eq("tournament_id", event.tournament_id)
          .in("status", ["confirmed", "checked_in", "pending", "waitlist"]);
        const userIds = Array.from(
          new Set((regs ?? []).map((r) => (r as { user_id: string }).user_id)),
        );
        rosterCount = userIds.length;
        if (userIds.length) {
          const { data: profs } = await supabaseAdmin
            .from("profiles")
            .select("id, pdga_rating")
            .in("id", userIds);
          rosterWithRatings = (profs ?? []).filter(
            (p) => (p as { pdga_rating: number | null }).pdga_rating != null,
          ).length;
        }
      }
    }

    const suggestions: EventReadiness["suggestions"] = [];
    if (!hasPdgaProfile) {
      suggestions.push({
        key: "sync_pdga",
        label: "Sync your PDGA profile",
        reason: "Your official rating and rated-round history power odds and course targets.",
      });
    }
    if (rows.length < 8) {
      suggestions.push({
        key: "import_rounds",
        label: "Import more rated rounds",
        reason: `Only ${rows.length} rated round(s) on file — import from PDGA or UDisc for stronger course fits.`,
      });
    }
    if (event.pdga_event_ref && priorEventResults === 0) {
      suggestions.push({
        key: "pull_event_page",
        label: "Pull prior results at this event",
        reason:
          "We didn't find any of your rounds tied to this event yet — import from the PDGA event page or your PDGA profile.",
      });
    }
    if (courses.some((c) => c.level === "missing")) {
      suggestions.push({
        key: "add_course_data",
        label: "Add course/layout data",
        reason:
          "One or more rounds have no SSA and no past history — targets fall back to a rough estimate.",
      });
    }
    if (event.tournament_id && rosterCount > 0 && rosterWithRatings / rosterCount < 0.5) {
      suggestions.push({
        key: "sync_roster",
        label: "Ask the field to sync PDGA ratings",
        reason: `${rosterWithRatings}/${rosterCount} registrants have a rating — odds improve as more sync.`,
      });
    }

    const worst = courses.reduce<ReadinessLevel>((acc, c) => {
      if (c.level === "missing" || acc === "missing") return "missing";
      if (c.level === "partial" || acc === "partial") return "partial";
      return "good";
    }, "good");
    const overall: ReadinessLevel =
      !hasPdgaProfile || rows.length === 0 ? "missing" : worst === "missing" ? "partial" : worst;

    return {
      eventId: event.id,
      hasPdgaProfile,
      totalRatedRounds: rows.length,
      priorEventResults,
      rosterCount,
      rosterWithRatings,
      courses,
      overall,
      suggestions,
    };
  });

/* ------- 6. Manual entry of past tournament results at a course -------- */

const PastResultRow = z.object({
  played_on: z.string(), // yyyy-mm-dd
  score: z.number().int().min(1).max(200),
  round_rating: z.number().int().min(400).max(1200).nullable().optional(),
  ssa: z.number().min(20).max(140).nullable().optional(),
  notes: z.string().max(200).nullable().optional(),
});

const SavePastResultsInput = z.object({
  eventId: z.string(),
  course_name: z.string().min(1),
  layout_name: z.string().nullable().optional(),
  event_name: z.string().nullable().optional(),
  rows: z.array(PastResultRow).min(1).max(50),
});

export const savePastEventResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => SavePastResultsInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const inserts = data.rows.map((r) => ({
      user_id: userId,
      source: "manual" as const,
      course_name: data.course_name,
      layout_name: data.layout_name ?? null,
      event_name: data.event_name ?? null,
      played_on: r.played_on,
      score: r.score,
      to_par: null,
      round_rating: r.round_rating ?? null,
      ssa: r.ssa ?? null,
      notes: r.notes ?? null,
      format: "singles" as const,
      included: true,
    }));
    const { error } = await supabase.from("external_rounds").insert(inserts as never);
    if (error) throw new Error(error.message);
    return { inserted: inserts.length, eventId: data.eventId };
  });

/* --------------------- 7. Preferred division setter -------------------- */

const DIVISION_CODES = [
  "MPO",
  "FPO",
  "MP40",
  "FP40",
  "MP50",
  "FP50",
  "MP55",
  "FP55",
  "MP60",
  "FP60",
  "MP65",
  "FP65",
  "MP70",
  "FP70",
  "MA1",
  "MA2",
  "MA3",
  "MA4",
  "FA1",
  "FA2",
  "FA3",
  "FA4",
  "MA40",
  "FA40",
  "MA50",
  "FA50",
  "MA60",
  "FA60",
  "MJ18",
  "FJ18",
  "MJ15",
  "FJ15",
  "MJ12",
  "FJ12",
] as const;

const SetPreferredDivisionInput = z.object({
  division: z.string().min(1).max(12).nullable(),
});

export const setPreferredDivision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => SetPreferredDivisionInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const value = data.division ? data.division.trim().toUpperCase() : null;
    // Accept any reasonable PDGA code; whitelist common ones but allow event
    // divisions that fall outside (e.g. AM50, TP) so users can lock those too.
    if (value && !/^[A-Z][A-Z0-9]{1,11}$/.test(value)) {
      throw new Error("Invalid division code");
    }
    const { error } = await supabase
      .from("profiles")
      .update({ preferred_division: value } as never)
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { preferred_division: value, knownCodes: DIVISION_CODES };
  });

export const getPreferredDivision = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("profiles")
      .select("preferred_division")
      .eq("id", userId)
      .maybeSingle();
    return {
      preferred_division: ((data as { preferred_division?: string | null } | null)
        ?.preferred_division ?? null) as string | null,
      knownCodes: DIVISION_CODES,
    };
  });
