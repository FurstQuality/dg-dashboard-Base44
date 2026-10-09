import { describe, it, expect } from "vitest";
import { scale1000, scale1000Public, SCALE_1000 } from "@/lib/dgd-v1/scale-1000";
import { MODEL_STATUS, PRODUCTION_CHAMPION } from "@/lib/dgd-v1/launch-readiness";

describe("Phase 9 — production promotion", () => {
  it("V1.3 is the only player-visible model; Legacy archived; V1.2 frozen control", () => {
    expect(PRODUCTION_CHAMPION).toBe("dgd-core-v1.3@0.3.0");
    expect(MODEL_STATUS.find((m) => m.model_version === "dgd-legacy")!.stage).toBe("LEGACY_ARCHIVED");
    expect(MODEL_STATUS.find((m) => m.model_version === "dgd-core-v1.2@0.2.0")!.stage).toBe("FROZEN_CONTROL");
  });
});

describe("dgd-scale-1200-v1", () => {
  it("stays within 500–1200, and public value caps at 1199", () => {
    for (const s of [-100, 0, 20, 40, 60, 100]) { expect(scale1000(s)).toBeLessThanOrEqual(1200); expect(scale1000(s)).toBeGreaterThanOrEqual(500); }
    for (const s of [0, 20, 30]) expect(scale1000(s)).toBeLessThan(1200);
    expect(scale1000Public(500)).toBe(SCALE_1000.public_max);
  });
  it("is strictly monotonic including the extreme tail", () => {
    let prev = -Infinity;
    for (let s = -40; s <= 30; s += 0.25) { const v = scale1000(s); expect(v).toBeGreaterThan(prev); prev = v; }
  });
  it("lands research percentiles in PDGA-like bands", () => {
    expect(scale1000(-8.538)).toBeGreaterThan(650); expect(scale1000(-8.538)).toBeLessThan(750); // p05
    expect(scale1000(2.371)).toBeGreaterThan(860); expect(scale1000(2.371)).toBeLessThan(930);  // median
    expect(scale1000(9.813)).toBeGreaterThan(990); expect(scale1000(9.813)).toBeLessThan(1060);  // p95
  });
  it("missing ratings stay null, never 0", () => {
    expect(scale1000Public(null)).toBeNull();
    expect(scale1000Public(undefined)).toBeNull();
    expect(scale1000Public(NaN)).toBeNull();
  });
});
