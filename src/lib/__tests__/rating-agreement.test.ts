import { describe, expect, it } from "vitest";
import { currentRating, solveRequiredAverage, type RatedRound } from "@/lib/rating-projection";
import { computeRating, computeRoundRating, type EngineRound } from "@/lib/stats/rating-engine";
import { planTarget } from "@/lib/stats/target-calculator";
import { requiredScoreForRating, ratingForScore } from "@/lib/stats/course-readiness";

/**
 * StatLink shows one rating in several places — the snapshot headline, the
 * target planner, and course readiness. These tests keep those surfaces on
 * the same engine so they can never quote different numbers.
 */

const today = new Date();

function iso(daysAgo: number): string {
  return new Date(today.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

const engineRounds: EngineRound[] = [
  { played_on: iso(10), round_rating: 960, score: null, ssa: null, source: "pdga" },
  { played_on: iso(40), round_rating: 945, score: null, ssa: null, source: "pdga" },
  { played_on: iso(90), round_rating: 970, score: null, ssa: null, source: "pdga" },
  { played_on: iso(160), round_rating: 930, score: null, ssa: null, source: "pdga" },
  { played_on: iso(300), round_rating: 955, score: null, ssa: null, source: "pdga" },
];

const ratedRounds: RatedRound[] = engineRounds.map((r) => ({
  played_on: r.played_on,
  round_rating: computeRoundRating(r)!,
  included: true,
  source: "pdga",
}));

describe("rating agreement", () => {
  it("derives a round rating from score and SSA the same way readiness does", () => {
    const r: EngineRound = {
      played_on: iso(1),
      round_rating: null,
      score: 58,
      ssa: 53.8,
      stroke_value: 9.2,
    };
    expect(computeRoundRating(r)).toBe(ratingForScore(58, 53.8, 9.2));
  });

  it("course readiness inverts its own rating line exactly", () => {
    const target = 965;
    const score = requiredScoreForRating(target, 53.8, 9.2);
    expect(ratingForScore(score, 53.8, 9.2)).toBe(target);
  });

  it("planTarget reports the same current rating as the snapshot engine", () => {
    const plan = planTarget(engineRounds, 975, 5);
    expect(plan.currentRating).toBe(computeRating(engineRounds).rating);
  });

  it("planTarget's required round rating matches the projection solver", () => {
    const plan = planTarget(engineRounds, 975, 5);
    const solved = solveRequiredAverage(ratedRounds, 975, 5);
    expect(plan.requiredRoundRating).toBe(solved);
  });

  it("playing at the required average actually reaches the target", () => {
    const target = 975;
    const added = 6;
    const required = solveRequiredAverage(ratedRounds, target, added);
    const simulated: RatedRound[] = [
      ...ratedRounds,
      ...Array.from({ length: added }, () => ({
        played_on: iso(0),
        round_rating: required,
        included: true,
        source: "pdga" as const,
      })),
    ];
    expect(currentRating(simulated)).toBeGreaterThanOrEqual(target - 1);
  });

  it("flags an unreachable target instead of promising it", () => {
    const plan = planTarget(engineRounds, 1120, 1);
    expect(plan.achievable).toBe(false);
    expect(plan.message).toContain("unrealistic");
  });
});
