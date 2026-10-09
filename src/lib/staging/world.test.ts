import { describe, expect, it } from "vitest";
import { clampPos, cleanSay, puttResult, tossScore, triviaPoints, triviaSet, TOSS_TARGETS } from "./world";

describe("staging world rules", () => {
  it("clamps positions onto the lawn", () => {
    expect(clampPos(-5, 200)).toEqual({ x: 4, y: 96 });
    expect(clampPos(Number.NaN, 50)).toEqual({ x: 50, y: 50 });
  });
  it("cleans chat bubbles", () => {
    expect(cleanSay("  hi   there ")).toBe("hi there");
    expect(cleanSay("x".repeat(300))).toHaveLength(140);
  });
  it("perfect timing hits chains, bad timing misses", () => {
    expect(puttResult(0.5, 15, 0)).toBe("chains");
    expect(puttResult(0.95, 15, 0)).toBe("miss");
  });
  it("longer putts are harder", () => {
    expect(puttResult(0.58, 15, 0)).not.toBe("miss");
    expect(puttResult(0.58, 33, 0)).toBe("miss");
  });
  it("scores toss targets with a bullseye bonus", () => {
    const t = TOSS_TARGETS[1];
    expect(tossScore(t.x, t.y)).toBe(t.points + 2);
    expect(tossScore(5, 95)).toBe(0);
  });
  it("trivia rewards fast correct answers and sets are stable", () => {
    expect(triviaPoints(false, 0)).toBe(0);
    expect(triviaPoints(true, 0)).toBe(200);
    expect(triviaSet(42)).toEqual(triviaSet(42));
    expect(new Set(triviaSet(42)).size).toBe(5);
  });
});
