import { describe, expect, it } from "vitest";
import { checkDivisionEligibility, type DgdDivision } from "./dgd-divisions";

const A30: DgdDivision = { code: "A30", competitive_class: "amateur", skill_min: null, skill_max: 935, age_min: 30, age_max: null };
const O: DgdDivision = { code: "O", competitive_class: "open", skill_min: null, skill_max: null, age_min: null, age_max: null };

describe("DGD division eligibility", () => {
  it("uses the calendar-year age rule", () => {
    expect(checkDivisionEligibility(A30, { rating: 900, birthYear: 1996 }, 2026).ok).toBe(true);
    expect(checkDivisionEligibility(A30, { rating: 900, birthYear: 1997 }, 2026).ok).toBe(false);
  });
  it("needs a birth year for age divisions", () => {
    expect(checkDivisionEligibility(A30, { rating: 900, birthYear: null }, 2026).ok).toBe(false);
  });
  it("blocks playing down but always allows playing up", () => {
    expect(checkDivisionEligibility(A30, { rating: 960, birthYear: 1980 }, 2026).ok).toBe(false);
    expect(checkDivisionEligibility(O, { rating: 700, birthYear: 2010 }, 2026).ok).toBe(true);
  });
  it("lets unrated players enter capped amateur divisions", () => {
    expect(checkDivisionEligibility(A30, { rating: null, birthYear: 1990 }, 2026).ok).toBe(true);
  });
});
