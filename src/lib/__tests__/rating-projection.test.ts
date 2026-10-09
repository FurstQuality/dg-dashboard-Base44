import { describe, expect, it } from "vitest";
import {
  currentRating,
  pdgaEligible,
  ratingBreakdown,
  weightedAverage,
  withinMonths,
  type RatedRound,
} from "../rating-projection";
import { estimatePlayerRating, estimateRoundRating } from "../rating";

const ANCHOR = new Date("2026-08-30T00:00:00Z");

function round(daysAgo: number, rating: number, extra: Partial<RatedRound> = {}): RatedRound {
  const d = new Date(ANCHOR.getTime() - daysAgo * 86_400_000);
  return {
    played_on: d.toISOString().slice(0, 10),
    round_rating: rating,
    source: "pdga",
    ...extra,
  };
}

describe("pdgaEligible", () => {
  it("keeps PDGA and source-less rounds, drops in-app rounds", () => {
    const rounds: RatedRound[] = [
      round(10, 950),
      round(11, 940, { source: "casual" }),
      round(12, 930, { source: "league" }),
      round(13, 920, { source: null }),
    ];
    expect(pdgaEligible(rounds).map((r) => r.round_rating)).toEqual([950, 920]);
  });
});

describe("withinMonths", () => {
  it("uses a 365-day window for 12 months and honours the included flag", () => {
    const rounds = [round(10, 950), round(400, 900), round(20, 940, { included: false })];
    expect(withinMonths(rounds, 12, ANCHOR).map((r) => r.round_rating)).toEqual([950]);
    expect(withinMonths(rounds, 24, ANCHOR).map((r) => r.round_rating)).toEqual([950, 900]);
  });
});

describe("weightedAverage", () => {
  it("returns 0 with no rounds", () => {
    expect(weightedAverage([])).toBe(0);
  });

  it("is a simple mean below the recency-weight threshold", () => {
    const rounds = [round(1, 900), round(2, 920), round(3, 940)];
    expect(weightedAverage(rounds)).toBe(920);
  });

  it("keeps a low round that is >100 below the mean but within 2.5 sigma", () => {
    // Wide spread: sigma is large, so the 100-point rule alone must not drop it.
    const ratings = [1000, 990, 980, 800, 790, 780, 700];
    const rounds = ratings.map((r, i) => round(i + 1, r));
    const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    expect(weightedAverage(rounds)).toBe(Math.round(mean));
  });

  it("double-weights the most recent 25% by date once 9+ rounds remain", () => {
    // Newest three rounds are 1000, the rest 900.
    const rounds = [
      ...[0, 1, 2].map((i) => round(i + 1, 1000)),
      ...Array.from({ length: 9 }, (_, i) => round(i + 10, 900)),
    ];
    const rating = weightedAverage(rounds);
    expect(rating).toBeGreaterThan(925);
    expect(rating).toBeLessThan(945);
  });
});

describe("currentRating", () => {
  it("falls back to the 24-month window with fewer than 8 recent rounds", () => {
    const rounds = [round(30, 960), round(500, 900), round(600, 900)];
    expect(currentRating(rounds, ANCHOR)).toBe(920);
  });

  it("stays on the 12-month window once 8 rounds exist", () => {
    const rounds = Array.from({ length: 8 }, (_, i) => round(i * 10 + 5, 950));
    rounds.push(round(500, 700));
    expect(currentRating(rounds, ANCHOR)).toBe(950);
  });
});

describe("ratingBreakdown", () => {
  it("reports an empty breakdown when nothing is eligible", () => {
    expect(ratingBreakdown([], ANCHOR)).toEqual({
      included: 0,
      droppedLow: 0,
      simpleMean: 0,
      doubleWeighted: 0,
      cutoff: null,
      rating: 0,
    });
  });

  it("matches currentRating for the same pool", () => {
    const rounds = Array.from({ length: 12 }, (_, i) => round(i * 5 + 1, 900 + i));
    const breakdown = ratingBreakdown(rounds, ANCHOR);
    expect(breakdown.rating).toBe(currentRating(rounds, ANCHOR));
    expect(breakdown.included).toBe(12);
    expect(breakdown.doubleWeighted).toBe(3);
  });
});

describe("estimateRoundRating", () => {
  it("prefers an official rating, then derives one from SSA", () => {
    expect(estimateRoundRating({ round_rating: 972, score: 54, ssa: 55 })).toBe(972);
    expect(estimateRoundRating({ round_rating: null, score: 52, ssa: 55 })).toBe(1030);
    expect(estimateRoundRating({ round_rating: null, score: 52, ssa: null })).toBeNull();
  });
});

describe("estimatePlayerRating", () => {
  it("reports no rating without rounds", () => {
    expect(estimatePlayerRating([], ANCHOR)).toEqual({
      rating: null,
      usedRounds: 0,
      bestRound: null,
      source: "none",
      windowMonths: 12,
    });
  });

  it("excludes doubles rounds and blends when no PDGA rounds exist", () => {
    const result = estimatePlayerRating(
      [
        { played_on: "2026-08-01", round_rating: 900, score: 54, ssa: 55, format: "doubles" },
        { played_on: "2026-08-02", round_rating: 960, score: 52, ssa: 55, format: "singles" },
      ],
      ANCHOR,
    );
    expect(result.source).toBe("blended");
    expect(result.usedRounds).toBe(1);
    expect(result.rating).toBe(960);
  });

  it("uses the 12-month PDGA window once 8 rated rounds exist", () => {
    const rounds = Array.from({ length: 8 }, (_, i) => ({
      played_on: new Date(ANCHOR.getTime() - (i * 10 + 5) * 86_400_000).toISOString().slice(0, 10),
      round_rating: 950,
      score: 54,
      ssa: 55,
      source: "pdga",
      format: "singles",
    }));
    const result = estimatePlayerRating(rounds, ANCHOR);
    expect(result.source).toBe("pdga");
    expect(result.windowMonths).toBe(12);
    expect(result.rating).toBe(950);
  });
});
