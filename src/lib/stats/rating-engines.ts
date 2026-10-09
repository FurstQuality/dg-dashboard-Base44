/**
 * Three separated rating engines:
 *   1. PDGA Rating       — verified rating from PDGA-sourced rounds only.
 *   2. UDisc Rating      — verified rating from UDisc-sourced rounds only.
 *   3. DG Dashboard Rating  — proprietary blend of PDGA + UDisc + in-app
 *                          head-to-head performance vs other rated players.
 *
 * All three use the same underlying PDGA-style methodology (singles only,
 * 12/24 month rolling window, outlier trim, top-25% double-weighted) so the
 * numbers stay comparable. The DG Dashboard layer nudges the blended base up or
 * down based on how you've actually performed against other rated players in
 * shared rounds inside the app.
 */

import { computeRoundRating, withinMonths, type EngineRound } from "./rating-engine";

export type Verified = "verified" | "provisional" | "insufficient";

export type SingleSourceRating = {
  rating: number | null;
  usedRounds: number;
  droppedLow: number;
  bestRound: number | null;
  worstRound: number | null;
  average: number | null;
  windowMonths: number;
  verified: Verified;
  rounds: Array<{ played_on: string; rating: number; course?: string | null }>;
};

/** Core PDGA-style calc parameterized by source filter. */
function computeSingleSource(
  rounds: EngineRound[],
  sourceMatch: (source: string | null | undefined) => boolean,
  now: Date = new Date(),
): SingleSourceRating {
  const eligible = rounds.filter((r) => {
    const fmt = (r.format ?? "singles").toLowerCase();
    if (fmt !== "singles") return false;
    if (r.included === false) return false;
    if (!sourceMatch(r.source)) return false;
    return true;
  });

  const in12 = eligible.filter((r) => withinMonths(r.played_on, 12, now));
  const in24 = eligible.filter((r) => withinMonths(r.played_on, 24, now));

  let pool: EngineRound[];
  let windowMonths: number;
  if (in12.length >= 8) {
    pool = in12;
    windowMonths = 12;
  } else if (in24.length > 0) {
    pool = in24;
    windowMonths = 24;
  } else {
    return {
      rating: null,
      usedRounds: 0,
      droppedLow: 0,
      bestRound: null,
      worstRound: null,
      average: null,
      windowMonths: 12,
      verified: "insufficient",
      rounds: [],
    };
  }

  const mapped = pool
    .map((r) => ({
      played_on: r.played_on,
      rating: computeRoundRating(r),
      course: r.course ?? null,
    }))
    .filter(
      (x): x is { played_on: string; rating: number; course: string | null } =>
        typeof x.rating === "number",
    )
    .sort((a, b) => (a.played_on < b.played_on ? 1 : -1));

  if (mapped.length === 0) {
    return {
      rating: null,
      usedRounds: 0,
      droppedLow: 0,
      bestRound: null,
      worstRound: null,
      average: null,
      windowMonths,
      verified: "insufficient",
      rounds: [],
    };
  }

  // PDGA outlier drop — 7+ rounds, cut > 100pts AND > 2.5σ below mean.
  let kept = mapped;
  let dropped = 0;
  if (mapped.length >= 7) {
    const mean = mapped.reduce((s, r) => s + r.rating, 0) / mapped.length;
    const variance = mapped.reduce((s, r) => s + (r.rating - mean) ** 2, 0) / mapped.length;
    const sd = Math.sqrt(variance);
    // PDGA drops a round only when it is BOTH >100 pts and >2.5σ below the
    // mean, so the less-strict threshold governs: mean - max(100, 2.5σ).
    const cutoff = mean - Math.max(100, 2.5 * sd);
    kept = mapped.filter((r) => r.rating >= cutoff);
    dropped = mapped.length - kept.length;
  }

  // Recency weight — most recent 25% BY DATE double-weighted when 9+ remain.
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

  const verified: Verified =
    windowMonths === 12 && kept.length >= 8
      ? "verified"
      : kept.length >= 3
        ? "provisional"
        : "insufficient";

  return {
    rating: Math.round(weightedSum / weight),
    usedRounds: kept.length,
    droppedLow: dropped,
    bestRound: sortedDesc[0].rating,
    worstRound: sortedDesc[sortedDesc.length - 1].rating,
    average: Math.round(kept.reduce((s, r) => s + r.rating, 0) / kept.length),
    windowMonths,
    verified,
    rounds: kept,
  };
}

export function computePdgaRating(
  rounds: EngineRound[],
  now: Date = new Date(),
): SingleSourceRating {
  return computeSingleSource(rounds, (s) => s === "pdga", now);
}

/**
 * Ownership note (Phase 3): this is a DG Dashboard projection computed from
 * UDisc-sourced rounds — classified internally as DGD LEGACY, not a native
 * UDisc-owned metric. Kept unchanged for the existing Statboard.
 */
export const UDISC_PROJECTION_OWNER = "dgd_legacy" as const;

export function computeUdiscRating(
  rounds: EngineRound[],
  now: Date = new Date(),
): SingleSourceRating {
  return computeSingleSource(rounds, (s) => s === "udisc", now);
}

/* ------------------------------------------------------------------ */
/*                       DG DASHBOARD RATING                             */
/* ------------------------------------------------------------------ */

export type HeadToHeadSample = {
  /** My in-app round_rating for this shared round. */
  myRoundRating: number;
  /** Average round_rating of rated OPPONENTS with a known PDGA rating. */
  opponentAvgRoundRating: number;
  /** Average official PDGA rating of those same opponents. */
  opponentAvgPdga: number;
  /** How many rated opponents anchored this sample. */
  opponentCount: number;
  playedOn: string;
};

export type DgdRatingResult = {
  rating: number | null;
  base: number | null; // PDGA anchor before H2H adjustment
  pdgaComponent: number | null;
  udiscComponent: number | null;
  headToHeadDelta: number; // shift applied by in-app play
  headToHeadRounds: number; // rounds vs PDGA-rated opponents
  headToHeadImplied: number | null; // pure implied rating from H2H alone
  confidence: "high" | "medium" | "low" | "insufficient";
  weightPdga: number;
  weightUdisc: number;
  // ---- Distribution-driven breakdown -------------------------------
  ceiling: number | null; // avg of top 20% rounds (your true upside)
  floor: number | null; // avg of bottom 20% rounds
  average: number | null;
  ceilingHitRate: number; // % of rounds within 15pts of ceiling
  upsideFrequency: number; // % of rounds > average + 25
  downsideFrequency: number; // % of rounds < average - 25
  recentTrend: number; // last 25% avg minus overall avg
  ceilingBonus: number; // points added for high upside frequency
  sampleSize: number;
  // ---- Recent-form and away-course components -----------------------
  /** Average rating of the last 10 rated rounds (the heavily weighted block). */
  recentTenAvg: number | null;
  /** Last-10 average minus the full-window average — rise or decline. */
  recentTenDelta: number;
  /** Points added or removed for how you score away from your home courses. */
  awayDelta: number;
  /** Rated rounds played away from your most-played (home) courses. */
  awayRounds: number;
  /** Average rating away from home courses. */
  awayAvg: number | null;
  /** Average rating at your home courses. */
  homeAvg: number | null;
};

/**
 * DG Dashboard Rating — the PDGA method, run live with a recent-form lean and
 * an away-course check.
 *
 * PDGA (https://www.pdga.com/faq/ratings/how-is-your-rating-calculated):
 *   singles rounds only, rolling 12-month window (24 when under 8 rounds),
 *   drop rounds more than 100 points AND 2.5 standard deviations below the
 *   mean, then double-weight the most recent 25% by date. It publishes once a
 *   month and only counts PDGA-sanctioned rounds.
 *
 * DGD uses the same math on a wider pool (PDGA imports + UDisc imports +
 * rounds scored in DG Dashboard) and differs in exactly three ways:
 *
 *  1. Recent-form lean — your last 10 rated rounds carry triple weight and
 *     the 10 before that carry double weight, so a genuine rise or decline
 *     shows up in days instead of months.
 *  2. Away-course component — your home courses are the ones you play most.
 *     Scoring well away from them nudges the rating up (to +12); only ever
 *     shooting well at home nudges it down (to -12). It needs at least four
 *     away rounds before it applies at all.
 *  3. Live head-to-head — shared rounds against PDGA-rated players can shift
 *     the number up to ±40 points.
 *
 * DGD is never used for division eligibility or official standing.
 */

export function computeDgdRating(
  pdga: SingleSourceRating,
  _udisc: SingleSourceRating,
  h2h: HeadToHeadSample[],
  fallback: SingleSourceRating,
): DgdRatingResult {
  // Build the ratings pool from PDGA + fallback (all-source singles).
  // Fallback already includes PDGA + in-app rounds, so use it as the union.
  const pool = fallback.rounds.length > 0 ? fallback.rounds : pdga.rounds;
  const ratings = pool.map((r) => r.rating).filter((n) => Number.isFinite(n));

  let ceiling: number | null = null;
  let floor: number | null = null;
  let average: number | null = null;
  let ceilingHitRate = 0;
  let upsideFrequency = 0;
  let downsideFrequency = 0;
  let recentTrend = 0;
  let ceilingBonus = 0;
  let distributionRating: number | null = null;
  let recentTenAvg: number | null = null;
  let recentTenDelta = 0;
  let awayDelta = 0;
  let awayRounds = 0;
  let awayAvg: number | null = null;
  let homeAvg: number | null = null;

  if (ratings.length >= 3) {
    const sortedDesc = [...ratings].sort((a, b) => b - a);
    const topN = Math.max(1, Math.ceil(sortedDesc.length * 0.2));
    const botN = Math.max(1, Math.ceil(sortedDesc.length * 0.2));
    ceiling = Math.round(sortedDesc.slice(0, topN).reduce((s, x) => s + x, 0) / topN);
    floor = Math.round(sortedDesc.slice(-botN).reduce((s, x) => s + x, 0) / botN);
    const rawMean = ratings.reduce((s, x) => s + x, 0) / ratings.length;
    average = Math.round(rawMean);

    // Frequency of ceiling-caliber rounds (within 15pts of ceiling)
    const nearCeiling = ratings.filter((r) => r >= (ceiling ?? 0) - 15).length;
    ceilingHitRate = Math.round((nearCeiling / ratings.length) * 100);
    upsideFrequency = Math.round(
      (ratings.filter((r) => r > rawMean + 25).length / ratings.length) * 100,
    );
    downsideFrequency = Math.round(
      (ratings.filter((r) => r < rawMean - 25).length / ratings.length) * 100,
    );

    // Recent trend — last 25% of chronological rounds (fallback.rounds is
    // sorted newest-first) minus overall mean.
    const recentN = Math.max(1, Math.ceil(pool.length * 0.25));
    const recentMean = pool.slice(0, recentN).reduce((s, r) => s + r.rating, 0) / recentN;
    recentTrend = Math.round(recentMean - rawMean);

    // ---- Last 10 rounds — the recent-form lean ----------------------
    // `pool` is newest-first, so the first 10 entries are the last 10 rounds.
    const lastTen = pool.slice(0, 10);
    if (lastTen.length > 0) {
      recentTenAvg = Math.round(lastTen.reduce((s, r) => s + r.rating, 0) / lastTen.length);
      recentTenDelta = recentTenAvg - Math.round(rawMean);
    }

    // ---- Home vs away courses ---------------------------------------
    // Home courses = the courses you play most. Everything with fewer rounds
    // than the leader (and any round with no course on it) counts as away.
    const byCourse = new Map<string, number[]>();
    for (const r of pool) {
      const key = (r.course ?? "").trim().toLowerCase();
      if (!key) continue;
      const list = byCourse.get(key) ?? [];
      list.push(r.rating);
      byCourse.set(key, list);
    }
    const mostPlayed = Math.max(0, ...Array.from(byCourse.values(), (v) => v.length));
    const homeKeys = new Set(
      Array.from(byCourse.entries())
        .filter(([, v]) => mostPlayed >= 3 && v.length >= Math.max(3, mostPlayed * 0.6))
        .map(([k]) => k),
    );
    const homeRatings: number[] = [];
    const awayRatings: number[] = [];
    for (const r of pool) {
      const key = (r.course ?? "").trim().toLowerCase();
      if (key && homeKeys.has(key)) homeRatings.push(r.rating);
      else if (key) awayRatings.push(r.rating);
    }
    awayRounds = awayRatings.length;
    if (homeRatings.length > 0) {
      homeAvg = Math.round(homeRatings.reduce((s, x) => s + x, 0) / homeRatings.length);
    }
    if (awayRatings.length > 0) {
      awayAvg = Math.round(awayRatings.reduce((s, x) => s + x, 0) / awayRatings.length);
    }
    // Only credit or discount travel form once there is a real away sample
    // on both sides of the comparison.
    if (awayRatings.length >= 4 && homeRatings.length >= 3 && awayAvg != null && homeAvg != null) {
      awayDelta = Math.max(-12, Math.min(12, Math.round((awayAvg - homeAvg) * 0.35)));
    }

    // ---- PDGA-style weighted rating, DGD weighting -------------------
    // Same trim rule as PDGA: drop rounds more than 100 points AND more than
    // 2.5σ below the mean (the less strict of the two governs).
    const variance = ratings.reduce((s, r) => s + (r - rawMean) ** 2, 0) / ratings.length;
    const sd = Math.sqrt(variance);
    const trimFloor =
      ratings.length >= 7 ? rawMean - Math.max(100, 2.5 * sd) : Number.NEGATIVE_INFINITY;

    // Weight by recency only — last 10 rounds x3, the 10 before that x2.
    // PDGA double-weights the most recent quarter; DGD leans harder on the
    // last 10 so a rise or decline in form lands immediately.
    let ws = 0;
    let wt = 0;
    let rank = 0;
    for (const r of pool) {
      if (r.rating < trimFloor) continue;
      const w = rank < 10 ? 3 : rank < 20 ? 2 : 1;
      ws += r.rating * w;
      wt += w;
      rank += 1;
    }
    if (wt > 0) distributionRating = ws / wt + awayDelta;

    // Ceiling bonus REMOVED (StatLink Phase 1). Peak capability now
    // surfaces separately as the High-Form Level so the primary rating
    // stays reproducible from published inputs. Do not add hidden uplift
    // back into the rating without a versioned model release.
    ceilingBonus = 0;
  }

  // Head-to-head implied rating from in-app PDGA-rated opponents.
  let impliedRating: number | null = null;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const s of h2h) {
    const implied = s.opponentAvgPdga + (s.myRoundRating - s.opponentAvgRoundRating);
    const w = Math.min(s.opponentCount, 3);
    weightedSum += implied * w;
    weightTotal += w;
  }
  if (weightTotal > 0) impliedRating = Math.round(weightedSum / weightTotal);

  // ---- Blend everything -------------------------------------------
  // Anchor = PDGA official (if any). DG Dashboard allows a wider swing than
  // PDGA's own drift: distribution rating can pull ±60, H2H can add ±40.
  const base = pdga.rating;
  let rating: number | null = null;
  let delta = 0;

  const anchor = base ?? distributionRating ?? impliedRating;
  if (anchor == null) {
    return {
      rating: null,
      base,
      pdgaComponent: pdga.rating,
      udiscComponent: null,
      headToHeadDelta: 0,
      headToHeadRounds: h2h.length,
      headToHeadImplied: impliedRating,
      confidence: "insufficient",
      weightPdga: 0,
      weightUdisc: 0,
      ceiling,
      floor,
      average,
      ceilingHitRate,
      upsideFrequency,
      downsideFrequency,
      recentTrend,
      ceilingBonus,
      sampleSize: ratings.length,
      recentTenAvg,
      recentTenDelta,
      awayDelta,
      awayRounds,
      awayAvg,
      homeAvg,
    };
  }

  // Distribution pull toward the weighted distribution rating.
  let distDelta = 0;
  if (distributionRating != null && base != null) {
    const rawDiff = distributionRating - base;
    // Faster than PDGA: shrink by n/(n+6) instead of n/(n+12), cap ±60.
    const shrink = ratings.length / (ratings.length + 6);
    distDelta = Math.max(-60, Math.min(60, Math.round(rawDiff * shrink)));
  }

  // Head-to-head pull.
  let h2hDelta = 0;
  if (impliedRating != null && base != null) {
    const shrink = h2h.length / (h2h.length + 5);
    const rawDiff = impliedRating - base;
    h2hDelta = Math.max(-40, Math.min(40, Math.round(rawDiff * shrink)));
  }

  delta = distDelta + h2hDelta;
  rating = base != null ? base + delta : Math.round(distributionRating ?? impliedRating ?? 0);

  let confidence: DgdRatingResult["confidence"] = "insufficient";
  const total = ratings.length + h2h.length;
  if (base != null && total >= 8) confidence = "high";
  else if (total >= 8) confidence = "high";
  else if (total >= 4) confidence = "medium";
  else if (rating != null) confidence = "low";

  return {
    rating: rating != null ? Math.round(rating) : null,
    base,
    pdgaComponent: pdga.rating,
    udiscComponent: null,
    headToHeadDelta: h2hDelta,
    headToHeadRounds: h2h.length,
    headToHeadImplied: impliedRating,
    confidence,
    weightPdga: base != null ? 1 : 0,
    weightUdisc: 0,
    ceiling,
    floor,
    average,
    ceilingHitRate,
    upsideFrequency,
    downsideFrequency,
    recentTrend,
    ceilingBonus,
    sampleSize: ratings.length,
    recentTenAvg,
    recentTenDelta,
    awayDelta,
    awayRounds,
    awayAvg,
    homeAvg,
  };
}
