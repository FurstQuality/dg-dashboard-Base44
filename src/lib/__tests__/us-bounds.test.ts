import { describe, expect, it } from "vitest";
import { isInUnitedStates } from "@/lib/event-directory-reverse-geo.server";

describe("isInUnitedStates", () => {
  it("accepts points across the contiguous states", () => {
    expect(isInUnitedStates(41.68, -87.49)).toBe(true); // Whiting, IN
    expect(isInUnitedStates(30.2, -97.64)).toBe(true); // Austin, TX
    expect(isInUnitedStates(45.53, -122.52)).toBe(true); // Portland, OR
  });

  it("accepts Alaska, Hawaii and the territories", () => {
    expect(isInUnitedStates(60.95, -149.16)).toBe(true); // Girdwood, AK
    expect(isInUnitedStates(21.31, -157.86)).toBe(true); // Honolulu, HI
    expect(isInUnitedStates(18.47, -66.11)).toBe(true); // San Juan, PR
    expect(isInUnitedStates(13.47, 144.75)).toBe(true); // Guam
  });

  it("cannot separate land neighbours by box alone", () => {
    // Toronto is south of the US border, so the box test reads it as inside.
    // The missing-region check in the correction pass is what flags it.
    expect(isInUnitedStates(43.65, -79.38)).toBe(true);
  });

  it("rejects overseas points the feed labels as United States", () => {
    expect(isInUnitedStates(36.6, -4.63)).toBe(false); // Fuengirola, Spain
    expect(isInUnitedStates(39.82, -8.37)).toBe(false); // Valle d'Encanto, Portugal
    expect(isInUnitedStates(60.17, 24.94)).toBe(false); // Helsinki, Finland
    expect(isInUnitedStates(-33.87, 151.21)).toBe(false); // Sydney, Australia
  });
});
