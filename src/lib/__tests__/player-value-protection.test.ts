import { describe, expect, it } from "vitest";
import { computePayoutSchedule, protectRounding, splitTies } from "@/lib/payout-engine";
import { fiftyFifty, splitPool } from "@/lib/side-pots";

describe("player value protection", () => {
  it("$1 minimum singles and doubles", () => {
    const s = computePayoutSchedule({ pool_cents: 1000, team_size: 1, requested_places: 10, min_player_cents: 100, round_player_cents: 0 });
    expect(s.places.length).toBe(10);
    const d = computePayoutSchedule({ pool_cents: 1000, team_size: 2, requested_places: 5, min_player_cents: 100, round_player_cents: 0 });
    expect(d.min_team_cents).toBe(200);
  });
  it("$1 rounding never rounds down and reports shortfall", () => {
    const r = protectRounding([4367, 2792, 1841, 1000], 100, 1, 10000);
    expect(r.final_cents).toEqual([4400, 2800, 1900, 1000]);
    expect(r.extra_required_cents).toBe(100);
    expect(r.funded).toBe(false);
  });
  it("$5 rounding: 47/32/21 needs $10 more", () => {
    const r = protectRounding([4700, 3200, 2100], 500, 1, 10000);
    expect(r.final_cents).toEqual([5000, 3500, 2500]);
    expect(r.extra_required_cents).toBe(1000);
  });
  it("exact cents kept; funded when extra money exists", () => {
    expect(protectRounding([1842], 0).final_cents).toEqual([1842]);
    expect(protectRounding([1842], 100, 1, 1900).funded).toBe(true);
  });
  it("team $37 at $5/player goes to $40, never $30", () => {
    const r = protectRounding([3700], 500, 2);
    expect(r.final_cents).toEqual([4000]);
    r.final_cents.forEach((c, i) => expect(c).toBeGreaterThanOrEqual(r.raw_cents[i]!));
  });
  it("ace $183 and two aces at $185", () => {
    expect(splitPool(183, 1, true)).toMatchObject({ shares: [185], extraRequired: 2 });
    expect(splitPool(185, 2).shares).toEqual([92.5, 92.5]);
  });
  it("50/50 fractional share stays exact", () => {
    expect(fiftyFifty(275, 50).winner).toBe(137.5);
  });
  it("ties split exactly, not rounded down to a cash step", () => {
    const s = computePayoutSchedule({ pool_cents: 10000, team_size: 1, requested_places: 3, min_player_cents: 500, round_player_cents: 500 });
    const t = splitTies(s, [1, 2, 2], 500);
    const tied = s.places[1]!.cents + s.places[2]!.cents;
    expect(t[1]!.cents + t[2]!.cents + (t.remainder_cents ?? 0)).toBe(tied);
    expect(t.remainder_cents ?? 0).toBeLessThan(2);
  });
  it("no unexplained remainder: paid + remainder = pool", () => {
    const s = computePayoutSchedule({ pool_cents: 12345, team_size: 1, requested_places: 6, min_player_cents: 100, round_player_cents: 500, remainder_to: "hold" });
    expect(s.total_paid_cents + s.remainder_cents).toBe(12345);
  });
});
