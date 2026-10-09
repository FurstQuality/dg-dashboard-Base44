/**
 * Phase 3.7 — DGD calibration cohort diagnostics. Pure, deterministic,
 * shadow-only. Nothing here changes DGD V1: it replays the unchanged engine
 * on calibration subjects and measures how it behaves. Admin notes are never
 * an input to any function in this file.
 */
import {
  computeForm,
  errorStats,
  fitLayoutDifficulty,
  pearson,
  replayPlayer,
  spearman,
  toDisplay,
  type CanonicalRoundInput,
  type DgdV1Config,
  type ErrorStats,
  type LayoutDifficulty,
  type Observation,
  type RatingEvent,
} from "./engine";
import { EXPERIENCE_DEFAULTS, UNKNOWN_FEATURES, playerExperienceDiagnostics, type CourseFeatures } from "./experience";

export const CALIBRATION_VERSION = "dgd-calibration@0.1.0";
export const DISPLAY_TRANSFORM_STATUS = "UNCALIBRATED_DISPLAY_TRANSFORM" as const;

/** Subject ids are prefixed so they can never collide with an auth user id. */
export const subjectKey = (subjectId: string) => `cal:${subjectId}`;

export type CalibrationRoundRow = {
  id: string;
  subject_id: string;
  pdga_event_id: string | null;
  event_name: string | null;
  division: string | null;
  round_number: number | null;
  played_on: string;
  score: number | null;
  round_rating: number | null;
  evaluated: boolean | null;
  included: boolean | null;
  layout_node_ids: string[];
  layout_name: string | null;
  hole_count: number | null;
  par: number | null;
};

const TEAM_RE = /\b(doubles|dubs|team|scramble|best shot|mixed pairs)\b/i;

/**
 * One calibration round → one engine input. A single-pool PDGA layout node is
 * an EXACT layout identity shared across events. Multi-pool rounds (we cannot
 * tell which pool the player threw) stay on an event-round key as POSSIBLE.
 */
export function toCalibrationInput(r: CalibrationRoundRow): CanonicalRoundInput {
  const single = r.layout_node_ids.length === 1;
  const multi = r.layout_node_ids.length > 1;
  const evKey = `pdga-event:${r.pdga_event_id ?? (r.event_name ?? "?").toLowerCase()}`;
  const toPar = r.score != null && r.par != null ? r.score - r.par : null;
  return {
    id: r.id,
    user_id: subjectKey(r.subject_id),
    played_on: r.played_on,
    course_key: single ? `pdga-node:${r.layout_node_ids[0]}` : evKey,
    course_name: r.layout_name ?? r.event_name,
    layout_name: single ? "pdga-layout" : `${r.division ?? "?"} r${r.round_number ?? "?"}`,
    score: r.score,
    to_par: toPar,
    hole_count: r.hole_count,
    hole_count_origin: r.hole_count != null ? "IMPORTED" : "UNKNOWN",
    par_played: r.par,
    layout_mapping: single ? "EXACT" : multi ? "POSSIBLE" : "UNMAPPED",
    mapped_layout_id: single ? `pdga-node-${r.layout_node_ids[0]}` : null,
    data_issue: null,
    duplicate_resolution: null,
    format: TEAM_RE.test(`${r.event_name ?? ""} ${r.division ?? ""}`) ? "doubles" : "singles",
    // A PDGA row without a round rating (unevaluated/unrated) is still a real
    // score, but we only model rounds PDGA itself rated as standard play.
    canonical_eligibility: r.round_rating != null ? "rated" : "ineligible",
    has_possible_duplicate: false,
    sources: [
      { source: "pdga", source_table: "dgd_calibration_rounds", source_row_id: r.id, match_level: "exact", source_round_rating: r.round_rating },
    ],
  };
}

// ---------- small stats ----------

export function quantiles(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => {
    const i = p * (s.length - 1);
    const lo = Math.floor(i);
    return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo);
  };
  return { n: s.length, min: s[0], p25: q(0.25), median: q(0.5), p75: q(0.75), max: s[s.length - 1], mean: s.reduce((a, b) => a + b, 0) / s.length };
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return m == null || xs.length < 3 ? null : Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000);
const isoMinus = (iso: string, days: number) => new Date((dayNum(iso) - days) * 86_400_000).toISOString().slice(0, 10);

// ---------- per-player diagnostics ----------

/** Skill (latent) as of a date, using only events on or before it. */
export function skillAt(events: RatingEvent[], iso: string, c: DgdV1Config): number {
  let mu = c.population_prior_mu;
  for (const e of events) if (e.played_on <= iso) mu = e.mu_after;
  return mu;
}

/**
 * Exact influence of each observation on the final Kalman mean:
 * w_i = K_i · Π_{j>i}(1−K_j). Used for the recency/old-performance test.
 */
export function observationInfluence(events: RatingEvent[]): number[] {
  const k = events.map((e) => (e.sigma_before_drifted > 0 ? 1 - e.sigma_after ** 2 / e.sigma_before_drifted ** 2 : 0));
  const w = new Array<number>(events.length).fill(0);
  let tail = 1;
  for (let i = events.length - 1; i >= 0; i--) {
    w[i] = k[i] * tail;
    tail *= 1 - k[i];
  }
  return w;
}

export type ResponseRun = { start_seq: number; length: number; mean_excess: number; skill_move: Record<string, number> };

/**
 * Responsiveness curve from real history: runs of consecutive "strong" rounds
 * (performance above the pre-round skill by ≥ threshold strokes) and how far
 * skill moved after 1, 3, 5, 10 of them.
 */
export function responsivenessRuns(events: RatingEvent[], threshold = 3, marks = [1, 3, 5, 10]): ResponseRun[] {
  const runs: ResponseRun[] = [];
  let i = 0;
  while (i < events.length) {
    if (events[i].round_performance_latent - events[i].mu_before < threshold) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < events.length && events[j + 1].round_performance_latent - events[j + 1].mu_before >= threshold) j++;
    const len = j - i + 1;
    const run = events.slice(i, j + 1);
    const move: Record<string, number> = {};
    for (const m of marks) if (len >= m) move[`after_${m}`] = run[m - 1].mu_after - run[0].mu_before;
    runs.push({
      start_seq: events[i].seq,
      length: len,
      mean_excess: run.reduce((a, e) => a + (e.round_performance_latent - run[0].mu_before), 0) / len,
      skill_move: move,
    });
    i = j + 1;
  }
  return runs;
}

export type PlayerClass = {
  rapid_improver: boolean;
  decliner: boolean;
  stable: boolean;
  high_volatility: boolean;
  high_volume: boolean;
  low_volume: boolean;
  local_heavy: boolean;
  broad_experience: boolean;
};

export type CalibrationPlayer = ReturnType<typeof playerDiagnostics>;

export function playerDiagnostics(
  subject: { id: string; pdga_number: string; display_name: string | null; official_rating: number | null; linked_user_id: string | null },
  rounds: CanonicalRoundInput[],
  eligibleCount: number,
  events: RatingEvent[],
  layouts: Map<string, LayoutDifficulty>,
  c: DgdV1Config,
  asOf: string,
) {
  const ev = [...events].sort((a, b) => a.seq - b.seq);
  const perf = ev.map((e) => e.round_performance_latent);
  const last = ev.at(-1);
  const mu = last?.mu_after ?? c.population_prior_mu;
  const sigma = last ? Math.sqrt(last.sigma_after ** 2 + c.skill_drift_per_day * Math.max(0, dayNum(asOf) - dayNum(last.played_on))) : c.population_prior_sigma;
  const form = computeForm(ev, c, asOf);
  const formAt = (d: string) => computeForm(ev.filter((e) => e.played_on <= d), c, d);
  const recentVsPrior = (n: number) => {
    if (perf.length < n + 5) return null;
    return (mean(perf.slice(-n)) as number) - (mean(perf.slice(0, -n)) as number);
  };
  const skillChange = (d: number) => (ev.length ? mu - skillAt(ev, isoMinus(asOf, d), c) : null);
  const formChange = (d: number) => {
    const then = formAt(isoMinus(asOf, d));
    return form != null && then != null ? form - then : null;
  };
  const resid = ev.filter((e) => e.seq > 3).map((e) => e.strokes_vs_expectation);
  const influence = observationInfluence(ev);
  const oldShare = (days: number) =>
    ev.reduce((a, e, i) => a + (dayNum(asOf) - dayNum(e.played_on) > days ? influence[i] : 0), 0);
  const pdgaRated = rounds
    .map((r) => ({ d: r.played_on, v: r.sources[0]?.source_round_rating ?? null }))
    .filter((x): x is { d: string; v: number } => x.v != null)
    .sort((a, b) => a.d.localeCompare(b.d));
  const pdgaLastN = (n: number) => (pdgaRated.length >= Math.min(n, 3) ? mean(pdgaRated.slice(-n).map((x) => x.v)) : null);
  const pdgaWindow = (days: number) => mean(pdgaRated.filter((x) => dayNum(asOf) - dayNum(x.d) <= days).map((x) => x.v));
  const features = new Map<string, CourseFeatures>();
  for (const k of layouts.keys()) features.set(k, UNKNOWN_FEATURES);
  const exp = ev.length ? playerExperienceDiagnostics(ev, layouts, features, asOf, EXPERIENCE_DEFAULTS) : null;
  const exactShare = ev.length
    ? ev.filter((e) => e.layout_key.startsWith("layout:pdga-node-")).length / ev.length
    : null;
  const lastYear = ev.filter((e) => dayNum(asOf) - dayNum(e.played_on) <= 365).length;
  const runs = responsivenessRuns(ev, c.base_observation_sigma);
  const lag10 = perf.length >= 10 ? (mean(perf.slice(-10)) as number) - mu : null;
  return {
    subject_id: subject.id,
    pdga_number: subject.pdga_number,
    name: subject.display_name,
    linked_user_id: subject.linked_user_id,
    official_pdga_rating: subject.official_rating,
    canonical_rounds: rounds.length,
    eligible_rounds: eligibleCount,
    ineligible_rounds: rounds.length - eligibleCount,
    rated_events: ev.length,
    first_round: ev[0]?.played_on ?? null,
    last_round: last?.played_on ?? null,
    rounds_last_365d: lastYear,
    skill_mu: mu,
    skill_sigma: sigma,
    display_uncalibrated: toDisplay(mu, c),
    display_transform_status: DISPLAY_TRANSFORM_STATUS,
    form,
    confidence: 100 * Math.min(1, Math.max(0, 1 - sigma / c.confidence_reference_sigma)),
    effective_observations: ev.reduce((a, e) => a + c.base_observation_sigma ** 2 / e.observation_sigma ** 2, 0),
    perf_last5: perf.length >= 5 ? mean(perf.slice(-5)) : null,
    perf_last10: perf.length >= 10 ? mean(perf.slice(-10)) : null,
    perf_last20: perf.length >= 20 ? mean(perf.slice(-20)) : null,
    recent_5_vs_prior_baseline: recentVsPrior(5),
    recent_10_vs_prior_baseline: recentVsPrior(10),
    recent_20_vs_prior_baseline: recentVsPrior(20),
    skill_change_30d: skillChange(30),
    skill_change_90d: skillChange(90),
    skill_change_180d: skillChange(180),
    // velocity = strokes of latent skill per 30 days over the window
    skill_velocity_30d: skillChange(30),
    skill_velocity_90d: skillChange(90) == null ? null : (skillChange(90) as number) / 3,
    skill_velocity_180d: skillChange(180) == null ? null : (skillChange(180) as number) / 6,
    form_change_30d: formChange(30),
    form_change_90d: formChange(90),
    form_minus_skill_display: form != null ? form - toDisplay(mu, c) : null,
    recent10_minus_skill_latent: lag10,
    volatility_residual_sd: sd(resid),
    volatility_performance_sd: sd(perf),
    expected_vs_actual: errorStats(resid),
    influence_share_older_180d: ev.length ? oldShare(180) : null,
    influence_share_older_365d: ev.length ? oldShare(365) : null,
    influence_share_prior: ev.length ? 1 - influence.reduce((a, b) => a + b, 0) : null,
    exact_layout_share: exactShare,
    course_breadth: exp?.course_breadth ?? null,
    generalization_confidence: exp?.generalization_confidence ?? null,
    effective_layout_count: exp?.effective_layout_count ?? null,
    primary_layout_share: exp?.primary_layout?.share ?? null,
    home_vs_away: exp?.familiarity_advantage ?? null,
    adaptability: exp?.adaptability ?? null,
    pdga_last5: pdgaLastN(5),
    pdga_last10: pdgaLastN(10),
    pdga_last20: pdgaLastN(20),
    pdga_90d: pdgaWindow(90),
    pdga_365d: pdgaWindow(365),
    responsiveness_runs: runs,
    history: ev.map((e) => ({
      d: e.played_on,
      skill: e.mu_after,
      sigma: e.sigma_after,
      perf: e.round_performance_latent,
      pdga: e.source_refs[0]?.source_round_rating ?? null,
    })),
  };
}

// ---------- classification and flags ----------

export function classify(players: CalibrationPlayer[]): Map<string, PlayerClass> {
  const vol = players.map((p) => p.volatility_residual_sd).filter((v): v is number => v != null);
  const vq = quantiles(vol);
  const volume = quantiles(players.map((p) => p.rounds_last_365d));
  const out = new Map<string, PlayerClass>();
  for (const p of players) {
    const r10 = p.recent_10_vs_prior_baseline;
    const r20 = p.recent_20_vs_prior_baseline;
    out.set(p.subject_id, {
      rapid_improver: r10 != null && r10 >= 3,
      decliner: r10 != null && r10 <= -3,
      stable: r20 != null && Math.abs(r20) < 1.5 && (p.volatility_residual_sd ?? 99) <= (vq?.median ?? 0),
      high_volatility: vq != null && vol.length >= 4 && (p.volatility_residual_sd ?? -1) >= vq.p75,
      high_volume: volume != null && p.rounds_last_365d >= Math.max(20, volume.p75),
      low_volume: p.rounds_last_365d <= Math.min(12, volume?.p25 ?? 12),
      local_heavy: (p.primary_layout_share ?? 0) >= 0.4 || (p.effective_layout_count ?? 99) < 5,
      broad_experience: (p.effective_layout_count ?? 0) >= 15,
    });
  }
  return out;
}

export type ModelFlag =
  | "SKILL_MOVES_TOO_FAST"
  | "SKILL_NOT_RESPONDING"
  | "CONFIDENCE_WITHOUT_EVIDENCE"
  | "FORM_SKILL_GAP_PERSISTENT"
  | "HIGH_PREDICTION_ERROR"
  | "POOR_LAYOUT_MAPPING"
  | "EXTREME_COURSE_CONCENTRATION";

export function modelFlags(p: CalibrationPlayer, c: DgdV1Config, cohortMaeP75: number | null): ModelFlag[] {
  const f: ModelFlag[] = [];
  const h = p.history;
  for (let i = 6; i < h.length; i++) if (Math.abs(h[i].skill - h[i - 1].skill) > 3) { f.push("SKILL_MOVES_TOO_FAST"); break; }
  if ((p.recent_10_vs_prior_baseline ?? 0) >= 3 && (p.recent10_minus_skill_latent ?? 0) >= 3) f.push("SKILL_NOT_RESPONDING");
  if (p.confidence >= 70 && p.effective_observations < 10) f.push("CONFIDENCE_WITHOUT_EVIDENCE");
  const gapNow = p.form_minus_skill_display;
  if (gapNow != null && Math.abs(gapNow) >= 4 * c.display_scale_factor && Math.abs(p.form_change_90d ?? 0) < Math.abs(gapNow) / 2)
    f.push("FORM_SKILL_GAP_PERSISTENT");
  const mae = p.expected_vs_actual.mae;
  if (mae != null && p.expected_vs_actual.n >= 10 && mae > Math.max(6, (cohortMaeP75 ?? 0) * 1.25)) f.push("HIGH_PREDICTION_ERROR");
  if ((p.exact_layout_share ?? 1) < 0.5) f.push("POOR_LAYOUT_MAPPING");
  if ((p.primary_layout_share ?? 0) >= 0.6) f.push("EXTREME_COURSE_CONCENTRATION");
  return f;
}

// ---------- cohort holdout ----------

const COHORT_MODELS = [
  "A_layout_only",
  "B_player_long_term",
  "C_player_recent10",
  "D_player_recent20",
  "E_player_plus_layout",
  "F_dgd_v1",
] as const;
type CohortModel = (typeof COHORT_MODELS)[number];
type Errs = Record<CohortModel, number[]>;
const emptyErrs = (): Errs => Object.fromEntries(COHORT_MODELS.map((m) => [m, []])) as unknown as Errs;

/**
 * Leakage-free: players AND layouts fit only on rounds strictly before the
 * cutoff, then frozen. B–D are "layout mean + the player's mean residual"
 * (all-time / last 10 / last 20) so they are comparable across layouts.
 */
export function cohortHoldoutAtCutoff(obs: Observation[], c: DgdV1Config, cutoff: string, groupsOf: (user: string) => string[]) {
  const train = obs.filter((o) => o.round.played_on < cutoff);
  const test = obs.filter((o) => o.round.played_on >= cutoff);
  if (train.length < 20 || !test.length) return null;
  const fit = fitLayoutDifficulty(train, c, cutoff);
  const overall = train.reduce((s, o) => s + o.score, 0) / train.length;
  const raw = new Map<string, { s: number; n: number }>();
  for (const o of train) {
    const a = raw.get(o.layout_key) ?? { s: 0, n: 0 };
    a.s += o.score;
    a.n++;
    raw.set(o.layout_key, a);
  }
  const lm = (k: string) => {
    const a = raw.get(k);
    return a ? a.s / a.n : overall;
  };
  const byUser = new Map<string, Observation[]>();
  for (const o of train) byUser.set(o.round.user_id, [...(byUser.get(o.round.user_id) ?? []), o]);
  const base = new Map<string, { all: number; r10: number; r20: number; mu: number }>();
  for (const [u, os] of byUser) {
    const s = [...os].sort((a, b) => a.round.played_on.localeCompare(b.round.played_on));
    const res = s.map((o) => o.score - lm(o.layout_key));
    const m = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    base.set(u, { all: m(res), r10: m(res.slice(-10)), r20: m(res.slice(-20)), mu: replayPlayer(os, fit.layouts, c, cutoff).state.skill_mu });
  }
  const overallErr = emptyErrs();
  const groups: Record<string, Errs> = {};
  for (const o of test) {
    const u = o.round.user_id;
    const b = base.get(u);
    const L = fit.layouts.get(o.layout_key);
    const lmean = lm(o.layout_key);
    const pred: Record<CohortModel, number> = {
      A_layout_only: lmean,
      B_player_long_term: lmean + (b?.all ?? 0),
      C_player_recent10: lmean + (b?.r10 ?? 0),
      D_player_recent20: lmean + (b?.r20 ?? 0),
      E_player_plus_layout: (L?.difficulty_mu ?? fit.anchor) - (fit.players.get(u) ?? 0),
      F_dgd_v1: (L?.difficulty_mu ?? fit.anchor) - (b?.mu ?? c.population_prior_mu),
    };
    const gs = [...groupsOf(u), L ? "layout_seen" : "layout_unseen"];
    for (const m of COHORT_MODELS) {
      const e = pred[m] - o.score;
      overallErr[m].push(e);
      for (const g of gs) (groups[g] ??= emptyErrs())[m].push(e);
    }
  }
  const stat = (r: Errs) => Object.fromEntries(COHORT_MODELS.map((m) => [m, errorStats(r[m])])) as Record<CohortModel, ErrorStats>;
  return {
    cutoff,
    train_rounds: train.length,
    test_rounds: test.length,
    test_on_unseen_layouts: test.filter((o) => !fit.layouts.has(o.layout_key)).length,
    overall: stat(overallErr),
    by_group: Object.fromEntries(Object.entries(groups).filter(([, r]) => r.F_dgd_v1.length >= 30).map(([g, r]) => [g, stat(r)])),
  };
}

export function cohortHoldout(obs: Observation[], c: DgdV1Config, groupsOf: (user: string) => string[], fractions = [0.6, 0.7, 0.8, 0.9]) {
  if (obs.length < 40) return null;
  const dates = obs.map((o) => o.round.played_on).sort();
  const cutoffs = [...new Set(fractions.map((f) => dates[Math.floor(dates.length * f)]))];
  return {
    leakage_free: true,
    subgroup_min_test_rounds: 30,
    models: COHORT_MODELS,
    cutoffs: cutoffs.map((cut) => cohortHoldoutAtCutoff(obs, c, cut, groupsOf)).filter(Boolean),
  };
}

export function pdgaCorrelation(events: RatingEvent[]) {
  const pairs: [number, number][] = [];
  for (const e of events) {
    const p = e.source_refs.find((s) => s.source === "pdga" && s.source_round_rating != null);
    if (p) pairs.push([e.round_performance_latent, p.source_round_rating!]);
  }
  return { n: pairs.length, pearson_r: pearson(pairs), spearman_rho: spearman(pairs) };
}

export const ratingBand = (r: number | null) =>
  r == null ? "unrated" : r < 850 ? "<850" : r < 900 ? "850–899" : r < 935 ? "900–934" : r < 970 ? "935–969" : "970+";
