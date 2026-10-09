/**
 * Phase 3.8 — DGD Core V1.1 Candidate (shadow, research only).
 *
 * A prequential, leakage-free backtester. Every round is predicted from state
 * built only from earlier rounds (plus, for the field estimate, OTHER players'
 * scores in the same event round — never the player's own). The control
 * ("A") reproduces V1's update rule; candidates switch on one mechanism each.
 * Nothing here writes ratings or touches V1 history.
 */
import { pearson } from "./engine";

export const CANDIDATE_MODEL_ID = "dgd-core-v1.1-candidate@0.1.0";
export const CONTROL_MODEL_ID = "dgd-core-v1@1.1.0";
export const DISPLAY_TRANSFORM_STATUS = "UNCALIBRATED_DISPLAY_TRANSFORM" as const;

export type CandidateFlags = {
  robust: boolean;
  coldStart: boolean;
  trend: boolean;
  volatility: boolean;
  /**
   * Phase 3.9 information boundary. When true the pre-round forecast never
   * sees any score from the round being predicted; same-round field scoring
   * is only used afterwards, as a separate event-round adjustment.
   */
  strictPreRound?: boolean;
  /** Post-round: update skill from the context-adjusted performance instead of the baseline one. */
  contextUpdate?: boolean;
};
export const NO_FLAGS: CandidateFlags = { robust: false, coldStart: false, trend: false, volatility: false };

export type CandidateConfig = {
  // V1 control values (mirrors dgd-core-v1@1.1.0)
  prior_mu: number;
  prior_sigma: number;
  drift_per_day: number;
  sigma_floor: number;
  base_obs_sigma: number;
  obs_sigma_min: number;
  obs_sigma_max: number;
  unknown_layout_mult: number;
  layout_prior_sigma: number;
  // B robust update
  gain_max: number;
  huber_k: number;
  // C cold start
  coldstart_max_rounds: number;
  field_min_others: number;
  field_small_sigma_mult: number;
  family_sigma: number;
  structural_min_layouts: number;
  population_sigma: number;
  // D trend
  trend_alpha: number;
  trend_min_run: number;
  trend_trigger: number;
  trend_process_var: number;
  // E volatility
  vol_prior_weight: number;
  vol_min_sigma: number;
  // Phase 3.9 event-round adjustment: typical round-to-round spread of how a
  // layout plays around its baseline (wind, pins, conditions), in strokes.
  event_adj_tau: number;
};

export const CANDIDATE_CONFIG: CandidateConfig = {
  prior_mu: 0,
  prior_sigma: 8,
  drift_per_day: 0.02,
  sigma_floor: 0.75,
  base_obs_sigma: 3,
  obs_sigma_min: 2,
  obs_sigma_max: 12,
  unknown_layout_mult: 1.25,
  layout_prior_sigma: 6,
  gain_max: 0.35,
  huber_k: 2,
  coldstart_max_rounds: 3,
  field_min_others: 2,
  field_small_sigma_mult: 1.5,
  family_sigma: 3,
  structural_min_layouts: 30,
  population_sigma: 8,
  trend_alpha: 0.3,
  trend_min_run: 3,
  trend_trigger: 0.8,
  trend_process_var: 1.5,
  vol_prior_weight: 8,
  vol_min_sigma: 2,
  event_adj_tau: 2.5,
};

export type CandRound = {
  id: string;
  player: string;
  played_on: string;
  event: string;
  round_number: number | null;
  division: string | null;
  score: number;
  round_rating: number | null;
  node: string | null; // single PDGA layout node
  pools: number; // number of pools listed
  layout_name: string | null;
  par: number | null;
  holes: number | null;
  distance_ft: number | null;
};

export type Mapping = "EXACT" | "HIGH_CONFIDENCE" | "POSSIBLE" | "UNMAPPED";

const dayNum = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000);
const eventRoundKey = (r: CandRound) => `${r.event}|${r.division ?? "?"}|${r.round_number ?? "?"}`;

/**
 * Contextual layout mapping for rounds with no PDGA layout listed. Only
 * HIGH_CONFIDENCE mappings (same event, division and round, every other
 * cohort row agreeing on one node) are used; anything weaker stays separate.
 */
export function contextualMapping(rounds: CandRound[]) {
  const byEr = new Map<string, Set<string>>();
  const byEvRound = new Map<string, Set<string>>();
  for (const r of rounds) {
    if (!r.node) continue;
    const a = byEr.get(eventRoundKey(r)) ?? new Set();
    a.add(r.node);
    byEr.set(eventRoundKey(r), a);
    const k = `${r.event}|${r.round_number ?? "?"}`;
    const b = byEvRound.get(k) ?? new Set();
    b.add(r.node);
    byEvRound.set(k, b);
  }
  const out = new Map<string, { mapping: Mapping; node: string | null }>();
  for (const r of rounds) {
    if (r.node) out.set(r.id, { mapping: "EXACT", node: r.node });
    else if (r.pools > 1) out.set(r.id, { mapping: "POSSIBLE", node: null });
    else {
      const s = byEr.get(eventRoundKey(r));
      const s2 = byEvRound.get(`${r.event}|${r.round_number ?? "?"}`);
      if (s && s.size === 1) out.set(r.id, { mapping: "HIGH_CONFIDENCE", node: [...s][0] });
      else if (s2 && s2.size >= 1) out.set(r.id, { mapping: "POSSIBLE", node: null });
      else out.set(r.id, { mapping: "UNMAPPED", node: null });
    }
  }
  return out;
}

export const familyOf = (layoutName: string | null) => {
  if (!layoutName) return null;
  const f = layoutName.split(" - ")[0].trim().toLowerCase();
  return f.length >= 3 ? f : null;
};

// ---------- layout state ----------

type LayoutAcc = {
  key: string;
  n: number;
  sw: number; // Σ precision
  swd: number; // Σ precision·implied difficulty
  rawSum: number;
  par: number | null;
  holes: number | null;
  ft: number | null;
  family: string | null;
};

function layoutPosterior(L: LayoutAcc | undefined, priorMu: number, priorSigma: number) {
  const pp = 1 / priorSigma ** 2;
  if (!L || L.n === 0) return { mu: priorMu, sigma: priorSigma };
  const p = pp + L.sw;
  return { mu: (priorMu * pp + L.swd) / p, sigma: Math.sqrt(1 / p) };
}

/** Weighted least squares d ~ a + b·par + c·(ft/hole) over well-sampled layouts. */
export function fitStructural(rows: { d: number; par: number; ftPerHole: number | null; w: number }[]) {
  const usable = rows.filter((r) => r.ftPerHole != null);
  if (usable.length < 10) return null;
  // normal equations, 3x3
  const X = usable.map((r) => [1, r.par, (r.ftPerHole as number) / 100]);
  const A = [0, 1, 2].map(() => [0, 0, 0]);
  const bv = [0, 0, 0];
  usable.forEach((r, i) => {
    for (let a = 0; a < 3; a++) {
      bv[a] += r.w * X[i][a] * r.d;
      for (let b = 0; b < 3; b++) A[a][b] += r.w * X[i][a] * X[i][b];
    }
  });
  const coef = solve3(A, bv);
  if (!coef) return null;
  let ss = 0;
  let sw = 0;
  usable.forEach((r, i) => {
    const e = r.d - (coef[0] + coef[1] * X[i][1] + coef[2] * X[i][2]);
    ss += r.w * e * e;
    sw += r.w;
  });
  return { coef, resid_sd: Math.sqrt(ss / Math.max(1e-9, sw)), n: usable.length };
}

function solve3(A: number[][], b: number[]): number[] | null {
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-9) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  return [0, 1, 2].map((i) => M[i][3] / M[i][i]);
}

/** Precision-weighted combination of independent estimates. */
export function combine(parts: { mu: number; sigma: number }[]) {
  let p = 0;
  let pm = 0;
  for (const x of parts) {
    p += 1 / x.sigma ** 2;
    pm += x.mu / x.sigma ** 2;
  }
  return { mu: pm / p, sigma: Math.sqrt(1 / p) };
}

/**
 * Leave-one-out field estimate of an event-round's difficulty from other
 * players' pre-round skill and actual scores. Poorly known players carry
 * less weight; tiny fields get extra uncertainty.
 */
export function fieldEstimate(
  others: { score: number; mu: number; sigma: number; obsSigma: number }[],
  c: CandidateConfig,
) {
  if (others.length < c.field_min_others) return null;
  let sw = 0;
  let swd = 0;
  let sw2 = 0;
  for (const o of others) {
    const v = o.obsSigma ** 2 + o.sigma ** 2;
    const w = 1 / v;
    sw += w;
    swd += w * (o.score + o.mu);
    sw2 += w * w;
  }
  const eff = (sw * sw) / sw2;
  let sigma = Math.sqrt(1 / sw);
  if (others.length < 5) sigma *= c.field_small_sigma_mult;
  return { mu: swd / sw, sigma, participant_count: others.length, effective_participant_count: eff };
}

// ---------- player state ----------

type PState = {
  mu: number;
  P: number; // variance
  last: number | null;
  n: number;
  z_ewma: number;
  run: number; // signed consecutive same-sign count
  vol_ss: number;
  vol_n: number;
  resid: number[]; // raw residuals for simple baselines
};
const newP = (c: CandidateConfig): PState => ({ mu: c.prior_mu, P: c.prior_sigma ** 2, last: null, n: 0, z_ewma: 0, run: 0, vol_ss: 0, vol_n: 0, resid: [] });

export type Prediction = {
  id: string;
  player: string;
  played_on: string;
  expected: number;
  actual: number;
  err: number; // expected − actual
  pred_sd: number;
  layout_rounds_before: number;
  layout_level: string;
  mapping: Mapping;
  gap: number | null;
  prior_events: number;
  prior_sigma: number;
  obs_sigma: number;
  gain: number;
  mu_before: number;
  mu_after: number;
  /** Performance used for the skill update (baseline or contextual). */
  perf: number;
  round_rating: number | null;
  // Phase 3.9: pre-round vs post-round context. `expected` is always the
  // true pre-round expectation; contextual values are null without a field.
  baseline_layout_difficulty: number;
  layout_key?: string;
  perf_baseline: number;
  ctx_expected: number | null;
  perf_ctx: number | null;
  event_round_adjustment: number | null;
  adjustment_uncertainty: number | null;
};

export type EventRoundDifficulty = {
  event_round_key: string;
  played_on: string;
  layout_key: string;
  /** Field-only estimate (other players' scores + pre-round skills, leave-one-out). */
  event_round_layout_difficulty_mu: number;
  event_round_layout_difficulty_sigma: number;
  participant_count: number;
  effective_participant_count: number;
  baseline_layout_difficulty?: number;
  event_round_adjustment?: number;
  contextual_layout_difficulty?: number;
  adjustment_uncertainty?: number;
};

/**
 * Post-round contextual difficulty: the pre-round baseline, allowed to move
 * by the typical event-to-event spread (tau), combined with the leave-one-out
 * field estimate. Never written back into the persistent layout difficulty.
 */
export function eventRoundAdjustment(
  baseline: { mu: number; sigma: number },
  field: { mu: number; sigma: number },
  tau: number,
) {
  const ctx = combine([{ mu: baseline.mu, sigma: Math.sqrt(baseline.sigma ** 2 + tau ** 2) }, field]);
  return { contextual: ctx.mu, adjustment: ctx.mu - baseline.mu, uncertainty: ctx.sigma };
}

export type BacktestResult = {
  flags: CandidateFlags;
  predictions: Prediction[];
  final: Map<string, { mu: number; sigma: number }>;
  fieldEstimates: EventRoundDifficulty[];
  levels: Record<string, number>;
  /** Read-only end state of each layout (persistent baseline difficulty). */
  layoutFinal: Map<string, { mu: number; sigma: number; n: number; name: string | null; par: number | null }>;
};

/** Volatility shrunk toward the base observation sigma. */
export function playerVolSigma(s: { vol_ss: number; vol_n: number }, c: CandidateConfig) {
  const v = (c.vol_prior_weight * c.base_obs_sigma ** 2 + s.vol_ss) / (c.vol_prior_weight + s.vol_n);
  return Math.max(c.vol_min_sigma, Math.sqrt(v));
}

/**
 * One Bayesian skill update. Returns the posterior and the effective gain.
 * Robust mode: Huber down-weighting of surprising rounds plus a cap on the
 * gain any single round can have, while the prior's widened variance stays.
 */
export function updateSkill(
  mu: number,
  P: number,
  perf: number,
  R: number,
  c: CandidateConfig,
  robust: boolean,
) {
  let Reff = R;
  if (robust) {
    const z = (perf - mu) / Math.sqrt(P + R);
    if (Math.abs(z) > c.huber_k) Reff = R * (Math.abs(z) / c.huber_k);
    const k = P / (P + Reff);
    if (k > c.gain_max) Reff = (P * (1 - c.gain_max)) / c.gain_max;
  }
  const K = P / (P + Reff);
  return { mu: mu + K * (perf - mu), P: Math.max(c.sigma_floor ** 2, (1 - K) * P), gain: K };
}

export function backtest(rounds: CandRound[], flags: CandidateFlags, c: CandidateConfig = CANDIDATE_CONFIG): BacktestResult {
  const mapping = contextualMapping(rounds);
  const keyOf = (r: CandRound) => {
    const m = mapping.get(r.id)!;
    if (m.mapping === "EXACT") return `node:${m.node}`;
    if (flags.coldStart && m.mapping === "HIGH_CONFIDENCE") return `node:${m.node}`;
    return `er:${eventRoundKey(r)}`;
  };
  const sorted = [...rounds].sort(
    (a, b) => a.played_on.localeCompare(b.played_on) || (a.round_number ?? 0) - (b.round_number ?? 0) || a.id.localeCompare(b.id),
  );
  const groups: CandRound[][] = [];
  for (const r of sorted) {
    const g = groups.at(-1);
    if (g && g[0].played_on === r.played_on && g[0].round_number === r.round_number) g.push(r);
    else groups.push([r]);
  }
  const players = new Map<string, PState>();
  const layouts = new Map<string, LayoutAcc>();
  const families = new Map<string, { sum: number; n: number }>(); // Σ(d − par)
  let globalSum = 0;
  let globalN = 0;
  let structural: ReturnType<typeof fitStructural> = null;
  let structuralMonth = "";
  const preds: Prediction[] = [];
  const fieldEstimates: EventRoundDifficulty[] = [];
  const levels: Record<string, number> = {};
  const layoutNames = new Map<string, string | null>();

  for (const g of groups) {
    const today = dayNum(g[0].played_on);
    const month = g[0].played_on.slice(0, 7);
    if (flags.coldStart && month !== structuralMonth) {
      structuralMonth = month;
      const rows = [];
      for (const L of layouts.values()) {
        if (L.n < 3 || L.par == null || !L.holes) continue;
        const post = layoutPosterior(L, globalN ? globalSum / globalN : 60, c.layout_prior_sigma);
        rows.push({ d: post.mu, par: L.par, ftPerHole: L.ft != null ? L.ft / L.holes : null, w: 1 / post.sigma ** 2 });
      }
      structural = rows.length >= c.structural_min_layouts ? fitStructural(rows) : null;
    }
    const anchor = globalN ? globalSum / globalN : 60;
    // Pre-round player snapshot (drift applied, nothing from this group yet).
    const snap = new Map<string, { mu: number; P: number; gap: number | null }>();
    for (const r of g) {
      const s = players.get(r.player) ?? newP(c);
      const gap = s.last == null ? null : Math.max(0, today - s.last);
      snap.set(r.id, { mu: s.mu, P: s.P + c.drift_per_day * (gap ?? 0), gap });
    }
    const byKey = new Map<string, CandRound[]>();
    for (const r of g) byKey.set(keyOf(r), [...(byKey.get(keyOf(r)) ?? []), r]);
    // Leave-one-out field estimate from other players' same-round scores and
    // their pre-round skills. Never includes the player's own score.
    const fieldFor = (r: CandRound, key: string) =>
      fieldEstimate(
        (byKey.get(key) ?? [])
          .filter((o) => o.player !== r.player)
          .map((o) => {
            const so = snap.get(o.id)!;
            const pso = players.get(o.player);
            return { score: o.score, mu: so.mu, sigma: Math.sqrt(so.P), obsSigma: flags.volatility && pso ? playerVolSigma(pso, c) : c.base_obs_sigma };
          }),
        c,
      );

    const pending: {
      r: CandRound;
      key: string;
      d: { mu: number; sigma: number };
      R: number;
      level: string;
      ctx: { mu: number; sigma: number; adjustment: number } | null;
      useCtx: boolean;
    }[] = [];
    for (const r of g) {
      const key = keyOf(r);
      const L = layouts.get(key);
      const m = mapping.get(r.id)!.mapping;
      const sp = snap.get(r.id)!;
      let d: { mu: number; sigma: number };
      let level: string;
      if (!flags.coldStart || (L && L.n >= c.coldstart_max_rounds)) {
        d = layoutPosterior(L, anchor, c.layout_prior_sigma);
        level = !L || L.n === 0 ? "L6_population" : L.n >= 10 ? "L1_established" : "L2_provisional";
      } else {
        const parts: { mu: number; sigma: number }[] = [{ mu: anchor, sigma: c.population_sigma }];
        level = "L6_population";
        const par = r.par;
        if (structural && par != null && r.holes && r.distance_ft != null) {
          const [a, b, k] = structural.coef;
          parts.push({ mu: a + b * par + k * (r.distance_ft / r.holes / 100), sigma: Math.max(3, structural.resid_sd * 1.5) });
          level = "L5_structural";
        }
        const fam = familyOf(r.layout_name);
        const F = fam ? families.get(fam) : undefined;
        if (F && F.n >= 2 && par != null) {
          parts.push({ mu: par + F.sum / F.n, sigma: c.family_sigma + 2 / Math.sqrt(F.n) });
          level = "L4_family";
        }
        const fe = fieldFor(r, key);
        // Strict pre-round mode never lets same-round scores into the forecast.
        if (fe && !flags.strictPreRound) {
          parts.push({ mu: fe.mu, sigma: fe.sigma });
          level = "L3_event_field";
          fieldEstimates.push({
            event_round_key: `${eventRoundKey(r)}|loo:${r.player}`,
            played_on: r.played_on,
            layout_key: key,
            event_round_layout_difficulty_mu: fe.mu,
            event_round_layout_difficulty_sigma: fe.sigma,
            participant_count: fe.participant_count,
            effective_participant_count: fe.effective_participant_count,
          });
        }
        const prior = combine(parts);
        d = layoutPosterior(L, prior.mu, prior.sigma);
        if (L && L.n > 0) level = "L2_provisional";
      }
      // Post-round context (strict mode only): computed after the forecast is fixed.
      let ctx: { mu: number; sigma: number; adjustment: number } | null = null;
      if (flags.strictPreRound) {
        const fe = fieldFor(r, key);
        if (fe) {
          const a = eventRoundAdjustment(d, fe, c.event_adj_tau);
          ctx = { mu: a.contextual, sigma: a.uncertainty, adjustment: a.adjustment };
          fieldEstimates.push({
            event_round_key: `${eventRoundKey(r)}|loo:${r.player}`,
            played_on: r.played_on,
            layout_key: key,
            event_round_layout_difficulty_mu: fe.mu,
            event_round_layout_difficulty_sigma: fe.sigma,
            participant_count: fe.participant_count,
            effective_participant_count: fe.effective_participant_count,
            baseline_layout_difficulty: d.mu,
            event_round_adjustment: a.adjustment,
            contextual_layout_difficulty: a.contextual,
            adjustment_uncertainty: a.uncertainty,
          });
        }
      }
      levels[level] = (levels[level] ?? 0) + 1;
      const ps = players.get(r.player);
      const obsBase = flags.volatility && ps ? playerVolSigma(ps, c) : c.base_obs_sigma;
      const toR = (sigma: number) => {
        let R = Math.sqrt(obsBase ** 2 + sigma ** 2);
        if (m !== "EXACT" && !(flags.coldStart && m === "HIGH_CONFIDENCE")) R *= c.unknown_layout_mult;
        return Math.min(c.obs_sigma_max, Math.max(c.obs_sigma_min, R));
      };
      const useCtx = !!(flags.contextUpdate && ctx);
      const R = toR(useCtx ? ctx!.sigma : d.sigma);
      pending.push({ r, key, d, R, level, ctx, useCtx });
    }

    // Updates (players, then layouts with pre-round skills).
    for (const { r, key, d, R, level, ctx, useCtx } of pending) {
      const s = players.get(r.player) ?? newP(c);
      const sp = snap.get(r.id)!;
      let P = sp.P;
      if (flags.trend && s.run !== 0 && Math.abs(s.run) >= c.trend_min_run && Math.abs(s.z_ewma) >= c.trend_trigger) {
        P += c.trend_process_var * s.z_ewma ** 2;
      }
      const perfBase = d.mu - r.score;
      const perfCtx = ctx ? ctx.mu - r.score : null;
      const perf = useCtx && perfCtx != null ? perfCtx : perfBase;
      const expected = d.mu - sp.mu; // pre-round: baseline difficulty and pre-round skill only
      const volSd = flags.volatility && s.vol_n > 0 ? playerVolSigma(s, c) : c.base_obs_sigma;
      const predSd = Math.sqrt(P + d.sigma ** 2 + volSd ** 2);
      const u = updateSkill(sp.mu, P, perf, R ** 2, c, flags.robust);
      preds.push({
        id: r.id,
        player: r.player,
        played_on: r.played_on,
        expected,
        actual: r.score,
        err: expected - r.score,
        pred_sd: predSd,
        layout_rounds_before: layouts.get(key)?.n ?? 0,
        layout_level: level,
        mapping: mapping.get(r.id)!.mapping,
        gap: sp.gap,
        prior_events: s.n,
        prior_sigma: Math.sqrt(P),
        obs_sigma: R,
        gain: u.gain,
        mu_before: sp.mu,
        mu_after: u.mu,
        perf,
        round_rating: r.round_rating,
        baseline_layout_difficulty: d.mu,
        layout_key: key,
        perf_baseline: perfBase,
        ctx_expected: ctx ? ctx.mu - sp.mu : null,
        perf_ctx: perfCtx,
        event_round_adjustment: ctx ? ctx.adjustment : null,
        adjustment_uncertainty: ctx ? ctx.sigma : null,
      });
      const z = (perf - sp.mu) / Math.sqrt(P + R ** 2);
      const sign = Math.sign(z);
      s.run = Math.abs(z) < 0.5 ? 0 : Math.sign(s.run) === sign ? s.run + sign : sign;
      s.z_ewma = (1 - c.trend_alpha) * s.z_ewma + c.trend_alpha * z;
      // Volatility: pre-round residual variance beyond the parts we already model.
      s.vol_ss += Math.max(0, (perfBase - sp.mu) ** 2 - P - d.sigma ** 2);
      s.vol_n++;
      s.resid.push(r.score - d.mu);
      s.mu = u.mu;
      s.P = u.P;
      s.last = today;
      s.n++;
      players.set(r.player, s);
    }
    for (const { r, key } of pending) {
      const sp = snap.get(r.id)!;
      if (!layoutNames.get(key)) layoutNames.set(key, r.layout_name);
      const L = layouts.get(key) ?? {
        key,
        n: 0,
        sw: 0,
        swd: 0,
        rawSum: 0,
        par: r.par,
        holes: r.holes,
        ft: r.distance_ft,
        family: key.startsWith("node:") ? familyOf(r.layout_name) : null,
      };
      const w = 1 / (c.base_obs_sigma ** 2 + sp.P);
      const before = L.n >= 3 ? layoutPosterior(L, anchor, c.layout_prior_sigma).mu : null;
      L.n++;
      L.sw += w;
      L.swd += w * (r.score + sp.mu);
      L.rawSum += r.score;
      layouts.set(key, L);
      if (L.family && L.par != null) {
        const after = L.n >= 3 ? layoutPosterior(L, anchor, c.layout_prior_sigma).mu : null;
        const F = families.get(L.family) ?? { sum: 0, n: 0 };
        if (before != null) F.sum -= before - L.par;
        else if (after != null) F.n++;
        if (after != null) F.sum += after - L.par;
        families.set(L.family, F);
      }
      globalSum += r.score + sp.mu;
      globalN++;
    }
  }
  const final = new Map<string, { mu: number; sigma: number }>();
  for (const [k, s] of players) final.set(k, { mu: s.mu, sigma: Math.sqrt(s.P) });
  const anchorEnd = globalN ? globalSum / globalN : 60;
  const layoutFinal: BacktestResult["layoutFinal"] = new Map();
  for (const [k, L] of layouts) {
    const post = layoutPosterior(L, anchorEnd, c.layout_prior_sigma);
    layoutFinal.set(k, { mu: post.mu, sigma: post.sigma, n: L.n, name: layoutNames.get(k) ?? null, par: L.par });
  }
  return { flags, predictions: preds, final, fieldEstimates, levels, layoutFinal };
}

// ---------- simple online baselines ----------

export function baselines(rounds: CandRound[]) {
  const sorted = [...rounds].sort((a, b) => a.played_on.localeCompare(b.played_on) || (a.round_number ?? 0) - (b.round_number ?? 0) || a.id.localeCompare(b.id));
  const lay = new Map<string, { s: number; n: number }>();
  const res = new Map<string, number[]>();
  let gs = 0;
  let gn = 0;
  const out = new Map<string, Record<string, number>>();
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j].played_on === sorted[i].played_on && sorted[j].round_number === sorted[i].round_number) j++;
    const g = sorted.slice(i, j);
    const key = (r: CandRound) => (r.node ? `node:${r.node}` : `er:${eventRoundKey(r)}`);
    for (const r of g) {
      const L = lay.get(key(r));
      const lm = L ? L.s / L.n : gn ? gs / gn : r.score;
      const rs = res.get(r.player) ?? [];
      const m = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
      const shrunk = rs.length ? (rs.reduce((a, b) => a + b, 0) / (rs.length + 2)) : 0;
      out.set(r.id, {
        layout_only: lm - r.score,
        player_long_term: lm + m(rs) - r.score,
        recent_10: lm + m(rs.slice(-10)) - r.score,
        recent_20: lm + m(rs.slice(-20)) - r.score,
        player_plus_layout: lm + shrunk - r.score,
      });
    }
    for (const r of g) {
      const L = lay.get(key(r)) ?? { s: 0, n: 0 };
      const lm = L.n ? L.s / L.n : gn ? gs / gn : r.score;
      res.set(r.player, [...(res.get(r.player) ?? []), r.score - lm]);
      L.s += r.score;
      L.n++;
      lay.set(key(r), L);
      gs += r.score;
      gn++;
    }
    i = j;
  }
  return out;
}

// ---------- metrics ----------

export function errStats(errs: number[]) {
  if (!errs.length) return { n: 0, mae: null as number | null, median_ae: null as number | null, rmse: null as number | null };
  const a = errs.map(Math.abs).sort((x, y) => x - y);
  return {
    n: errs.length,
    mae: a.reduce((s, x) => s + x, 0) / a.length,
    median_ae: a[Math.floor(a.length / 2)],
    rmse: Math.sqrt(errs.reduce((s, x) => s + x * x, 0) / errs.length),
  };
}

export function pct(xs: number[], ps = [0.5, 0.75, 0.9, 0.95, 0.99]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const o: Record<string, number> = {};
  for (const p of ps) o[`p${Math.round(p * 100)}`] = s[Math.min(s.length - 1, Math.floor(p * s.length))];
  o.max = s[s.length - 1];
  return o;
}

/** Deterministic PRNG for bootstrap so reports are reproducible. */
function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Paired |error| difference (candidate − control) with a player-clustered
 * bootstrap 95% interval. Negative = candidate better.
 */
export function pairedDiff(ctrl: Map<string, Prediction>, cand: Prediction[], reps = 400) {
  const byPlayer = new Map<string, number[]>();
  let win = 0;
  let loss = 0;
  for (const p of cand) {
    const a = ctrl.get(p.id);
    if (!a) continue;
    const d = Math.abs(p.err) - Math.abs(a.err);
    if (d < -1e-9) win++;
    else if (d > 1e-9) loss++;
    byPlayer.set(p.player, [...(byPlayer.get(p.player) ?? []), d]);
  }
  const ps = [...byPlayer.values()];
  const all = ps.flat();
  const mean = all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;
  const r = rng(38);
  const boots: number[] = [];
  for (let k = 0; k < reps && ps.length; k++) {
    let s = 0;
    let n = 0;
    for (let i = 0; i < ps.length; i++) {
      const x = ps[Math.floor(r() * ps.length)];
      for (const v of x) s += v;
      n += x.length;
    }
    boots.push(s / n);
  }
  boots.sort((a, b) => a - b);
  const playersBetter = ps.filter((x) => x.reduce((a, b) => a + b, 0) < 0).length;
  return {
    n: all.length,
    mean_abs_err_diff: mean,
    ci95: boots.length ? [boots[Math.floor(0.025 * boots.length)], boots[Math.floor(0.975 * boots.length)]] : null,
    rounds_better_pct: win + loss ? (100 * win) / (win + loss) : null,
    rounds_tied: all.length - win - loss,
    players_better_pct: ps.length ? (100 * playersBetter) / ps.length : null,
  };
}

const Z = { p50: 0.6745, p80: 1.2816, p95: 1.96 };
export function coverage(preds: Prediction[], scale = 1) {
  const n = preds.length || 1;
  const o: Record<string, number> = {};
  for (const [k, z] of Object.entries(Z)) o[k] = (100 * preds.filter((p) => Math.abs(p.err) <= z * p.pred_sd * scale).length) / n;
  o.mean_80_width = preds.reduce((a, p) => a + 2 * Z.p80 * p.pred_sd * scale, 0) / n;
  // Gaussian log score (higher is better)
  o.mean_log_score = preds.reduce((a, p) => a - Math.log(p.pred_sd * scale) - 0.5 * (p.err / (p.pred_sd * scale)) ** 2 - 0.9189, 0) / n;
  return o;
}

/** Interval scale s such that the 80% interval covers 80% of real results. */
export function calibrateScale(preds: Prediction[]) {
  const r = preds.map((p) => Math.abs(p.err) / p.pred_sd).sort((a, b) => a - b);
  if (!r.length) return null;
  return r[Math.floor(0.8 * r.length)] / Z.p80;
}

export function movement(preds: Prediction[]) {
  const all = preds.map((p) => Math.abs(p.mu_after - p.mu_before));
  const split = (f: (p: Prediction) => boolean) => {
    const xs = preds.filter(f).map((p) => Math.abs(p.mu_after - p.mu_before));
    return { n: xs.length, dist: pct(xs), gt1: xs.filter((x) => x > 1).length, gt2: xs.filter((x) => x > 2).length, gt3: xs.filter((x) => x > 3).length, gt5: xs.filter((x) => x > 5).length };
  };
  return {
    all: { n: all.length, dist: pct(all), gt1: all.filter((x) => x > 1).length, gt2: all.filter((x) => x > 2).length, gt3: all.filter((x) => x > 3).length, gt5: all.filter((x) => x > 5).length },
    new_provisional: split((p) => p.prior_events < 10),
    established: split((p) => p.prior_events >= 10 && (p.gap ?? 0) < 90),
    post_inactivity: split((p) => p.prior_events >= 10 && (p.gap ?? 0) >= 90),
  };
}

export function postBreak(preds: Prediction[], thresholds = [30, 60, 90, 180, 365]) {
  const byPlayer = new Map<string, Prediction[]>();
  for (const p of preds) byPlayer.set(p.player, [...(byPlayer.get(p.player) ?? []), p]);
  const out: Record<string, unknown> = {};
  for (const t of thresholds) {
    const first: Prediction[] = [];
    const next3: number[] = [];
    const next5: number[] = [];
    for (const list of byPlayer.values()) {
      list.forEach((p, i) => {
        if (p.prior_events < 5 || (p.gap ?? 0) < t) return;
        first.push(p);
        for (const q of list.slice(i + 1, i + 4)) next3.push(Math.abs(q.err));
        for (const q of list.slice(i + 1, i + 6)) next5.push(Math.abs(q.err));
      });
    }
    const m = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    out[`gap_${t}d`] = {
      n: first.length,
      prior_sigma: m(first.map((p) => p.prior_sigma)),
      obs_sigma: m(first.map((p) => p.obs_sigma)),
      gain: m(first.map((p) => p.gain)),
      abs_skill_change: m(first.map((p) => Math.abs(p.mu_after - p.mu_before))),
      first_round_mae: m(first.map((p) => Math.abs(p.err))),
      next3_mae: m(next3),
      next5_mae: m(next5),
    };
  }
  return out;
}

/**
 * Responsiveness on fixed sequences (defined from the control so every model
 * is judged on the same rounds): skill change from the sequence start after
 * 1/3/5/10 rounds, and the next-5 MAE after the sequence ends.
 */
export function responsiveness(ctrl: Prediction[], cand: Map<string, Prediction>, sign: 1 | -1, threshold = 3) {
  const byPlayer = new Map<string, Prediction[]>();
  for (const p of ctrl) byPlayer.set(p.player, [...(byPlayer.get(p.player) ?? []), p]);
  const marks = [1, 3, 5, 10];
  const acc: Record<string, { ctrl: number[]; cand: number[] }> = Object.fromEntries(marks.map((m) => [`after_${m}`, { ctrl: [], cand: [] }]));
  const after5 = { ctrl: [] as number[], cand: [] as number[] };
  let runs = 0;
  for (const list of byPlayer.values()) {
    let i = 0;
    while (i < list.length) {
      const strong = (p: Prediction) => sign * (p.perf - p.mu_before) >= threshold;
      if (list[i].prior_events < 10 || !strong(list[i])) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < list.length && strong(list[j + 1])) j++;
      runs++;
      const startC = list[i].mu_before;
      const startK = cand.get(list[i].id)?.mu_before;
      for (const m of marks) {
        if (j - i + 1 < m) continue;
        const e = list[i + m - 1];
        acc[`after_${m}`].ctrl.push(sign * (e.mu_after - startC));
        const k = cand.get(e.id);
        if (k && startK != null) acc[`after_${m}`].cand.push(sign * (k.mu_after - startK));
      }
      for (const q of list.slice(j + 1, j + 6)) {
        after5.ctrl.push(Math.abs(q.err));
        const k = cand.get(q.id);
        if (k) after5.cand.push(Math.abs(k.err));
      }
      i = j + 1;
    }
  }
  const m = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    sequences: runs,
    ...Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, { n: v.ctrl.length, control: m(v.ctrl), candidate: m(v.cand) }])),
    next5_mae_after_sequence: { control: m(after5.ctrl), candidate: m(after5.cand) },
  };
}

export function pdgaReference(res: BacktestResult, official: Map<string, number | null>) {
  const pp: [number, number][] = [];
  for (const [k, s] of res.final) {
    const o = official.get(k);
    if (o != null) pp.push([s.mu, o]);
  }
  const rr: [number, number][] = res.predictions.filter((p) => p.round_rating != null).map((p) => [p.perf, p.round_rating as number]);
  return { player_skill_vs_official: { n: pp.length, r: pearson(pp) }, round_perf_vs_round_rating: { n: rr.length, r: pearson(rr) } };
}
