/**
 * Skill Engine (StatLink Phase 6)
 * -------------------------------
 * Turns hole-level score history into coaching insight:
 *   • how each par + distance bucket performs vs an elite benchmark
 *   • estimated strokes lost per round by category (putts, OB, par-3 tee, etc.)
 *   • prioritized "rating leaks" (rating points recoverable by fixing a category)
 *
 * Numbers are approximate — the goal is directional coaching, not a claim
 * of official PDGA math. Every tile in the UI shows how the number is
 * computed so users can trust or discard it.
 */

export type SkillHole = {
  strokes: number | null;
  putts: number | null;
  penalties: number | null;
  par: number | null;
  distance_ft: number | null;
};

/** Elite scoring average vs par for a well-designed hole at that par. */
const ELITE_VS_PAR: Record<number, number> = { 3: -0.32, 4: -0.55, 5: -0.85 };
/** Approx PDGA rating points lost per extra stroke on a typical 18-hole course. */
export const RATING_PER_STROKE = 10;

export type ParBucket = {
  par: number;
  holes: number;
  scoringAvg: number; // avg (strokes - par)
  eliteVsPar: number; // benchmark
  strokesLost: number; // (scoringAvg - eliteVsPar) — positive = below elite
  birdiePct: number;
  parPct: number;
  bogeyPlusPct: number;
};

export type DistanceBucket = {
  key: string;
  label: string;
  par: number;
  minFt: number;
  maxFt: number | null;
  holes: number;
  scoringAvg: number;
  eliteVsPar: number;
  strokesLost: number;
  birdiePct: number;
};

export type Leak = {
  id: string;
  category: string; // e.g. "Par 3 tee — 250–330 ft"
  strokesPerRound: number; // strokes lost per 18 holes in this category
  ratingImpact: number; // ≈ strokesPerRound * RATING_PER_STROKE
  sample: number; // # holes contributing
  suggestion: string;
};

export type SkillReport = {
  holesTracked: number;
  roundsTracked: number;
  byPar: ParBucket[];
  distance: DistanceBucket[];
  putts: {
    avg: number | null;
    threePuttPct: number;
    onePuttPct: number;
    holes: number;
  };
  /** rate is null when the scorecards never recorded penalties or putts. */
  ob: { rate: number | null; holesWithPenalty: number; holes: number };
  leaks: Leak[];
  strengths: Leak[];
  /** Total strokes lost per 18 vs elite baseline. */
  totalStrokesLostPerRound: number;
  /** Rating points recoverable if leaks were closed to baseline. */
  totalRatingUpside: number;
};

const DIST_BUCKETS: Array<{ par: number; label: string; min: number; max: number | null }> = [
  { par: 3, label: "Par 3 · short (<250 ft)", min: 0, max: 250 },
  { par: 3, label: "Par 3 · mid (250–330 ft)", min: 250, max: 330 },
  { par: 3, label: "Par 3 · long (330 ft+)", min: 330, max: null },
  { par: 4, label: "Par 4 · short (<450 ft)", min: 0, max: 450 },
  { par: 4, label: "Par 4 · mid (450–600 ft)", min: 450, max: 600 },
  { par: 4, label: "Par 4 · long (600 ft+)", min: 600, max: null },
  { par: 5, label: "Par 5 · any", min: 0, max: null },
];

function pct(n: number, d: number) {
  return d ? +((100 * n) / d).toFixed(1) : 0;
}

function suggestionFor(category: string): string {
  const c = category.toLowerCase();
  if (c.includes("par 3 · short"))
    return "Sharpen inside-circle putting and controlled upshots — these are your birdie holes.";
  if (c.includes("par 3 · mid"))
    return "Work on repeatable 300–330 ft lines; small line breakdowns cost the most rating.";
  if (c.includes("par 3 · long"))
    return "Trade distance for safe par — a controlled par-3 approach is worth more than a scramble.";
  if (c.includes("par 4 · short"))
    return "These should be birdie looks. Practice the tee → 120 ft upshot sequence.";
  if (c.includes("par 4 · mid"))
    return "Play for a Circle 2 look off the tee, not a Circle 1 gamble.";
  if (c.includes("par 4 · long"))
    return "Prioritize placement over max distance to keep a clean 3-shot par path.";
  if (c.includes("par 5"))
    return "Structure it as three planned shots — most strokes leak from a rushed second shot.";
  return "Focus practice sessions on this category to convert avoidable bogeys.";
}

export function buildSkillReport(scores: SkillHole[], distinctRoundIds: number): SkillReport {
  // ---- Par buckets ---------------------------------------------------------
  const parAgg = new Map<
    number,
    { count: number; diffSum: number; birdies: number; pars: number; bogeys: number }
  >();
  let obHoles = 0;
  let holesWithPutts = 0;
  let puttsSum = 0;
  let threePutts = 0;
  let onePutts = 0;
  let tracked = 0;

  for (const s of scores) {
    if (!s.strokes || !s.par) continue;
    tracked++;
    const diff = s.strokes - s.par;
    const bucket = parAgg.get(s.par) ?? { count: 0, diffSum: 0, birdies: 0, pars: 0, bogeys: 0 };
    bucket.count++;
    bucket.diffSum += diff;
    if (diff <= -1) bucket.birdies++;
    else if (diff === 0) bucket.pars++;
    else bucket.bogeys++;
    parAgg.set(s.par, bucket);

    if ((s.penalties ?? 0) > 0) obHoles++;
    if (typeof s.putts === "number" && s.putts > 0) {
      puttsSum += s.putts;
      holesWithPutts++;
      if (s.putts >= 3) threePutts++;
      if (s.putts === 1) onePutts++;
    }
  }

  const byPar: ParBucket[] = Array.from(parAgg.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([par, v]) => {
      const scoringAvg = +(v.diffSum / v.count).toFixed(2);
      const elite = ELITE_VS_PAR[par] ?? 0;
      return {
        par,
        holes: v.count,
        scoringAvg,
        eliteVsPar: elite,
        strokesLost: +(scoringAvg - elite).toFixed(2),
        birdiePct: pct(v.birdies, v.count),
        parPct: pct(v.pars, v.count),
        bogeyPlusPct: pct(v.bogeys, v.count),
      };
    });

  // ---- Distance buckets ----------------------------------------------------
  const distance: DistanceBucket[] = DIST_BUCKETS.map((b) => {
    const bucketScores = scores.filter(
      (s) =>
        s.par === b.par &&
        s.strokes != null &&
        s.distance_ft != null &&
        s.distance_ft >= b.min &&
        (b.max == null || s.distance_ft < b.max),
    );
    const holes = bucketScores.length;
    if (!holes) return null;
    const diffs = bucketScores.map((s) => (s.strokes as number) - (s.par as number));
    const avg = diffs.reduce((a, v) => a + v, 0) / holes;
    const elite = ELITE_VS_PAR[b.par] ?? 0;
    const birdies = diffs.filter((d) => d <= -1).length;
    return {
      key: `${b.par}-${b.min}-${b.max ?? "inf"}`,
      label: b.label,
      par: b.par,
      minFt: b.min,
      maxFt: b.max,
      holes,
      scoringAvg: +avg.toFixed(2),
      eliteVsPar: elite,
      strokesLost: +(avg - elite).toFixed(2),
      birdiePct: pct(birdies, holes),
    };
  }).filter((x): x is DistanceBucket => x != null);

  // ---- Leaks ---------------------------------------------------------------
  // Convert bucket strokesLost into strokes-per-round (18 holes) so users
  // can see a category impact in units they understand.
  const rounds = Math.max(1, distinctRoundIds);
  const totalHoles = tracked;
  const holesPerRound = totalHoles / rounds;

  const leakInputs: Array<{
    id: string;
    category: string;
    strokesLostPerHole: number;
    share: number;
    holes: number;
  }> = [];
  // Distance-level leaks (finer signal than par-level)
  for (const d of distance) {
    if (d.holes < 6) continue;
    leakInputs.push({
      id: d.key,
      category: d.label,
      strokesLostPerHole: d.strokesLost,
      share: d.holes / totalHoles,
      holes: d.holes,
    });
  }
  // Putting + OB categories
  const puttAvg = holesWithPutts ? puttsSum / holesWithPutts : null;
  if (puttAvg != null && holesWithPutts >= 9) {
    // Elite average putts / green ≈ 1.55. Every 0.1 above ≈ 0.1 str/hole.
    const puttStrokesLostPerHole = Math.max(0, puttAvg - 1.55);
    leakInputs.push({
      id: "putting",
      category: "Putting — 3-putt & long-putt conversion",
      strokesLostPerHole: puttStrokesLostPerHole,
      share: 1,
      holes: holesWithPutts,
    });
  }
  if (tracked >= 9) {
    // Elite OB rate ≈ 3%. Every 1% above ≈ 0.01 str/hole (penalty = 1 stroke).
    const obPerHole = Math.max(0, obHoles / tracked - 0.03);
    leakInputs.push({
      id: "ob",
      category: "OB & penalties",
      strokesLostPerHole: obPerHole,
      share: 1,
      holes: tracked,
    });
  }

  const scored: Leak[] = leakInputs.map((l) => {
    const strokesPerRound = +(
      l.strokesLostPerHole *
      (l.id === "putting" || l.id === "ob" ? holesPerRound : l.holes / rounds)
    ).toFixed(2);
    return {
      id: l.id,
      category: l.category,
      strokesPerRound,
      ratingImpact: Math.round(strokesPerRound * RATING_PER_STROKE),
      sample: l.holes,
      suggestion: suggestionFor(l.category),
    };
  });

  const leaks = scored
    .filter((l) => l.strokesPerRound > 0.05)
    .sort((a, b) => b.strokesPerRound - a.strokesPerRound)
    .slice(0, 5);

  const strengths = scored
    .filter((l) => l.strokesPerRound < -0.02)
    .sort((a, b) => a.strokesPerRound - b.strokesPerRound)
    .slice(0, 3);

  const totalStrokesLostPerRound = +byPar
    .reduce((sum, b) => {
      // Only include par buckets that are worse than elite. Better-than-elite
      // buckets show as strengths but don't offset leaks in the "upside" total.
      if (b.strokesLost <= 0) return sum;
      return sum + b.strokesLost * (b.holes / rounds);
    }, 0)
    .toFixed(2);

  return {
    holesTracked: tracked,
    roundsTracked: rounds,
    byPar,
    distance,
    putts: {
      avg: puttAvg != null ? +puttAvg.toFixed(2) : null,
      threePuttPct: pct(threePutts, holesWithPutts),
      onePuttPct: pct(onePutts, holesWithPutts),
      holes: holesWithPutts,
    },
    ob: {
      rate: obHoles > 0 || holesWithPutts > 0 ? pct(obHoles, tracked) : null,
      holesWithPenalty: obHoles,
      holes: tracked,
    },
    leaks,
    strengths,
    totalStrokesLostPerRound,
    totalRatingUpside: Math.round(totalStrokesLostPerRound * RATING_PER_STROKE),
  };
}
