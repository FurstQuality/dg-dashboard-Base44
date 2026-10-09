/**
 * Phase 5B.1 — DGD V1.3 calibration candidates. Research only: never wired into
 * the updater and never writes V1.2 rows. V1.2 (dgd-core-v1.2@0.2.0) stays the
 * frozen control; every V1.3 variant runs the unchanged V1.2 engine with one or
 * two optional, frozen calibration hooks.
 *
 * Fitted once, leakage-safe, on research rounds played before V13_FIT.split and
 * evaluated only on rounds on or after it. Changing any value needs a new id.
 */
import { referencePrior, type V12Options } from "./candidate-v12";
import type { CandRound } from "./candidate";

export const V13_MODEL_ID = "dgd-core-v1.3-candidate@0.1.0";

export const V13_FIT = {
  version: "v13-fit-2026-10-05",
  split: "2022-01-01",
  /** Mean first-observation forecast error by structural prior basis (train period). */
  prior_offsets: { structure: 0.868, par: 0.136, holes: 0, none: 1.039 } as Record<"structure" | "par" | "holes" | "none", number>,
  /** Forecast-side Skill calibration on established layouts (train period). */
  skill_center: 4.133,
  skill_slope: -0.0654,
} as const;

/** B: recalibrated structural / unknown-layout prior. Uses only par, holes, length. */
export function v13Prior(r: Pick<CandRound, "par" | "holes" | "distance_ft">) {
  const p = referencePrior(r);
  return { mu: p.mu - V13_FIT.prior_offsets[p.basis], sigma: p.sigma };
}

/** C: expected-score calibration by pre-round Skill. Skill itself is never changed. */
export function v13ForecastMu(mu: number) {
  return mu + V13_FIT.skill_slope * (mu - V13_FIT.skill_center);
}

export type V13Candidate = "A_v12_control" | "B_prior" | "C_skill_cal" | "D_both";

export function v13Options(c: V13Candidate, base: V12Options = {}): V12Options {
  if (c === "B_prior") return { ...base, prior: v13Prior };
  if (c === "C_skill_cal") return { ...base, forecastMu: v13ForecastMu };
  if (c === "D_both") return { ...base, prior: v13Prior, forecastMu: v13ForecastMu };
  return { ...base };
}

/** Phase 5B.2 — Candidate D frozen as its own version and run by the updater beside V1.2. */
export const V13_RESEARCH_MODEL_ID = "dgd-core-v1.3@0.3.0";
export const V13_RESEARCH_CANDIDATE: V13Candidate = "D_both";
