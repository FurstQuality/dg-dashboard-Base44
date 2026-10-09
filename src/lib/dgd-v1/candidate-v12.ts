/**
 * Phase 5A.4 — DGD V1.2 research candidate. Pure. Never writes V1 or V1.1
 * rows and never changes V1.1 (candidate.ts) behaviour.
 *
 * Differences from V1.1:
 *  1. Fixed, versioned reference frame. Layout-difficulty priors come from
 *     frozen coefficients (V12_REFERENCE), never from a running average over
 *     whichever players happen to be in the database. Unrelated players can't
 *     move each other's Skill.
 *  2. Information flows between players only through shared modeled context:
 *     the same layout node, or the same event-round-layout field.
 *  3. Explicit round-context state + context uncertainty per round.
 *  4. Optional context-aware observation noise: rounds with insufficient
 *     course context get very wide uncertainty instead of the V1.1 clamp, so a
 *     raw score against an "average course" barely moves Skill. The round is
 *     kept in history.
 */
import {
  CANDIDATE_CONFIG,
  combine,
  eventRoundAdjustment,
  fieldEstimate,
  playerVolSigma,
  updateSkill,
  type CandRound,
  type CandidateConfig,
  type Prediction,
} from "./candidate";
import { contextStatus, eventRoundLayoutKey, type ContextStatus } from "./pdga-context";

export const V12_MODEL_ID = "dgd-core-v1.2-candidate@0.1.0";
/**
 * Phase 5A.5 — the SHADOW_CHAMPION: Model D finalized (context-aware
 * uncertainty + field-coverage uncertainty + recency/uncertainty-weighted
 * Form). Frozen from here on; any math change needs a new id.
 */
export const V12_SHADOW_MODEL_ID = "dgd-core-v1.2@0.2.0";

/**
 * Frozen reference frame, fitted once (Phase 5A.4) on the 52-player PDGA
 * calibration cohort's V1.1 layout baselines and then fixed. Changing any
 * value requires a new model version. Difficulty = expected score of a
 * reference (Skill 0) player.
 */
export const V12_REFERENCE = {
  version: "ref-2026-10a",
  // d ≈ a + b·par + c·(ft per hole / 100), used when par, holes and length are known
  struct_full: [25.983, 0.4872, 3.5848] as [number, number, number],
  struct_full_sigma: 4.5,
  // d ≈ a + b·par, when par and holes are known but length is not
  struct_par: [37.415, 0.4919] as [number, number],
  struct_par_sigma: 5.5,
  // d ≈ per_hole · holes, holes only
  per_hole: 3.435,
  per_hole_sigma: 8,
  // nothing known about the course
  unknown_mu: 68.8,
  unknown_sigma: 10,
} as const;

export type V12Config = CandidateConfig & {
  /** Floor for observation uncertainty on INSUFFICIENT_CONTEXT rounds (ctxSigma mode). */
  insufficient_obs_sigma: number;
  /** Floor for STRUCTURAL_CONTEXT_ONLY rounds (ctxSigma mode). */
  structural_obs_sigma: number;
};

export const V12_CONFIG: V12Config = { ...CANDIDATE_CONFIG, insufficient_obs_sigma: 30, structural_obs_sigma: 6 };

export type V12Flags = {
  /** Context-aware observation uncertainty (model D). */
  ctxSigma: boolean;
  /** Update Skill from the post-round contextual performance when a field exists. */
  contextUpdate: boolean;
  /** Widen same-day field uncertainty by how much of the real field we observed (5A.5). */
  fieldCoverage?: boolean;
};

/** Production flags for the V1.2 shadow champion. */
export const V12_SHADOW_FLAGS: V12Flags = { ctxSigma: true, contextUpdate: true, fieldCoverage: true };

export type FieldConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

/**
 * Field-coverage summary for one event-round-layout. `full` is the real field
 * size only when it is reliably known; otherwise coverage is unknown and the
 * field is treated as partial.
 */
export function fieldCoverage(known: number, full: number | null, effective: number, exactLayout: boolean) {
  const ratio = full && full > 0 ? Math.min(1, known / full) : null;
  // Unknown coverage counts as a half-observed field, never a full one.
  const cov = ratio ?? 0.5;
  const inflate = 1 / Math.sqrt(Math.max(0.25, cov));
  let confidence: FieldConfidence = "NONE";
  if (known >= 2) {
    confidence = effective >= 8 && cov >= 0.5 && exactLayout ? "HIGH" : effective >= 4 && cov >= 0.25 ? "MEDIUM" : "LOW";
  }
  return { known, full, ratio, effective, inflate, confidence };
}

export type V12Prediction = Prediction & {
  context_status: ContextStatus;
  context_sigma: number;
  field_others: number;
  erl_key: string | null;
  field_full_count?: number | null;
  field_coverage_ratio?: number | null;
  effective_field_count?: number | null;
  field_context_confidence?: FieldConfidence;
};

export type V12Options = {
  /** Reliable full field size for an event-round-layout, given the divisions seen in it. */
  fullField?: (erl: string, event: string, divisions: string[]) => number | null;
  /** V1.3 candidates only: structural layout prior override. V1.2 never sets it. */
  prior?: (r: Pick<CandRound, "par" | "holes" | "distance_ft">) => { mu: number; sigma: number };
  /** V1.3 candidates only: forecast-side Skill calibration. Never changes the Skill trajectory. */
  forecastMu?: (mu: number) => number;
};

export type V12Result = {
  predictions: V12Prediction[];
  final: Map<string, { mu: number; sigma: number }>;
  layoutFinal: Map<string, { mu: number; sigma: number; n: number }>;
};

/** Fixed structural prior for a layout from real attributes only. */
export function referencePrior(r: Pick<CandRound, "par" | "holes" | "distance_ft">) {
  const R = V12_REFERENCE;
  if (r.par != null && r.holes && r.distance_ft != null) {
    const [a, b, c] = R.struct_full;
    return { mu: a + b * r.par + c * (r.distance_ft / r.holes / 100), sigma: R.struct_full_sigma, basis: "structure" as const };
  }
  if (r.par != null && r.holes) return { mu: R.struct_par[0] + R.struct_par[1] * r.par, sigma: R.struct_par_sigma, basis: "par" as const };
  if (r.holes) return { mu: R.per_hole * r.holes, sigma: R.per_hole_sigma, basis: "holes" as const };
  return { mu: R.unknown_mu, sigma: R.unknown_sigma, basis: "none" as const };
}

type Acc = { n: number; sw: number; swd: number };
const post = (L: Acc | undefined, prior: { mu: number; sigma: number }) => {
  if (!L || !L.n) return { mu: prior.mu, sigma: prior.sigma };
  const pp = 1 / prior.sigma ** 2;
  const p = pp + L.sw;
  return { mu: (prior.mu * pp + L.swd) / p, sigma: Math.sqrt(1 / p) };
};

const dayNum = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000);

type PS = { mu: number; P: number; last: number | null; n: number; vol_ss: number; vol_n: number };

export function backtestV12(rounds: CandRound[], flags: V12Flags, c: V12Config = V12_CONFIG, opts: V12Options = {}): V12Result {
  const sorted = [...rounds].sort(
    (a, b) => a.played_on.localeCompare(b.played_on) || (a.round_number ?? 0) - (b.round_number ?? 0) || a.id.localeCompare(b.id),
  );
  const groups: CandRound[][] = [];
  for (const r of sorted) {
    const g = groups.at(-1);
    if (g && g[0].played_on === r.played_on && g[0].round_number === r.round_number) g.push(r);
    else groups.push([r]);
  }
  const players = new Map<string, PS>();
  const layouts = new Map<string, Acc>();
  const preds: V12Prediction[] = [];
  const newP = (): PS => ({ mu: c.prior_mu, P: c.prior_sigma ** 2, last: null, n: 0, vol_ss: 0, vol_n: 0 });

  for (const g of groups) {
    const today = dayNum(g[0].played_on);
    const snap = new Map<string, { mu: number; P: number; gap: number | null }>();
    for (const r of g) {
      const s = players.get(r.player) ?? newP();
      const gap = s.last == null ? null : Math.max(0, today - s.last);
      snap.set(r.id, { mu: s.mu, P: s.P + c.drift_per_day * (gap ?? 0), gap });
    }
    const byErl = new Map<string, CandRound[]>();
    for (const r of g) {
      const k = eventRoundLayoutKey(r);
      if (k) byErl.set(k, [...(byErl.get(k) ?? []), r]);
    }
    type Cov = ReturnType<typeof fieldCoverage> | null;
    const pending: { r: CandRound; d: { mu: number; sigma: number }; R: number; status: ContextStatus; ctx: ReturnType<typeof eventRoundAdjustment> | null; others: number; erl: string | null; cov: Cov }[] = [];
    for (const r of g) {
      const lk = r.node ? `node:${r.node}` : null;
      const L = lk ? layouts.get(lk) : undefined;
      const d = post(L, (opts.prior ?? referencePrior)(r));
      const erl = eventRoundLayoutKey(r);
      // Leave-one-out: other players only, their pre-round skills.
      const others = erl
        ? (byErl.get(erl) ?? []).filter((o) => o.player !== r.player).map((o) => {
            const so = snap.get(o.id)!;
            const pso = players.get(o.player);
            return { score: o.score, mu: so.mu, sigma: Math.sqrt(so.P), obsSigma: pso ? playerVolSigma(pso, c) : c.base_obs_sigma };
          })
        : [];
      let fe = fieldEstimate(others, c);
      let cov: Cov = null;
      if (fe && erl) {
        const group = byErl.get(erl) ?? [];
        const divs = [...new Set(group.map((o) => o.division ?? "?"))];
        const full = opts.fullField ? opts.fullField(erl, r.event, divs) : null;
        cov = fieldCoverage(others.length, full != null ? Math.max(full - 1, others.length) : null, fe.effective_participant_count, !!r.node);
        if (flags.fieldCoverage) fe = { ...fe, sigma: fe.sigma * cov.inflate };
      }
      const ctx = fe ? eventRoundAdjustment(d, fe, c.event_adj_tau) : null;
      const status = contextStatus({ layout_known: !!r.node, layout_rounds_before: L?.n ?? 0, hole_count: r.holes, par: r.par, distance_ft: r.distance_ft, field_others: fe ? others.length : 0 });
      const ps = players.get(r.player);
      const obsBase = ps ? playerVolSigma(ps, c) : c.base_obs_sigma;
      const useCtx = flags.contextUpdate && ctx;
      let R = Math.sqrt(obsBase ** 2 + (useCtx ? ctx!.uncertainty : d.sigma) ** 2);
      if (!r.node) R *= c.unknown_layout_mult;
      R = Math.max(c.obs_sigma_min, R);
      if (flags.ctxSigma) {
        if (status === "INSUFFICIENT_CONTEXT") R = Math.max(R, c.insufficient_obs_sigma);
        else if (status === "STRUCTURAL_CONTEXT_ONLY") R = Math.max(R, c.structural_obs_sigma);
        else R = Math.min(c.obs_sigma_max, R);
      } else R = Math.min(c.obs_sigma_max, R);
      pending.push({ r, d, R, status, ctx, others: fe ? others.length : 0, erl, cov });
    }
    for (const { r, d, R, status, ctx, others, erl, cov } of pending) {
      const s = players.get(r.player) ?? newP();
      const sp = snap.get(r.id)!;
      const perfBase = d.mu - r.score;
      const perfCtx = ctx ? ctx.contextual - r.score : null;
      const perf = flags.contextUpdate && perfCtx != null ? perfCtx : perfBase;
      const expected = d.mu - (opts.forecastMu ? opts.forecastMu(sp.mu) : sp.mu);
      const volSd = s.vol_n > 0 ? playerVolSigma(s, c) : c.base_obs_sigma;
      const u = updateSkill(sp.mu, sp.P, perf, R ** 2, c, true);
      preds.push({
        id: r.id, player: r.player, played_on: r.played_on, expected, actual: r.score, err: expected - r.score,
        pred_sd: Math.sqrt(sp.P + d.sigma ** 2 + volSd ** 2),
        layout_rounds_before: r.node ? (layouts.get(`node:${r.node}`)?.n ?? 0) : 0,
        layout_level: status, mapping: r.node ? "EXACT" : "UNMAPPED", gap: sp.gap, prior_events: s.n,
        prior_sigma: Math.sqrt(sp.P), obs_sigma: R, gain: u.gain, mu_before: sp.mu, mu_after: u.mu, perf,
        round_rating: r.round_rating, baseline_layout_difficulty: d.mu, layout_key: r.node ? `node:${r.node}` : `round:${r.id}`,
        perf_baseline: perfBase, ctx_expected: ctx ? ctx.contextual - sp.mu : null, perf_ctx: perfCtx,
        event_round_adjustment: ctx ? ctx.adjustment : null, adjustment_uncertainty: ctx ? ctx.uncertainty : null,
        context_status: status, context_sigma: d.sigma, field_others: others, erl_key: erl,
        field_full_count: cov?.full ?? null, field_coverage_ratio: cov?.ratio ?? null,
        effective_field_count: cov?.effective ?? null, field_context_confidence: cov?.confidence ?? "NONE",
      });
      s.vol_ss += Math.max(0, (perfBase - sp.mu) ** 2 - sp.P - d.sigma ** 2);
      s.vol_n++;
      s.mu = u.mu;
      s.P = u.P;
      s.last = today;
      s.n++;
      players.set(r.player, s);
    }
    // Baseline layout difficulty: only rounds on a known node, keyed to it.
    // The event-round adjustment is never written here.
    for (const { r } of pending) {
      if (!r.node) continue;
      const sp = snap.get(r.id)!;
      const k = `node:${r.node}`;
      const L = layouts.get(k) ?? { n: 0, sw: 0, swd: 0 };
      const w = 1 / (c.base_obs_sigma ** 2 + sp.P);
      L.n++;
      L.sw += w;
      L.swd += w * (r.score + sp.mu);
      layouts.set(k, L);
    }
  }
  const final = new Map<string, { mu: number; sigma: number }>();
  for (const [k, s] of players) final.set(k, { mu: s.mu, sigma: Math.sqrt(s.P) });
  const layoutFinal = new Map<string, { mu: number; sigma: number; n: number }>();
  for (const [k, L] of layouts) {
    const pr = { mu: L.swd / L.sw, sigma: Math.sqrt(1 / L.sw) };
    layoutFinal.set(k, { ...pr, n: L.n });
  }
  return { predictions: preds, final, layoutFinal };
}

/**
 * Connected components of players linked by shared layout nodes or
 * event-round-layout fields. Players in different components cannot affect
 * each other under V1.2.
 */
export function connectionPaths(rounds: CandRound[]) {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  const shared = new Map<string, Set<string>>();
  for (const r of rounds) {
    parent.set(`p:${r.player}`, parent.get(`p:${r.player}`) ?? `p:${r.player}`);
    for (const k of [r.node ? `node:${r.node}` : null, eventRoundLayoutKey(r)]) {
      if (!k) continue;
      union(`p:${r.player}`, k);
      shared.set(k, (shared.get(k) ?? new Set()).add(r.player));
    }
  }
  return {
    connected: (a: string, b: string) => find(`p:${a}`) === find(`p:${b}`),
    sharedKeys: (a: string, b: string) => [...shared.entries()].filter(([, s]) => s.has(a) && s.has(b)).map(([k]) => k),
  };
}

// ---------- Form research ----------

export type FormMethod = "A_unweighted" | "B_uncertainty" | "C_context" | "D_recency_uncertainty" | "E_suppressed";
export const FORM_METHODS: FormMethod[] = ["A_unweighted", "B_uncertainty", "C_context", "D_recency_uncertainty", "E_suppressed"];
export const FORM_WINDOW_V12 = 8;
export const FORM_MIN = 5;

/** How usable a round's performance estimate is for Form (context quality, 0–1). */
export const CONTEXT_WEIGHT: Record<ContextStatus, number> = {
  ESTABLISHED_LAYOUT: 1,
  PROVISIONAL_LAYOUT: 0.85,
  EVENT_CONTEXT_ONLY: 0.7,
  EXACT_LAYOUT: 0.6,
  STRUCTURAL_CONTEXT_ONLY: 0.3,
  INSUFFICIENT_CONTEXT: 0,
};
const RELIABLE = (s: ContextStatus) => CONTEXT_WEIGHT[s] >= 0.6;

export type FormConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

/** Separate from Skill confidence: quality of the recent performance estimates. */
export function formConfidence(recent: Pick<V12Prediction, "context_status">[]): { level: FormConfidence; reliable: number; window: number } {
  const w = recent.slice(-FORM_WINDOW_V12);
  const reliable = w.filter((p) => RELIABLE(p.context_status)).length;
  const level: FormConfidence = w.length < FORM_MIN ? "NONE" : reliable >= 6 ? "HIGH" : reliable >= 4 ? "MEDIUM" : "LOW";
  return { level, reliable, window: w.length };
}

/** Form value (latent strokes) by method; null = unavailable. */
export function formValue(recent: Pick<V12Prediction, "perf" | "obs_sigma" | "context_status" | "played_on">[], method: FormMethod): number | null {
  const w = recent.slice(-FORM_WINDOW_V12);
  if (w.length < FORM_MIN) return null;
  const asOf = dayNum(w[w.length - 1].played_on);
  const weight = (p: (typeof w)[number]) => {
    switch (method) {
      case "A_unweighted": return 1;
      case "B_uncertainty": return 1 / p.obs_sigma ** 2;
      case "C_context": return CONTEXT_WEIGHT[p.context_status];
      case "D_recency_uncertainty":
      case "E_suppressed": return Math.pow(0.5, (asOf - dayNum(p.played_on)) / 60) / p.obs_sigma ** 2;
    }
  };
  if (method === "E_suppressed" && w.filter((p) => RELIABLE(p.context_status)).length < FORM_MIN) return null;
  let sw = 0;
  let s = 0;
  for (const p of w) {
    const x = weight(p);
    sw += x;
    s += x * p.perf;
  }
  return sw > 0 ? s / sw : null;
}

/**
 * V1.2 Form Confidence (5A.5): context quality, round uncertainty, number of
 * usable recent observations and recency. Separate from Skill confidence.
 */
export function formConfidenceV12(
  recent: Pick<V12Prediction, "context_status" | "obs_sigma" | "played_on">[],
  asOf: string,
): { level: FormConfidence; reliable: number; window: number; effective: number; days_since_last: number | null } {
  const w = recent.slice(-FORM_WINDOW_V12);
  // A round only counts as usable when its context is good and its performance estimate is tight.
  const reliable = w.filter((p) => RELIABLE(p.context_status) && p.obs_sigma <= 15).length;
  const last = w.at(-1);
  const days = last ? dayNum(asOf) - dayNum(last.played_on) : null;
  // Effective observations: precision-weighted count, uncertain rounds count less.
  const ws = w.map((p) => CONTEXT_WEIGHT[p.context_status] / Math.max(1, (p.obs_sigma / 6) ** 2));
  const sw = ws.reduce((a, b) => a + b, 0);
  const sw2 = ws.reduce((a, b) => a + b * b, 0);
  const effective = sw2 > 0 ? (sw * sw) / sw2 : 0;
  let level: FormConfidence = w.length < FORM_MIN ? "NONE" : reliable >= 6 && effective >= 5 ? "HIGH" : reliable >= 4 && effective >= 3 ? "MEDIUM" : "LOW";
  // Stale form: a year without rounds caps confidence.
  if (days != null && days > 365 && level !== "NONE") level = "LOW";
  else if (days != null && days > 180 && level === "HIGH") level = "MEDIUM";
  return { level, reliable, window: w.length, effective: +effective.toFixed(2), days_since_last: days };
}

/** User-facing Form state for a future model: never falsely precise. */
export function formDisplay(value: number | null, conf: FormConfidence): { state: "AVAILABLE" | "LOW_CONTEXT" | "UNAVAILABLE"; value: number | null } {
  if (value == null || conf === "NONE") return { state: "UNAVAILABLE", value: null };
  if (conf === "LOW") return { state: "LOW_CONTEXT", value: null };
  return { state: "AVAILABLE", value };
}
