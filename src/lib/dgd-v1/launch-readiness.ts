/**
 * Phase 5B.3 — DGD model promotion status, display rounding, source-mix
 * validation harness, launch gates and draft public copy. Pure and admin-only:
 * nothing here changes Skill, Form or Confidence math, and nothing is exposed
 * to normal players yet.
 */
import { V12_SHADOW_MODEL_ID } from "./candidate-v12";
import { V13_RESEARCH_MODEL_ID } from "./candidate-v13";

/* ------------------------------ model status ------------------------------ */

export type ModelStage = "PRODUCTION_CHAMPION" | "LEGACY_ARCHIVED" | "PUBLIC_LEGACY" | "FROZEN_BASELINE" | "FROZEN_CONTROL" | "SHADOW_CHAMPION" | "PROMOTION_CANDIDATE" | "RESEARCH";

export type ModelStatus = { model_version: string; stage: ModelStage; math_frozen: boolean; player_visible: boolean };

/** Single source of truth; mirrored in rating_model_versions.shadow_stage. */
export const MODEL_STATUS: readonly ModelStatus[] = [
  { model_version: "dgd-legacy", stage: "LEGACY_ARCHIVED", math_frozen: true, player_visible: false },
  { model_version: "dgd-core-v1@1.0.0", stage: "FROZEN_BASELINE", math_frozen: true, player_visible: false },
  { model_version: "dgd-core-v1.1-candidate@0.1.0", stage: "FROZEN_CONTROL", math_frozen: true, player_visible: false },
  { model_version: V12_SHADOW_MODEL_ID, stage: "FROZEN_CONTROL", math_frozen: true, player_visible: false },
  { model_version: V13_RESEARCH_MODEL_ID, stage: "PRODUCTION_CHAMPION", math_frozen: true, player_visible: true },
];
export const modelStatus = (v: string) => MODEL_STATUS.find((m) => m.model_version === v) ?? null;
/** Phase 9: V1.3 is the production champion; V1.2 is a frozen control kept for research. */
export const PRODUCTION_CHAMPION = MODEL_STATUS.find((m) => m.stage === "PRODUCTION_CHAMPION")!.model_version;
/** @deprecated Phase 9 — kept for research code; equals the former shadow champion (V1.2). */
export const SHADOW_CHAMPION = V12_SHADOW_MODEL_ID;
/** @deprecated Phase 9 — V1.3 was promoted; alias of PRODUCTION_CHAMPION. */
export const PROMOTION_CANDIDATE = PRODUCTION_CHAMPION;

/** Promotion of V1.3 to shadow champion needs both real-evidence gates; percentile is not required. Never implies public launch. */
export function canPromoteCandidate(g: { udisc_validation: GateState; native_canary: GateState }): boolean {
  return g.udisc_validation === "PASS" && g.native_canary === "PASS";
}

/* ---------------------------- whole-number rule --------------------------- */

/**
 * The one rounding rule for public DGD Rating: snap the stored value to 6
 * decimals (removes float noise, so 61.4999999997 is treated as 61.5), then
 * round half away from zero (61.5 -> 62, -2.5 -> -3). Every screen calls this.
 */
export function publicDgdRating(display: number | null | undefined): number | null {
  if (display == null || !Number.isFinite(display)) return null;
  const s = Math.sign(display), a = Math.abs(display);
  return s * Math.floor(Math.round(a * 1e6) / 1e6 + 0.5);
}
export const publicDgdRatingText = (display: number | null | undefined) => {
  const r = publicDgdRating(display);
  return r == null ? "Not rated yet" : String(r);
};

/* ----------------------------- terminology -------------------------------- */

export const PLAYER_TERMS = ["DGD Rating", "Form", "Form vs Rating", "Confidence"] as const;
export const ADMIN_ONLY_TERMS = ["Latent Skill", "Skill uncertainty"] as const;

/* ------------------------------ percentiles ------------------------------- */

export const PERCENTILE_LAUNCH_DECISION = { required_for_initial_launch: false, state: "NOT_REQUIRED", exposure: "RESEARCH_ONLY" } as const;

/* ------------------------- source-empty states ---------------------------- */

export type SourceKey = "pdga" | "udisc" | "native";
const EMPTY: Record<SourceKey, string> = {
  pdga: "No PDGA rating on file",
  udisc: "No native UDisc rating on file",
  native: "No DG Dashboard rounds yet",
};
/** Missing evidence is never shown as zero. */
export function sourceValueText(src: SourceKey, value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? EMPTY[src] : String(Math.round(value));
}

/* --------------------------- source-mix harness --------------------------- */

export type SourceObs = {
  round_id: string;
  player: string;
  sources: SourceKey[];
  /** actual − expected strokes, pre-round. */
  error: number;
  obs_sigma: number;
  /** 0–1 context quality. */
  context_quality: number;
};

export type SourceStats = { eligible_rounds: number; unique_players: number; bias: number | null; mae: number | null; median_ae: number | null; rmse: number | null; avg_obs_sigma: number | null; avg_context_quality: number | null };

const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : null);
const median = (x: number[]) => { if (!x.length) return null; const s = [...x].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r3 = (v: number | null) => (v == null ? null : +v.toFixed(3));

function stats(rows: SourceObs[]): SourceStats {
  const e = rows.map((r) => r.error);
  return {
    eligible_rounds: rows.length,
    unique_players: new Set(rows.map((r) => r.player)).size,
    bias: r3(mean(e)), mae: r3(mean(e.map(Math.abs))), median_ae: r3(median(e.map(Math.abs))),
    rmse: r3(e.length ? Math.sqrt(mean(e.map((x) => x * x))!) : null),
    avg_obs_sigma: r3(mean(rows.map((r) => r.obs_sigma))), avg_context_quality: r3(mean(rows.map((r) => r.context_quality))),
  };
}

/** One row per physical round (ids deduped). A round touched by several sources counts in each source's slice, and once in "mixed". */
export function sourceMixReport(obs: SourceObs[]) {
  const seen = new Set<string>(); const uniq = obs.filter((o) => (seen.has(o.round_id) ? false : (seen.add(o.round_id), true)));
  const by = (k: SourceKey) => uniq.filter((o) => o.sources.includes(k));
  return {
    physical_rounds: uniq.length,
    duplicates_dropped: obs.length - uniq.length,
    pdga: stats(by("pdga")), udisc: stats(by("udisc")), native: stats(by("native")),
    mixed: stats(uniq.filter((o) => new Set(o.sources).size > 1)),
  };
}

export type PlayerSnap = { mu: number; form: number | null; confidence: number };
export function mixedSourceDelta(before: PlayerSnap, after: PlayerSnap, recentMix: Partial<Record<SourceKey, number>>) {
  return { skill_before: before.mu, skill_after: after.mu, skill_shift: +(after.mu - before.mu).toFixed(3), form_before: before.form, form_after: after.form, confidence_before: before.confidence, confidence_after: after.confidence, recent_source_mix: recentMix };
}

/* ------------------------------ launch gates ------------------------------ */

export type GateState = "PASS" | "PENDING" | "FAIL" | "NOT_REQUIRED" | "POST_LAUNCH_MONITORING";
export type NativeValidation = { pipeline: "PIPELINE_VALIDATED" | "PENDING"; statistical: "STATISTICALLY_VALIDATED" | "POST_LAUNCH_MONITORING" | "PENDING" };

export type Gate = { key: string; label: string; state: GateState; evidence: string };

/** Current gate table. Changing a PENDING gate needs real evidence and a code change, never a silent flip. */
export const LAUNCH_GATES: readonly Gate[] = [
  { key: "v13_frozen", label: "V1.3 frozen", state: "PASS", evidence: "dgd-core-v1.3@0.3.0 math locked; any change needs V1.4" },
  { key: "v13_pdga_validation", label: "V1.3 PDGA validation", state: "PASS", evidence: "Frozen pre-source-mix snapshot (Phase 5B.3)" },
  { key: "queue_immediate_wake", label: "Queue immediate wake", state: "PASS", evidence: "All five live enqueue paths claimed within seconds" },
  { key: "full_batch_continuation", label: "Full-batch continuation", state: "PENDING", evidence: "Logic unit-tested; live test needs more than 25 distinct players with open jobs" },
  { key: "hourly_fallback", label: "Hourly fallback", state: "PASS", evidence: "Backstop cron succeeds hourly; delayed job claimed by backstop" },
  { key: "security", label: "Security", state: "PASS", evidence: "0 active critical/high; research tables admin-only" },
  { key: "scale_b", label: "Scale B", state: "PASS", evidence: "dgd-scale-B-linear-2.0 unchanged, refreshed dry run" },
  { key: "terminology", label: "Terminology", state: "PASS", evidence: "Player UI: DGD Rating / Form / Form vs Rating / Confidence" },
  { key: "udisc_mixed_source", label: "UDisc mixed-source validation", state: "PENDING", evidence: "Waiting for a fresh UDisc export" },
  { key: "native_canary", label: "First real native canary", state: "PENDING", evidence: "No real qualifying native multiplayer singles round yet" },
  { key: "native_statistical", label: "Native statistical validation", state: "PENDING", evidence: "Becomes POST_LAUNCH_MONITORING once the canary passes" },
  { key: "percentile_benchmark", label: "Percentile benchmark", state: "NOT_REQUIRED", evidence: "Research-only for initial Rating launch" },
  { key: "statboard_copy", label: "Statboard copy", state: "PENDING", evidence: "Draft ready; awaiting product review" },
  { key: "migration_dry_run", label: "Migration dry run", state: "PASS", evidence: "Scale B refreshed from current V1.2/V1.3 states" },
];

export const publicLaunchReady = (gates: readonly Gate[] = LAUNCH_GATES) => gates.every((g) => g.state === "PASS" || g.state === "NOT_REQUIRED" || g.state === "POST_LAUNCH_MONITORING");

export function nativeValidationFor(canaryPassed: boolean, nativeRounds: number, minRounds = 200): NativeValidation {
  if (!canaryPassed) return { pipeline: "PENDING", statistical: "PENDING" };
  return { pipeline: "PIPELINE_VALIDATED", statistical: nativeRounds >= minRounds ? "STATISTICALLY_VALIDATED" : "POST_LAUNCH_MONITORING" };
}

/* ---------------------------- known limitation ---------------------------- */

export const KNOWN_LIMITATIONS = [
  { key: "low_skill_plus_one_stroke", state: "KNOWN_MODEL_LIMITATION", summary: "Lower-skill players score about one stroke worse than forecast", concentrations: ["unmapped layouts", "post-inactivity rounds", "first-time layouts", "short / low-par courses"], revisit: "Only with mixed-source or larger validation evidence, as V1.4" },
] as const;

/* --------------------------- draft public copy ---------------------------- */

/** Draft only — not rendered anywhere for players yet. */
export const DGD_COPY_DRAFT = {
  headline: "DGD Rating estimates your current playing ability using eligible rounds from PDGA, UDisc and DG Dashboard.",
  points: [
    "Your PDGA Rating stays your official PDGA rating.",
    "UDisc ratings stay as UDisc calculates them.",
    "DGD Rating sits beside both and doesn't replace either one.",
    "A round recorded in more than one place counts once.",
    "Form shows how you've played recently.",
    "Confidence shows how sure the rating is, based on how much good evidence we have.",
  ],
} as const;
