import { describe, it, expect } from "vitest";
import { checkPayoutCompliance, requiredPaidPlaces } from "./payout-compliance";

const base = { sanctioned: true, mode: "pdga_guided" as const, tier: "B" as const, net_entry_cents: 0 };

describe("payout compliance", () => {
  it("requires 40% pro / 45% am depth", () => {
    expect(requiredPaidPlaces(12, "pro")).toBe(5);
    expect(requiredPaidPlaces(10, "pro")).toBe(4);
    expect(requiredPaidPlaces(20, "am")).toBe(9);
    expect(requiredPaidPlaces(1, "pro")).toBe(1);
  });
  it("flags too few paid places", () => {
    const r = checkPayoutCompliance({ ...base, division_type: "pro", entries: 12, places_paid: 4, max_places: 10 });
    expect(r.rows[0]!.pass).toBe(false);
    expect(r.advice[0]).toContain("at least 5 of 12");
  });
  it("flags pool too small", () => {
    const r = checkPayoutCompliance({ ...base, division_type: "pro", entries: 12, places_paid: 3, max_places: 3 });
    expect(r.rows.some((x) => x.key === "pool" && !x.pass)).toBe(true);
  });
  it("checks am tier value", () => {
    const ok = checkPayoutCompliance({ ...base, tier: "A", division_type: "am", entries: 20, places_paid: 9, max_places: 20, net_entry_cents: 100000, am_value_cents: 110000 });
    expect(ok.rows.every((x) => x.pass)).toBe(true);
    const c = checkPayoutCompliance({ ...base, tier: "C", division_type: "am", entries: 20, places_paid: 9, max_places: 20, net_entry_cents: 100000, am_value_cents: 80000 });
    expect(c.rows.find((x) => x.key === "am_value")!.pass).toBe(false);
  });
  it("true amateur skips depth; unsanctioned skips everything", () => {
    const t = checkPayoutCompliance({ ...base, mode: "true_amateur", division_type: "am", entries: 20, places_paid: 0, max_places: 0, net_entry_cents: 1000, am_value_cents: 1000 });
    expect(t.rows.map((x) => x.key)).toEqual(["am_value"]);
    expect(checkPayoutCompliance({ ...base, sanctioned: false, division_type: "pro", entries: 12, places_paid: 1, max_places: 1 }).rows).toEqual([]);
  });
});
