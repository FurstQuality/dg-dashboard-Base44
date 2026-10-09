/**
 * PDGA-first player rating estimator (client-side fallback path).
 *
 * PDGA methodology (public — see
 * https://www.pdga.com/faq/ratings/how-is-your-rating-calculated):
 *   - Singles rounds only. Doubles/team are excluded.
 *   - "Included" rounds only when the flag is known.
 *   - Rolling 12-month window; extend to 24 months if fewer than 8 rated
 *     rounds in the last 12.
 *   - When 7+ rounds are included, drop rounds more than 100 pts AND more
 *     than 2.5σ below the simple mean (both conditions required).
 *   - When 9+ rounds remain, double-weight the most recent 25% BY DATE
 *     (NOT top 25% by rating — a common misreading of the PDGA rules).
 */
export type RatedRound = {
  played_on: string;
  round_rating: number | null;
  score: number;
  ssa: number | null;
  source?: string | null;
  format?: string | null;
  included?: boolean | null;
};

export function estimateRoundRating(
  r: Pick<RatedRound, "round_rating" | "score" | "ssa">,
): number | null {
  if (typeof r.round_rating === "number") return r.round_rating;
  if (typeof r.ssa === "number") return Math.round(1000 - (r.score - r.ssa) * 10);
  return null;
}

function withinMonths(iso: string, months: number, now: Date = new Date()): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= now.getTime() - months * 30.44 * 86_400_000;
}

export type PlayerRating = {
  rating: number | null;
  usedRounds: number;
  bestRound: number | null;
  source: "pdga" | "blended" | "none";
  windowMonths: number;
};

function eligible(r: RatedRound): boolean {
  const fmt = (r.format ?? "singles").toLowerCase();
  if (fmt !== "singles") return false;
  if (r.included === false) return false;
  return true;
}

export function estimatePlayerRating(rounds: RatedRound[], now: Date = new Date()): PlayerRating {
  const singles = rounds.filter(eligible);
  const pdgaAll = singles.filter((r) => r.source === "pdga");
  const pdga12 = pdgaAll.filter((r) => withinMonths(r.played_on, 12, now));
  const pdga24 = pdgaAll.filter((r) => withinMonths(r.played_on, 24, now));

  let pool: RatedRound[];
  let source: PlayerRating["source"];
  let windowMonths: number;

  if (pdga12.length >= 8) {
    pool = pdga12;
    windowMonths = 12;
    source = "pdga";
  } else if (pdga24.length > 0) {
    pool = pdga24;
    windowMonths = 24;
    source = "pdga";
  } else if (singles.length > 0) {
    pool = singles;
    windowMonths = 12;
    source = "blended";
  } else {
    return { rating: null, usedRounds: 0, bestRound: null, source: "none", windowMonths: 12 };
  }

  const rated = pool
    .map((r) => ({ date: r.played_on, rating: estimateRoundRating(r) }))
    .filter((r): r is { date: string; rating: number } => typeof r.rating === "number")
    .filter((r) => withinMonths(r.date, windowMonths, now))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 50);

  if (rated.length === 0) {
    return { rating: null, usedRounds: 0, bestRound: null, source: "none", windowMonths };
  }

  // PDGA outlier drop — 7+ rounds included, cut anything > 100pts AND > 2.5σ below mean.
  let kept = rated;
  if (rated.length >= 7) {
    const mean = rated.reduce((s, r) => s + r.rating, 0) / rated.length;
    const variance = rated.reduce((s, r) => s + (r.rating - mean) ** 2, 0) / rated.length;
    const sd = Math.sqrt(variance);
    // PDGA drops a round only when it is BOTH >100 pts and >2.5σ below the
    // mean, so the less-strict threshold governs: mean - max(100, 2.5σ).
    const cutoff = mean - Math.max(100, 2.5 * sd);
    kept = rated.filter((r) => r.rating >= cutoff);
  }

  // Recency weight — most recent 25% BY DATE get 2x when 9+ rounds remain.
  const byDateDesc = [...kept].sort((a, b) => (a.date < b.date ? 1 : -1));
  const topN = byDateDesc.length >= 9 ? Math.max(1, Math.ceil(byDateDesc.length / 4)) : 0;
  const bestRound = kept.length ? Math.max(...kept.map((r) => r.rating)) : 0;

  let weightedSum = 0;
  let weight = 0;
  byDateDesc.forEach((r, i) => {
    const w = i < topN ? 2 : 1;
    weightedSum += r.rating * w;
    weight += w;
  });
  return {
    rating: Math.round(weightedSum / weight),
    usedRounds: kept.length,
    bestRound,
    source,
    windowMonths,
  };
}
