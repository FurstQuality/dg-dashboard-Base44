export type HoleScore = {
  strokes: number | null;
  putts: number | null;
  penalties: number | null;
  par: number | null;
};

export type ScoringSummary = {
  holesTracked: number;
  aces: number;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doublePlus: number;
  birdiePct: number;
  parPct: number;
  bogeyPlusPct: number;
  /** Null when no recorded hole tracked penalties — never shown as 0%. */
  obRate: number | null;
  avgPutts: number | null;
  byPar: Array<{ par: number; count: number; scoringAvg: number }>;
};

export function summarizeScores(scores: HoleScore[]): ScoringSummary {
  let aces = 0,
    eagles = 0,
    birdies = 0,
    pars = 0,
    bogeys = 0,
    doublePlus = 0;
  let obHoles = 0,
    puttsSum = 0,
    puttsCount = 0,
    penaltiesTracked = 0;
  const parBuckets = new Map<number, { count: number; sum: number }>();
  let tracked = 0;

  for (const s of scores) {
    if (!s.strokes || !s.par) continue;
    tracked++;
    const diff = s.strokes - s.par;
    if (s.strokes === 1) aces++;
    else if (diff <= -2) eagles++;
    else if (diff === -1) birdies++;
    else if (diff === 0) pars++;
    else if (diff === 1) bogeys++;
    else doublePlus++;

    if (s.penalties != null) penaltiesTracked++;
    if ((s.penalties ?? 0) > 0) obHoles++;
    // A 0 putt count is the scorecard default, not a recorded stat.
    if (typeof s.putts === "number" && s.putts > 0) {
      puttsSum += s.putts;
      puttsCount++;
    }

    const bucket = parBuckets.get(s.par) ?? { count: 0, sum: 0 };
    bucket.count++;
    bucket.sum += diff;
    parBuckets.set(s.par, bucket);
  }

  const under = aces + eagles + birdies;
  const bogeyPlus = bogeys + doublePlus;
  return {
    holesTracked: tracked,
    aces,
    eagles,
    birdies,
    pars,
    bogeys,
    doublePlus,
    birdiePct: tracked ? +((100 * under) / tracked).toFixed(1) : 0,
    parPct: tracked ? +((100 * pars) / tracked).toFixed(1) : 0,
    bogeyPlusPct: tracked ? +((100 * bogeyPlus) / tracked).toFixed(1) : 0,
    // Penalties count as tracked only when the scorecards show detailed stats
    // (some putts or some penalty recorded); all-zero defaults read "Not tracked".
    obRate: penaltiesTracked && (obHoles > 0 || puttsCount > 0) ? +((100 * obHoles) / penaltiesTracked).toFixed(1) : null,
    avgPutts: puttsCount ? +(puttsSum / puttsCount).toFixed(2) : null,
    byPar: Array.from(parBuckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([par, v]) => ({ par, count: v.count, scoringAvg: +(v.sum / v.count).toFixed(2) })),
  };
}
