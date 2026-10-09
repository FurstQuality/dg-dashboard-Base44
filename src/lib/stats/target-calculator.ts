import { computeRating, type EngineRound, computeRoundRating } from "./rating-engine";
import { solveRequiredAverage, type RatedRound } from "@/lib/rating-projection";

export type TargetPlan = {
  currentRating: number | null;
  targetRating: number;
  remainingRounds: number;
  requiredRoundRating: number | null;
  achievable: boolean;
  message: string;
  scoreExamples: Array<{ ssa: number; score: number; label: string }>;
};

/**
 * Given the player's historical rounds and a target rating, estimate the
 * round rating they need to average across the next `remainingRounds`.
 *
 * Uses the same PDGA-style engine (recency-weighted, outlier-dropped) as
 * the rest of the app — the required average is found by binary-searching
 * the engine, not a closed-form top-quartile approximation.
 */
export function planTarget(
  rounds: EngineRound[],
  targetRating: number,
  remainingRounds: number,
  ssaOptions: number[] = [50, 54, 58],
): TargetPlan {
  const current = computeRating(rounds);
  const cur = current.rating;
  const clampedRemaining = Math.max(1, Math.min(50, Math.floor(remainingRounds)));

  // Convert kept rounds into RatedRound shape for the projection engine.
  const rated: RatedRound[] = [];
  for (const r of rounds) {
    const rr = computeRoundRating(r);
    if (rr == null) continue;
    const src = r.source;
    rated.push({
      played_on: r.played_on,
      round_rating: rr,
      included: r.included ?? true,
      source:
        src === "pdga" || src === "tournament" || src === "league" || src === "casual" ? src : null,
    });
  }

  const required = solveRequiredAverage(rated, targetRating, clampedRemaining);
  const achievable = required >= 500 && required <= 1100;
  const delta = cur == null ? null : targetRating - cur;

  const message =
    cur == null
      ? `Play ${clampedRemaining} rated rounds averaging ~${required} to establish a ${targetRating} rating.`
      : delta != null && delta <= 0
        ? `You're already at or above ${targetRating}. Keep averaging ${cur} to maintain it.`
        : achievable
          ? `Average ~${required} across your next ${clampedRemaining} rated rounds to reach ${targetRating} (from ${cur}).`
          : `Reaching ${targetRating} in ${clampedRemaining} rounds needs unrealistic play (~${required}). Try a longer horizon.`;

  // Translate required round rating into score-to-SSA examples.
  // round_rating = 1000 - (score - ssa) * 10  →  score = ssa - (required - 1000) / 10
  const scoreExamples = ssaOptions.map((ssa) => {
    const scoreVsSsa = -(required - 1000) / 10;
    return {
      ssa,
      score: Math.round(ssa + scoreVsSsa),
      label: `SSA ${ssa}: shoot ${scoreVsSsa >= 0 ? "+" : ""}${scoreVsSsa.toFixed(1)} (≈ ${Math.round(ssa + scoreVsSsa)})`,
    };
  });

  return {
    currentRating: cur,
    targetRating,
    remainingRounds: clampedRemaining,
    requiredRoundRating: required,
    achievable,
    message,
    scoreExamples,
  };
}
