import { describe, expect, it } from "vitest";
import {
  cashLineFor,
  fieldStrength,
  groupFieldByDivision,
  simulateOdds,
  type FieldRow,
} from "@/lib/tracker/event-preview";

const row = (n: number, rating: number | null, division: string | null = "MPO"): FieldRow => ({
  pdgaNumber: String(100000 + n),
  name: `Player ${n}`,
  division,
  rating,
  place: null,
  totalToPar: null,
});

describe("fieldStrength", () => {
  it("summarises ratings and counts unrated players as part of the field", () => {
    const s = fieldStrength([row(1, 1000), row(2, 950), row(3, null)]);
    expect(s.players).toBe(3);
    expect(s.rated).toBe(2);
    expect(s.ratedPct).toBe(67);
    expect(s.averageRating).toBe(975);
    expect(s.highestRating).toBe(1000);
    expect(s.lowestRating).toBe(950);
    expect(s.spread).toBe(50);
  });

  it("reports nulls rather than zeros when nothing is rated", () => {
    const s = fieldStrength([row(1, null), row(2, null)]);
    expect(s.averageRating).toBeNull();
    expect(s.medianRating).toBeNull();
    expect(s.top10Average).toBeNull();
    expect(s.spread).toBeNull();
  });

  it("averages only the top ten players for top10Average", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(i, 900 + i * 10));
    const s = fieldStrength(rows);
    // top ten are 1010 down to 920 → mean 965
    expect(s.top10Average).toBe(965);
  });

  it("takes the median of an odd-sized rated set", () => {
    expect(fieldStrength([row(1, 900), row(2, 950), row(3, 1010)]).medianRating).toBe(950);
  });
});

describe("groupFieldByDivision", () => {
  it("buckets divisions, sorts players by rating, and keeps undivisioned players", () => {
    const groups = groupFieldByDivision([
      row(1, 940, "MA1"),
      row(2, 1030, "MPO"),
      row(3, 990, "MPO"),
      row(4, 900, null),
    ]);
    expect(groups.map((g) => g.division)).toEqual(["MPO", "MA1", "Unlisted"]);
    expect(groups[0].players.map((p) => p.rating)).toEqual([1030, 990]);
    expect(groups[2].players).toHaveLength(1);
  });
});

describe("simulateOdds", () => {
  it("is deterministic for the same inputs", () => {
    const a = simulateOdds(1000, [990, 980, 970], 2);
    const b = simulateOdds(1000, [990, 980, 970], 2);
    expect(a).toEqual(b);
  });

  it("gives a far stronger player better odds than a far weaker one", () => {
    const field = [1000, 1010, 1020, 1030];
    const strong = simulateOdds(1060, field, 2);
    const weak = simulateOdds(900, field, 2);
    expect(strong.winPct).toBeGreaterThan(weak.winPct);
    expect(strong.cashPct).toBeGreaterThanOrEqual(weak.cashPct);
  });

  it("returns zeros and no sims when the field has no ratings", () => {
    expect(simulateOdds(1000, [], 2)).toEqual({ winPct: 0, top3Pct: 0, cashPct: 0, sims: 0 });
  });

  it("keeps percentages within bounds", () => {
    const r = simulateOdds(950, [1000, 900, 940, 980, 1010], 3);
    for (const v of [r.winPct, r.top3Pct, r.cashPct]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(r.cashPct).toBeGreaterThanOrEqual(r.top3Pct);
  });
});

describe("cashLineFor", () => {
  it("pays roughly the top 40% and never fewer than one spot", () => {
    expect(cashLineFor(50)).toBe(20);
    expect(cashLineFor(1)).toBe(1);
    expect(cashLineFor(0)).toBe(1);
  });
});
