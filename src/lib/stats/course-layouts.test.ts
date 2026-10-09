import { describe, expect, it } from "vitest";
import { buildLayoutBreakdown } from "./course-layouts";

describe("buildLayoutBreakdown", () => {
  it("never mixes layouts or rating sources", () => {
    const out = buildLayoutBreakdown([
      { layoutKey: null, layoutName: "Gold", source: "pdga", score: 50, toPar: -10, rating: 1000, playedOn: "2026-01-01" },
      { layoutKey: null, layoutName: "Blue", source: "pdga", score: 50, toPar: -10, rating: 900, playedOn: "2026-01-02" },
      { layoutKey: null, layoutName: "Gold", source: "udisc", score: 52, toPar: -8, rating: 250, playedOn: "2026-01-03" },
      { layoutKey: null, layoutName: "gold", source: "pdga", score: 54, toPar: -6, rating: 960, playedOn: "2026-01-04" },
    ]);
    expect(out).toHaveLength(3);
    const gold = out.find((l) => l.key === "pdga:gold")!;
    expect(gold.rounds).toBe(2);
    expect(gold.avgRating).toBe(980);
    expect(gold.bestToPar).toBe(-10);
    expect(out.find((l) => l.source === "udisc")!.avgRating).toBe(250);
  });
});
