// Pure functions for PDGA-style weighted rolling rating math and projection.
// Mirrors the logic in public.player_rating_details but runs in TypeScript so
// the UI can project hypothetical scenarios without a round trip.

export type RatedRound = {
  played_on: string; // ISO date
  round_rating: number;
  included?: boolean | null;
  event_name?: string | null;
  /** "pdga" (external), "tournament" / "league" / "casual" (in-app chainlink). */
  source?: "pdga" | "tournament" | "league" | "casual" | null;
};

const DAY = 86_400_000;

/**
 * The PDGA is the only true rating authority, so every rating calculation
 * in the app must use the same eligibility filter: PDGA-sourced rounds
 * plus rounds without a source (synthesized/hypothetical rounds added by
 * the impact calculator or planner). In-app rounds (tournament, league,
 * casual) are excluded so the number of "rated rounds" and the resulting
 * rating are identical everywhere they're shown.
 */
export function pdgaEligible(rounds: RatedRound[]): RatedRound[] {
  return rounds.filter((r) => r.source == null || r.source === "pdga");
}

/** Filter to rounds within the past N months of an anchor date. */
export function withinMonths(
  rounds: RatedRound[],
  months: number,
  anchor = new Date(),
): RatedRound[] {
  // PDGA uses a 365-day rolling window (24 months when fewer than ~8 rated rounds).
  const days = months === 12 ? 365 : months === 24 ? 730 : Math.round(months * 30.4375);
  const cutoff = anchor.getTime() - days * DAY;
  return pdgaEligible(rounds).filter(
    (r) => new Date(r.played_on).getTime() >= cutoff && (r.included ?? true),
  );
}

/**
 * PDGA-style weighted average. Source: https://www.pdga.com/faq/ratings/how-is-your-rating-calculated
 *   1. If 7+ rounds are included, drop any round that is BOTH >100 points below
 *      the simple mean AND >2.5σ below it (PDGA requires both, so the cutoff
 *      is mean - max(100, 2.5·σ) — the less-strict threshold governs).
 *   2. If 9+ rounds remain, double-weight the most recent 25% BY DATE
 *      (not top 25% by rating — a common misreading).
 *   3. Weighted mean of the survivors is the rating.
 */
export function weightedAverage(rounds: RatedRound[]): number {
  if (rounds.length === 0) return 0;
  const vals = rounds.map((r) => r.round_rating);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  // Rule 1 — drop rounds >100 AND >2.5σ below the simple mean (both required).
  let kept = rounds;
  if (rounds.length >= 7) {
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    const sd = Math.sqrt(variance);
    const cutoff = mean - Math.max(100, 2.5 * sd);
    kept = rounds.filter((r) => r.round_rating >= cutoff);
  }
  if (kept.length === 0) return 0;
  // Rule 2 — recency weight (by date, not by rating) when 9+ rounds remain.
  const byDateDesc = [...kept].sort((a, b) => b.played_on.localeCompare(a.played_on));
  const topN = byDateDesc.length >= 9 ? Math.max(1, Math.ceil(byDateDesc.length / 4)) : 0;
  let sumWeights = 0;
  let sumWeighted = 0;
  byDateDesc.forEach((r, i) => {
    const w = i < topN ? 2 : 1;
    sumWeighted += r.round_rating * w;
    sumWeights += w;
  });
  return sumWeights ? Math.round(sumWeighted / sumWeights) : 0;
}

/**
 * Inspect how a rating decomposes — for UI explanations. Uses the same
 * PDGA-only eligibility + 12/24 month rolling window + top-50 cap as
 * `currentRating`, so the counts shown here match the number of rounds
 * that actually drove the rating everywhere else in the app.
 */
export function ratingBreakdown(
  rounds: RatedRound[],
  anchor = new Date(),
): {
  included: number;
  droppedLow: number;
  simpleMean: number;
  doubleWeighted: number; // how many rounds got 2x weight
  cutoff: number | null; // outlier threshold if applied
  rating: number;
} {
  const twelve = withinMonths(rounds, 12, anchor);
  const windowed = twelve.length >= 8 ? twelve : withinMonths(rounds, 24, anchor);
  const pool = [...windowed].sort((a, b) => b.played_on.localeCompare(a.played_on)).slice(0, 50);
  if (pool.length === 0) {
    return {
      included: 0,
      droppedLow: 0,
      simpleMean: 0,
      doubleWeighted: 0,
      cutoff: null,
      rating: 0,
    };
  }
  const vals = pool.map((r) => r.round_rating);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  let kept = pool;
  let cutoff: number | null = null;
  if (pool.length >= 7) {
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    const sd = Math.sqrt(variance);
    cutoff = mean - Math.max(100, 2.5 * sd);
    kept = pool.filter((r) => r.round_rating >= cutoff!);
  }
  const doubleWeighted = kept.length >= 9 ? Math.max(1, Math.ceil(kept.length / 4)) : 0;
  return {
    included: kept.length,
    droppedLow: pool.length - kept.length,
    simpleMean: Math.round(mean),
    doubleWeighted,
    cutoff: cutoff != null ? Math.round(cutoff) : null,
    rating: weightedAverage(pool),
  };
}

/** Pick the correct window: 12 mo if >=8 rated rounds, else 24 mo. Capped at the most recent 50 rounds (matches PDGA's DB cap). */
export function currentRating(rounds: RatedRound[], anchor = new Date()): number {
  const twelve = withinMonths(rounds, 12, anchor);
  const window = twelve.length >= 8 ? twelve : withinMonths(rounds, 24, anchor);
  const recent50 = [...window].sort((a, b) => b.played_on.localeCompare(a.played_on)).slice(0, 50);
  return weightedAverage(recent50);
}

/** Compute rating for each historical month using rolling window. */
export function monthlyHistory(
  rounds: RatedRound[],
  months = 12,
): { month: string; rating: number; count: number }[] {
  const now = new Date();
  const eligible = pdgaEligible(rounds);
  const out: { month: string; rating: number; count: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const anchor = new Date(now.getFullYear(), now.getMonth() - i, 15);
    const past = eligible.filter((r) => new Date(r.played_on) <= anchor);
    const rating = currentRating(past, anchor);
    const monthRounds = past.filter((r) => {
      const d = new Date(r.played_on);
      return d.getFullYear() === anchor.getFullYear() && d.getMonth() === anchor.getMonth();
    });
    out.push({
      month: anchor.toLocaleDateString("en", { month: "short", year: "2-digit" }),
      rating,
      count: monthRounds.length,
    });
  }
  return out;
}

/** First PDGA rating update (2nd Tuesday of a month) on or after `d`. */
export function pdgaUpdateOnOrAfter(d: Date): Date {
  const probe = (y: number, m: number) => {
    const first = new Date(y, m, 1);
    const offset = (2 - first.getDay() + 7) % 7; // Tuesday = 2
    return new Date(y, m, 1 + offset + 7);
  };
  let y = d.getFullYear();
  let m = d.getMonth();
  let update = probe(y, m);
  if (update < d) {
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    update = probe(y, m);
  }
  return update;
}

/** The next `count` PDGA rating update dates on or after `anchor`. */
export function nextPdgaUpdates(count: number, anchor = new Date()): Date[] {
  const out: Date[] = [];
  let cursor = pdgaUpdateOnOrAfter(anchor);
  for (let i = 0; i < count; i++) {
    out.push(cursor);
    cursor = pdgaUpdateOnOrAfter(new Date(cursor.getTime() + DAY));
  }
  return out;
}

/**
 * Rounds that will roll out of the 365-day window at or before the Nth
 * upcoming PDGA rating update (default: the next three monthly updates).
 */
export function expiringSoon(
  rounds: RatedRound[],
  anchor = new Date(),
  updates = 3,
): RatedRound[] {
  const horizon = nextPdgaUpdates(updates, anchor).at(-1)!;
  const min = new Date(anchor.getTime() - 365 * DAY);
  // A round expires 365 days after it was played, so it rolls off at the
  // horizon update when it was played on or before horizon - 365 days.
  const max = new Date(horizon.getTime() - 365 * DAY);
  return pdgaEligible(rounds)
    .filter((r) => {
      const d = new Date(r.played_on);
      return d >= min && d <= max;
    })
    .sort((a, b) => a.played_on.localeCompare(b.played_on));
}

/** Extreme stats. */
export function ratingExtremes(rounds: RatedRound[]): {
  highest: number | null;
  lowest: number | null;
  average: number | null;
} {
  if (rounds.length === 0) return { highest: null, lowest: null, average: null };
  const vals = rounds.map((r) => r.round_rating);
  return {
    highest: Math.max(...vals),
    lowest: Math.min(...vals),
    average: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
  };
}

/** Generate hypothetical future rounds under a plan strategy. */
export type PlanStrategy = "offset" | "goal" | "manual";
export type PlanConfig = {
  strategy: PlanStrategy;
  months: number;
  roundsPerMonth: number;
  offsetPoints?: number; // for "offset"
  targetRating?: number; // for "goal"
  goalMode?: "realistic" | "definitive"; // for "goal"
  baseRating: number; // player's current rating
};

/** Compute expected ratings month-by-month for a plan. */
export function projectPlan(
  existing: RatedRound[],
  cfg: PlanConfig,
): {
  monthlyProjection: {
    month: string;
    rating: number;
    monthDate: string;
    expectedRoundRating: number;
  }[];
  finalRating: number;
} {
  const now = new Date();
  const out: { month: string; rating: number; monthDate: string; expectedRoundRating: number }[] =
    [];
  const synthetic: RatedRound[] = [...existing];

  const target = cfg.targetRating ?? cfg.baseRating + (cfg.offsetPoints ?? 0);
  const gap = target - cfg.baseRating;
  const totalMonths = Math.max(1, cfg.months);

  for (let i = 1; i <= totalMonths; i++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 15);
    let expectedRound: number;

    if (cfg.strategy === "offset") {
      expectedRound = cfg.baseRating + (cfg.offsetPoints ?? 0);
    } else if (cfg.strategy === "goal") {
      // Realistic: linear ramp; Definitive: aggressive front-load
      const t = i / totalMonths;
      if (cfg.goalMode === "definitive") {
        // Play at target+10 average, faster arrival
        expectedRound = target + 10;
      } else {
        expectedRound = Math.round(cfg.baseRating + gap * t + gap * 0.4);
      }
    } else {
      expectedRound = cfg.baseRating;
    }

    // Simulate playing `roundsPerMonth` at expectedRound this month
    for (let r = 0; r < cfg.roundsPerMonth; r++) {
      synthetic.push({
        played_on: monthDate.toISOString().slice(0, 10),
        round_rating: expectedRound,
        included: true,
        event_name: null,
      });
    }
    const rating = currentRating(synthetic, monthDate);
    out.push({
      month: monthDate.toLocaleDateString("en", { month: "short", year: "2-digit" }),
      monthDate: monthDate.toISOString().slice(0, 10),
      rating,
      expectedRoundRating: expectedRound,
    });
  }
  return { monthlyProjection: out, finalRating: out.at(-1)?.rating ?? cfg.baseRating };
}

/* -------------------- Goal Solver (DGRatingStudio-style) -------------------- */

/**
 * Binary-search the constant round rating needed so `addedRounds` new rounds
 * move the weighted rolling rating to `target` — evaluated at `anchor` (the
 * target date). Rounds are spread evenly between now and the anchor so that
 * old rounds correctly age out of the 365-day window on the way there.
 */
export function solveRequiredAverage(
  existing: RatedRound[],
  target: number,
  addedRounds: number,
  anchor: Date = new Date(),
): number {
  if (addedRounds <= 0) return target;
  const nowMs = Date.now();
  const anchorMs = Math.max(nowMs, anchor.getTime());
  const spread = anchorMs - nowMs;
  const dates = Array.from({ length: addedRounds }, (_, i) => {
    const t = addedRounds === 1 ? 1 : (i + 1) / addedRounds;
    return new Date(nowMs + spread * t).toISOString().slice(0, 10);
  });
  const simulate = (avg: number) => {
    const rounded = Math.round(avg);
    const extra: RatedRound[] = dates.map((played_on) => ({
      played_on,
      round_rating: rounded,
      included: true,
      event_name: null,
    }));
    return currentRating([...existing, ...extra], new Date(anchorMs));
  };
  let lo = 500;
  let hi = 1150;
  // Guard: if playing at 1150 still can't reach the target, target is unreachable
  // with this many rounds — return the ceiling so the UI flags "unlikely".
  if (simulate(hi) < target) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (simulate(mid) < target) lo = mid;
    else hi = mid;
  }
  return Math.round(hi);
}

/** Build a suggested distribution of round ratings averaging `avg`, sized `n`. */
export function suggestPlannedRounds(
  existing: RatedRound[],
  avg: number,
  n: number,
): {
  rating: number;
  comment: string;
}[] {
  const vals = existing.map((r) => r.round_rating);
  const historyAvg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : avg;
  const countAtOrAbove = (v: number) => vals.filter((x) => x >= v).length;
  const out: { rating: number; comment: string }[] = [];
  // Weight: (n-1) rounds slightly above avg, 1 anchor round pulled toward historyAvg
  const top = n > 1 ? avg + 5 : avg;
  const anchor = Math.max(500, Math.min(avg, Math.round((historyAvg + avg) / 2)));
  const total = avg * n;
  const topSum = top * (n - 1);
  const last = Math.round(total - topSum);
  for (let i = 0; i < n - 1; i++) {
    const r = Math.round(top);
    const times = countAtOrAbove(r);
    out.push({
      rating: r,
      comment:
        times >= 3
          ? `a great day — you've done this ${times} times`
          : times > 0
            ? `a strong day — done this ${times} time${times === 1 ? "" : "s"}`
            : "a new personal best territory",
    });
  }
  const anchorFinal = n > 1 ? last : anchor;
  const diff = anchorFinal - Math.round(historyAvg);
  out.push({
    rating: anchorFinal,
    comment:
      Math.abs(diff) <= 8
        ? "around your average, very doable"
        : diff < 0
          ? "below your average — an easy day"
          : "above your average — a solid push",
  });
  return out;
}

/** Rough realism check: gap ÷ addedRounds vs historical variance. */
export function assessRealism(
  existing: RatedRound[],
  target: number,
  base: number,
  addedRounds: number,
  anchor: Date = new Date(),
): {
  verdict: "very_realistic" | "realistic" | "stretch" | "unlikely";
  message: string;
} {
  const requiredAvg = solveRequiredAverage(existing, target, addedRounds, anchor);
  const vals = existing.map((r) => r.round_rating);
  const best = vals.length ? Math.max(...vals) : base;
  const p75 = vals.length ? [...vals].sort((a, b) => b - a)[Math.floor(vals.length / 4)] : base;
  if (requiredAvg >= 1150)
    return {
      verdict: "unlikely",
      message: `Even averaging tournament-pro rounds (1150+) over ${addedRounds} rounds won't reach ${target} by that date. Add more rounds or push the date out.`,
    };
  if (requiredAvg <= p75)
    return {
      verdict: "very_realistic",
      message: `Averaging ${requiredAvg} is within your top-quartile form (${p75}).`,
    };
  if (requiredAvg <= best - 5)
    return {
      verdict: "realistic",
      message: `You'll need ${requiredAvg} avg — below your best (${best}). Achievable with focus.`,
    };
  if (requiredAvg <= best + 15)
    return {
      verdict: "stretch",
      message: `Requires ${requiredAvg} avg — near your ceiling (${best}). Tough but possible.`,
    };
  return {
    verdict: "unlikely",
    message: `Requires ${requiredAvg} avg — above your best round (${best}) over ${addedRounds} rounds. Consider more rounds or a lower goal.`,
  };
}

/* -------------------- Extended Player Statistics -------------------- */

export type ExtendedRound = RatedRound & {
  source?: string | null;
  format?: string | null;
  event_name?: string | null;
  score?: number | null;
  to_par?: number | null;
};

export function statsSummary(rounds: ExtendedRound[]) {
  const included = rounds.filter((r) => (r.included ?? true) && Number.isFinite(r.round_rating));
  const vals = included.map((r) => r.round_rating);
  if (!vals.length) {
    return {
      count: 0,
      average: null,
      highest: null,
      lowest: null,
      stddev: null,
      best: null as ExtendedRound | null,
      worst: null as ExtendedRound | null,
      best10: null,
      worst10: null,
      recent8: null,
      prior8: null,
      recent5: null,
      baseline20: null,
      baselineCount: 0,
      momentum: 0,
      firstDate: null as string | null,
      lastDate: null as string | null,
      yearsActive: 0,
      roundsThisYear: 0,
      eventsThisYear: 0,
      totalEvents: 0,
      byYear: [] as { year: number; avg: number; count: number; best: number }[],
      pctBelow: 0,
      pctAbove: 0,
    };
  }
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  const sd = Math.sqrt(variance);
  const sortedDesc = [...included].sort((a, b) => b.round_rating - a.round_rating);
  const sortedAsc = [...sortedDesc].reverse();
  const byDateDesc = [...included].sort((a, b) => b.played_on.localeCompare(a.played_on));
  const best10 = sortedDesc.slice(0, Math.min(10, sortedDesc.length));
  const worst10 = sortedAsc.slice(0, Math.min(10, sortedAsc.length));
  const avg = (arr: ExtendedRound[]) =>
    arr.length ? Math.round(arr.reduce((a, r) => a + r.round_rating, 0) / arr.length) : 0;
  // Momentum: last 5 rounds vs the last 20 rounds (the recent baseline).
  const recent5 = byDateDesc.slice(0, 5);
  const baseline20 = byDateDesc.slice(0, 20);
  const recent5Avg = recent5.length ? avg(recent5) : null;
  const baseline20Avg = baseline20.length ? avg(baseline20) : null;
  const momentum =
    recent5Avg !== null && baseline20Avg !== null && baseline20.length > recent5.length
      ? recent5Avg - baseline20Avg
      : 0;
  const recent8Avg = recent5Avg;
  const prior8Avg = baseline20Avg;

  const events = new Set<string>();
  const eventsYear = new Set<string>();
  const nowYear = new Date().getFullYear();
  let roundsThisYear = 0;
  const yearMap = new Map<number, ExtendedRound[]>();
  for (const r of included) {
    const y = new Date(r.played_on).getFullYear();
    yearMap.set(y, [...(yearMap.get(y) ?? []), r]);
    if (r.event_name) events.add(`${r.event_name}|${r.played_on.slice(0, 7)}`);
    if (y === nowYear) {
      roundsThisYear += 1;
      if (r.event_name) eventsYear.add(`${r.event_name}|${r.played_on.slice(0, 7)}`);
    }
  }
  const byYear = [...yearMap.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, rs]) => ({
      year,
      count: rs.length,
      avg: Math.round(rs.reduce((a, r) => a + r.round_rating, 0) / rs.length),
      best: Math.max(...rs.map((r) => r.round_rating)),
    }));

  const first = sortedAsc[0]; // any — recompute below
  const firstDate =
    [...included].sort((a, b) => a.played_on.localeCompare(b.played_on))[0]?.played_on ?? null;
  const lastDate = byDateDesc[0]?.played_on ?? null;
  const yearsActive = yearMap.size;

  const above = vals.filter((v) => v >= mean).length;
  return {
    count: vals.length,
    average: Math.round(mean),
    highest: sortedDesc[0].round_rating,
    lowest: sortedAsc[0].round_rating,
    stddev: Number(sd.toFixed(1)),
    best: sortedDesc[0] ?? null,
    worst: sortedAsc[0] ?? null,
    best10: avg(best10),
    worst10: avg(worst10),
    recent8: recent8Avg,
    prior8: prior8Avg,
    recent5: recent5Avg,
    baseline20: baseline20Avg,
    baselineCount: baseline20.length,
    momentum,
    firstDate,
    lastDate,
    yearsActive,
    roundsThisYear,
    eventsThisYear: eventsYear.size,
    totalEvents: events.size,
    byYear,
    pctAbove: Math.round((above / vals.length) * 100),
    pctBelow: 100 - Math.round((above / vals.length) * 100),
    _first: first,
  };
}
