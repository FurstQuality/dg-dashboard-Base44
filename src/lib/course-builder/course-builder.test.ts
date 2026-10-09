import { describe, it, expect } from "vitest";
import { distanceFt, holeDistances, insertBend, removeBend, polygonAcres, pointInPolygon, distanceToPathFt, type LatLng } from "./geometry";
import { MODE_TOOLS, classifyLegacyFeature, featuresForView } from "./layers";
import { canSetState, needsVerification, findNearbyOpenIssue, maintenanceStats } from "./maintenance";
import { validateCourse, canPublishBasic, completeness } from "./validate";

const tee: LatLng = [41.0, -87.0];
const basket: LatLng = [41.001, -87.0]; // ~364 ft north

describe("geometry", () => {
  it("measures straight-line distance", () => {
    _e(Math.round(distanceFt(tee, basket))).toBeGreaterThan(360);
    _e(Math.round(distanceFt(tee, basket))).toBeLessThan(368);
  });
  it("flight path with a bend is longer and flagged", () => {
    const d = holeDistances(tee, basket, [[41.0005, -86.9995]]);
    _e(d.flightFt).toBeGreaterThan(d.straightFt);
    _e(d.differs).toBe(true);
    _e(holeDistances(tee, basket).differs).toBe(false);
  });
  it("inserts and removes bends", () => {
    const b = insertBend([], 0, [1, 1]);
    _e(insertBend(b, 1, [2, 2])).toEqual([[1, 1], [2, 2]]);
    _e(removeBend([[1, 1], [2, 2]], 0)).toEqual([[2, 2]]);
  });
  it("area and containment", () => {
    const sq: LatLng[] = [[41, -87], [41.001, -87], [41.001, -86.999], [41, -86.999]];
    _e(polygonAcres(sq)).toBeGreaterThan(2);
    _e(pointInPolygon([41.0005, -86.9995], sq)).toBe(true);
    _e(pointInPolygon([41.01, -86.9995], sq)).toBe(false);
  });
  it("distance to flight line", () => {
    _e(Math.round(distanceToPathFt([41.0005, -87.0], [tee, basket]))).toBe(0);
  });
});

describe("layers", () => {
  it("no tool is duplicated across modes (Select excepted)", () => {
    const all = Object.values(MODE_TOOLS).flat().filter((t) => t !== "select");
    _e(new Set(all).size).toBe(all.length);
    _e(MODE_TOOLS.course[1]).toBe("boundary");
  });
  it("classifies legacy objects and flags uncertain ones", () => {
    _e(classifyLegacyFeature({ type: "parking" })).toEqual({ layer: "base", flagged: false });
    _e(classifyLegacyFeature({ type: "ob_area", hole_number: 3 })).toEqual({ layer: "layout", flagged: false });
    _e(classifyLegacyFeature({ type: "mando" }).flagged).toBe(true);
  });
  it("layout view never shows conditions or other events", () => {
    const fs = [
      { type: "parking" as const, layer: "base" as const },
      { type: "ob_area" as const, layer: "layout" as const, layout_id: "L1" },
      { type: "ob_area" as const, layer: "layout" as const, layout_id: "L2" },
      { type: "mando" as const, layer: "event" as const, event_overlay_id: "E1" },
      { type: "note" as const, layer: "condition" as const },
    ];
    _e(featuresForView(fs, { layoutId: "L1" }).length).toBe(2);
    _e(featuresForView(fs, { layoutId: "L1", overlayId: "E1" }).length).toBe(3);
  });
});

describe("maintenance", () => {
  it("permissions follow lifecycle rules", () => {
    const player = { isSteward: false, isReporter: false, signedIn: true };
    _e(canSetState("CONFIRMED", player)).toBe(false);
    _e(canSetState("PLANNED", player)).toBe(false);
    _e(canSetState("RESOLVED", { ...player, isReporter: true })).toBe(true);
    _e(canSetState("PLANNED", { ...player, isSteward: true })).toBe(true);
  });
  it("stale detection keeps history and only flags", () => {
    const old = { lifecycle: "REPORTED" as const, priority: "LOW" as const, category: "TRASH", created_at: "2026-01-01" };
    _e(needsVerification(old, new Date("2026-01-08"))).toBe(true);
    _e(needsVerification({ ...old, lifecycle: "RESOLVED" }, new Date("2026-02-01"))).toBe(false);
  });
  it("finds a nearby open issue", () => {
    const rows = [{ lat: 41.0001, lng: -87, lifecycle: "REPORTED" as const }];
    _e(findNearbyOpenIssue(tee, rows, { radiusFt: 75 })).not.toBeNull();
    _e(findNearbyOpenIssue(basket, rows, { radiusFt: 75 })).toBeNull();
  });
  it("stats", () => {
    const s = maintenanceStats([
      { lifecycle: "RESOLVED", category: "Trash", created_at: "2026-01-01", resolved_at: "2026-01-03" },
      { lifecycle: "REPORTED", category: "Trash", hole_number: 4, created_at: "2026-01-02" },
    ]);
    _e(s.avgResolutionDays).toBe(2);
    _e(s.open).toBe(1);
    _e(s.byCategory[0]).toEqual(["Trash", 2]);
  });
});

describe("validate", () => {
  const sq: LatLng[] = [[40.999, -87.001], [41.002, -87.001], [41.002, -86.998], [40.999, -86.998]];
  it("warns but allows basic publish", () => {
    const holes = [{ number: 1, par: 3, tee, basket }];
    const w = validateCourse({ boundaries: [sq], holes, features: [] });
    _e(w.map((x) => x.code)).toEqual(["no_flight"]);
    _e(canPublishBasic(holes)).toBe(true);
  });
  it("flags outside-boundary tee", () => {
    const w = validateCourse({ boundaries: [sq], holes: [{ number: 1, par: 3, tee: [42, -87], basket }], features: [] });
    _e(w.some((x) => x.code === "tee_outside")).toBe(true);
  });
  it("completeness scores", () => {
    _e(completeness({ hasBoundary: true, infrastructureCount: 1, holes: [{ number: 1, par: 3, tee, basket, flightPath: [tee, basket], rulesConfirmed: true }] }).pct).toBe(100);
  });
});

import { readiness as _readiness } from "./validate";
import { describe as _d, it as _it, expect as _e } from "vitest";
_d("readiness", () => {
  _it("separates scoring, map and caddy", () => {
    const r = _readiness([{ number: 1, par: 3, tee: [0, 0], basket: [0, 1], hasDistance: true }]);
    _e(r.map((x) => x.ready)).toEqual([true, true, false]);
    _e(r[2].missing.map((m) => m.code)).toEqual(["no_flight", "no_notes"]);
  });
  _it("nothing is ready with no holes", () => {
    _e(_readiness([]).every((x) => !x.ready)).toBe(true);
  });
});

import { mappingSummary as _ms } from "./validate";
_d("mappingSummary", () => {
  _it("picks the first missing tee, then unconfirmed par", () => {
    const base = { tee: [0, 0] as [number, number], basket: [0, 1] as [number, number], par: 3 };
    _e(_ms({ hasBoundary: true, holes: [{ number: 1, ...base }, { number: 2, ...base, tee: null }] }).next?.label).toBe("Map Hole 2 tee");
    const r = _ms({ hasBoundary: true, holes: [{ number: 1, ...base, parConfirmed: false }] });
    _e(r.next?.label).toBe("Confirm Hole 1 par");
    _e(r.rows.find((x) => x.key === "pars")?.done).toBe(0);
  });
});
