/**
 * DGD Core V1 — pure rating engine (shadow mode).
 *
 * Runs server-side only (called from run.server.ts). No React, no I/O.
 * Every number the model uses comes from DgdV1Config, which is stored with
 * the model version row in rating_model_versions. See docs/dgd-phase3-core-v1.md
 * and docs/dgd-phase3_5-hardening.md.
 *
 * Units: player skill `mu` is "strokes better than a population-average
 * player on the same layout". Layout difficulty `d` is the expected score of
 * a population-average player on that layout. expected_score = d - mu.
 */

export type DgdV1Config = {
  population_prior_mu: number;
  population_prior_sigma: number;
  skill_drift_per_day: number;
  skill_sigma_floor: number;
  base_observation_sigma: number;
  observation_sigma_min: number;
  observation_sigma_max: number;
  unknown_hole_count_sigma_mult: number;
  unknown_layout_sigma_mult: number;
  possible_mapping_sigma_mult: number;
  minimum_supported_holes: number;
  plausible_score_min: number;
  plausible_score_max: number;
  plausible_to_par_min: number;
  plausible_to_par_max: number;
  incomplete_par_threshold: number;
  layout_prior_sigma: number;
  layout_confounding_sigma: number;
  layout_shrink_rounds: number;
  layout_minimum_sample: number;
  layout_developing_sample: number;
  layout_established_sample: number;
  layout_established_min_effective_players: number;
  layout_convergence_threshold: number;
  convergence_max_skill_delta: number;
  convergence_max_layout_delta: number;
  layout_max_iterations: number;
  player_fit_shrink_rounds: number;
  recent_window_days: number;
  form_half_life_days: number;
  form_min_effective_observations: number;
  form_max_lookback_days: number;
  display_scale_center: number;
  display_scale_factor: number;
  display_min: number;
  display_max: number;
  confidence_reference_sigma: number;
  established_max_sigma: number;
};

export const DGD_V1_MODEL_ID = "dgd-core-v1@1.1.0";
/** The 0–100 display scale is a placeholder until a real population exists. */
export const DGD_V1_DISPLAY_SCALE_STATUS = "PLACEHOLDER_UNCALIBRATED" as const;

/** Mirrors the seeded config row; the DB row wins when present. */
export const DGD_V1_DEFAULT_CONFIG: DgdV1Config = {
  population_prior_mu: 0,
  population_prior_sigma: 8,
  skill_drift_per_day: 0.02,
  skill_sigma_floor: 0.75,
  base_observation_sigma: 3.0,
  observation_sigma_min: 2.0,
  observation_sigma_max: 12.0,
  unknown_hole_count_sigma_mult: 1.15,
  unknown_layout_sigma_mult: 1.25,
  possible_mapping_sigma_mult: 1.15,
  minimum_supported_holes: 9,
  plausible_score_min: 18,
  plausible_score_max: 130,
  plausible_to_par_min: -30,
  plausible_to_par_max: 60,
  incomplete_par_threshold: 27,
  layout_prior_sigma: 6,
  layout_confounding_sigma: 4,
  layout_shrink_rounds: 3,
  layout_minimum_sample: 3,
  layout_developing_sample: 10,
  layout_established_sample: 20,
  layout_established_min_effective_players: 3,
  layout_convergence_threshold: 0.01,
  convergence_max_skill_delta: 0.001,
  convergence_max_layout_delta: 0.001,
  layout_max_iterations: 5000,
  player_fit_shrink_rounds: 2,
  recent_window_days: 365,
  form_half_life_days: 30,
  form_min_effective_observations: 2,
  form_max_lookback_days: 365,
  display_scale_center: 50,
  display_scale_factor: 2.5,
  display_min: 0,
  display_max: 100,
  confidence_reference_sigma: 8,
  established_max_sigma: 2.5,
};

export function resolveConfig(raw: unknown): DgdV1Config {
  const out = { ...DGD_V1_DEFAULT_CONFIG };
  if (raw && typeof raw === "object") {
    for (const k of Object.keys(out) as (keyof DgdV1Config)[]) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
  }
  return out;
}

// ---------- Input ----------

export type SourceRef = {
  source: string;
  source_table: string;
  source_row_id: string;
  match_level: string;
  source_round_rating: number | null;
};

export type LayoutMapping = "EXACT" | "HIGH_CONFIDENCE" | "POSSIBLE" | "UNMAPPED";
export type HoleCountOrigin =
  | "IMPORTED"
  | "HOLE_SCORE_COUNT"
  | "LAYOUT_INFERRED"
  | "EVENT_INFERRED"
  | "MANUAL"
  | "UNKNOWN";
export type DuplicateResolution = "LINK" | "KEEP_SEPARATE" | "NEEDS_REVIEW";

/** One canonical physical round. Unknown values stay null — never zero. */
export type CanonicalRoundInput = {
  id: string;
  user_id: string;
  played_on: string; // YYYY-MM-DD
  course_key: string | null;
  course_name: string | null;
  layout_name: string | null;
  score: number | null;
  to_par: number | null; // null = UNKNOWN
  hole_count: number | null; // null = UNKNOWN
  canonical_eligibility: "rated" | "practice" | "ineligible";
  has_possible_duplicate: boolean;
  sources: SourceRef[];
  format?: string;
  hole_count_origin?: HoleCountOrigin;
  par_played?: number | null;
  layout_mapping?: LayoutMapping;
  mapped_layout_id?: string | null;
  data_issue?: string | null;
  duplicate_resolution?: DuplicateResolution | null;
};

export type DgdState = "ELIGIBLE" | "INELIGIBLE" | "PENDING_REVIEW" | "EXCLUDED";
export type ReasonCode =
  | "DOUBLES"
  | "UNSUPPORTED_FORMAT"
  | "SOURCE_EXCLUDED"
  | "PRACTICE"
  | "MALFORMED_SOURCE"
  | "POSSIBLE_DUPLICATE"
  | "IMPOSSIBLE_SCORE"
  | "IMPOSSIBLE_SCORE_TO_PAR"
  | "INCOMPLETE_SCORE"
  | "UNKNOWN_COURSE"
  | "UNKNOWN_LAYOUT"
  | "UNKNOWN_HOLE_COUNT"
  | "POSSIBLE_LAYOUT_MAPPING"
  | "OTHER";

/** Codes that never block a round — they only widen its uncertainty. */
export const INFORMATIONAL_CODES: ReadonlySet<ReasonCode> = new Set([
  "UNKNOWN_LAYOUT",
  "UNKNOWN_HOLE_COUNT",
  "POSSIBLE_LAYOUT_MAPPING",
]);

export type EligibilityResult = {
  canonical_round_id: string;
  eligible: boolean;
  state: DgdState;
  reason_codes: ReasonCode[];
  /** Legacy detail strings kept for the Phase 3 inspector. */
  reasons: string[];
  layout_key: string | null;
  layout_known: boolean;
};

export function normalizeLayoutName(s: string | null): string | null {
  if (!s) return null;
  const t = s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return t.length ? t : null;
}

const SAFE_MAPPING = (m?: LayoutMapping) => m === "EXACT" || m === "HIGH_CONFIDENCE";

export function layoutKeyFor(
  r: Pick<CanonicalRoundInput, "course_key" | "layout_name" | "layout_mapping" | "mapped_layout_id">,
): { key: string | null; known: boolean } {
  // Safe mappings collapse every source alias onto the app's real layout.
  if (r.mapped_layout_id && SAFE_MAPPING(r.layout_mapping)) return { key: `layout:${r.mapped_layout_id}`, known: true };
  if (!r.course_key) return { key: null, known: false };
  const l = normalizeLayoutName(r.layout_name);
  return { key: `${r.course_key}|${l ?? "?"}`, known: l != null };
}

/**
 * One top-level state per round. Precedence: EXCLUDED > INELIGIBLE >
 * PENDING_REVIEW > ELIGIBLE. A round may carry several reason codes.
 */
export function checkEligibility(r: CanonicalRoundInput, c: DgdV1Config): EligibilityResult {
  const reasons: string[] = [];
  const excl: ReasonCode[] = [];
  const inel: ReasonCode[] = [];
  const pend: ReasonCode[] = [];
  const info: ReasonCode[] = [];

  if (r.canonical_eligibility !== "rated") reasons.push(`canonical:${r.canonical_eligibility}`);
  const fmt = r.format ?? "singles";
  if (fmt === "doubles" || fmt === "team") excl.push("DOUBLES");
  else if (fmt !== "singles") excl.push("UNSUPPORTED_FORMAT");
  else if (r.canonical_eligibility === "ineligible") excl.push("SOURCE_EXCLUDED");
  else if (r.canonical_eligibility === "practice") excl.push("PRACTICE");
  if (r.data_issue === "MALFORMED_SOURCE") excl.push("MALFORMED_SOURCE");

  if (r.has_possible_duplicate && r.duplicate_resolution !== "KEEP_SEPARATE") {
    reasons.push("possible_duplicate");
    pend.push("POSSIBLE_DUPLICATE");
  }

  if (r.score == null) {
    reasons.push("score_unknown");
    inel.push("INCOMPLETE_SCORE");
  } else if (r.score >= 600) {
    reasons.push("score_looks_like_rating");
    inel.push("IMPOSSIBLE_SCORE");
  } else if (r.score < c.plausible_score_min || r.score > c.plausible_score_max) {
    reasons.push("score_implausible");
    // A low score with a known small par is a partial round, not a bad number.
    if (r.score < c.plausible_score_min && r.par_played != null && r.par_played < c.incomplete_par_threshold)
      inel.push("INCOMPLETE_SCORE");
    else inel.push("IMPOSSIBLE_SCORE");
  }
  if (r.to_par != null) {
    if (Math.abs(r.to_par) >= 600) {
      reasons.push("to_par_looks_like_rating");
      inel.push("IMPOSSIBLE_SCORE_TO_PAR");
    } else if (r.to_par < c.plausible_to_par_min || r.to_par > c.plausible_to_par_max) {
      reasons.push("to_par_implausible");
      inel.push("IMPOSSIBLE_SCORE_TO_PAR");
    }
  }
  if (r.hole_count != null && r.hole_count < c.minimum_supported_holes) {
    reasons.push("too_few_holes");
    inel.push("INCOMPLETE_SCORE");
  }
  const lk = layoutKeyFor(r);
  if (!lk.key) {
    reasons.push("course_unmapped");
    inel.push("UNKNOWN_COURSE");
  }
  if (!lk.known) info.push("UNKNOWN_LAYOUT");
  if (r.hole_count == null) info.push("UNKNOWN_HOLE_COUNT");
  if (r.layout_mapping === "POSSIBLE") info.push("POSSIBLE_LAYOUT_MAPPING");

  const state: DgdState = excl.length
    ? "EXCLUDED"
    : inel.length
      ? "INELIGIBLE"
      : pend.length
        ? "PENDING_REVIEW"
        : "ELIGIBLE";
  const codes = [...new Set([...excl, ...inel, ...pend, ...info])];
  return {
    canonical_round_id: r.id,
    eligible: state === "ELIGIBLE",
    state,
    reason_codes: codes,
    reasons,
    layout_key: lk.key,
    layout_known: lk.known,
  };
}

// ---------- Layout difficulty (anchored alternating fit) ----------

export type Observation = {
  round: CanonicalRoundInput;
  layout_key: string;
  layout_known: boolean;
  score: number;
};

export type LayoutStatus = "unrated" | "provisional" | "developing" | "established";

export type LayoutDifficulty = {
  layout_key: string;
  course_key: string | null;
  course_name: string | null;
  layout_name: string | null;
  difficulty_mu: number;
  difficulty_sigma: number;
  sample_size: number;
  player_count: number;
  effective_player_count: number;
  skill_range: number | null;
  recent_round_count: number;
  layout_mapping: LayoutMapping | null;
  status: LayoutStatus;
};

export type ConvergenceStep = {
  iteration: number;
  max_player_skill_change: number;
  mean_player_skill_change: number;
  max_layout_difficulty_change: number;
  mean_layout_difficulty_change: number;
};

export type LayoutFit = {
  layouts: Map<string, LayoutDifficulty>;
  players: Map<string, number>;
  iterations: number;
  converged: boolean;
  convergence_status: "CONVERGED" | "NOT_CONVERGED";
  stop_reason: "thresholds_met" | "max_iterations" | "no_data";
  final_delta: ConvergenceStep | null;
  history: ConvergenceStep[];
  anchor: number;
};

/** Kish effective sample size of per-player round counts. */
export function effectivePlayers(counts: number[]): number {
  const s = counts.reduce((a, b) => a + b, 0);
  const s2 = counts.reduce((a, b) => a + b * b, 0);
  return s2 ? (s * s) / s2 : 0;
}

export function layoutStatus(
  n: number,
  effPlayers: number,
  mapping: LayoutMapping | null,
  c: DgdV1Config,
): LayoutStatus {
  if (n < c.layout_minimum_sample) return "unrated";
  if (n < c.layout_developing_sample) return "provisional";
  if (
    n >= c.layout_established_sample &&
    effPlayers >= c.layout_established_min_effective_players &&
    SAFE_MAPPING(mapping ?? undefined)
  )
    return "established";
  return "developing";
}

/**
 * Layout difficulty uncertainty. Besides sampling noise, difficulty on a
 * layout seen by few independent players is confounded with those players'
 * skill, so we add layout_confounding_sigma² / effective_players.
 */
export function layoutSigma(n: number, effPlayers: number, c: DgdV1Config): number {
  const sampling = 1 / (1 / c.layout_prior_sigma ** 2 + n / c.base_observation_sigma ** 2);
  const confound = effPlayers > 0 ? c.layout_confounding_sigma ** 2 / effPlayers : c.layout_prior_sigma ** 2;
  return Math.min(c.layout_prior_sigma, Math.sqrt(sampling + confound));
}

/**
 * Alternating shrinkage fit of player offsets and layout difficulty:
 *   d_L  = (Σ(score + p) + k_L·anchor) / (n_L + k_L)
 *   p_u  = Σ(d_L − score) / (n_u + k_p)
 * then re-centred so the round-weighted mean player offset is 0 (anchor).
 * Stops only when BOTH the max player-skill change and the max layout
 * change fall below the versioned thresholds; hitting the iteration cap
 * marks the fit NOT_CONVERGED.
 */
export function fitLayoutDifficulty(obs: Observation[], c: DgdV1Config, asOf?: string): LayoutFit {
  const layouts = new Map<string, LayoutDifficulty>();
  const players = new Map<string, number>();
  if (obs.length === 0)
    return {
      layouts,
      players,
      iterations: 0,
      converged: true,
      convergence_status: "CONVERGED",
      stop_reason: "no_data",
      final_delta: null,
      history: [],
      anchor: 0,
    };
  const anchor = obs.reduce((s, o) => s + o.score, 0) / obs.length;
  const d = new Map<string, number>();
  const p = players;
  for (const o of obs) {
    d.set(o.layout_key, anchor);
    p.set(o.round.user_id, 0);
  }
  let iterations = 0;
  let converged = false;
  const history: ConvergenceStep[] = [];
  let last: ConvergenceStep | null = null;
  while (iterations < c.layout_max_iterations) {
    iterations++;
    const dPrev = new Map(d);
    const pPrev = new Map(p);
    const dSum = new Map<string, { s: number; n: number }>();
    for (const o of obs) {
      const a = dSum.get(o.layout_key) ?? { s: 0, n: 0 };
      a.s += o.score + (p.get(o.round.user_id) ?? 0);
      a.n += 1;
      dSum.set(o.layout_key, a);
    }
    for (const [k, a] of dSum) d.set(k, (a.s + c.layout_shrink_rounds * anchor) / (a.n + c.layout_shrink_rounds));
    const pSum = new Map<string, { s: number; n: number }>();
    for (const o of obs) {
      const a = pSum.get(o.round.user_id) ?? { s: 0, n: 0 };
      a.s += (d.get(o.layout_key) ?? anchor) - o.score;
      a.n += 1;
      pSum.set(o.round.user_id, a);
    }
    for (const [u, a] of pSum) p.set(u, a.s / (a.n + c.player_fit_shrink_rounds));
    let m = 0;
    for (const o of obs) m += p.get(o.round.user_id) ?? 0;
    m /= obs.length;
    if (Math.abs(m) > 1e-12) {
      for (const [u, v] of p) p.set(u, v - m);
      for (const [k, v] of d) d.set(k, v - m);
    }
    // Deltas measured after re-centring, against the previous iteration.
    let pMax = 0;
    let pSumD = 0;
    for (const [u, v] of p) {
      const x = Math.abs(v - (pPrev.get(u) ?? v));
      pMax = Math.max(pMax, x);
      pSumD += x;
    }
    let dMax = 0;
    let dSumD = 0;
    for (const [k, v] of d) {
      const x = Math.abs(v - (dPrev.get(k) ?? v));
      dMax = Math.max(dMax, x);
      dSumD += x;
    }
    last = {
      iteration: iterations,
      max_player_skill_change: pMax,
      mean_player_skill_change: p.size ? pSumD / p.size : 0,
      max_layout_difficulty_change: dMax,
      mean_layout_difficulty_change: d.size ? dSumD / d.size : 0,
    };
    if (iterations <= 10 || iterations % 50 === 0) history.push(last);
    if (pMax < c.convergence_max_skill_delta && dMax < c.convergence_max_layout_delta) {
      converged = true;
      break;
    }
  }
  if (last && history[history.length - 1]?.iteration !== last.iteration) history.push(last);

  const asOfDay = asOf ? dayNum(asOf) : null;
  const meta = new Map<string, { n: number; perPlayer: Map<string, number>; recent: number; o: Observation }>();
  for (const o of obs) {
    const a = meta.get(o.layout_key) ?? { n: 0, perPlayer: new Map<string, number>(), recent: 0, o };
    a.n++;
    a.perPlayer.set(o.round.user_id, (a.perPlayer.get(o.round.user_id) ?? 0) + 1);
    if (asOfDay != null && asOfDay - dayNum(o.round.played_on) <= c.recent_window_days) a.recent++;
    meta.set(o.layout_key, a);
  }
  for (const [k, a] of meta) {
    const eff = effectivePlayers([...a.perPlayer.values()]);
    const skills = [...a.perPlayer.keys()].map((u) => p.get(u) ?? 0);
    const mapping = a.o.round.layout_mapping ?? null;
    layouts.set(k, {
      layout_key: k,
      course_key: a.o.round.course_key,
      course_name: a.o.round.course_name,
      layout_name: a.o.layout_known ? a.o.round.layout_name : null,
      difficulty_mu: d.get(k) ?? anchor,
      difficulty_sigma: layoutSigma(a.n, eff, c),
      sample_size: a.n,
      player_count: a.perPlayer.size,
      effective_player_count: eff,
      skill_range: skills.length > 1 ? Math.max(...skills) - Math.min(...skills) : null,
      recent_round_count: a.recent,
      layout_mapping: mapping,
      status: layoutStatus(a.n, eff, mapping, c),
    });
  }
  return {
    layouts,
    players: p,
    iterations,
    converged,
    convergence_status: converged ? "CONVERGED" : "NOT_CONVERGED",
    stop_reason: converged ? "thresholds_met" : "max_iterations",
    final_delta: last,
    history,
    anchor,
  };
}

// ---------- Player replay ----------

export const toDisplay = (mu: number, c: DgdV1Config) =>
  Math.min(c.display_max, Math.max(c.display_min, c.display_scale_center + c.display_scale_factor * mu));

export const confidenceFrom = (sigma: number, c: DgdV1Config) =>
  100 * Math.min(1, Math.max(0, 1 - sigma / c.confidence_reference_sigma));

const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

export type RatingEvent = {
  canonical_round_id: string;
  seq: number;
  played_on: string;
  source_refs: SourceRef[];
  layout_key: string;
  layout_difficulty_mu: number;
  layout_difficulty_sigma: number;
  expected_score: number;
  actual_score: number;
  strokes_vs_expectation: number;
  round_performance_latent: number;
  round_performance_display: number;
  observation_sigma: number;
  days_since_last: number | null;
  mu_before: number;
  sigma_before: number;
  sigma_before_drifted: number;
  mu_after: number;
  sigma_after: number;
  display_before: number;
  display_after: number;
  confidence_before: number;
  confidence_after: number;
};

export type PlayerState = {
  skill_mu: number;
  skill_sigma: number;
  display_rating: number;
  form: number | null;
  confidence: number;
  effective_observations: number;
  eligible_rounds: number;
  last_played_on: string | null;
  status: "no_data" | "provisional" | "established";
};

export function observationSigma(
  layout: LayoutDifficulty,
  o: Observation,
  c: DgdV1Config,
): number {
  let s = Math.sqrt(c.base_observation_sigma ** 2 + layout.difficulty_sigma ** 2);
  if (!o.layout_known) s *= c.unknown_layout_sigma_mult;
  if (o.round.hole_count == null) s *= c.unknown_hole_count_sigma_mult;
  if (o.round.layout_mapping === "POSSIBLE") s *= c.possible_mapping_sigma_mult;
  return Math.min(c.observation_sigma_max, Math.max(c.observation_sigma_min, s));
}

/** Chronological replay of one player's eligible observations. */
export function replayPlayer(
  obs: Observation[],
  layouts: Map<string, LayoutDifficulty>,
  c: DgdV1Config,
  asOf: string,
): { events: RatingEvent[]; state: PlayerState } {
  const sorted = [...obs].sort(
    (a, b) => a.round.played_on.localeCompare(b.round.played_on) || a.round.id.localeCompare(b.round.id),
  );
  let mu = c.population_prior_mu;
  let sigma = c.population_prior_sigma;
  let last: number | null = null;
  let effObs = 0;
  const events: RatingEvent[] = [];
  for (const o of sorted) {
    const L = layouts.get(o.layout_key);
    if (!L) continue;
    const day = dayNum(o.round.played_on);
    const gap = last == null ? null : Math.max(0, day - last);
    // Skill drift: inactivity widens uncertainty, never moves mu.
    const sigmaDrift = Math.sqrt(sigma ** 2 + c.skill_drift_per_day * (gap ?? 0));
    const obsSigma = observationSigma(L, o, c);
    const roundMu = L.difficulty_mu - o.score;
    const expected = L.difficulty_mu - mu;
    const pp = 1 / sigmaDrift ** 2;
    const rp = 1 / obsSigma ** 2;
    const muAfter = (mu * pp + roundMu * rp) / (pp + rp);
    const sigmaAfter = Math.max(c.skill_sigma_floor, Math.sqrt(1 / (pp + rp)));
    effObs += c.base_observation_sigma ** 2 / obsSigma ** 2;
    events.push({
      canonical_round_id: o.round.id,
      seq: events.length + 1,
      played_on: o.round.played_on,
      source_refs: o.round.sources,
      layout_key: o.layout_key,
      layout_difficulty_mu: L.difficulty_mu,
      layout_difficulty_sigma: L.difficulty_sigma,
      expected_score: expected,
      actual_score: o.score,
      strokes_vs_expectation: expected - o.score,
      round_performance_latent: roundMu,
      round_performance_display: toDisplay(roundMu, c),
      observation_sigma: obsSigma,
      days_since_last: gap,
      mu_before: mu,
      sigma_before: sigma,
      sigma_before_drifted: sigmaDrift,
      mu_after: muAfter,
      sigma_after: sigmaAfter,
      display_before: toDisplay(mu, c),
      display_after: toDisplay(muAfter, c),
      confidence_before: confidenceFrom(sigma, c),
      confidence_after: confidenceFrom(sigmaAfter, c),
    });
    mu = muAfter;
    sigma = sigmaAfter;
    last = day;
  }
  // Present-day uncertainty includes drift since the last round.
  const nowGap = last == null ? 0 : Math.max(0, dayNum(asOf) - last);
  const sigmaNow = events.length
    ? Math.sqrt(sigma ** 2 + c.skill_drift_per_day * nowGap)
    : c.population_prior_sigma;
  return {
    events,
    state: {
      skill_mu: mu,
      skill_sigma: sigmaNow,
      display_rating: toDisplay(mu, c),
      form: computeForm(events, c, asOf),
      confidence: confidenceFrom(sigmaNow, c),
      effective_observations: effObs,
      eligible_rounds: events.length,
      last_played_on: events.length ? events[events.length - 1].played_on : null,
      status: events.length === 0 ? "no_data" : sigmaNow <= c.established_max_sigma ? "established" : "provisional",
    },
  };
}

/** Exponentially weighted recent round performance (display scale). */
export function computeForm(events: RatingEvent[], c: DgdV1Config, asOf: string): number | null {
  const now = dayNum(asOf);
  let sw = 0;
  let sw2 = 0;
  let sx = 0;
  for (const e of events) {
    const age = now - dayNum(e.played_on);
    if (age < 0 || age > c.form_max_lookback_days) continue;
    const w = 0.5 ** (age / c.form_half_life_days);
    sw += w;
    sw2 += w * w;
    sx += w * e.round_performance_display;
  }
  if (sw === 0) return null;
  const nEff = (sw * sw) / sw2;
  if (nEff < c.form_min_effective_observations) return null;
  return sx / sw;
}

/** Order-stable FNV-1a hash of the inputs that drive one player's replay. */
export function inputHash(modelId: string, obs: Observation[], layouts: Map<string, LayoutDifficulty>): string {
  const parts = [...obs]
    .sort((a, b) => a.round.id.localeCompare(b.round.id))
    .map((o) => {
      const L = layouts.get(o.layout_key);
      return `${o.round.id}:${o.round.played_on}:${o.score}:${o.layout_key}:${L?.difficulty_mu.toFixed(4)}:${L?.difficulty_sigma.toFixed(4)}:${o.round.hole_count ?? "u"}`;
    });
  let h = 0x811c9dc5;
  const s = `${modelId}|${parts.join(",")}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0") + ":" + parts.length;
}

// ---------- Validation helpers ----------

export function summarize(xs: number[]) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  return {
    n: s.length,
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    min: s[0],
    p10: q(0.1),
    median: q(0.5),
    p90: q(0.9),
    max: s[s.length - 1],
  };
}

export function pearson(pairs: [number, number][]): number | null {
  if (pairs.length < 5) return null;
  const n = pairs.length;
  const mx = pairs.reduce((a, p) => a + p[0], 0) / n;
  const my = pairs.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}


export function spearman(pairs: [number, number][]): number | null {
  if (pairs.length < 5) return null;
  const rank = (xs: number[]) => {
    const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(xs.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(pairs.map((p) => p[0]));
  const ry = rank(pairs.map((p) => p[1]));
  return pearson(rx.map((x, i) => [x, ry[i]] as [number, number]));
}

export function toObservations(rounds: CanonicalRoundInput[], c: DgdV1Config) {
  const elig: EligibilityResult[] = [];
  const obs: Observation[] = [];
  for (const r of rounds) {
    const e = checkEligibility(r, c);
    elig.push(e);
    if (e.eligible && e.layout_key && r.score != null)
      obs.push({ round: r, layout_key: e.layout_key, layout_known: e.layout_known, score: r.score });
  }
  return { elig, obs };
}

// ---------- Validation ----------

export type ErrorStats = { n: number; mae: number | null; median_ae: number | null; rmse: number | null };

export function errorStats(errs: number[]): ErrorStats {
  if (!errs.length) return { n: 0, mae: null, median_ae: null, rmse: null };
  const a = errs.map(Math.abs).sort((x, y) => x - y);
  const mid = a.length >> 1;
  return {
    n: a.length,
    mae: a.reduce((s, x) => s + x, 0) / a.length,
    median_ae: a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2,
    rmse: Math.sqrt(errs.reduce((s, x) => s + x * x, 0) / errs.length),
  };
}

const MODELS = ["A_layout_only", "B_player_history", "C_player_recent_form", "D_player_plus_layout", "E_dgd_v1"] as const;
type ModelName = (typeof MODELS)[number];

/**
 * Leakage-free chronological holdout at one cutoff. Everything — layout
 * difficulty, player offsets, DGD replay, baselines — is fitted ONLY on
 * rounds played strictly before the cutoff, then frozen. Test rounds never
 * update anything. Unseen layouts are predicted from training-only fallbacks.
 */
export function holdoutAtCutoff(obs: Observation[], c: DgdV1Config, cutoff: string, knownPlayerMinRounds = 5) {
  const train = obs.filter((o) => o.round.played_on < cutoff);
  const test = obs.filter((o) => o.round.played_on >= cutoff);
  if (!train.length || !test.length) return null;
  const fit = fitLayoutDifficulty(train, c, cutoff);
  const overall = train.reduce((s, o) => s + o.score, 0) / train.length;
  const layoutRaw = new Map<string, { s: number; n: number }>();
  const byUser = new Map<string, Observation[]>();
  for (const o of train) {
    const a = layoutRaw.get(o.layout_key) ?? { s: 0, n: 0 };
    a.s += o.score;
    a.n++;
    layoutRaw.set(o.layout_key, a);
    byUser.set(o.round.user_id, [...(byUser.get(o.round.user_id) ?? []), o]);
  }
  const userMean = new Map<string, number>();
  const userRecent = new Map<string, number>();
  const userResid = new Map<string, number>(); // mean (score − layout raw mean)
  const mus = new Map<string, number>();
  for (const [u, os] of byUser) {
    const sorted = [...os].sort((a, b) => a.round.played_on.localeCompare(b.round.played_on));
    userMean.set(u, sorted.reduce((s, o) => s + o.score, 0) / sorted.length);
    const last10 = sorted.slice(-10);
    userRecent.set(u, last10.reduce((s, o) => s + o.score, 0) / last10.length);
    userResid.set(
      u,
      sorted.reduce((s, o) => {
        const l = layoutRaw.get(o.layout_key)!;
        return s + (o.score - l.s / l.n);
      }, 0) / sorted.length,
    );
    mus.set(u, replayPlayer(os, fit.layouts, c, cutoff).state.skill_mu);
  }
  const errs: Record<ModelName, number[]> = {
    A_layout_only: [],
    B_player_history: [],
    C_player_recent_form: [],
    D_player_plus_layout: [],
    E_dgd_v1: [],
  };
  const groups: Record<string, Record<ModelName, number[]>> = {};
  const push = (g: string, m: ModelName, e: number) => {
    groups[g] ??= { A_layout_only: [], B_player_history: [], C_player_recent_form: [], D_player_plus_layout: [], E_dgd_v1: [] };
    groups[g][m].push(e);
  };
  for (const o of test) {
    const u = o.round.user_id;
    const L = fit.layouts.get(o.layout_key);
    const raw = layoutRaw.get(o.layout_key);
    const layoutMean = raw ? raw.s / raw.n : overall;
    const preds: Record<ModelName, number> = {
      A_layout_only: layoutMean,
      B_player_history: userMean.get(u) ?? overall,
      C_player_recent_form: userRecent.get(u) ?? overall,
      D_player_plus_layout: (L?.difficulty_mu ?? fit.anchor) - (fit.players.get(u) ?? 0),
      E_dgd_v1: (L?.difficulty_mu ?? fit.anchor) - (mus.get(u) ?? c.population_prior_mu),
    };
    const lg = L ? `layout_${L.status}` : "layout_unseen";
    const pg = (byUser.get(u)?.length ?? 0) >= knownPlayerMinRounds ? "known_player" : "new_player";
    for (const m of MODELS) {
      const e = preds[m] - o.score;
      errs[m].push(e);
      push(lg, m, e);
      push(pg, m, e);
    }
  }
  const stat = (r: Record<ModelName, number[]>) =>
    Object.fromEntries(MODELS.map((m) => [m, errorStats(r[m])])) as Record<ModelName, ErrorStats>;
  return {
    cutoff,
    train_rounds: train.length,
    test_rounds: test.length,
    train_convergence: fit.convergence_status,
    test_rounds_on_unseen_layouts: test.filter((o) => !fit.layouts.has(o.layout_key)).length,
    overall: stat(errs),
    by_group: Object.fromEntries(Object.entries(groups).map(([g, r]) => [g, stat(r)])),
  };
}

/** Several chronological cutoffs (fractions of the eligible-round timeline). */
export function chronologicalHoldout(obs: Observation[], c: DgdV1Config, fractions = [0.6, 0.7, 0.8, 0.9]) {
  if (obs.length < 20) return null;
  const dates = obs.map((o) => o.round.played_on).sort();
  const cutoffs = [...new Set(fractions.map((f) => dates[Math.floor(dates.length * f)]))];
  return {
    leakage_free: true,
    note: "Training uses only rounds before each cutoff for players AND layouts; test rounds never update state.",
    cutoffs: cutoffs.map((cut) => holdoutAtCutoff(obs, c, cut)).filter(Boolean),
  };
}

/**
 * Cold-start audit: how much a single round moves the player's skill,
 * grouped by the layout's status. Uses the Kalman gain of each update.
 */
export function coldStartInfluence(events: RatingEvent[], layouts: Map<string, LayoutDifficulty>) {
  const g: Record<string, { n: number; gain: number; absMove: number; obsSigma: number }> = {};
  for (const e of events) {
    const L = layouts.get(e.layout_key);
    const k = L ? L.status : "unseen";
    const gain = 1 - e.sigma_after ** 2 / e.sigma_before_drifted ** 2;
    const a = (g[k] ??= { n: 0, gain: 0, absMove: 0, obsSigma: 0 });
    a.n++;
    a.gain += gain;
    a.absMove += Math.abs(e.mu_after - e.mu_before);
    a.obsSigma += e.observation_sigma;
  }
  return Object.fromEntries(
    Object.entries(g).map(([k, a]) => [
      k,
      {
        rounds: a.n,
        mean_update_weight: a.gain / a.n,
        mean_abs_skill_move: a.absMove / a.n,
        mean_observation_sigma: a.obsSigma / a.n,
      },
    ]),
  );
}

/** Influence of one fresh round on an established player, per layout state. */
export function singleRoundWeight(layoutSigmaValue: number, playerSigma: number, c: DgdV1Config) {
  const obsSigma = Math.min(
    c.observation_sigma_max,
    Math.max(c.observation_sigma_min, Math.sqrt(c.base_observation_sigma ** 2 + layoutSigmaValue ** 2)),
  );
  const pp = 1 / playerSigma ** 2;
  const rp = 1 / obsSigma ** 2;
  return rp / (pp + rp);
}
