/** Phase 3.8 — builds the candidate-matrix report. Pure; shared by the admin job and tests. */
import {
  CANDIDATE_CONFIG,
  CANDIDATE_MODEL_ID,
  CONTROL_MODEL_ID,
  DISPLAY_TRANSFORM_STATUS,
  NO_FLAGS,
  backtest,
  baselines,
  calibrateScale,
  contextualMapping,
  coverage,
  errStats,
  movement,
  pairedDiff,
  pct,
  pdgaReference,
  postBreak,
  responsiveness,
  type BacktestResult,
  type CandRound,
  type CandidateFlags,
  type Prediction,
} from "./candidate";

export type CalRow = {
  id: string;
  subject_id: string;
  pdga_event_id: string | null;
  event_name: string | null;
  division: string | null;
  round_number: number | null;
  played_on: string;
  score: number | null;
  round_rating: number | null;
  layout_node_ids: string[];
  layout_name: string | null;
  hole_count: number | null;
  par: number | null;
  distance_ft: number | null;
};

const TEAM_RE = /\b(doubles|dubs|team|scramble|best shot|mixed pairs)\b/i;

/** Same eligibility as the Phase 3.7 cohort run, so the control is comparable. */
export function toCandRounds(rows: CalRow[]): CandRound[] {
  return rows
    .filter((r) => r.score != null && r.score >= 18 && r.score <= 130 && r.round_rating != null)
    .filter((r) => !TEAM_RE.test(`${r.event_name ?? ""} ${r.division ?? ""}`))
    .map((r) => ({
      id: r.id,
      player: `cal:${r.subject_id}`,
      played_on: r.played_on,
      event: r.pdga_event_id ?? (r.event_name ?? "?").toLowerCase(),
      round_number: r.round_number,
      division: r.division,
      score: r.score as number,
      round_rating: r.round_rating,
      node: r.layout_node_ids.length === 1 ? r.layout_node_ids[0] : null,
      pools: r.layout_node_ids.length,
      layout_name: r.layout_name,
      par: r.par,
      holes: r.hole_count,
      distance_ft: r.distance_ft,
    }));
}

export const MATRIX: Record<string, CandidateFlags> = {
  A_v1_baseline: NO_FLAGS,
  B_robust_post_break: { ...NO_FLAGS, robust: true },
  C_cold_start_layouts: { ...NO_FLAGS, coldStart: true },
  D_trend_aware: { ...NO_FLAGS, trend: true },
  E_volatility_confidence: { ...NO_FLAGS, volatility: true },
};

/**
 * A component earns a place in F when its paired 95% CI is entirely on the
 * better side of zero, or — for interval-only mechanisms — when it leaves
 * accuracy unchanged (CI spans zero) and brings 80% coverage within 5 points
 * of nominal while the control misses by more.
 */
const COVERAGE_TOLERANCE = 5;

export function buildCandidateReport(
  rows: CalRow[],
  classes: Map<string, Record<string, boolean>>,
  official: Map<string, number | null>,
  burnInFraction = 0.2,
) {
  const rounds = toCandRounds(rows);
  const dates = rounds.map((r) => r.played_on).sort();
  const evalFrom = dates[Math.floor(dates.length * burnInFraction)] ?? "0000";
  const scored = (ps: Prediction[]) => ps.filter((p) => p.played_on >= evalFrom && p.prior_events >= 1);

  const runs: Record<string, BacktestResult> = {};
  for (const [k, f] of Object.entries(MATRIX)) runs[k] = backtest(rounds, f);
  const ctrl = new Map(scored(runs.A_v1_baseline.predictions).map((p) => [p.id, p]));
  const diffs: Record<string, ReturnType<typeof pairedDiff>> = {};
  for (const k of Object.keys(MATRIX)) if (k !== "A_v1_baseline") diffs[k] = pairedDiff(ctrl, scored(runs[k].predictions));

  // F: every component whose paired CI is entirely below −MIN_GAIN.
  const cov80 = (k: string) => coverage(scored(runs[k].predictions)).p80;
  const ctrlCovMiss = Math.abs(cov80("A_v1_baseline") - 80);
  const validated = Object.entries(diffs)
    .filter(([k, d]) => {
      if (!d.ci95) return false;
      if (d.ci95[1] < 0) return true;
      return d.ci95[0] < 0 && Math.abs(cov80(k) - 80) <= COVERAGE_TOLERANCE && ctrlCovMiss > COVERAGE_TOLERANCE;
    })
    .map(([k]) => k);
  const fFlags: CandidateFlags = { ...NO_FLAGS };
  for (const k of validated) Object.assign(fFlags, Object.fromEntries(Object.entries(MATRIX[k]).filter(([, v]) => v)));
  runs.F_best_validated = backtest(rounds, fFlags);
  diffs.F_best_validated = pairedDiff(ctrl, scored(runs.F_best_validated.predictions));
  // Phase 3.9: strict pre-round forecast (no same-round scores), with the
  // event-round field used only after the round for the skill update.
  const strictFlags: CandidateFlags = { ...fFlags, strictPreRound: true, contextUpdate: true };
  runs.F_strict_pre_round = backtest(rounds, strictFlags);
  diffs.F_strict_pre_round = pairedDiff(ctrl, scored(runs.F_strict_pre_round.predictions));

  const base = baselines(rounds);
  const groupsOf = (p: Prediction) => {
    const g: string[] = ["overall"];
    if (p.layout_rounds_before >= 10) g.push("established_layout");
    if (p.layout_rounds_before === 0) g.push("cold_start_layout");
    if ((p.gap ?? 0) >= 90 && p.prior_events >= 5) g.push("post_inactivity_90d");
    const cl = classes.get(p.player.replace(/^cal:/, ""));
    if (cl?.rapid_improver) g.push("rapid_improver_player");
    if (cl?.stable) g.push("stable_player");
    return g;
  };
  const table: Record<string, Record<string, ReturnType<typeof errStats>>> = {};
  const push = (model: string, g: string, e: number, acc: Record<string, Record<string, number[]>>) => ((acc[g] ??= {})[model] ??= []).push(e);
  const acc: Record<string, Record<string, number[]>> = {};
  for (const p of ctrl.values()) {
    const b = base.get(p.id)!;
    for (const g of groupsOf(p)) for (const [m, e] of Object.entries(b)) push(m, g, e, acc);
  }
  for (const [k, r] of Object.entries(runs)) {
    for (const p of scored(r.predictions)) {
      const c = ctrl.get(p.id);
      if (!c) continue;
      // Group by the control's view so every model is judged on the same rounds.
      for (const g of groupsOf(c)) push(k, g, p.err, acc);
    }
  }
  for (const [g, ms] of Object.entries(acc)) table[g] = Object.fromEntries(Object.entries(ms).map(([m, e]) => [m, errStats(e)]));

  const scaleA = calibrateScale(scored(runs.A_v1_baseline.predictions));
  const intervals = Object.fromEntries(
    Object.entries(runs).map(([k, r]) => {
      const ps = scored(r.predictions);
      const s = calibrateScale(ps);
      return [k, { raw: coverage(ps), calibration_scale_80: s, calibrated: s ? coverage(ps, s) : null }];
    }),
  );
  // Confidence bands of the control: does stated confidence match coverage?
  const confBands = [
    [0, 50],
    [50, 70],
    [70, 85],
    [85, 101],
  ].map(([lo, hi]) => {
    const ps = scored(runs.A_v1_baseline.predictions).filter((p) => {
      const conf = 100 * Math.max(0, 1 - p.prior_sigma / 8);
      return conf >= lo && conf < hi;
    });
    return { confidence: `${lo}–${Math.min(hi, 100)}`, n: ps.length, coverage: coverage(ps) };
  });

  // Volatility diagnostic from the control's residuals after layout difficulty.
  const byP = new Map<string, number[]>();
  for (const p of ctrl.values()) byP.set(p.player, [...(byP.get(p.player) ?? []), p.err]);
  const vol = [...byP.values()].filter((x) => x.length >= 20).map((x) => {
    const m = x.reduce((a, b) => a + b, 0) / x.length;
    return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1));
  });

  const mapping = contextualMapping(rounds);
  const mapCounts: Record<string, number> = {};
  for (const m of mapping.values()) mapCounts[m.mapping] = (mapCounts[m.mapping] ?? 0) + 1;

  const field = runs.C_cold_start_layouts.fieldEstimates;
  const ctrlAll = runs.A_v1_baseline.predictions;
  const strictPreds = scored(runs.F_strict_pre_round.predictions);
  const promotion = promotionDecision(strictPreds, diffs.F_strict_pre_round, table.overall ?? {});
  const withField = strictPreds.filter((p) => p.perf_ctx != null && p.round_rating != null);
  return {
    version: "dgd-candidate-report@0.2.0",
    candidate_model: CANDIDATE_MODEL_ID,
    control_model: CONTROL_MODEL_ID,
    control_changed: false,
    display_transform_status: DISPLAY_TRANSFORM_STATUS,
    config: CANDIDATE_CONFIG,
    strict_flags: strictFlags,
    promotion,
    post_round_reference: {
      rounds: withField.length,
      baseline_vs_pdga: correlations(withField.map((p) => p.perf_baseline), withField.map((p) => p.round_rating!)),
      contextual_vs_pdga: correlations(withField.map((p) => p.perf_ctx!), withField.map((p) => p.round_rating!)),
    },
    protocol: {
      kind: "prequential_online",
      leakage_free: true,
      note: "Each round is predicted only from earlier rounds; event-field estimates use other players' same-round scores with the player left out.",
      burn_in_fraction: burnInFraction,
      evaluated_from: evalFrom,
      rounds_total: rounds.length,
      rounds_scored: ctrl.size,
      players: new Set(rounds.map((r) => r.player)).size,
    },
    mapping: mapCounts,
    f_components: validated,
    f_flags: fFlags,
    layout_levels: Object.fromEntries(Object.entries(runs).map(([k, r]) => [k, r.levels])),
    error_table: table,
    paired_vs_v1: diffs,
    intervals,
    control_confidence_bands: confBands,
    control_interval_scale_80: scaleA,
    volatility: { players: vol.length, residual_sd: pct(vol, [0.1, 0.25, 0.5, 0.75, 0.9]) },
    movement: Object.fromEntries(Object.entries(runs).map(([k, r]) => [k, movement(r.predictions)])),
    post_break: Object.fromEntries(["A_v1_baseline", "B_robust_post_break", "F_best_validated"].map((k) => [k, postBreak(runs[k].predictions)])),
    responsiveness: Object.fromEntries(
      ["B_robust_post_break", "D_trend_aware", "F_best_validated"].map((k) => [
        k,
        {
          positive: responsiveness(ctrlAll, new Map(runs[k].predictions.map((p) => [p.id, p])), 1),
          negative: responsiveness(ctrlAll, new Map(runs[k].predictions.map((p) => [p.id, p])), -1),
        },
      ]),
    ),
    pdga_reference: Object.fromEntries(Object.entries(runs).map(([k, r]) => [k, pdgaReference(r, official)])),
    event_field: {
      estimates: field.length,
      participants: pct(field.map((f) => f.participant_count), [0.5, 0.9]),
      effective_participants: pct(field.map((f) => f.effective_participant_count), [0.5, 0.9]),
      sigma: pct(field.map((f) => f.event_round_layout_difficulty_sigma), [0.5, 0.9]),
    },
  };
}

const pearson = (a: number[], b: number[]) => {
  const n = a.length;
  if (n < 3) return null;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let c = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    c += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  return va && vb ? c / Math.sqrt(va * vb) : null;
};
const ranks = (a: number[]) => {
  const o = a.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]);
  const r = new Array<number>(a.length);
  for (let i = 0; i < o.length; ) {
    let j = i;
    while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++;
    for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return r;
};
/** Pearson and Spearman against the official PDGA round rating (a reference, not the target). */
export function correlations(a: number[], b: number[]) {
  return { n: a.length, pearson: pearson(a, b), spearman: pearson(ranks(a), ranks(b)) };
}

/**
 * Phase 3.9 promotion rule: SHADOW_CHAMPION only when the strict pre-round
 * forecast beats the V1 control (paired 95% CI entirely below zero) and every
 * simple baseline on overall MAE. Otherwise the candidate stays a candidate.
 */
export function promotionDecision(
  strict: Prediction[],
  diff: { ci95: number[] | null } | undefined,
  overall: Record<string, { mae: number | null }>,
) {
  const mae = strict.length ? strict.reduce((s, p) => s + Math.abs(p.err), 0) / strict.length : Infinity;
  const simple = ["layout_only", "player_long_term", "recent_10", "recent_20", "player_plus_layout"]
    .map((k) => overall[k]?.mae)
    .filter((x): x is number => typeof x === "number");
  const bestSimple = simple.length ? Math.min(...simple) : Infinity;
  const beatsControl = !!diff?.ci95 && diff.ci95[1] < 0;
  const beatsBaselines = mae < bestSimple;
  return {
    stage: beatsControl && beatsBaselines ? ("shadow_champion" as const) : ("candidate" as const),
    strict_mae: mae,
    best_simple_baseline_mae: bestSimple,
    beats_control: beatsControl,
    beats_baselines: beatsBaselines,
  };
}
