import { describe, it, expect } from "vitest";
import { applyResponses, canSetState, freshnessOf, sortConditions, courseStatusSummary, findNearbyOpenIssue, maintenanceStats } from "./maintenance";

describe("live course truth", () => {
  it("reporter and repeat answers never count as independent", () => {
    const r = applyResponses("REPORTED", "MEDIUM", [
      { user_id: "rep", response: "STILL_THERE" },
      { user_id: "a", response: "STILL_THERE" },
      { user_id: "a", response: "STILL_THERE" },
    ], "rep");
    expect(r.confirm).toBe(1);
    expect(r.lifecycle).toBe("CONFIRMED");
  });
  it("two independent 'looks resolved' -> possibly resolved, never for safety", () => {
    const rs = [{ user_id: "a", response: "RESOLVED" as const }, { user_id: "b", response: "RESOLVED" as const }];
    expect(applyResponses("CONFIRMED", "MEDIUM", rs, "rep").lifecycle).toBe("POSSIBLY_RESOLVED");
    expect(applyResponses("CONFIRMED", "SAFETY", rs, "rep").lifecycle).toBe("CONFIRMED");
  });
  it("safety needs a steward to resolve", () => {
    const reporter = { isSteward: false, isReporter: true, signedIn: true };
    expect(canSetState("RESOLVED", reporter, "LOW")).toBe(true);
    expect(canSetState("RESOLVED", reporter, "SAFETY")).toBe(false);
    expect(canSetState("REOPEN", reporter)).toBe(false);
  });
  it("freshness ages per category", () => {
    const base = { lifecycle: "REPORTED" as const, priority: "MEDIUM" as const, created_at: "2026-01-01T00:00:00Z" };
    expect(freshnessOf({ ...base, category: "FLOODING" }, new Date("2026-01-03"))).toBe("NEEDS_CONFIRMATION");
    expect(freshnessOf({ ...base, category: "CONSTRUCTION" }, new Date("2026-01-03"))).toBe("FRESH");
    expect(freshnessOf({ ...base, category: "TRASH" }, new Date("2026-03-01"))).toBe("ARCHIVED");
    expect(freshnessOf({ ...base, priority: "SAFETY", category: "SAFETY" }, new Date("2026-12-01"))).toBe("STALE");
  });
  it("safety and confirmed sort first", () => {
    const s = sortConditions([
      { id: 1, priority: "LOW" as const, confidence: "UNVERIFIED" as const, freshness_state: "STALE" as const },
      { id: 2, priority: "SAFETY" as const, confidence: "COMMUNITY_CONFIRMED" as const, freshness_state: "FRESH" as const },
    ]);
    expect(s[0].id).toBe(2);
  });
  it("community reports never publish a closure", () => {
    expect(courseStatusSummary("OPEN", [{ priority: "SAFETY", freshness_state: "FRESH" }]).status).toBe("OPEN_WITH_CONDITIONS");
    expect(courseStatusSummary("CLOSED", []).status).toBe("CLOSED");
  });
  it("duplicates match by category radius", () => {
    const rows = [{ lat: 41.0001, lng: -87, lifecycle: "CONFIRMED" as const, category: "DOWNED_TREE" }];
    expect(findNearbyOpenIssue([41, -87], rows, { category: "DOWNED_TREE" })).not.toBeNull();
    expect(findNearbyOpenIssue([41, -87], rows, { category: "TRASH" })).toBeNull();
  });
  it("detects recurring problem spots", () => {
    const rows = Array.from({ length: 3 }, () => ({ lifecycle: "RESOLVED" as const, category: "FLOODING", hole_number: 3, created_at: "2026-01-01" }));
    expect(maintenanceStats(rows).recurring).toEqual([{ hole: 3, category: "FLOODING", count: 3 }]);
  });
});
