import { describe, expect, it } from "vitest";
import {
  ageContributions, direction, directionalAgreement, errorMetrics, evidenceWeights, formParts, formValueFrom, layoutState,
} from "@/lib/dgd-v1/recent-audit";
import { formLabels } from "@/lib/dgd-v1/preview-format";
import { CANDIDATE_CONFIG, CANDIDATE_MODEL_ID, backtest, updateSkill, type CandRound } from "@/lib/dgd-v1/candidate";
import { STRICT_FLAGS } from "@/lib/dgd-v1/shadow.server";

describe("Form value vs Form-minus-Skill", () => {
  it("keeps the two quantities separate", () => {
    const f = formParts([40, 42, 41, 39, 43, 40, 42, 41], 55);
    expect(f.form_value).toBeCloseTo(41);
    expect(f.form_minus_skill).toBeCloseTo(-14);
    expect(formValueFrom(55, -14)).toBe(41);
  });
  it("needs 5 rounds", () => expect(formParts([1, 2, 3, 4], 0).form_value).toBeNull());
  it("labels the difference as Form vs Rating, never as Form", () => {
    const l = formLabels(41.1, -13.9, 8);
    expect(l.form).toEqual({ label: "Form", value: "41.1" });
    expect(l.vsSkill).toEqual({ label: "Form vs Rating", value: "−13.9" });
    expect(l.form.value).not.toContain("−");
  });
});

describe("layout-state diagnostics", () => {
  const base = { mapping: "EXACT" as const, layout_key: "node:1" };
  it("classifies by prior layout evidence", () => {
    expect(layoutState({ ...base, layout_rounds_before: 0 })).toBe("COLD_START");
    expect(layoutState({ ...base, layout_rounds_before: 5 })).toBe("PROVISIONAL");
    expect(layoutState({ ...base, layout_rounds_before: 12 })).toBe("ESTABLISHED");
    expect(layoutState({ mapping: "UNMAPPED", layout_key: "er:x", layout_rounds_before: 40 })).toBe("UNKNOWN");
  });
});

describe("directional comparison", () => {
  it("never converts scales; bands each signal separately", () => {
    expect(direction(22, 10)).toBe("ABOVE");
    expect(direction(-0.5, 1)).toBe("NEAR");
    const d = directionalAgreement([
      { id: "a", pdga_signal: 22, dgd_signal: 3 },
      { id: "b", pdga_signal: 30, dgd_signal: -14 },
      { id: "c", pdga_signal: 2, dgd_signal: -5 },
    ]);
    expect(d).toMatchObject({ sample: 3, agree: 1, disagree: 2, strong: 1 });
  });
});

describe("evidence weights and age buckets", () => {
  const preds = [
    { id: "1", played_on: "2023-01-01", gain: 0.5 },
    { id: "2", played_on: "2026-06-01", gain: 0.2 },
    { id: "3", played_on: "2026-09-01", gain: 0.1 },
  ];
  it("reproduces the Kalman mean exactly", () => {
    const perf = [10, 20, 30];
    let mu = 0;
    preds.forEach((p, i) => (mu = mu + p.gain * (perf[i] - mu)));
    const { weights, prior } = evidenceWeights(preds);
    expect(weights.reduce((s, w, i) => s + w * perf[i], 0) + prior * 0).toBeCloseTo(mu);
    expect(weights.reduce((a, b) => a + b, 0) + prior).toBeCloseTo(1);
  });
  it("buckets by age without cutoffs", () => {
    const { buckets } = ageContributions(preds, "2026-10-01");
    expect(buckets["0-90"].rounds).toBe(1);
    expect(buckets["91-180"].rounds).toBe(1);
    expect(buckets["2y+"].rounds).toBe(1);
    expect(buckets["2y+"].weight).toBeGreaterThan(0);
  });
  it("names every error metric", () => {
    expect(Object.keys(errorMetrics([1, -1, 2]))).toEqual(["sample_size", "mean_error_bias", "mae", "median_absolute_error", "rmse"]);
    expect(errorMetrics([1, -1, 2]).median_absolute_error).toBe(1);
  });
});

describe("contextual candidate isolation and V1.1 immutability", () => {
  const rounds: CandRound[] = Array.from({ length: 12 }, (_, i) => ({
    id: `r${i}`, player: i % 2 ? "p" : "q", played_on: `2026-0${1 + (i >> 2)}-1${i % 4}`, event: `e${i >> 1}`, round_number: 1,
    division: "MA1", score: 55 + (i % 5), round_rating: null, node: "n1", pools: 1, layout_name: "Main", par: 54, holes: 18, distance_ft: 6000,
  }));
  it("research variant never mutates the frozen config or inputs", () => {
    const cfg = JSON.stringify(CANDIDATE_CONFIG), inp = JSON.stringify(rounds);
    const a = backtest(rounds, STRICT_FLAGS as any);
    backtest(rounds, { ...STRICT_FLAGS, contextUpdate: false } as any);
    const a2 = backtest(rounds, STRICT_FLAGS as any);
    expect(JSON.stringify(CANDIDATE_CONFIG)).toBe(cfg);
    expect(JSON.stringify(rounds)).toBe(inp);
    expect(a2.predictions.map((p) => p.mu_after)).toEqual(a.predictions.map((p) => p.mu_after));
  });
  it("V1.1 identity, flags and update math are unchanged", () => {
    expect(CANDIDATE_MODEL_ID).toBe("dgd-core-v1.1-candidate@0.1.0");
    expect(STRICT_FLAGS).toEqual({ robust: true, coldStart: true, trend: false, volatility: true, strictPreRound: true, contextUpdate: true });
    expect(CANDIDATE_CONFIG).toMatchObject({ prior_sigma: 8, base_obs_sigma: 3, gain_max: 0.35, huber_k: 2, event_adj_tau: 2.5, unknown_layout_mult: 1.25 });
    const u = updateSkill(0, 4, 2, 9, CANDIDATE_CONFIG, true);
    expect(u.gain).toBeCloseTo(4 / 13);
    expect(u.mu).toBeCloseTo((4 / 13) * 2);
  });
});
