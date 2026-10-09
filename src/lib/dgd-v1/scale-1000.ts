/** Phase 9 — production public DGD scale. Pure; independent of model math (Skill never changes). */

/* ---------------- Phase 9 — production 0–1000 scale (dgd-scale-1000-v1) ---------------- */

/** Frozen after validation on 1003 V1.3 research players (cal-2026-10-05). Mirrors SQL dgd_scale_1000(). */
/** Active public scale: dgd-scale-1200-v1 (PDGA-like 500–1200, cap 1199). Mirrors SQL dgd_scale_1200(). */
export const SCALE_1000 = { scale_version: "dgd-scale-1200-v1", model_version: "dgd-core-v1.3@0.3.0" /* calibrated against */, midpoint: 0, slope: 9, floor: 500, ceiling: 1200, public_max: 1199 } as const;

/** Asymptotic 0–1000 DGD Rating from V1.3 latent Skill. 1000 = unreachable theoretical perfection. */
export function scale1000(skill: number): number {
  return SCALE_1000.floor + (SCALE_1000.ceiling - SCALE_1000.floor) / (1 + Math.exp(-(skill - SCALE_1000.midpoint) / SCALE_1000.slope));
}
/** Public whole number; missing stays null (never 0); never shows 1000. */
export function scale1000Public(skill: number | null | undefined): number | null {
  if (skill == null || !Number.isFinite(skill)) return null;
  return Math.min(SCALE_1000.public_max, Math.round(scale1000(skill)));
}
