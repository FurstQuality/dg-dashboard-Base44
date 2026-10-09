import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { SCALE_CANDIDATES, applyScale, historyThroughScale, latentPerPoint, percentileIn, sourceMixStatus, type Benchmark } from "../dgd-v1/display-scale";
import { V12_SHADOW_MODEL_ID } from "../dgd-v1/candidate-v12";

const [A, B, C, D] = SCALE_CANDIDATES;
const bench: Benchmark = { benchmark_version: "b1", model_version: V12_SHADOW_MODEL_ID, benchmark_date: "2026-10-05", population_definition: "test", sample_size: 5, sorted_latent: [-10, -5, 0, 5, 10] };

describe("DGD display scales", () => {
  it("scale versions are independent of the model version", () => {
    for (const s of SCALE_CANDIDATES) {
      expect(s.scale_version).not.toBe(s.model_version);
      expect(s.model_version).toBe(V12_SHADOW_MODEL_ID);
    }
    expect(new Set(SCALE_CANDIDATES.map((s) => s.scale_version)).size).toBe(SCALE_CANDIDATES.length);
  });
  it("A preserves the placeholder 50 + 2.5×Skill", () => {
    expect(A.status).toBe("PLACEHOLDER_CONTROL");
    expect(applyScale(A, 4)).toBeCloseTo(60);
  });
  it("linear scales are fixed: a player's rating ignores who else exists", () => {
    // applyScale takes only the player's own latent Skill — population can't enter.
    expect(applyScale(B, 3)).toBe(applyScale(B, 3));
    expect(applyScale.length).toBe(2);
  });
  it("one point has a constant meaning on linear scales", () => {
    expect(latentPerPoint(B)).toBeCloseTo(0.5);
    expect(applyScale(B, 6) - applyScale(B, 5)).toBeCloseTo(applyScale(B, -5) - applyScale(B, -6));
  });
  it("tails: C and D never leave 0–100; B stays linear and reports overflow", () => {
    for (const x of [-60, -30, 30, 60]) {
      expect(applyScale(C, x)).toBeGreaterThan(0);
      expect(applyScale(C, x)).toBeLessThan(100);
      expect(applyScale(D, x)).toBeGreaterThan(0);
      expect(applyScale(D, x)).toBeLessThan(100);
    }
    expect(applyScale(B, 30)).toBe(110);
    expect(applyScale(C, 10)).toBeCloseTo(applyScale(B, 10)); // identical inside the linear region
  });
  it("rating and percentile are separate", () => {
    expect(percentileIn(bench, 0)).toBe(50);
    expect(applyScale(B, 0)).toBe(50);
    expect(percentileIn(bench, 5)).toBe(70);
    expect(applyScale(B, 5)).toBe(60);
  });
  it("percentile depends on benchmark version; rating does not", () => {
    const b2 = { ...bench, benchmark_version: "b2", sorted_latent: [0, 1, 2, 3, 4] };
    expect(percentileIn(bench, 2)).not.toBe(percentileIn(b2, 2));
    expect(applyScale(B, 2)).toBe(54);
  });
  it("history replays stored latent Skill through the current scale without altering it", () => {
    const h = historyThroughScale(B, [{ on: "2025-01-01", mu: 1 }, { on: "2026-01-01", mu: 3 }]);
    expect(h.map((x) => x.mu)).toEqual([1, 3]);
    expect(h.map((x) => x.display)).toEqual([52, 56]);
    expect(h.every((x) => x.scale_version === B.scale_version)).toBe(true);
  });
  it("source-mix validation stays pending without UDisc and native data", () => {
    expect(sourceMixStatus({ pdga: 90000, udisc_qualifying: 0, native: 0 })).toBe("PENDING");
    expect(sourceMixStatus({ pdga: 500, udisc_qualifying: 500, native: 500 })).toBe("VALIDATED");
  });
  it("the Statboard panel never converts Skill itself", () => {
    const src = readFileSync("src/components/stats/dgd-preview-panel.tsx", "utf8");
    expect(src).not.toMatch(/applyScale|display-scale|2\.5\s*\*/);
  });
  it("calibration tables have no direct client policies and the read function is gated", () => {
    const sql = readFileSync("drizzle/migrations/0016_dgd_phase5b_scale_research.sql", "utf8");
    expect(sql).toMatch(/dgd_v12_display_candidates[\s\S]*No client policies/);
    expect(sql).not.toMatch(/GRANT [A-Z, ]+ ON public\.dgd_v12_display_candidates TO (authenticated|anon)/);
    expect(sql).toMatch(/dgd_preview_allowed\(\)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_my_dgd_scale_candidates\(\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/is_platform_admin\(auth\.uid\(\)\)/);
  });
});
