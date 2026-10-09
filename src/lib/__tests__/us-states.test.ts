import { describe, expect, it } from "vitest";
import { normalizeStateCode, stateFilterVariants, stateName, US_STATES } from "../us-states";

describe("normalizeStateCode", () => {
  it("treats postal codes and full names as the same state", () => {
    expect(normalizeStateCode("IN")).toBe("IN");
    expect(normalizeStateCode("in")).toBe("IN");
    expect(normalizeStateCode("Indiana")).toBe("IN");
    expect(normalizeStateCode("  indiana ")).toBe("IN");
    expect(normalizeStateCode("Ind.")).toBe("IN");
  });

  it("resolves every US state from its code and its name", () => {
    for (const s of US_STATES) {
      expect(normalizeStateCode(s.code)).toBe(s.code);
      expect(normalizeStateCode(s.name)).toBe(s.code);
      expect(normalizeStateCode(s.name.toUpperCase())).toBe(s.code);
    }
  });

  it("extracts the state from location strings", () => {
    expect(normalizeStateCode("Emporia, KS")).toBe("KS");
    expect(normalizeStateCode("Carmel, Indiana 46032")).toBe("IN");
    expect(normalizeStateCode("Charlotte, NC 28226")).toBe("NC");
    expect(normalizeStateCode("Raleigh, North Carolina")).toBe("NC");
    expect(normalizeStateCode("Austin Texas")).toBe("TX");
  });

  it("returns null when no state is present", () => {
    expect(normalizeStateCode("")).toBeNull();
    expect(normalizeStateCode(null)).toBeNull();
    expect(normalizeStateCode("Ontario, Canada")).toBeNull();
  });
});

describe("stateFilterVariants", () => {
  it("covers both stored spellings", () => {
    expect(stateFilterVariants("IN").sort()).toEqual(["IN", "Indiana"]);
    expect(stateFilterVariants("Indiana").sort()).toEqual(["IN", "Indiana"]);
  });

  it("falls back to the raw value for unknown regions", () => {
    expect(stateFilterVariants("Ontario")).toEqual(["Ontario"]);
  });
});

describe("stateName", () => {
  it("expands codes", () => {
    expect(stateName("IN")).toBe("Indiana");
  });
});
