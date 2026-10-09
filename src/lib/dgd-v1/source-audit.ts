/**
 * Phase 5A.1 — admin-only source-integrity diagnostics for the ONE unified
 * DGD player model. Pure and read-only: nothing here feeds the rating, and
 * per-source numbers are evidence shares, never separate DGD ratings.
 */
import type { Prediction } from "./candidate";
import type { RoundMeta } from "./shadow-input";

export type RoundContext = { hole_count_origin: "known" | "inferred" | "unknown" };

const originKey = (m: RoundMeta) => (m.sources.length > 1 ? "multi_source" : m.origin);

type Acc = { n: number; sum: number; abs: number };
const acc = () => ({ n: 0, sum: 0, abs: 0 }) as Acc;
const push = (a: Acc, x: number) => ((a.n++, (a.sum += x), (a.abs += Math.abs(x))), a);
const fin = (a: Acc) => ({ n: a.n, mean_residual: a.n ? +(a.sum / a.n).toFixed(2) : null, mae: a.n ? +(a.abs / a.n).toFixed(2) : null });

/** Residual = expected − actual (positive = played better than expected). First rounds excluded. */
export function residualTable(preds: Prediction[], meta: Map<string, RoundMeta>, ctx: Map<string, RoundContext>) {
  const groups = new Map<string, Acc>();
  const add = (k: string, x: number) => push(groups.get(k) ?? (groups.set(k, acc()), groups.get(k)!), x);
  for (const p of preds) {
    if (p.prior_events < 1) continue;
    const m = meta.get(p.id);
    if (!m) continue;
    const src = originKey(m);
    const x = p.expected - p.actual;
    const dims: Record<string, string> = {
      mapping: p.mapping === "EXACT" || p.mapping === "HIGH_CONFIDENCE" ? "exact" : p.mapping === "POSSIBLE" ? "provisional" : "unknown",
      holes: ctx.get(p.id)?.hole_count_origin ?? "unknown",
      event: m.category === "sanctioned_tournament" || m.category === "unsanctioned_tournament" ? "tournament" : m.category === "league" ? "league" : m.category === "practice" ? "practice" : "casual_multi_player",
      layout: p.layout_rounds_before >= 3 ? "established" : "cold_start",
    };
    add(`all|source:${src}`, x);
    for (const [d, v] of Object.entries(dims)) {
      add(`${d}:${v}|source:${src}`, x);
      add(`${d}:${v}|source:all`, x);
    }
  }
  return [...groups.entries()].map(([key, a]) => ({ key, ...fin(a) })).sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Effective observation count. Kish n_eff on the update gains measures how
 * concentrated influence is; same-day clusters show correlated repetition.
 */
export function effectiveEvidence(preds: Prediction[]) {
  const g = preds.map((p) => p.gain);
  const s = g.reduce((a, b) => a + b, 0);
  const s2 = g.reduce((a, b) => a + b * b, 0);
  const days = new Set(preds.map((p) => p.played_on)).size;
  return { raw_rounds: preds.length, distinct_days: days, kish_effective: s2 ? +((s * s) / s2).toFixed(1) : 0, total_gain: +s.toFixed(2) };
}

export function playerSourceAudit(u: string, metas: RoundMeta[], preds: Prediction[]) {
  const own = metas.filter((m) => m.user_id === u);
  const mine = preds.filter((p) => p.player === u);
  const metaById = new Map(own.map((m) => [m.id, m]));
  const eligible = own.filter((m) => m.state === "ELIGIBLE" && mine.some((p) => p.id === m.id));
  const only = (s: string) => eligible.filter((m) => m.sources.length === 1 && m.sources[0] === s).length;
  const excluded: Record<string, Record<string, number>> = {};
  for (const m of own) {
    if (m.state === "ELIGIBLE") continue;
    for (const s of m.sources) {
      const bucket = (excluded[s] ??= {});
      for (const c of m.reason_codes.length ? m.reason_codes : [m.state]) bucket[c] = (bucket[c] ?? 0) + 1;
    }
  }
  const mix = (ps: Prediction[]) => {
    const out: Record<string, number> = { pdga: 0, udisc: 0, app: 0, multi_source: 0 };
    for (const p of ps) {
      const m = metaById.get(p.id);
      if (m) out[originKey(m)]++;
    }
    return out;
  };
  const gainBy: Record<string, number> = { pdga: 0, udisc: 0, app: 0, multi_source: 0 };
  let tot = 0;
  for (const p of mine) {
    const m = metaById.get(p.id);
    if (!m) continue;
    gainBy[originKey(m)] += p.gain;
    tot += p.gain;
  }
  return {
    eligible_physical_rounds: eligible.length,
    sources_touching_eligible: {
      pdga: eligible.filter((m) => m.sources.includes("pdga")).length,
      udisc: eligible.filter((m) => m.sources.includes("udisc")).length,
      app: eligible.filter((m) => m.sources.includes("app")).length,
    },
    pdga_only: only("pdga"),
    udisc_only: only("udisc"),
    app_only: only("app"),
    multi_source: eligible.filter((m) => m.sources.length > 1).length,
    effective_evidence_share: Object.fromEntries(Object.entries(gainBy).map(([k, v]) => [k, tot ? +(v / tot).toFixed(3) : 0])),
    recent20_mix: mix(mine.slice(-20)),
    form_mix: mix(mine.slice(-8)),
    excluded_by_source: excluded,
    evidence: effectiveEvidence(mine),
  };
}

/** Same-day groups of eligible UDisc rounds: listed for review, never auto-linked. */
export function sameDayUdisc(metas: RoundMeta[]) {
  const g = new Map<string, RoundMeta[]>();
  for (const m of metas) {
    if (m.state !== "ELIGIBLE" || !m.sources.includes("udisc")) continue;
    const k = `${m.user_id}|${m.played_on}`;
    g.set(k, [...(g.get(k) ?? []), m]);
  }
  const groups = [...g.values()].filter((x) => x.length > 1);
  return {
    groups: groups.length,
    rounds: groups.reduce((a, x) => a + x.length, 0),
    identical_score_same_course: groups.filter((x) => new Set(x.map((m) => `${m.score}|${m.course_name}|${m.layout_name}`)).size < x.length).length,
  };
}

export function pearson(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sx += (xs[i] - mx) ** 2;
    sy += (ys[i] - my) ** 2;
  }
  return sx && sy ? +(sxy / Math.sqrt(sx * sy)).toFixed(3) : null;
}
const ranks = (xs: number[]) => {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return r as number[];
};
export const spearman = (xs: number[], ys: number[]) => (xs.length < 3 ? null : pearson(ranks(xs), ranks(ys)));
