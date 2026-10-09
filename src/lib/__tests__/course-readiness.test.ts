import { describe, expect, it } from "vitest";
import {
  buildReadinessRow,
  ratingForScore,
  requiredScoreForRating,
  summarizeCourseHistory,
  type ReadinessLayoutInput,
} from "@/lib/stats/course-readiness";

const layout: ReadinessLayoutInput = {
  layoutId: "l1",
  layoutName: "Blue",
  ssa: 55,
  strokeValue: 10,
  parTotal: 54,
  holeCount: 18,
  ssaSource: "layout-scratch",
};

describe("requiredScoreForRating", () => {
  it("returns the SSA for a 1000 rated round", () => {
    expect(requiredScoreForRating(1000, 55, 10)).toBe(55);
  });

  it("requires fewer strokes for a higher target", () => {
    expect(requiredScoreForRating(1050, 55, 10)).toBe(50);
    expect(requiredScoreForRating(950, 55, 10)).toBe(60);
  });

  it("falls back to the default stroke value when missing or invalid", () => {
    expect(requiredScoreForRating(950, 55, 0)).toBe(60);
  });

  it("round-trips with ratingForScore", () => {
    const score = requiredScoreForRating(965, 52.4, 8.5);
    expect(ratingForScore(score, 52.4, 8.5)).toBe(965);
  });
});

describe("buildReadinessRow", () => {
  it("reports unknown when no SSA exists", () => {
    const row = buildReadinessRow({ ...layout, ssa: null }, 950, summarizeCourseHistory([]));
    expect(row.verdict).toBe("unknown");
    expect(row.requiredScore).toBeNull();
  });

  it("calls it ready when the player's average already clears the number", () => {
    const history = summarizeCourseHistory([
      { played_on: "2026-05-01", score: 56, to_par: 2, round_rating: 990 },
      { played_on: "2026-06-01", score: 58, to_par: 4, round_rating: 970 },
    ]);
    const row = buildReadinessRow(layout, 950, history);
    expect(row.requiredScore).toBe(60);
    expect(row.verdict).toBe("ready");
    expect(row.gapFromAverage).toBe(-3);
  });

  it("calls it a stretch when only the best round clears", () => {
    const history = summarizeCourseHistory([
      { played_on: "2026-05-01", score: 58, to_par: 4, round_rating: 970 },
      { played_on: "2026-06-01", score: 66, to_par: 12, round_rating: 890 },
    ]);
    const row = buildReadinessRow(layout, 970, history);
    expect(row.requiredScore).toBe(58);
    expect(row.verdict).toBe("stretch");
  });

  it("calls it a reach when the best round is far short", () => {
    const history = summarizeCourseHistory([
      { played_on: "2026-05-01", score: 70, to_par: 16, round_rating: 850 },
    ]);
    const row = buildReadinessRow(layout, 1000, history);
    expect(row.verdict).toBe("reach");
    expect(row.gapFromBest).toBe(15);
  });

  it("expresses the target against par when par is known", () => {
    const row = buildReadinessRow(layout, 1000, summarizeCourseHistory([]));
    expect(row.requiredToPar).toBe(1);
  });
});

describe("summarizeCourseHistory", () => {
  it("returns empty history safely", () => {
    const h = summarizeCourseHistory([]);
    expect(h).toMatchObject({ rounds: 0, bestScore: null, avgScore: null, lastPlayedOn: null });
  });

  it("ignores null scores and tracks the latest date", () => {
    const h = summarizeCourseHistory([
      { played_on: "2026-01-02", score: null, to_par: null, round_rating: null },
      { played_on: "2026-03-04", score: 60, to_par: 6, round_rating: 940 },
      { played_on: "2026-02-01", score: 54, to_par: 0, round_rating: 1000 },
    ]);
    expect(h.rounds).toBe(3);
    expect(h.bestScore).toBe(54);
    expect(h.avgScore).toBe(57);
    expect(h.bestRating).toBe(1000);
    expect(h.lastPlayedOn).toBe("2026-03-04");
  });
});
