import { describe, expect, it } from "vitest";
import { recentAverages, recentTrend, resolveStatboardView } from "@/lib/stats/statboard-views";

describe("Statboard view state", () => {
  it("reads ?view= and falls back to the default", () => {
    expect(resolveStatboardView("courses", undefined, false)).toBe("courses");
    expect(resolveStatboardView(undefined, undefined, false, "ratings")).toBe("ratings");
    expect(resolveStatboardView("nonsense", undefined, false)).toBe("overview");
  });
  it("maps legacy ?tab= links onto the new views", () => {
    expect(resolveStatboardView(undefined, "history", false)).toBe("rounds");
    expect(resolveStatboardView(undefined, "goals", false)).toBe("development");
    expect(resolveStatboardView(undefined, "scoring", false)).toBe("scoring");
  });
  it("never opens Research for a normal user, even from a shared URL", () => {
    expect(resolveStatboardView("research", undefined, false)).toBe("overview");
    expect(resolveStatboardView("research", undefined, true)).toBe("research");
  });
});

describe("recent performance helpers", () => {
  it("needs the full window before showing an average", () => {
    expect(recentAverages([900, 910, 920])).toEqual([
      { n: 5, avg: null },
      { n: 10, avg: null },
      { n: 20, avg: null },
    ]);
    expect(recentAverages([1, 2, 3, 4, 5])[0]).toEqual({ n: 5, avg: 3 });
  });
  it("only states a trend with 10+ rounds and a real gap", () => {
    expect(recentTrend([950, 950, 950, 950, 950], 10)).toBeNull();
    expect(recentTrend([...Array(5).fill(950), ...Array(5).fill(930)], 10)).toBe("up");
    expect(recentTrend([...Array(5).fill(930), ...Array(5).fill(950)], 10)).toBe("down");
    expect(recentTrend([...Array(5).fill(935), ...Array(5).fill(930)], 10)).toBe("flat");
  });
});
