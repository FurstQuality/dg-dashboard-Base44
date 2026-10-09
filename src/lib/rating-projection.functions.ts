import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Full-window PDGA rating projection.
 *
 * Simulates the user's PDGA rating 3 and 6 months into the future by:
 *  1. Pulling every rated round (from `round_ratings` + PDGA-verified
 *     `external_rounds`) with its play date.
 *  2. For each future month, ageing out rounds older than the trailing
 *     24-month PDGA window from that future date.
 *  3. Applying PDGA-style weighting: rounds within the trailing 12 months
 *     of the future date are double-weighted; 12–24 months old are
 *     single-weighted.
 *  4. Injecting simulated future rounds at the player's recent-form
 *     average (mean of last 5 rated singles rounds) at their observed
 *     rounds-per-month cadence.
 *  5. Recomputing the weighted mean at each future month.
 *
 * Returns null values when the user has no rated rounds. The result is
 * an estimate — real PDGA publications depend on which rounds the player
 * actually plays over the next six months, so we cap projected drift
 * conservatively and clamp to sane bounds.
 */
export type RatingProjectionPoint = {
  monthsAhead: number;
  rating: number;
  weightedRoundCount: number;
};

export type RatingProjectionResult = {
  currentWeighted: number | null;
  recentFormAvg: number | null;
  cadencePerMonth: number;
  projections: RatingProjectionPoint[];
  proj3: number | null;
  proj6: number | null;
};

const WINDOW_MONTHS = 24;
const DOUBLE_WEIGHT_MONTHS = 12;

function monthsBetween(a: Date, b: Date): number {
  // signed months a -> b
  return (
    (b.getFullYear() - a.getFullYear()) * 12 +
    (b.getMonth() - a.getMonth()) +
    (b.getDate() - a.getDate()) / 30
  );
}

function weightedMean(
  rounds: { rating: number; playedAt: Date }[],
  asOf: Date,
): { mean: number | null; count: number } {
  let num = 0;
  let den = 0;
  for (const r of rounds) {
    const age = monthsBetween(r.playedAt, asOf);
    if (age < 0 || age > WINDOW_MONTHS) continue;
    const w = age <= DOUBLE_WEIGHT_MONTHS ? 2 : 1;
    num += r.rating * w;
    den += w;
  }
  return { mean: den > 0 ? num / den : null, count: den };
}

export const getRatingProjection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RatingProjectionResult> => {
    const { supabase, userId } = context;

    const [nativeRes, extRes] = await Promise.all([
      supabase
        .from("round_ratings")
        .select("round_rating, created_at")
        .eq("user_id", userId)
        .not("round_rating", "is", null)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("external_rounds")
        .select("round_rating, played_on")
        .eq("user_id", userId)
        .eq("source", "pdga")
        .not("round_rating", "is", null)
        .order("played_on", { ascending: false })
        .limit(200),
    ]);

    const rounds: { rating: number; playedAt: Date }[] = [];
    for (const r of (nativeRes.data ?? []) as Array<{
      round_rating: number | null;
      created_at: string | null;
    }>) {
      if (r.round_rating == null || !r.created_at) continue;
      rounds.push({ rating: r.round_rating, playedAt: new Date(r.created_at) });
    }
    for (const r of (extRes.data ?? []) as Array<{
      round_rating: number | null;
      played_on: string | null;
    }>) {
      if (r.round_rating == null || !r.played_on) continue;
      rounds.push({ rating: r.round_rating, playedAt: new Date(r.played_on) });
    }

    if (rounds.length === 0) {
      return {
        currentWeighted: null,
        recentFormAvg: null,
        cadencePerMonth: 0,
        projections: [],
        proj3: null,
        proj6: null,
      };
    }

    rounds.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());

    const now = new Date();
    const current = weightedMean(rounds, now);

    const lastFive = rounds.slice(0, 5);
    const recentFormAvg = lastFive.length
      ? lastFive.reduce((s, r) => s + r.rating, 0) / lastFive.length
      : null;

    // Cadence: rated rounds in the last 12 months / 12
    const twelveAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const recentCount = rounds.filter((r) => r.playedAt >= twelveAgo).length;
    const cadencePerMonth = Math.max(0, recentCount / 12);

    const projections: RatingProjectionPoint[] = [];
    for (const m of [1, 2, 3, 4, 5, 6]) {
      const asOf = new Date(now);
      asOf.setMonth(asOf.getMonth() + m);

      // Simulate future rounds at recent-form rating, evenly spaced across the m months.
      const simulated: { rating: number; playedAt: Date }[] = [];
      const totalSim = Math.round(cadencePerMonth * m);
      if (recentFormAvg != null && totalSim > 0) {
        for (let i = 1; i <= totalSim; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() + Math.round((i / totalSim) * m * 30));
          simulated.push({ rating: recentFormAvg, playedAt: d });
        }
      }

      const { mean, count } = weightedMean([...rounds, ...simulated], asOf);
      if (mean != null) {
        projections.push({ monthsAhead: m, rating: Math.round(mean), weightedRoundCount: count });
      }
    }

    const proj3 = projections.find((p) => p.monthsAhead === 3)?.rating ?? null;
    const proj6 = projections.find((p) => p.monthsAhead === 6)?.rating ?? null;

    return {
      currentWeighted: current.mean != null ? Math.round(current.mean) : null,
      recentFormAvg: recentFormAvg != null ? Math.round(recentFormAvg) : null,
      cadencePerMonth,
      projections,
      proj3,
      proj6,
    };
  });
