import { describe, expect, it } from "vitest";
import { computePayoutSchedule, requestedPlaces, splitTies } from "./payout-engine";

const base = { team_size: 1, min_player_cents: 500, round_player_cents: 500 };

describe("computePayoutSchedule", () => {
  it("pays doubles $20/$10 on a $30 pool", () => {
    const s = computePayoutSchedule({ ...base, team_size: 2, pool_cents: 3000, requested_places: 2 });
    expect(s.places.map((p) => p.cents)).toEqual([2000, 1000]);
    expect(s.places[1]!.per_player_cents).toBe(500);
  });
  it("never pays below $5 per player and never exceeds the pool", () => {
    for (const pool of [1000, 3000, 7300, 12000, 45500]) {
      const s = computePayoutSchedule({ ...base, pool_cents: pool, requested_places: 20 });
      expect(s.total_paid_cents).toBeLessThanOrEqual(pool);
      s.places.forEach((p, i) => {
        expect(p.per_player_cents).toBeGreaterThanOrEqual(500);
        if (i > 0) expect(p.cents).toBeLessThanOrEqual(s.places[i - 1]!.cents);
      });
    }
  });
  it("clamps a minimum below $5 up to $5", () => {
    const s = computePayoutSchedule({ ...base, min_player_cents: 100, pool_cents: 2000, requested_places: 10 });
    expect(s.places.length).toBe(4);
  });
  it("reports a depth note when places are trimmed", () => {
    const s = computePayoutSchedule({ ...base, pool_cents: 3000, requested_places: 10 });
    expect(s.depth_note).toBeTruthy();
  });
});

describe("requestedPlaces", () => {
  it("rounds percent up", () => expect(requestedPlaces("top_percent", 24, 40)).toBe(10));
  it("caps count at entries", () => expect(requestedPlaces("top_count", 3, 5)).toBe(3));
});

describe("splitTies", () => {
  it("shares tied places evenly", () => {
    const s = computePayoutSchedule({ ...base, round_player_cents: 0, pool_cents: 6000, requested_places: 3 });
    const r = splitTies(s, [1, 2, 2]);
    expect(r[1]!.cents).toBe(r[2]!.cents);
    expect(r.reduce((t, x) => t + x.cents, 0) + (r.remainder_cents ?? 0)).toBe(s.total_paid_cents);
  });
});

describe("remainder to first", () => {
  it("gives 1st the odd $8 on an $18 doubles pool", () => {
    const s = computePayoutSchedule({ ...base, team_size: 2, pool_cents: 1800, requested_places: 3 });
    expect(s.places.map((p) => p.cents)).toEqual([1800]);
    expect(s.places[0]!.per_player_cents).toBe(900);
    expect(s.remainder_cents).toBe(0);
  });
});

import { computePayoutSchedule as cps } from "./payout-engine";
describe("remainder destination", () => {
  it("holds odd money instead of adding it to 1st", () => {
    const a = cps({ pool_cents: 7300, team_size: 1, requested_places: 3, min_player_cents: 500, round_player_cents: 500 });
    const b = cps({ pool_cents: 7300, team_size: 1, requested_places: 3, min_player_cents: 500, round_player_cents: 500, remainder_to: "hold" });
    expect(a.remainder_cents).toBe(0);
    expect(b.remainder_cents).toBe(300);
    expect(b.places[0]!.cents).toBe(a.places[0]!.cents - 300);
    expect(b.total_paid_cents + b.remainder_cents).toBe(7300);
  });
  it("uses an installed curve exponent and version", () => {
    const s = cps({ pool_cents: 10000, team_size: 1, requested_places: 3, min_player_cents: 500, round_player_cents: 0, curve_b: -0.5, curve_version: "pdga-2026@1" });
    expect(s.curve_version).toBe("pdga-2026@1");
    expect(s.total_paid_cents).toBe(10000);
  });
});
