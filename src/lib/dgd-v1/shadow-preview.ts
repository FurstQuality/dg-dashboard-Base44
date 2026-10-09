/**
 * Phase 5A — per-player V1.1 read model built from canonical rounds. Pure;
 * same wording/display helpers as Phase 4, no new rating mathematics.
 */
import { DGD_V1_DEFAULT_CONFIG, confidenceFrom, toDisplay } from "./engine";
import { CANDIDATE_MODEL_ID, calibrateScale, type BacktestResult, type Prediction } from "./candidate";
import { layoutKnowledge, trendFrom } from "./preview";
import { coverageFor, ratingStatus, rowHash, sourceMix, type RoundMeta } from "./shadow-input";

const Z80 = 1.2816;
const disp = (mu: number) => toDisplay(mu, DGD_V1_DEFAULT_CONFIG);
const conf = (sigma: number) => confidenceFrom(sigma, DGD_V1_DEFAULT_CONFIG);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const REASON_TEXT: Record<string, string> = {
  DOUBLES: "Doubles or team round",
  UNSUPPORTED_FORMAT: "Format DGD doesn't rate yet",
  SOURCE_EXCLUDED: "Marked as not rated at the source",
  PRACTICE: "Practice round",
  MALFORMED_SOURCE: "Source data couldn't be read",
  POSSIBLE_DUPLICATE: "Possible duplicate — waiting for review",
  DUPLICATE: "Same round as another record — counted once",
  SOLO_ROUND: "Played solo — DGD only counts singles rounds with other players",
  TEAM_OR_DOUBLES: "Doubles or team round — not an individual score",
  UNKNOWN_FORMAT: "Not sure who was on the card — re-upload the UDisc export to check",
  IMPOSSIBLE_SCORE: "Score outside the normal range",
  IMPOSSIBLE_SCORE_TO_PAR: "Score to par outside the normal range",
  INCOMPLETE_SCORE: "Incomplete score",
  UNKNOWN_COURSE: "Course not recognized yet",
  OTHER: "Not part of this model run",
};

export function reasonText(codes: string[]) {
  const c = codes.find((x) => REASON_TEXT[x]);
  return c ? REASON_TEXT[c] : REASON_TEXT.OTHER;
}

function statusOf(m: RoundMeta): "excluded" | "not_rated" | "pending_review" {
  if (m.state === "PENDING_REVIEW") return "pending_review";
  if (m.state === "EXCLUDED") return "excluded";
  return "not_rated";
}

/** Per-model hooks so V1.2 reuses this read model without changing V1.1 output. */
export type PreviewModelHooks = {
  modelId: string;
  /** Extra columns on rated round rows. */
  roundExtra?: (p: Prediction) => Record<string, unknown>;
  /** Extra columns on every round row (rated or not). */
  rowExtra?: (m: RoundMeta) => Record<string, unknown>;
  /** Replaces the plain latest-8 Form; returns display-scale value or null plus extra state. */
  form?: (preds: Prediction[], disp: (mu: number) => number, today: string) => { value: number | null; extra: Record<string, unknown> };
  layoutLevel?: (p: Prediction) => string;
};

const V11_HOOKS: PreviewModelHooks = { modelId: CANDIDATE_MODEL_ID };

export function buildShadowPreview(
  res: Pick<BacktestResult, "predictions" | "final"> & { layoutFinal: Map<string, { mu: number; sigma: number; n: number; name?: string | null; par?: number | null }> },
  meta: Map<string, RoundMeta>,
  users: string[],
  today = new Date().toISOString().slice(0, 10),
  hooks: PreviewModelHooks = V11_HOOKS,
) {
  const MODEL = hooks.modelId;
  const scale = calibrateScale(res.predictions.filter((p) => p.prior_events >= 1)) ?? 1;
  const byPlayer = new Map<string, Prediction[]>();
  for (const p of res.predictions) byPlayer.set(p.player, [...(byPlayer.get(p.player) ?? []), p]);
  const metasByUser = new Map<string, RoundMeta[]>();
  for (const m of meta.values()) metasByUser.set(m.user_id, [...(metasByUser.get(m.user_id) ?? []), m]);

  const out = new Map<string, { state: Record<string, unknown>; rounds: Record<string, unknown>[]; layouts: Record<string, unknown>[] }>();
  for (const u of users) {
    const preds = byPlayer.get(u) ?? [];
    const fin = res.final.get(u);
    const own = metasByUser.get(u) ?? [];
    const byId = new Map(preds.map((p) => [p.id, p]));
    const rounds: Record<string, unknown>[] = [];
    let excluded = 0;
    for (const m of own) {
      const base = {
        user_id: u, canonical_round_id: m.id, calibration_round_id: null, model_version: MODEL,
        played_on: m.played_on, event_name: m.event_name, division: m.division, round_number: null,
        layout_name: m.layout_name, course_name: m.course_name, par: m.par, score: m.score ?? 0,
        pdga_round_rating: m.pdga_round_rating, udisc_round_rating: m.udisc_round_rating, legacy_round_rating: m.legacy_round_rating,
        sources: m.sources, origin_source: m.origin, category: m.category,
        ...(hooks.rowExtra?.(m) ?? {}),
      };
      const p = byId.get(m.id);
      let row: Record<string, unknown>;
      if (!p) {
        excluded++;
        row = { ...base, seq: 0, layout_key: null, status: statusOf(m), status_reason: reasonText(m.reason_codes),
          layout_knowledge: null, pre_expected: null, pre_strokes_vs_expectation: null, likely_low: null, likely_high: null,
          ctx_expected: null, ctx_strokes_vs_expectation: null, event_adjustment: null, round_performance_display: null,
          display_before: null, display_after: null, confidence_before: null, confidence_after: null };
      } else {
        const sd80 = Z80 * p.pred_sd * scale;
        row = {
          ...base, seq: preds.indexOf(p), layout_key: p.layout_key ?? null, score: p.actual,
          status: p.prior_events === 0 ? "provisional" : "rated",
          status_reason: p.prior_events === 0 ? "First round on record — DGD is still getting to know you" : null,
          layout_knowledge: hooks.layoutLevel ? hooks.layoutLevel(p) : layoutKnowledge(p.layout_level),
          pre_expected: p.expected, pre_strokes_vs_expectation: p.expected - p.actual,
          likely_low: p.expected - sd80, likely_high: p.expected + sd80,
          ctx_expected: p.ctx_expected, ctx_strokes_vs_expectation: p.ctx_expected == null ? null : p.ctx_expected - p.actual,
          event_adjustment: p.event_round_adjustment,
          round_performance_display: disp(p.perf), display_before: disp(p.mu_before), display_after: disp(p.mu_after),
          confidence_before: conf(p.prior_sigma), confidence_after: conf(Math.sqrt((1 - p.gain) * p.prior_sigma ** 2)),
          ...(hooks.roundExtra?.(p) ?? {}),
        };
      }
      row.row_hash = rowHash(row);
      rounds.push(row);
    }

    const coverage = coverageFor(own);
    const status = ratingStatus(preds.length, fin?.sigma ?? null);
    if (!fin || !preds.length) {
      out.set(u, { state: { user_id: u, model_version: MODEL, rating_status: status, coverage, eligible_rounds: 0, excluded_rounds: excluded }, rounds, layouts: [] });
      continue;
    }
    const at = (days: number) => {
      const cut = new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
      const before = preds.filter((p) => p.played_on <= cut).at(-1);
      return before ? disp(fin.mu) - disp(before.mu_after) : null;
    };
    const recentBlock = (n: number) => {
      const last = preds.slice(-n);
      if (last.length < n) return null;
      const r = last.map((p) => p.round_rating).filter((x): x is number => x != null);
      return {
        rounds: n,
        avg_round_performance: +mean(last.map((p) => disp(p.perf)))!.toFixed(1),
        avg_strokes_vs_expectation: +mean(last.map((p) => p.expected - p.actual))!.toFixed(2),
        avg_pdga_round_rating: r.length ? Math.round(mean(r)!) : null,
      };
    };
    const last8 = preds.slice(-8);
    const custom = hooks.form?.(preds, disp, today);
    const formVal = custom ? custom.value : last8.length >= 5 ? mean(last8.map((p) => disp(p.perf)))! : null;
    const form = formVal == null ? null : formVal - disp(fin.mu);
    const resid = preds.slice(-30).map((p) => p.expected - p.actual);
    const m = mean(resid);
    const vol = resid.length >= 20 && m != null ? Math.sqrt(resid.reduce((a, x) => a + (x - m) ** 2, 0) / (resid.length - 1)) : null;
    const c90 = at(90);
    const state = {
      user_id: u, subject_id: null, model_version: MODEL,
      skill_latent: fin.mu, skill_sigma: fin.sigma, display_rating: disp(fin.mu), display_status: "UNCALIBRATED",
      rating_status: status, form_value: formVal, form_delta: form, form_rounds: last8.length, ...(custom?.extra ?? {}), confidence: conf(fin.sigma), trend: trendFrom(c90),
      change_30: at(30), change_90: c90, change_180: at(180), volatility: vol,
      eligible_rounds: preds.length, excluded_rounds: excluded, last_played_on: preds.at(-1)!.played_on,
      recent: { last5: recentBlock(5), last10: recentBlock(10), last20: recentBlock(20) },
      source_mix: sourceMix(preds, meta), coverage, input_basis: "canonical",
      state_hash: `${preds.length}:${fin.mu.toFixed(4)}:${fin.sigma.toFixed(4)}`,
      updated_at: new Date().toISOString(),
    };
    const layouts: Record<string, unknown>[] = [];
    const perLayout = new Map<string, Prediction[]>();
    for (const p of preds) if (p.layout_key && !p.layout_key.startsWith("er:")) perLayout.set(p.layout_key, [...(perLayout.get(p.layout_key) ?? []), p]);
    for (const [key, ps] of perLayout) {
      const L = res.layoutFinal.get(key);
      if (!L) continue;
      const expected = L.mu - fin.mu;
      const sd = Z80 * Math.sqrt(fin.sigma ** 2 + L.sigma ** 2 + 3 ** 2) * scale;
      layouts.push({
        user_id: u, layout_key: key, model_version: MODEL, layout_name: L.name ?? meta.get(ps[0].id)?.course_name ?? null, par: L.par,
        rounds_on_layout: L.n, player_rounds: ps.length, expected, likely_low: expected - sd, likely_high: expected + sd,
        layout_confidence: L.n >= 10 ? "High" : L.n >= 3 ? "Moderate" : "Low",
        best_score: Math.min(...ps.map((p) => p.actual)), avg_score: mean(ps.map((p) => p.actual)),
      });
    }
    out.set(u, { state, rounds, layouts });
  }
  return { players: out, interval_scale_80: scale };
}
