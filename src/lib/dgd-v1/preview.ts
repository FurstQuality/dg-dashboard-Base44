/**
 * Phase 4 — turns a strict V1.1 backtest into the per-player preview read
 * model. Pure: no I/O, no new rating mathematics. The display value comes
 * from the shared engine transform so a calibrated scale can replace it later
 * without touching latent skill, history or events.
 */
import { DGD_V1_DEFAULT_CONFIG, confidenceFrom, toDisplay } from "./engine";
import { CANDIDATE_MODEL_ID, calibrateScale, type BacktestResult, type Prediction } from "./candidate";
import type { CalRow } from "./candidate-report";

const Z80 = 1.2816;
const TEAM_RE = /\b(doubles|dubs|team|scramble|best shot|mixed pairs)\b/i;

export type PreviewStatus = "rated" | "provisional" | "not_rated" | "excluded" | "pending_review";

/** Player-facing reason a round does or does not count toward DGD. */
export function roundStatus(row: Pick<CalRow, "score" | "round_rating" | "event_name" | "division">): {
  status: PreviewStatus;
  reason: string | null;
} {
  if (TEAM_RE.test(`${row.event_name ?? ""} ${row.division ?? ""}`)) return { status: "excluded", reason: "Doubles or team round" };
  if (row.score == null) return { status: "excluded", reason: "Incomplete score" };
  if (row.score < 18 || row.score > 130) return { status: "excluded", reason: "Score outside the normal range" };
  if (row.round_rating == null) return { status: "not_rated", reason: "PDGA hasn't rated this round yet" };
  return { status: "rated", reason: null };
}

export function layoutKnowledge(level: string): string {
  if (level === "L1_established") return "Established";
  if (level === "L2_provisional") return "Learning";
  return "New layout";
}

/** Direction over a window; ignores moves smaller than the noise threshold. */
export function trendFrom(change: number | null, threshold = 1): "improving" | "stable" | "declining" | "insufficient" {
  if (change == null) return "insufficient";
  if (change >= threshold) return "improving";
  if (change <= -threshold) return "declining";
  return "stable";
}

const disp = (mu: number) => toDisplay(mu, DGD_V1_DEFAULT_CONFIG);
const conf = (sigma: number) => confidenceFrom(sigma, DGD_V1_DEFAULT_CONFIG);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function buildPreview(
  res: BacktestResult,
  rows: CalRow[],
  subjects: { id: string; linked_user_id: string | null }[],
  today = new Date().toISOString().slice(0, 10),
) {
  const scale = calibrateScale(res.predictions.filter((p) => p.prior_events >= 1)) ?? 1;
  const byPlayer = new Map<string, Prediction[]>();
  for (const p of res.predictions) byPlayer.set(p.player, [...(byPlayer.get(p.player) ?? []), p]);
  const states: Record<string, unknown>[] = [];
  const rounds: Record<string, unknown>[] = [];
  const layouts: Record<string, unknown>[] = [];

  for (const s of subjects) {
    if (!s.linked_user_id) continue;
    const preds = byPlayer.get(`cal:${s.id}`) ?? [];
    const fin = res.final.get(`cal:${s.id}`);
    if (!fin || !preds.length) continue;
    const byId = new Map(preds.map((p) => [p.id, p]));
    const own = rows.filter((r) => r.subject_id === s.id);
    let excluded = 0;
    own.forEach((r) => {
      const p = byId.get(r.id);
      const st = roundStatus(r);
      if (!p) {
        if (st.status !== "rated") excluded++;
        rounds.push({
          user_id: s.linked_user_id, calibration_round_id: r.id, model_version: CANDIDATE_MODEL_ID, seq: 0,
          played_on: r.played_on, event_name: r.event_name, division: r.division, round_number: r.round_number,
          layout_name: r.layout_name, par: r.par, score: r.score ?? 0, pdga_round_rating: r.round_rating,
          status: st.status === "rated" ? "not_rated" : st.status, status_reason: st.reason ?? "Not part of this model run",
        });
        return;
      }
      const sd80 = Z80 * p.pred_sd * scale;
      rounds.push({
        user_id: s.linked_user_id, calibration_round_id: r.id, model_version: CANDIDATE_MODEL_ID,
        seq: preds.indexOf(p), played_on: r.played_on, event_name: r.event_name, division: r.division,
        round_number: r.round_number, layout_name: r.layout_name, layout_key: p.layout_key ?? null, par: r.par,
        score: p.actual, pdga_round_rating: r.round_rating,
        status: p.prior_events === 0 ? "provisional" : "rated",
        status_reason: p.prior_events === 0 ? "First round on record — DGD is still getting to know you" : null,
        layout_knowledge: layoutKnowledge(p.layout_level),
        pre_expected: p.expected, pre_strokes_vs_expectation: p.expected - p.actual,
        likely_low: p.expected - sd80, likely_high: p.expected + sd80,
        ctx_expected: p.ctx_expected, ctx_strokes_vs_expectation: p.ctx_expected == null ? null : p.ctx_expected - p.actual,
        event_adjustment: p.event_round_adjustment,
        round_performance_display: disp(p.perf), display_before: disp(p.mu_before), display_after: disp(p.mu_after),
        confidence_before: conf(p.prior_sigma),
        confidence_after: conf(Math.sqrt((1 - p.gain) * p.prior_sigma ** 2)),
      });
    });

    const at = (days: number) => {
      const cut = new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
      const before = preds.filter((p) => p.played_on <= cut).at(-1);
      return before ? disp(fin.mu) - disp(before.mu_after) : null;
    };
    const recentBlock = (n: number) => {
      const last = preds.slice(-n);
      return last.length < n
        ? null
        : {
            rounds: n,
            avg_round_performance: +mean(last.map((p) => disp(p.perf)))!.toFixed(1),
            avg_strokes_vs_expectation: +mean(last.map((p) => p.expected - p.actual))!.toFixed(2),
            avg_pdga_round_rating: (() => {
              const r = last.map((p) => p.round_rating).filter((x): x is number => x != null);
              return r.length ? Math.round(mean(r)!) : null;
            })(),
          };
    };
    const last8 = preds.slice(-8);
    const form = last8.length >= 5 ? mean(last8.map((p) => disp(p.perf)))! - disp(fin.mu) : null;
    const resid = preds.slice(-30).map((p) => p.expected - p.actual);
    const m = mean(resid);
    const vol = resid.length >= 20 && m != null ? Math.sqrt(resid.reduce((a, x) => a + (x - m) ** 2, 0) / (resid.length - 1)) : null;
    const c90 = at(90);
    states.push({
      user_id: s.linked_user_id, subject_id: s.id, model_version: CANDIDATE_MODEL_ID,
      skill_latent: fin.mu, skill_sigma: fin.sigma, display_rating: disp(fin.mu), display_status: "UNCALIBRATED",
      form_delta: form, form_rounds: last8.length, confidence: conf(fin.sigma), trend: trendFrom(c90),
      change_30: at(30), change_90: c90, change_180: at(180), volatility: vol,
      eligible_rounds: preds.length, excluded_rounds: excluded, last_played_on: preds.at(-1)!.played_on,
      recent: { last5: recentBlock(5), last10: recentBlock(10), last20: recentBlock(20) },
      updated_at: new Date().toISOString(),
    });

    const perLayout = new Map<string, Prediction[]>();
    for (const p of preds) if (p.layout_key) perLayout.set(p.layout_key, [...(perLayout.get(p.layout_key) ?? []), p]);
    for (const [key, ps] of perLayout) {
      const L = res.layoutFinal.get(key);
      if (!L) continue;
      const expected = L.mu - fin.mu;
      const sd = Z80 * Math.sqrt(fin.sigma ** 2 + L.sigma ** 2 + 3 ** 2) * scale;
      layouts.push({
        user_id: s.linked_user_id, layout_key: key, model_version: CANDIDATE_MODEL_ID, layout_name: L.name, par: L.par,
        rounds_on_layout: L.n, player_rounds: ps.length, expected, likely_low: expected - sd, likely_high: expected + sd,
        layout_confidence: L.n >= 10 ? "High" : L.n >= 3 ? "Moderate" : "Low",
        best_score: Math.min(...ps.map((p) => p.actual)), avg_score: mean(ps.map((p) => p.actual)),
      });
    }
  }
  return { states, rounds, layouts, interval_scale_80: scale };
}
