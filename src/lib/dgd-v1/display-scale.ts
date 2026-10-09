/**
 * Phase 5B — versioned public display scales for DGD V1.2 latent Skill.
 * Pure. The display scale is independent of the model version: changing a
 * scale never changes Skill, Form evidence or Confidence. Only the backend
 * applies these; UI components render stored display values.
 */

export type ScaleTransform = "LINEAR" | "LINEAR_SOFT_EDGE" | "TANH";

export type DisplayScale = {
  scale_version: string;
  model_version: string;
  transform_type: ScaleTransform;
  /** Display value of a reference (latent Skill 0) player. */
  anchor: number;
  /** Display points per stroke of latent Skill. */
  slope: number;
  params: Record<string, number>;
  min_behavior: "UNBOUNDED" | "SOFT_FLOOR_0" | "ASYMPTOTE_0";
  max_behavior: "UNBOUNDED" | "SOFT_CEIL_100" | "ASYMPTOTE_100";
  calibration_dataset_version: string;
  status: "PLACEHOLDER_CONTROL" | "LEADING_CANDIDATE" | "CANDIDATE" | "RESEARCH_ONLY";
};

const MODEL = "dgd-core-v1.2@0.2.0";
const DATASET = "cal-2026-10-05";

export const SCALE_CANDIDATES: readonly DisplayScale[] = [
  { scale_version: "dgd-scale-A-placeholder", model_version: MODEL, transform_type: "LINEAR", anchor: 50, slope: 2.5, params: {}, min_behavior: "UNBOUNDED", max_behavior: "UNBOUNDED", calibration_dataset_version: DATASET, status: "PLACEHOLDER_CONTROL" },
  { scale_version: "dgd-scale-B-linear-2.0", model_version: MODEL, transform_type: "LINEAR", anchor: 50, slope: 2.0, params: {}, min_behavior: "UNBOUNDED", max_behavior: "UNBOUNDED", calibration_dataset_version: DATASET, status: "LEADING_CANDIDATE" },
  { scale_version: "dgd-scale-C-linear-2.0-soft-edge", model_version: MODEL, transform_type: "LINEAR_SOFT_EDGE", anchor: 50, slope: 2.0, params: { edge: 5 }, min_behavior: "SOFT_FLOOR_0", max_behavior: "SOFT_CEIL_100", calibration_dataset_version: DATASET, status: "CANDIDATE" },
  { scale_version: "dgd-scale-D-tanh-research", model_version: MODEL, transform_type: "TANH", anchor: 50, slope: 2.0, params: { half_range: 50 }, min_behavior: "ASYMPTOTE_0", max_behavior: "ASYMPTOTE_100", calibration_dataset_version: DATASET, status: "RESEARCH_ONLY" },
];

/** Soft edge: linear inside [edge, 100-edge], exponentially compressed beyond so values approach but never cross 0/100. */
function softEdge(x: number, edge: number) {
  if (x > 100 - edge) return 100 - edge * Math.exp(-(x - (100 - edge)) / edge);
  if (x < edge) return edge * Math.exp((x - edge) / edge);
  return x;
}

export function applyScale(s: DisplayScale, latent: number): number {
  const lin = s.anchor + s.slope * latent;
  if (s.transform_type === "LINEAR") return lin;
  if (s.transform_type === "LINEAR_SOFT_EDGE") return softEdge(lin, s.params.edge ?? 5);
  const h = s.params.half_range ?? 50;
  return s.anchor + h * Math.tanh((s.slope * latent) / h);
}

/** Inverse on the linear part: latent strokes represented by `points` display points. */
export const latentPerPoint = (s: DisplayScale) => 1 / s.slope;

export type Benchmark = { benchmark_version: string; model_version: string; benchmark_date: string; population_definition: string; sample_size: number; sorted_latent: number[] };

/** Percentile (0–100) of latent Skill within a fixed benchmark. Never feeds back into Skill or Rating. */
export function percentileIn(b: Benchmark, latent: number): number {
  const xs = b.sorted_latent;
  if (!xs.length) return NaN;
  let lo = 0, hi = xs.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m] < latent) lo = m + 1; else hi = m; }
  let eq = lo; while (eq < xs.length && xs[eq] === latent) eq++;
  return (100 * (lo + (eq - lo) / 2)) / xs.length;
}

/** Final public-scale validation requires every source family to have enough qualifying data. */
export type SourceMixStatus = "VALIDATED" | "PENDING";
export function sourceMixStatus(counts: { pdga: number; udisc_qualifying: number; native: number }, min = 200): SourceMixStatus {
  return counts.pdga >= min && counts.udisc_qualifying >= min && counts.native >= min ? "VALIDATED" : "PENDING";
}

/** Historical charts re-express stored latent history through the current scale (decision: CURRENT_SCALE). */
export function historyThroughScale(s: DisplayScale, latentHistory: { on: string; mu: number }[]) {
  return latentHistory.map((h) => ({ on: h.on, mu: h.mu, display: applyScale(s, h.mu), scale_version: s.scale_version }));
}

/** Phase 5B.1 — Scale B leads. A scale version applies to every player; there is no per-player fallback. */
export const LEADING_SCALE_VERSION = "dgd-scale-B-linear-2.0";
export const scaleByVersion = (v: string) => SCALE_CANDIDATES.find((s) => s.scale_version === v) ?? null;
/** Eventual public presentation is a whole number; research views keep one decimal. */
export const publicRatingText = (display: number) => String(Math.round(display));
export const researchRatingText = (display: number) => display.toFixed(1);

