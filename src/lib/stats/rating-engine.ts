/**
 * PDGA-style rating engine. Source:
 * https://www.pdga.com/faq/ratings/how-is-your-rating-calculated
 *   - Singles rounds only (doubles/team are filtered out upstream).
 *   - Use PDGA-flagged "included" rounds when available.
 *   - Rolling window: last 12 months; extends to 24 months when the player
 *     has fewer than 8 rated rounds in the last 12 (PDGA's own fallback).
 *   - Per-round rating from the source when present, otherwise:
 *       round_rating = 1000 - (score - ssa) * stroke_value  (default sv=10)
 *   - Once 7+ rounds are included, drop rounds > 100 pts AND > 2.5σ below
 *     the simple mean (the stricter threshold wins).
 *   - Once 9+ rounds remain, double-weight the most recent 25% BY DATE
 *     (NOT top 25% by rating — a common misreading of the PDGA rules).
 *
 * Community estimate — clearly labeled in the UI.
 */

export type EngineRound = {
  played_on: string; // ISO date
  round_rating: number | null;
  score: number | null;
  ssa: number | null;
  stroke_value?: number | null;
  source?: string | null; // "pdga" | "udisc" | "manual" | "app" | ...
  /** 'singles' | 'doubles' | 'team' | 'other'. Only 'singles' is rated. */
  format?: string | null;
  /** PDGA "Included" flag when known. Null means include unless proven otherwise. */
  included?: boolean | null;
  /** Course key (name or id) — powers the DGD home/away course component. */
  course?: string | null;
  /** Score relative to the layout's par, when the source records it. Display only. */
  to_par?: number | null;
};

export type ComputedRound = {
  played_on: string;
  rating: number;
  source: string | null;
  course?: string | null;
};

export function computeRoundRating(r: EngineRound): number | null {
  if (typeof r.round_rating === "number" && Number.isFinite(r.round_rating)) return r.round_rating;
  if (typeof r.score === "number" && typeof r.ssa === "number") {
    const sv = typeof r.stroke_value === "number" && r.stroke_value > 0 ? r.stroke_value : 10;
    return Math.round(1000 - (r.score - r.ssa) * sv);
  }
  return null;
}

export function withinMonths(iso: string, months: number, now: Date = new Date()): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const cutoff = now.getTime() - months * 30.44 * 86_400_000;
  return t >= cutoff;
}

export type RatingResult = {
  rating: number | null;
  usedRounds: number;
  droppedLow: number;
  bestRound: number | null;
  worstRound: number | null;
  average: number | null;
  rounds: ComputedRound[]; // rounds used, sorted by date desc
  source: "pdga" | "blended" | "none";
  windowMonths: number;
};

/** Keep only rounds that would be eligible for a PDGA rating: singles + included. */
function eligible(r: EngineRound): boolean {
  const fmt = (r.format ?? "singles").toLowerCase();
  if (fmt !== "singles") return false;
  if (r.included === false) return false;
  return true;
}

export function computeRating(rounds: EngineRound[], now: Date = new Date()): RatingResult {
  const singles = rounds.filter(eligible);

  // PDGA-first: if the player has ANY PDGA rounds in the last 24mo, use PDGA
  // rounds exclusively and pick the window (12 or 24) by count in last 12mo.
  const pdgaAll = singles.filter((r) => r.source === "pdga");
  const pdga12 = pdgaAll.filter((r) => withinMonths(r.played_on, 12, now));
  const pdga24 = pdgaAll.filter((r) => withinMonths(r.played_on, 24, now));

  let pool: EngineRound[];
  let source: RatingResult["source"];
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
    return {
      rating: null,
      usedRounds: 0,
      droppedLow: 0,
      bestRound: null,
      worstRound: null,
      average: null,
      rounds: [],
      source: "none",
      windowMonths: 12,
    };
  }

  const mapped = pool.map((r) => ({
    played_on: r.played_on,
    rating: computeRoundRating(r),
    source: r.source ?? null,
  }));

  const all: ComputedRound[] = mapped
    .filter(
      (x): x is ComputedRound =>
        typeof x.rating === "number" && withinMonths(x.played_on, windowMonths, now),
    )
    .sort((a, b) => (a.played_on < b.played_on ? 1 : -1));

  if (all.length === 0) {
    return {
      rating: null,
      usedRounds: 0,
      droppedLow: 0,
      bestRound: null,
      worstRound: null,
      average: null,
      rounds: [],
      source: "none",
      windowMonths,
    };
  }

  // PDGA outlier drop — 7+ rounds included, cut > 100pts AND > 2.5σ below mean.
  let kept = all;
  let dropped = 0;
  if (all.length >= 7) {
    const mean = all.reduce((s, r) => s + r.rating, 0) / all.length;
    const variance = all.reduce((s, r) => s + (r.rating - mean) ** 2, 0) / all.length;
    const sd = Math.sqrt(variance);
    // PDGA drops a round only when it is BOTH >100 pts and >2.5σ below the
    // mean, so the less-strict threshold governs: mean - max(100, 2.5σ).
    const cutoff = mean - Math.max(100, 2.5 * sd);
    kept = all.filter((r) => r.rating >= cutoff);
    dropped = all.length - kept.length;
  }

  // Recency weight — most recent 25% BY DATE get 2x when 9+ rounds remain.
  const byDateDesc = [...kept].sort((a, b) => (a.played_on < b.played_on ? 1 : -1));
  const topN = byDateDesc.length >= 9 ? Math.max(1, Math.ceil(byDateDesc.length / 4)) : 0;
  const sortedDesc = [...kept].sort((a, b) => b.rating - a.rating);

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
    droppedLow: dropped,
    bestRound: sortedDesc[0]?.rating ?? null,
    worstRound: sortedDesc[sortedDesc.length - 1]?.rating ?? null,
    average: Math.round(kept.reduce((s, r) => s + r.rating, 0) / kept.length),
    rounds: kept,
    source,
    windowMonths,
  };
}

/**
 * Project the rating as of `asOf` — includes all rounds played on or before
 * that date, applies the same rules relative to that point in time.
 */
export function projectRating(rounds: EngineRound[], asOf: Date): RatingResult {
  const filtered = rounds.filter((r) => new Date(r.played_on).getTime() <= asOf.getTime());
  return computeRating(filtered, asOf);
}
