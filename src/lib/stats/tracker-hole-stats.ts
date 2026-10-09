import { summarizeScores, type HoleScore, type ScoringSummary } from "./scoring-stats";

/**
 * Verified hole-by-hole rounds mirrored from PDGA live scoring by the friend
 * tracker. Every row here is official event data (pars, distances, and
 * per-hole strokes as posted by the PDGA), so it is the highest-confidence
 * scoring source the statboard has — imports from UDisc/DGS never carry
 * hole detail.
 */
export type TrackerScoreRow = {
  event_id: string;
  round_number: number | null;
  division: string | null;
  place: number | null;
  round_score: number | null;
  round_to_par: number | null;
  completed: boolean;
  hole_scores: unknown;
  hole_pars: unknown;
  hole_lengths: unknown;
  hole_length_units: string | null;
};

export type TrackerEventMeta = {
  name: string | null;
  date: string | null;
  location: string | null;
};

export type TrackerRoundSummary = {
  eventId: string;
  eventName: string;
  eventDate: string | null;
  location: string | null;
  roundNumber: number | null;
  courseName: string | null;
  holes: number;
  strokes: number | null;
  toPar: number | null;
  place: number | null;
  division: string | null;
  birdies: number;
  bogeyPlus: number;
};

export type TrackerHoleInsights = {
  summary: ScoringSummary;
  roundsCounted: number;
  eventsCounted: number;
  coursesCounted: number;
  rounds: TrackerRoundSummary[];
  byCourse: Array<{
    course: string;
    rounds: number;
    holes: number;
    avgToPar: number;
    birdiePct: number;
  }>;
  byDistance: Array<{ bucket: string; holes: number; scoringAvg: number; birdiePct: number }>;
  toughestHoles: Array<{
    course: string;
    hole: number;
    par: number;
    length: number | null;
    plays: number;
    scoringAvg: number;
  }>;
  bestHoles: Array<{
    course: string;
    hole: number;
    par: number;
    length: number | null;
    plays: number;
    scoringAvg: number;
  }>;
};

function numArray(raw: unknown): Array<number | null> {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  });
}

function toFeet(value: number | null, units: string | null): number | null {
  if (value == null) return null;
  const u = (units ?? "ft").toLowerCase();
  if (u.startsWith("m")) return Math.round(value * 3.28084);
  return Math.round(value);
}

const DISTANCE_BUCKETS: Array<{ label: string; max: number }> = [
  { label: "Under 300 ft", max: 300 },
  { label: "300–450 ft", max: 450 },
  { label: "450–700 ft", max: 700 },
  { label: "700+ ft", max: Infinity },
];

function bucketFor(feet: number): string {
  return (
    DISTANCE_BUCKETS.find((b) => feet < b.max) ?? DISTANCE_BUCKETS[DISTANCE_BUCKETS.length - 1]
  ).label;
}

/**
 * Roll verified tracker rows into statboard-ready aggregates.
 * `courseByRound` maps `${event_id}:${round_number}` → course name, sourced
 * from the tracker's published round/pool schedule.
 */
export function buildTrackerHoleInsights(
  rows: TrackerScoreRow[],
  events: Map<string, TrackerEventMeta>,
  courseByRound: Map<string, string>,
  parsByRound?: Map<string, Array<number | null>>,
): TrackerHoleInsights {
  const holeScores: HoleScore[] = [];
  const rounds: TrackerRoundSummary[] = [];
  const courseAgg = new Map<
    string,
    { rounds: number; holes: number; diff: number; under: number; scored: number }
  >();
  const distAgg = new Map<string, { holes: number; diff: number; under: number }>();
  const holeAgg = new Map<
    string,
    {
      course: string;
      hole: number;
      par: number;
      length: number | null;
      plays: number;
      diff: number;
    }
  >();
  const eventIds = new Set<string>();

  for (const row of rows) {
    const scores = numArray(row.hole_scores);
    if (!scores.length) continue;

    const key = `${row.event_id}:${row.round_number ?? 0}`;
    // Pars come from the live PDGA feed. Older rows predate par capture, so
    // fall back to any par set posted for the same event round (every card on
    // a round plays the same layout) before giving up on hole-level splits.
    const pars = numArray(row.hole_pars);
    const parSet = pars.length ? pars : (parsByRound?.get(key) ?? []);
    const lengths = numArray(row.hole_lengths);
    const course = courseByRound.get(key) ?? null;
    const courseLabel = course ?? "Course not posted";
    const meta = events.get(row.event_id);

    let played = 0;
    let scoredHoles = 0;
    let birdies = 0;
    let bogeyPlus = 0;
    let diffTotal = 0;

    for (let i = 0; i < scores.length; i++) {
      const strokes = scores[i];
      if (!strokes) continue;
      played++;
      const par = parSet[i] ?? null;
      if (!par) continue;
      scoredHoles++;
      const diff = strokes - par;
      diffTotal += diff;
      if (diff < 0) birdies++;
      if (diff > 0) bogeyPlus++;

      // Tracker rows never carry putts or penalties — PDGA posts strokes only.
      holeScores.push({ strokes, par, putts: null, penalties: null });

      const feet = toFeet(lengths[i] ?? null, row.hole_length_units);
      if (feet != null) {
        const b = bucketFor(feet);
        const d = distAgg.get(b) ?? { holes: 0, diff: 0, under: 0 };
        d.holes++;
        d.diff += diff;
        if (diff < 0) d.under++;
        distAgg.set(b, d);
      }

      const hKey = `${courseLabel}#${i + 1}`;
      const h = holeAgg.get(hKey) ?? {
        course: courseLabel,
        hole: i + 1,
        par,
        length: feet,
        plays: 0,
        diff: 0,
      };
      h.plays++;
      h.diff += diff;
      if (h.length == null) h.length = feet;
      holeAgg.set(hKey, h);
    }

    if (!played) continue;
    eventIds.add(row.event_id);

    // Round-level to par is authoritative when PDGA posts it; the hole sum is
    // only used for rounds where it's missing.
    const roundToPar = row.round_to_par ?? (scoredHoles ? diffTotal : null);

    const c = courseAgg.get(courseLabel) ?? { rounds: 0, holes: 0, diff: 0, under: 0, scored: 0 };
    c.rounds++;
    c.holes += played;
    c.diff += roundToPar ?? 0;
    c.under += birdies;
    c.scored += scoredHoles;
    courseAgg.set(courseLabel, c);

    rounds.push({
      eventId: row.event_id,
      eventName: meta?.name ?? "Tracked event",
      eventDate: meta?.date ?? null,
      location: meta?.location ?? null,
      roundNumber: row.round_number,
      courseName: course,
      holes: played,
      strokes: row.round_score ?? null,
      toPar: roundToPar,
      place: row.place,
      division: row.division,
      birdies,
      bogeyPlus,
    });
  }

  rounds.sort((a, b) => {
    const d = (b.eventDate ?? "").localeCompare(a.eventDate ?? "");
    if (d !== 0) return d;
    return (b.roundNumber ?? 0) - (a.roundNumber ?? 0);
  });

  const holeList = Array.from(holeAgg.values())
    .filter((h) => h.plays > 0)
    .map((h) => ({ ...h, scoringAvg: +(h.diff / h.plays).toFixed(2) }));

  return {
    summary: summarizeScores(holeScores),
    roundsCounted: rounds.length,
    eventsCounted: eventIds.size,
    coursesCounted: Array.from(courseAgg.keys()).filter((c) => c !== "Course not posted").length,
    rounds,
    byCourse: Array.from(courseAgg.entries())
      .map(([course, v]) => ({
        course,
        rounds: v.rounds,
        holes: v.holes,
        avgToPar: +(v.diff / v.rounds).toFixed(1),
        birdiePct: v.holes ? +((100 * v.under) / v.holes).toFixed(1) : 0,
      }))
      .sort((a, b) => a.avgToPar - b.avgToPar),
    byDistance: DISTANCE_BUCKETS.map((b) => {
      const v = distAgg.get(b.label);
      return v && v.holes
        ? {
            bucket: b.label,
            holes: v.holes,
            scoringAvg: +(v.diff / v.holes).toFixed(2),
            birdiePct: +((100 * v.under) / v.holes).toFixed(1),
          }
        : null;
    }).filter((x): x is NonNullable<typeof x> => x != null),
    toughestHoles: [...holeList].sort((a, b) => b.scoringAvg - a.scoringAvg).slice(0, 6),
    bestHoles: [...holeList].sort((a, b) => a.scoringAvg - b.scoringAvg).slice(0, 6),
  };
}
