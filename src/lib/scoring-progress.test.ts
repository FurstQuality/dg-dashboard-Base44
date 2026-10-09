import { describe, expect, it } from "vitest";
import {
  firstUnscoredHole,
  formatToPar,
  isTypingTarget,
  paceProjection,
  playerRunningTotals,
  resolveScoringKey,
  type ProgressHole,
  type ProgressScore,
} from "@/lib/scoring-progress";

const holes: ProgressHole[] = [
  { number: 1, par: 3 },
  { number: 2, par: 4 },
  { number: 3, par: 3 },
  { number: 4, par: 5 },
];

const scores: ProgressScore[] = [
  { round_player_id: "me", hole_number: 1, strokes: 2 },
  { round_player_id: "me", hole_number: 2, strokes: 5 },
  { round_player_id: "other", hole_number: 1, strokes: 4 },
];

describe("playerRunningTotals", () => {
  it("totals only the requested player's saved holes", () => {
    expect(playerRunningTotals(holes, scores, "me")).toEqual({
      thru: 2,
      strokes: 7,
      parThru: 7,
      toPar: 0,
    });
  });

  it("counts a hole once when it was saved twice", () => {
    const dupes = [...scores, { round_player_id: "me", hole_number: 2, strokes: 5 }];
    expect(playerRunningTotals(holes, dupes, "me").thru).toBe(2);
  });

  it("ignores scores for holes that are not on this layout", () => {
    const stray = [...scores, { round_player_id: "me", hole_number: 19, strokes: 9 }];
    expect(playerRunningTotals(holes, stray, "me").strokes).toBe(7);
  });

  it("returns zeroes without a player", () => {
    expect(playerRunningTotals(holes, scores, null).thru).toBe(0);
  });
});

describe("firstUnscoredHole", () => {
  it("finds the next hole needing a score", () => {
    expect(firstUnscoredHole(holes, scores, "me")).toBe(3);
  });

  it("skips gaps in card order", () => {
    const skipped: ProgressScore[] = [
      { round_player_id: "me", hole_number: 1, strokes: 3 },
      { round_player_id: "me", hole_number: 3, strokes: 3 },
    ];
    expect(firstUnscoredHole(holes, skipped, "me")).toBe(2);
  });

  it("returns null once every hole is scored", () => {
    const all = holes.map((h) => ({ round_player_id: "me", hole_number: h.number, strokes: h.par }));
    expect(firstUnscoredHole(holes, all, "me")).toBeNull();
  });
});

describe("paceProjection", () => {
  it("holds current pace over the remaining holes", () => {
    const totals = playerRunningTotals(holes, [
      { round_player_id: "me", hole_number: 1, strokes: 2 },
      { round_player_id: "me", hole_number: 2, strokes: 4 },
    ], "me");
    expect(paceProjection(totals, 4)).toEqual({ remaining: 2, projectedToPar: -2 });
  });

  it("is null before the first hole is in the books", () => {
    expect(paceProjection({ thru: 0, strokes: 0, parThru: 0, toPar: 0 }, 18)).toBeNull();
  });
});

describe("formatToPar", () => {
  it("reads like a scorecard", () => {
    expect(formatToPar(0)).toBe("E");
    expect(formatToPar(3)).toBe("+3");
    expect(formatToPar(-2)).toBe("-2");
  });
});

describe("resolveScoringKey", () => {
  it("sets a score from a digit, with 0 meaning ten", () => {
    expect(resolveScoringKey("4")).toEqual({ type: "set", strokes: 4 });
    expect(resolveScoringKey("0")).toEqual({ type: "set", strokes: 10 });
  });

  it("nudges, navigates, confirms, and jumps", () => {
    expect(resolveScoringKey("+")).toEqual({ type: "bump", delta: 1 });
    expect(resolveScoringKey("ArrowDown")).toEqual({ type: "bump", delta: -1 });
    expect(resolveScoringKey("ArrowRight")).toEqual({ type: "nav", delta: 1 });
    expect(resolveScoringKey("Enter")).toEqual({ type: "confirm" });
    expect(resolveScoringKey("u")).toEqual({ type: "jumpUnscored" });
  });

  it("ignores keys with no scoring meaning", () => {
    expect(resolveScoringKey("q")).toBeNull();
    expect(resolveScoringKey("Tab")).toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("recognises form fields so typing is never stolen", () => {
    expect(isTypingTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(
      true,
    );
    expect(isTypingTarget({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
