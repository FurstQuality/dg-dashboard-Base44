import { validUdiscRating } from "./udisc-eligibility";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ScoringBreakdown = {
  totalHoles: number;
  aces: number;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doublePlus: number;
  // percentages (0-100)
  acePct: number;
  eaglePct: number;
  birdiePct: number;
  parPct: number;
  bogeyPct: number;
  doublePlusPct: number;
};

export type EventHighlights = {
  totalEvents: number;
  totalRatedRounds: number;
  bestRoundRating: number | null;
  bestRoundEvent: string | null;
  bestRoundDate: string | null;
  topEventAvg: number | null;
  topEventName: string | null;
  leagueRounds: number;
  tournamentRounds: number;
  wins: number;
  podiums: number;
  finishesRecorded: number;
};

export type EventBucket = {
  events: number;
  rounds: number;
  ratedRounds: number;
  bestRating: number | null;
  bestEvent: string | null;
  bestDate: string | null;
};
export type SourceEventSplit = { tournament: EventBucket; league: EventBucket };
/** Events split by rating source, then tournament vs league. Ratings never mix sources. */
export type EventsBySource = { pdga: SourceEventSplit; udisc: SourceEventSplit; dgd: SourceEventSplit };

export type ScoringFilters = {
  rounds: {
    id: string;
    label: string;
    date: string | null;
    courseId: string | null;
    courseName: string | null;
    eventName: string | null;
    source: "chainlink" | "udisc" | "pdga";
  }[];
  courses: { id: string; name: string }[];
  events: { name: string }[];
};

export type RoundsSummary = {
  totalRounds: number;
  bySource: { chainlink: number; udisc: number; pdga: number };
  withHoleData: number;
  totalsOnly: number;
  avgToPar: number | null;
  bestToPar: number | null;
  worstToPar: number | null;
  subParPct: number; // % of rated rounds that finished under par
  atParPct: number;
  overParPct: number;
};

export type PlayerBreakdowns = {
  scoring: ScoringBreakdown;
  roundsSummary: RoundsSummary;
  highlights: EventHighlights;
  eventsBySource: EventsBySource;
  filters: ScoringFilters;
  scope: { kind: "all" | "course" | "event" | "round"; value: string | null };
  scopeMeta?: { totalsOnly?: boolean; sources?: ("chainlink" | "udisc" | "pdga")[] };
};

const EMPTY_SCORING: ScoringBreakdown = {
  totalHoles: 0,
  aces: 0,
  eagles: 0,
  birdies: 0,
  pars: 0,
  bogeys: 0,
  doublePlus: 0,
  acePct: 0,
  eaglePct: 0,
  birdiePct: 0,
  parPct: 0,
  bogeyPct: 0,
  doublePlusPct: 0,
};

const EMPTY_HIGHLIGHTS: EventHighlights = {
  totalEvents: 0,
  totalRatedRounds: 0,
  bestRoundRating: null,
  bestRoundEvent: null,
  bestRoundDate: null,
  topEventAvg: null,
  topEventName: null,
  leagueRounds: 0,
  tournamentRounds: 0,
  wins: 0,
  podiums: 0,
  finishesRecorded: 0,
};

function pct(n: number, total: number): number {
  if (!total) return 0;
  return Math.round((n / total) * 1000) / 10;
}

const inputSchema = z
  .object({
    scope: z.enum(["all", "course", "event", "round"]).default("all"),
    value: z.string().nullable().optional(),
  })
  .optional();

export const getMyPlayerBreakdowns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ context, data }): Promise<PlayerBreakdowns> => {
    const { supabase, userId } = context;
    const scopeKind = data?.scope ?? "all";
    const scopeValue = data?.value ?? null;

    // ---------- Load user's rounds (with course + event for filter dropdown) ----------
    const { data: myRounds } = await supabase
      .from("rounds")
      .select("id, layout_id, course_id, started_at, tournament_id, league_event_id")
      .eq("created_by", userId);

    const allRounds = myRounds ?? [];
    const courseIds = Array.from(
      new Set(allRounds.map((r) => r.course_id as string | null).filter(Boolean)),
    ) as string[];
    const layoutIds = Array.from(
      new Set(allRounds.map((r) => r.layout_id as string | null).filter(Boolean)),
    ) as string[];
    const tournamentIds = Array.from(
      new Set(allRounds.map((r) => r.tournament_id as string | null).filter(Boolean)),
    ) as string[];
    const leagueEventIds = Array.from(
      new Set(allRounds.map((r) => r.league_event_id as string | null).filter(Boolean)),
    ) as string[];

    const [{ data: courseRows }, { data: tournamentRows }, { data: leagueEventRows }] =
      await Promise.all([
        courseIds.length
          ? supabase.from("courses").select("id, name").in("id", courseIds)
          : Promise.resolve({ data: [] as any[] }),
        tournamentIds.length
          ? supabase.from("tournaments").select("id, name").in("id", tournamentIds)
          : Promise.resolve({ data: [] as any[] }),
        leagueEventIds.length
          ? supabase.from("league_events").select("id, name, league_id").in("id", leagueEventIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

    const courseName = new Map<string, string>();
    for (const c of (courseRows ?? []) as any[]) courseName.set(c.id, c.name);
    const eventNameByRound = new Map<string, string>();
    const tournamentName = new Map<string, string>();
    for (const t of (tournamentRows ?? []) as any[]) tournamentName.set(t.id, t.name);
    const leagueEventName = new Map<string, string>();
    for (const le of (leagueEventRows ?? []) as any[]) leagueEventName.set(le.id, le.name);
    for (const r of allRounds) {
      const tName = r.tournament_id ? tournamentName.get(r.tournament_id as string) : undefined;
      const lName = r.league_event_id
        ? leagueEventName.get(r.league_event_id as string)
        : undefined;
      const name = tName || lName;
      if (name) eventNameByRound.set(r.id as string, name);
    }

    // ---------- Pull external PDGA rounds ----------
    // StatLink breakdowns are PDGA-driven: only PDGA-sourced rounds (including
    // PDGA results imported from Disc Golf Scene) join the native DG Dashboard
    // rounds here. UDisc imports live solely behind the DG Statboard source
    // switcher on /stats.
    const { data: extAll } = await supabase
      .from("external_rounds")
      .select(
        "id, source, event_name, played_on, course_name, layout_name, score, to_par, round_rating",
      )
      .eq("user_id", userId)
      .in("source", ["pdga", "disc_golf_scene"]);
    const externalRounds = (extAll ?? []) as Array<{
      id: string;
      source: string;
      event_name: string | null;
      played_on: string | null;
      course_name: string | null;
      layout_name: string | null;
      score: number | null;
      to_par: number | null;
      round_rating: number | null;
    }>;

    // ---------- Build filter options ----------
    const nativeRoundOptions = allRounds
      .slice()
      .sort((a, b) => String(b.started_at ?? "").localeCompare(String(a.started_at ?? "")))
      .map((r) => {
        const cName = r.course_id ? (courseName.get(r.course_id as string) ?? null) : null;
        const eName = eventNameByRound.get(r.id as string) ?? null;
        const date = r.started_at ? String(r.started_at).slice(0, 10) : null;
        const parts = ["DGD", date, cName ?? "Course TBD", eName].filter(Boolean);
        return {
          id: r.id as string,
          label: parts.join(" · "),
          date,
          courseId: (r.course_id as string | null) ?? null,
          courseName: cName,
          eventName: eName,
          source: "chainlink" as const,
        };
      });

    const externalRoundOptions = externalRounds
      .slice()
      .sort((a, b) => String(b.played_on ?? "").localeCompare(String(a.played_on ?? "")))
      .map((r) => {
        const src =
          r.source === "pdga" || r.source === "disc_golf_scene"
            ? ("pdga" as const)
            : r.source === "udisc"
              ? ("udisc" as const)
              : ("udisc" as const);
        const label = [
          src === "pdga" ? "PDGA" : "UDisc",
          r.played_on ?? null,
          r.course_name ?? "Course TBD",
          r.event_name ?? null,
        ]
          .filter(Boolean)
          .join(" · ");
        return {
          id: `ext:${r.id}`,
          label,
          date: r.played_on,
          courseId: null,
          courseName: r.course_name,
          eventName: r.event_name,
          source: src,
        };
      });

    const roundOptions = [...nativeRoundOptions, ...externalRoundOptions];

    const coursesForFilter = Array.from(
      new Map(
        allRounds
          .filter((r) => r.course_id)
          .map((r) => [r.course_id as string, courseName.get(r.course_id as string) ?? "Unknown"]),
      ).entries(),
    )
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Event options unify internal, external, and scheduled event names.
    const externalEventNames = new Set<string>();
    for (const r of externalRounds) {
      const n = (r.event_name ?? "").trim();
      if (n) externalEventNames.add(n);
    }

    const { data: schedRows } = await supabase
      .from("scheduled_events")
      .select("title")
      .eq("user_id", userId);
    const scheduledEventNames = new Set<string>();
    for (const row of (schedRows ?? []) as any[]) {
      const n = ((row.title as string | null) ?? "").trim();
      if (n) scheduledEventNames.add(n);
    }

    const combinedEventNames = new Set<string>([
      ...Array.from(eventNameByRound.values()),
      ...externalEventNames,
      ...scheduledEventNames,
    ]);
    const eventsForFilter = Array.from(combinedEventNames)
      .map((name) => ({ name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // ---------- Apply scope filter to which rounds feed the scoring breakdown ----------
    let filteredRounds = allRounds;
    let filteredExternal = externalRounds;
    if (scopeKind === "round" && scopeValue) {
      if (scopeValue.startsWith("ext:")) {
        const extId = scopeValue.slice(4);
        filteredRounds = [];
        filteredExternal = externalRounds.filter((r) => r.id === extId);
      } else {
        filteredRounds = allRounds.filter((r) => r.id === scopeValue);
        filteredExternal = [];
      }
    } else if (scopeKind === "course" && scopeValue) {
      const courseNameForId = courseName.get(scopeValue) ?? null;
      filteredRounds = allRounds.filter((r) => r.course_id === scopeValue);
      filteredExternal = courseNameForId
        ? externalRounds.filter(
            (r) => (r.course_name ?? "").toLowerCase() === courseNameForId.toLowerCase(),
          )
        : [];
    } else if (scopeKind === "event" && scopeValue) {
      filteredRounds = allRounds.filter((r) => eventNameByRound.get(r.id as string) === scopeValue);
      filteredExternal = externalRounds.filter((r) => (r.event_name ?? "") === scopeValue);
    }

    const roundIds = filteredRounds.map((r) => r.id as string);
    const filteredLayoutIds = Array.from(
      new Set(filteredRounds.map((r) => r.layout_id as string).filter(Boolean)),
    );
    const externalIds = filteredExternal.map((r) => r.id);

    let aces = 0,
      eagles = 0,
      birdies = 0,
      pars = 0,
      bogeys = 0,
      doublePlus = 0,
      total = 0;
    const sourcesInScope = new Set<"chainlink" | "udisc" | "pdga">();

    // Chainlink live rounds → round_scores + holes
    if (roundIds.length && filteredLayoutIds.length) {
      const [{ data: scores }, { data: holes }] = await Promise.all([
        supabase
          .from("round_scores")
          .select("round_id, hole_number, strokes")
          .in("round_id", roundIds)
          .not("strokes", "is", null),
        supabase.from("holes").select("layout_id, number, par").in("layout_id", filteredLayoutIds),
      ]);

      const parMap = new Map<string, number>();
      for (const h of holes ?? []) {
        parMap.set(`${h.layout_id}:${h.number}`, h.par as number);
      }
      const roundLayout = new Map<string, string>();
      for (const r of filteredRounds) roundLayout.set(r.id as string, r.layout_id as string);

      let contributedNative = false;
      for (const s of scores ?? []) {
        const layoutId = roundLayout.get(s.round_id as string);
        if (!layoutId) continue;
        const par = parMap.get(`${layoutId}:${s.hole_number}`);
        if (!par) continue;
        const strokes = s.strokes as number;
        if (!strokes || strokes < 1) continue;
        total++;
        contributedNative = true;
        if (strokes === 1) aces++;
        else {
          const diff = strokes - par;
          if (diff <= -2) eagles++;
          else if (diff === -1) birdies++;
          else if (diff === 0) pars++;
          else if (diff === 1) bogeys++;
          else doublePlus++;
        }
      }
      if (contributedNative) sourcesInScope.add("chainlink");
    }

    // External (UDisc) rounds → external_round_holes (par + strokes stored per hole)
    if (externalIds.length) {
      const { data: extHoles } = await supabase
        .from("external_round_holes")
        .select("external_round_id, hole_number, par, strokes")
        .in("external_round_id", externalIds);
      const sourceById = new Map<string, string>();
      for (const r of filteredExternal) sourceById.set(r.id, r.source);
      for (const h of extHoles ?? []) {
        const strokes = h.strokes as number | null;
        const par = h.par as number | null;
        if (!strokes || strokes < 1) continue;
        total++;
        const src = sourceById.get(h.external_round_id as string);
        if (src === "pdga") sourcesInScope.add("pdga");
        else sourcesInScope.add("udisc");
        if (strokes === 1) aces++;
        else if (par && par > 0) {
          const diff = strokes - par;
          if (diff <= -2) eagles++;
          else if (diff === -1) birdies++;
          else if (diff === 0) pars++;
          else if (diff === 1) bogeys++;
          else doublePlus++;
        } else {
          // No par recorded — count as par so totals still reflect the hole.
          pars++;
        }
      }
    }

    const scoring: ScoringBreakdown = {
      totalHoles: total,
      aces,
      eagles,
      birdies,
      pars,
      bogeys,
      doublePlus,
      acePct: pct(aces, total),
      eaglePct: pct(eagles, total),
      birdiePct: pct(birdies, total),
      parPct: pct(pars, total),
      bogeyPct: pct(bogeys, total),
      doublePlusPct: pct(doublePlus, total),
    };

    // Detect totals-only scope: user selected a specific round/event with no per-hole data.
    let totalsOnly = false;
    if (total === 0 && scopeKind === "round" && scopeValue?.startsWith("ext:")) {
      totalsOnly = true;
    }

    // ---------- Rounds summary (totals-based, covers ALL rounds in scope across sources) ----------
    // Chainlink rounds count toward totals even when per-hole is missing; external
    // rounds contribute their stored score / to_par. This is the honest way to
    // reflect every round on the scoring page regardless of source.
    const nativeRoundsInScope = filteredRounds.length;
    const externalInScope = filteredExternal;
    const externalWithHoles = new Set<string>();
    if (externalIds.length) {
      const { data: extWith } = await supabase
        .from("external_round_holes")
        .select("external_round_id")
        .in("external_round_id", externalIds);
      for (const row of (extWith ?? []) as any[]) {
        externalWithHoles.add(row.external_round_id as string);
      }
    }

    // Count Chainlink rounds that actually have per-hole score data.
    let nativeWithHoles = 0;
    if (roundIds.length) {
      const { data: cScored } = await supabase
        .from("round_scores")
        .select("round_id")
        .in("round_id", roundIds)
        .not("strokes", "is", null)
        .limit(50000);
      nativeWithHoles = new Set((cScored ?? []).map((s: any) => s.round_id as string)).size;
    }

    const bySource = { chainlink: nativeRoundsInScope, udisc: 0, pdga: 0 };
    const toParValues: number[] = [];
    for (const r of externalInScope) {
      const isSanctionedDgs = r.source === "disc_golf_scene" && r.round_rating != null;
      if (r.source === "pdga" || isSanctionedDgs) bySource.pdga++;
      else bySource.udisc++;
      if (typeof r.to_par === "number") toParValues.push(r.to_par);
    }

    const totalRoundsInScope = nativeRoundsInScope + externalInScope.length;
    const withHoleData = nativeWithHoles + externalWithHoles.size;
    const summaryTotalsOnly = totalRoundsInScope - withHoleData;

    const rated = toParValues.length;
    const avgToPar = rated
      ? Math.round((toParValues.reduce((a, b) => a + b, 0) / rated) * 10) / 10
      : null;
    const bestToPar = rated ? Math.min(...toParValues) : null;
    const worstToPar = rated ? Math.max(...toParValues) : null;
    const subPar = toParValues.filter((v) => v < 0).length;
    const atPar = toParValues.filter((v) => v === 0).length;
    const overPar = toParValues.filter((v) => v > 0).length;

    const roundsSummary: RoundsSummary = {
      totalRounds: totalRoundsInScope,
      bySource,
      withHoleData,
      totalsOnly: Math.max(0, summaryTotalsOnly),
      avgToPar,
      bestToPar,
      worstToPar,
      subParPct: pct(subPar, rated),
      atParPct: pct(atPar, rated),
      overParPct: pct(overPar, rated),
    };

    // ---------- Event highlights, split by source then tournament/league ----------
    const { data: ext } = await supabase
      .from("external_rounds")
      .select("event_name, course_name, played_on, round_rating, source, format, event_context")
      .eq("user_id", userId);

    type Acc = { keys: Set<string>; b: EventBucket };
    const mk = (): Acc => ({
      keys: new Set(),
      b: { events: 0, rounds: 0, ratedRounds: 0, bestRating: null, bestEvent: null, bestDate: null },
    });
    const acc = {
      pdga: { tournament: mk(), league: mk() },
      udisc: { tournament: mk(), league: mk() },
      dgd: { tournament: mk(), league: mk() },
    };
    const add = (a: Acc, key: string, name: string, date: string | null, rating: number | null) => {
      a.keys.add(key);
      a.b.rounds++;
      if (rating != null) {
        a.b.ratedRounds++;
        if (a.b.bestRating == null || rating > a.b.bestRating) {
          a.b.bestRating = rating;
          a.b.bestEvent = name;
          a.b.bestDate = date;
        }
      }
    };

    const highlights: EventHighlights = { ...EMPTY_HIGHLIGHTS };
    const pdgaEvents = new Map<string, { count: number; sum: number; name: string }>();
    let best = { rating: -Infinity, event: "", date: "" };
    for (const r of (ext ?? []) as any[]) {
      if ((r.format ?? "singles") !== "singles") continue;
      const src = r.source as string;
      const date = (r.played_on as string) || null;
      if (src === "pdga" || src === "disc_golf_scene") {
        const name = (r.event_name as string) || "Event";
        const kind = /league/i.test(name) ? "league" : "tournament";
        const rating = (r.round_rating as number | null) ?? null;
        add(acc.pdga[kind], `${name}|${kind === "league" ? date : ""}`, name, date, rating);
        if (rating == null) continue;
        // Legacy PDGA-only highlight fields.
        highlights.totalRatedRounds++;
        if (kind === "league") highlights.leagueRounds++;
        else highlights.tournamentRounds++;
        const key = `${name}|${date}`;
        const e = pdgaEvents.get(key) ?? { count: 0, sum: 0, name };
        e.count++;
        e.sum += rating;
        pdgaEvents.set(key, e);
        if (rating > best.rating) best = { rating, event: name, date: date ?? "" };
      } else if (src === "udisc") {
        const ctx = r.event_context as string | null;
        const kind = ctx === "LEAGUE" ? "league" : ctx === "TOURNAMENT" ? "tournament" : null;
        if (!kind) continue;
        const name = (r.event_name as string) || (r.course_name as string) || "UDisc event";
        add(acc.udisc[kind], `${name}|${date}`, name, date, validUdiscRating(r.round_rating));
      }
    }
    highlights.totalEvents = pdgaEvents.size;
    if (best.rating > -Infinity) {
      highlights.bestRoundRating = best.rating;
      highlights.bestRoundEvent = best.event;
      highlights.bestRoundDate = best.date || null;
    }
    let topEvent: { avg: number; name: string } | null = null;
    for (const e of pdgaEvents.values()) {
      const avg = Math.round(e.sum / e.count);
      if (!topEvent || avg > topEvent.avg) topEvent = { avg, name: e.name };
    }
    if (topEvent) {
      highlights.topEventAvg = topEvent.avg;
      highlights.topEventName = topEvent.name;
    }

    // DG Dashboard events: rounds scored here inside a tournament or league night.
    const eventRounds = allRounds.filter((r) => r.tournament_id || r.league_event_id);
    if (eventRounds.length) {
      const { data: rr } = await supabase
        .from("round_ratings")
        .select("round_id, round_rating")
        .eq("user_id", userId)
        .in("round_id", eventRounds.map((r) => r.id as string));
      const ratingByRound = new Map<string, number | null>();
      for (const x of (rr ?? []) as any[]) ratingByRound.set(x.round_id, x.round_rating ?? null);
      for (const r of eventRounds) {
        const isLeague = !!r.league_event_id;
        const id = (isLeague ? r.league_event_id : r.tournament_id) as string;
        const name = isLeague
          ? (leagueEventRows ?? []).find((x: any) => x.id === id)?.name ?? "League night"
          : (tournamentRows ?? []).find((x: any) => x.id === id)?.name ?? "Tournament";
        add(
          acc.dgd[isLeague ? "league" : "tournament"],
          id,
          name,
          ((r.started_at as string) || "").slice(0, 10) || null,
          ratingByRound.get(r.id as string) ?? null,
        );
      }
    }
    const fin = (a: Acc): EventBucket => ({ ...a.b, events: a.keys.size });
    const eventsBySource: EventsBySource = {
      pdga: { tournament: fin(acc.pdga.tournament), league: fin(acc.pdga.league) },
      udisc: { tournament: fin(acc.udisc.tournament), league: fin(acc.udisc.league) },
      dgd: { tournament: fin(acc.dgd.tournament), league: fin(acc.dgd.league) },
    };

    const { data: prof } = await supabase
      .from("profiles")
      .select("pdga_number")
      .eq("id", userId)
      .maybeSingle();
    const pdga = ((prof?.pdga_number as string | null) ?? "").replace(/\D/g, "");
    if (pdga) {
      const { data: finishes } = await supabase
        .from("pdga_events")
        .select("place")
        .eq("pdga_number", pdga)
        .not("place", "is", null);
      if (finishes && finishes.length) {
        highlights.finishesRecorded = finishes.length;
        for (const f of finishes) {
          const p = Number(f.place);
          if (!Number.isFinite(p) || p < 1) continue;
          if (p === 1) highlights.wins++;
          if (p <= 3) highlights.podiums++;
        }
      }
    }

    // layoutIds retained for future use but not returned
    void layoutIds;

    return {
      scoring,
      roundsSummary,
      highlights,
      eventsBySource,
      filters: { rounds: roundOptions, courses: coursesForFilter, events: eventsForFilter },
      scope: { kind: scopeKind, value: scopeValue },
      scopeMeta: { totalsOnly, sources: Array.from(sourcesInScope) },
    };
  });
