/**
 * Phase 5A.3 — read-only recent-performance diagnostics for V1.1 shadow
 * results. Pure functions over backtest predictions; never changes V1.1
 * mathematics or stored ratings.
 */
import type { Prediction } from "./candidate";

/** Two different quantities that were both called "Form". */
export type FormParts = { form_value: number | null; form_minus_skill: number | null; rounds: number };

export const FORM_MIN_ROUNDS = 5;
export const FORM_WINDOW = 8;

/** FORM_VALUE = mean recent round performance; FORM_MINUS_SKILL = that minus Skill (same display scale). */
export function formParts(recentPerfDisplay: number[], skillDisplay: number): FormParts {
  const last = recentPerfDisplay.slice(-FORM_WINDOW);
  if (last.length < FORM_MIN_ROUNDS) return { form_value: null, form_minus_skill: null, rounds: last.length };
  const v = last.reduce((a, b) => a + b, 0) / last.length;
  return { form_value: v, form_minus_skill: v - skillDisplay, rounds: last.length };
}

/** Reconstruct FORM_VALUE from stored rows that only kept the difference. */
export const formValueFrom = (skillDisplay: number | null | undefined, formMinusSkill: number | null | undefined) =>
  skillDisplay == null || formMinusSkill == null ? null : skillDisplay + formMinusSkill;

export type LayoutState = "ESTABLISHED" | "PROVISIONAL" | "COLD_START" | "UNKNOWN";

/** Information state of the layout at forecast time (before this round). */
export function layoutState(p: Pick<Prediction, "mapping" | "layout_rounds_before" | "layout_key">): LayoutState {
  if (p.mapping === "UNMAPPED" || p.mapping === "POSSIBLE" || p.layout_key?.startsWith("er:")) return "UNKNOWN";
  if (p.layout_rounds_before < 3) return "COLD_START";
  if (p.layout_rounds_before < 10) return "PROVISIONAL";
  return "ESTABLISHED";
}

export type Direction = "ABOVE" | "NEAR" | "BELOW";

/** PDGA signal in rating points, DGD signal in strokes vs pre-round Skill. Never converted between scales. */
export const DIRECTION_BANDS = { pdga_points: 10, dgd_strokes: 1 } as const;

export function direction(signal: number, band: number): Direction {
  if (signal > band) return "ABOVE";
  if (signal < -band) return "BELOW";
  return "NEAR";
}

export type DualRound = { id: string; pdga_signal: number; dgd_signal: number };

export function directionalAgreement(rows: DualRound[], bands = DIRECTION_BANDS) {
  const out = rows.map((r) => {
    const pdga = direction(r.pdga_signal, bands.pdga_points);
    const dgd = direction(r.dgd_signal, bands.dgd_strokes);
    // Opposite signs = strong disagreement; one NEAR = soft.
    const kind = pdga === dgd ? "AGREE" : pdga === "NEAR" || dgd === "NEAR" ? "SOFT_DISAGREE" : "STRONG_DISAGREE";
    return { ...r, pdga, dgd, kind };
  });
  return {
    sample: out.length,
    agree: out.filter((r) => r.kind === "AGREE").length,
    disagree: out.filter((r) => r.kind !== "AGREE").length,
    strong: out.filter((r) => r.kind === "STRONG_DISAGREE").length,
    rows: out,
  };
}

/**
 * Exact weight each observation carries in the final Skill mean. With
 * mu_after = mu_before + K (perf − mu_before), final mu =
 * prior_w · prior_mu + Σ w_i · perf_i, w_i = K_i · Π_{j>i}(1 − K_j).
 */
export function evidenceWeights(preds: Pick<Prediction, "gain" | "id" | "played_on">[]) {
  const w = new Array<number>(preds.length);
  let tail = 1;
  for (let i = preds.length - 1; i >= 0; i--) {
    w[i] = preds[i].gain * tail;
    tail *= 1 - preds[i].gain;
  }
  return { weights: w, prior: tail };
}

export const AGE_BUCKETS = ["0-90", "91-180", "181-365", "1-2y", "2y+"] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];

export function ageBucket(days: number): AgeBucket {
  if (days <= 90) return "0-90";
  if (days <= 180) return "91-180";
  if (days <= 365) return "181-365";
  if (days <= 730) return "1-2y";
  return "2y+";
}

/** Share of the final Skill mean carried by rounds in each age bucket (diagnostic; no cutoffs). */
export function ageContributions(preds: Pick<Prediction, "gain" | "id" | "played_on">[], asOf: string) {
  const { weights, prior } = evidenceWeights(preds);
  const now = Date.parse(`${asOf}T00:00:00Z`);
  const out: Record<AgeBucket, { rounds: number; weight: number }> = Object.fromEntries(
    AGE_BUCKETS.map((b) => [b, { rounds: 0, weight: 0 }]),
  ) as any;
  preds.forEach((p, i) => {
    const b = ageBucket(Math.round((now - Date.parse(`${p.played_on}T00:00:00Z`)) / 86_400_000));
    out[b].rounds++;
    out[b].weight += weights[i];
  });
  return { buckets: out, prior };
}

/** Each round's pull on a recent-window average relative to the earlier window. */
export function windowContribution(perf: number[], k: number, ref: number) {
  const last = perf.slice(-k);
  return last.map((x) => (x - ref) / k);
}

export function errorMetrics(errs: number[]) {
  const n = errs.length;
  if (!n) return { sample_size: 0, mean_error_bias: null, mae: null, median_absolute_error: null, rmse: null };
  const abs = errs.map(Math.abs).sort((a, b) => a - b);
  const mid = n >> 1;
  return {
    sample_size: n,
    mean_error_bias: errs.reduce((a, b) => a + b, 0) / n,
    mae: abs.reduce((a, b) => a + b, 0) / n,
    median_absolute_error: n % 2 ? abs[mid] : (abs[mid - 1] + abs[mid]) / 2,
    rmse: Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / n),
  };
}
