import { describe, expect, it } from "vitest";
import { CAPABILITIES, INVENTORY_TABLES, SOURCES, capabilityMatrix, capabilityStatus } from "../registry";

describe("data intel registry", () => {
  it("every capability belongs to a known source and has a real parser", () => {
    const keys = new Set(SOURCES.map((s) => s.key));
    for (const c of CAPABILITIES) {
      expect(keys.has(c.source)).toBe(true);
      expect(c.parser.length).toBeGreaterThan(0);
    }
  });
  it("status climbs only with stored and linked data", () => {
    const cap = CAPABILITIES.find((c) => c.canonicalTable)!;
    expect(capabilityStatus(cap, {})).toBe("parser_built");
    expect(capabilityStatus(cap, { [cap.storedTable]: 5 })).toBe("stored");
    expect(capabilityStatus(cap, { [cap.storedTable]: 5, [cap.canonicalTable!]: 1 })).toBe("canonicalized");
  });
  it("unsupported cells stay empty instead of guessed", () => {
    const row = capabilityMatrix({}).find((r) => r.capability === "disc_catalog")!;
    expect(row.cells.find((c) => c.source === "pdga")!.status).toBeNull();
    expect(INVENTORY_TABLES).toContain("udisc_catalog");
  });
});
