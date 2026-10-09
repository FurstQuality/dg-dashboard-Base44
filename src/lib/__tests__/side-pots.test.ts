import { describe, expect, it } from "vitest";
import { aceFundTotal, fiftyFifty, splitPool, payoutSummary, minimumWarning, perPlayer } from "@/lib/side-pots";

const base = { id: "a", award_type: "ace_fund", value_kind: "cash", amount: 0, payout_rule: "split_equal", winner_percent: 100, per_player: 2, contributors: 20, carryover_in: 100, added_cash: 0, round_to_5: false, team_award: false, team_size: 1, status: "awarded" };

describe("side pots", () => {
  it("ace fund total = carryover + contributions + added", () => {
    expect(aceFundTotal(base).total).toBe(140);
    expect(aceFundTotal({ ...base, carryover_in: 125, contributors: 18, added_cash: 10 }).total).toBe(171);
  });
  it("one ace takes all, no ace carries all", () => {
    expect(payoutSummary([base], [{ prize_id: "a", amount: 140, voided_at: null, paid: true }], 0).ace.carryover).toBe(0);
    expect(payoutSummary([base], [], 0).ace.carryover).toBe(140);
  });
  it("two aces split $200 evenly", () => {
    expect(splitPool(200, 2).shares).toEqual([100, 100]);
    expect(splitPool(101, 2, true)).toEqual({ shares: [55, 55], paid: 110, remainder: 0, extraRequired: 9 });
  });
  it("50/50 reconciles to gross", () => {
    const f = fiftyFifty(400, 50);
    expect(f.winner + f.retained).toBe(400);
    const s = payoutSummary([{ ...base, award_type: "fifty_fifty", amount: 400, winner_percent: 50 }], [{ prize_id: "a", amount: 200, voided_at: null, paid: true }], 500);
    expect(s.fiftyFifty).toEqual({ gross: 400, winner: 200, retained: 200 });
    expect(s.totalCash).toBe(700);
  });
  it("merchandise is value, not cash; voided winners don't count", () => {
    const s = payoutSummary([{ ...base, award_type: "ctp", value_kind: "merchandise", amount: 75 }], [{ prize_id: "a", amount: 75, voided_at: null, paid: true }, { prize_id: "a", amount: 75, voided_at: "x", paid: false }], 0);
    expect(s.additionalCash).toBe(0);
    expect(s.prizeValue).toBe(75);
  });
  it("warns on tiny cash and splits team prizes", () => {
    expect(minimumWarning("cash", 0.5)).toMatch(/\$1/);
    expect(minimumWarning("merchandise", 1)).toBeNull();
    expect(perPlayer(40, true, 2)).toBe(20);
  });
});
