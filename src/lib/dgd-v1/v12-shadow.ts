/**
 * Phase 5A.5 — pure pieces of the V1.2 shadow champion: preview hooks,
 * weighted Form, source-conflict detection and connected-evidence tracing.
 * No database access; no V1.1 behaviour changes.
 */
import type { CandRound } from "./candidate";
import {
  CONTEXT_WEIGHT,
  FORM_WINDOW_V12,
  V12_SHADOW_MODEL_ID,
  formConfidenceV12,
  formDisplay,
  formValue,
  type V12Prediction,
} from "./candidate-v12";
import type { PreviewModelHooks } from "./shadow-preview";

export const V12_FORM_METHOD = "D_recency_uncertainty" as const;

const KNOWLEDGE: Record<string, string> = {
  ESTABLISHED_LAYOUT: "Established",
  PROVISIONAL_LAYOUT: "Learning",
  EXACT_LAYOUT: "New layout",
  EVENT_CONTEXT_ONLY: "Same-day field only",
  STRUCTURAL_CONTEXT_ONLY: "Par and holes only",
  INSUFFICIENT_CONTEXT: "Course details missing",
};

/** V1.2 Form on the display scale: recency + uncertainty weighted (method D). */
export function v12Form(preds: V12Prediction[], disp: (mu: number) => number, today: string) {
  const onScale = preds.map((p) => ({ ...p, perf: disp(p.perf) }));
  const value = formValue(onScale, V12_FORM_METHOD);
  const conf = formConfidenceV12(preds, today);
  const shown = formDisplay(value, conf.level);
  return {
    value,
    extra: {
      form_method: V12_FORM_METHOD,
      form_confidence: conf.level,
      form_state: shown.state,
      form_reliable_rounds: conf.reliable,
      form_effective_rounds: conf.effective,
    },
  };
}

export function v12Hooks(conflicts: Map<string, string> = new Map()): PreviewModelHooks {
  return {
    modelId: V12_SHADOW_MODEL_ID,
    layoutLevel: (p) => KNOWLEDGE[(p as V12Prediction).context_status] ?? "New layout",
    rowExtra: (m) => ({ source_conflict: conflicts.get(m.id) ?? null }),
    roundExtra: (p) => {
      const q = p as V12Prediction;
      return {
        context_status: q.context_status,
        field_known_players: q.field_others || null,
        field_known_scores: q.field_others || null,
        field_full_count: q.field_full_count ?? null,
        field_coverage_ratio: q.field_coverage_ratio ?? null,
        effective_field_count: q.effective_field_count ?? null,
        field_context_confidence: q.field_context_confidence ?? "NONE",
      };
    },
    form: (preds, disp, today) => v12Form(preds as V12Prediction[], disp, today),
  };
}

/** Round weights inside the current Form window (for admin inspection). */
export function formWeights(preds: Pick<V12Prediction, "id" | "obs_sigma" | "played_on" | "context_status">[]) {
  const w = preds.slice(-FORM_WINDOW_V12);
  if (!w.length) return [];
  const day = (s: string) => Date.parse(`${s.slice(0, 10)}T00:00:00Z`) / 86_400_000;
  const asOf = day(w[w.length - 1].played_on);
  const raw = w.map((p) => Math.pow(0.5, (asOf - day(p.played_on)) / 60) / p.obs_sigma ** 2);
  const sum = raw.reduce((a, b) => a + b, 0);
  return w.map((p, i) => ({ id: p.id, played_on: p.played_on, context: p.context_status, context_weight: CONTEXT_WEIGHT[p.context_status], share: sum ? raw[i] / sum : 0 }));
}

// ---------- source conflicts ----------

export type SourceConflict = {
  round_id: string;
  player: string;
  kind: "RATING_INCONSISTENT_WITH_LISTED_LAYOUT" | "AMBIGUOUS_LAYOUT_MATCH";
  detail: Record<string, unknown>;
};

/**
 * SOURCE_CONFLICT: PDGA's own data disagrees with itself. Within one
 * event-round-layout, PDGA round ratings fall on a straight line against
 * score. If a round's rating sits far off the line fitted from the other
 * players listed on the same layout, the listed layout (or the rating) is
 * inconsistent. Nothing is changed — the round is only flagged for review.
 */
export function detectRatingConflicts(rounds: CandRound[], erlOf: (r: CandRound) => string | null, threshold = 25, minOthers = 3): SourceConflict[] {
  const groups = new Map<string, CandRound[]>();
  for (const r of rounds) {
    const k = erlOf(r);
    if (k && r.round_rating != null) groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out: SourceConflict[] = [];
  for (const [k, g] of groups) {
    if (g.length < minOthers + 1) continue;
    for (const r of g) {
      const o = g.filter((x) => x.id !== r.id && x.player !== r.player);
      if (o.length < minOthers) continue;
      const mx = o.reduce((a, x) => a + x.score, 0) / o.length;
      const my = o.reduce((a, x) => a + (x.round_rating as number), 0) / o.length;
      const sxx = o.reduce((a, x) => a + (x.score - mx) ** 2, 0);
      if (sxx < 1) continue;
      const b = o.reduce((a, x) => a + (x.score - mx) * ((x.round_rating as number) - my), 0) / sxx;
      // PDGA ratings drop ~5–15 points per stroke; outside that the fit is unusable.
      if (b > -3 || b < -20) continue;
      const predicted = my + b * (r.score - mx);
      const gap = (r.round_rating as number) - predicted;
      if (Math.abs(gap) >= threshold) {
        out.push({ round_id: r.id, player: r.player, kind: "RATING_INCONSISTENT_WITH_LISTED_LAYOUT", detail: { erl: k, score: r.score, pdga_round_rating: r.round_rating, implied_by_others: Math.round(predicted), gap: Math.round(gap), others: o.length, points_per_stroke: +(-b).toFixed(1), layout_name: r.layout_name } });
      }
    }
  }
  return out;
}

// ---------- connected evidence ----------

/**
 * Admin trace: how player A's rounds reach player B. Each path is a shared
 * layout node or event-round-layout field, with the rounds on both sides.
 */
export function connectedEvidence(rounds: CandRound[], a: string, b: string, erlOf: (r: CandRound) => string | null) {
  const keyed = new Map<string, { a: CandRound[]; b: CandRound[] }>();
  for (const r of rounds) {
    if (r.player !== a && r.player !== b) continue;
    for (const k of [r.node ? `node:${r.node}` : null, erlOf(r)]) {
      if (!k) continue;
      const e = keyed.get(k) ?? { a: [], b: [] };
      (r.player === a ? e.a : e.b).push(r);
      keyed.set(k, e);
    }
  }
  return [...keyed.entries()]
    .filter(([, e]) => e.a.length && e.b.length)
    .map(([k, e]) => ({
      via: k.startsWith("node:") ? "shared_layout" : "same_event_round_layout",
      key: k,
      layout_name: e.a[0].layout_name ?? e.b[0].layout_name,
      from_rounds: e.a.map((r) => ({ id: r.id, played_on: r.played_on, score: r.score })),
      to_rounds: e.b.map((r) => ({ id: r.id, played_on: r.played_on, score: r.score })),
    }));
}
