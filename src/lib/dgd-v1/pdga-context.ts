/**
 * Phase 5A.4 — PDGA course/layout context recovery. Pure and browser-safe.
 * Matches imported PDGA rows to PDGA player-details rows (which list the
 * layout pools played) and classifies each round's context. Never invents
 * holes, par or layout; UNKNOWN stays UNKNOWN.
 */

export type ExtPdgaRow = {
  id: string;
  user_id: string;
  pdga_event_ref: string | null;
  event_name: string | null;
  played_on: string;
  division: string | null;
  score: number | null;
};

export type DetailRow = {
  id: string;
  pdga_event_id: string | null;
  event_name: string | null;
  played_on: string;
  division: string | null;
  round_number: number | null;
  score: number | null;
  layout_node_ids: string[];
  layout_name: string | null;
  hole_count: number | null;
  par: number | null;
  distance_ft: number | null;
  source_url: string | null;
  fetched_at: string | null;
};

export type MatchMethod = "EXACT" | "SAME_SCORE_AGREED" | "AMBIGUOUS";

export type RoundContextRecord = {
  external_round_id: string;
  user_id: string;
  pdga_event_id: string | null;
  event_name: string | null;
  played_on: string;
  round_number: number | null;
  division: string | null;
  pool_count: number;
  layout_node_ids: string[];
  layout_name: string | null;
  hole_count: number | null;
  par: number | null;
  distance_ft: number | null;
  match_method: MatchMethod;
  provenance: "pdga_player_details";
  source_url: string | null;
  source_row_id: string | null;
  source_fetched_at: string | null;
};

const normDiv = (d: string | null) => (d ?? "").trim().toUpperCase();
const sameContext = (a: DetailRow, b: DetailRow) =>
  a.layout_node_ids.join(",") === b.layout_node_ids.join(",") && a.par === b.par && a.hole_count === b.hole_count && a.distance_ft === b.distance_ft;

/**
 * One detail row per imported row. Key: event + score, preferring the same
 * division. When several detail rows share that key (two rounds with the
 * same score) they are assigned in round order; if their context differs the
 * match is AMBIGUOUS and only the round-independent fields are kept.
 */
export function matchPdgaContext(ext: ExtPdgaRow[], detail: DetailRow[]): RoundContextRecord[] {
  // Detail rows come from the player's own PDGA page, so event + score is
  // enough; a matching division is preferred when several rows qualify
  // (imports sometimes carry a placeholder division such as "XC").
  const key = (e: string | null, _div: string | null, score: number | null) => `${e ?? ""}|${score ?? ""}`;
  const pool = new Map<string, DetailRow[]>();
  for (const d of [...detail].sort((a, b) => (a.round_number ?? 0) - (b.round_number ?? 0) || a.id.localeCompare(b.id))) {
    if (!d.pdga_event_id || d.score == null) continue;
    const k = key(d.pdga_event_id, d.division, d.score);
    pool.set(k, [...(pool.get(k) ?? []), d]);
  }
  // Ambiguity is decided on the full group, before any row is assigned.
  const groupMethod = new Map<string, MatchMethod>();
  for (const [k, g] of pool) groupMethod.set(k, g.length === 1 ? "EXACT" : g.every((o) => sameContext(o, g[0])) ? "SAME_SCORE_AGREED" : "AMBIGUOUS");
  const out: RoundContextRecord[] = [];
  const sortedExt = [...ext].sort((a, b) => a.played_on.localeCompare(b.played_on) || a.id.localeCompare(b.id));
  for (const e of sortedExt) {
    if (!e.pdga_event_ref || e.score == null) continue;
    const k = key(e.pdga_event_ref, e.division, e.score);
    const cands = pool.get(k);
    if (!cands?.length) continue;
    const di = Math.max(0, cands.findIndex((c) => normDiv(c.division) === normDiv(e.division)));
    const d = cands.splice(di, 1)[0];
    const method = groupMethod.get(k)!;
    const amb = method === "AMBIGUOUS";
    out.push({
      external_round_id: e.id,
      user_id: e.user_id,
      pdga_event_id: d.pdga_event_id,
      event_name: d.event_name,
      played_on: d.played_on,
      round_number: amb ? null : d.round_number,
      division: d.division,
      pool_count: amb ? 0 : d.layout_node_ids.length,
      layout_node_ids: amb ? [] : d.layout_node_ids,
      layout_name: amb ? null : d.layout_name,
      hole_count: amb ? null : d.hole_count,
      par: amb ? null : d.par,
      distance_ft: amb ? null : d.distance_ft,
      match_method: method,
      provenance: "pdga_player_details",
      source_url: d.source_url,
      source_row_id: d.id,
      source_fetched_at: d.fetched_at,
    });
  }
  return out;
}

export type ContextStatus =
  | "EXACT_LAYOUT"
  | "ESTABLISHED_LAYOUT"
  | "PROVISIONAL_LAYOUT"
  | "EVENT_CONTEXT_ONLY"
  | "STRUCTURAL_CONTEXT_ONLY"
  | "INSUFFICIENT_CONTEXT";

export const CONTEXT_STATUSES: ContextStatus[] = [
  "ESTABLISHED_LAYOUT",
  "PROVISIONAL_LAYOUT",
  "EXACT_LAYOUT",
  "EVENT_CONTEXT_ONLY",
  "STRUCTURAL_CONTEXT_ONLY",
  "INSUFFICIENT_CONTEXT",
];

export type ContextInputs = {
  layout_known: boolean;
  layout_rounds_before: number;
  hole_count: number | null;
  par: number | null;
  distance_ft: number | null;
  field_others: number;
};

/**
 * Context state at forecast time. Layout known: ESTABLISHED (10+ prior
 * rounds), PROVISIONAL (1–9), EXACT (first look at a known layout). Without a
 * layout: same-event field → EVENT_CONTEXT_ONLY; real par+holes →
 * STRUCTURAL_CONTEXT_ONLY; otherwise INSUFFICIENT_CONTEXT.
 */
export function contextStatus(x: ContextInputs): ContextStatus {
  if (x.layout_known) {
    if (x.layout_rounds_before >= 10) return "ESTABLISHED_LAYOUT";
    if (x.layout_rounds_before >= 1) return "PROVISIONAL_LAYOUT";
    return "EXACT_LAYOUT";
  }
  if (x.field_others >= 2) return "EVENT_CONTEXT_ONLY";
  if (x.par != null && x.hole_count != null) return "STRUCTURAL_CONTEXT_ONLY";
  return "INSUFFICIENT_CONTEXT";
}

/**
 * Event-round-layout identity: event + round + the physical layout. Divisions
 * share a group only through the same single layout node; rounds with
 * multiple possible pools or no layout never join a group.
 */
export function eventRoundLayoutKey(r: { event: string; round_number: number | null; node: string | null }): string | null {
  if (!r.node || r.round_number == null) return null;
  return `${r.event}|r${r.round_number}|${r.node}`;
}

/** Earliest date whose context changed between two snapshots (null = nothing to replay). */
export function contextReplayFrom(
  prev: Map<string, Pick<RoundContextRecord, "layout_node_ids" | "par" | "hole_count" | "distance_ft" | "played_on">>,
  next: Map<string, Pick<RoundContextRecord, "layout_node_ids" | "par" | "hole_count" | "distance_ft" | "played_on">>,
): string | null {
  let from: string | null = null;
  const sig = (r?: { layout_node_ids: string[]; par: number | null; hole_count: number | null; distance_ft: number | null }) =>
    r ? `${r.layout_node_ids.join(",")}|${r.par}|${r.hole_count}|${r.distance_ft}` : "none";
  for (const id of new Set([...prev.keys(), ...next.keys()])) {
    const a = prev.get(id);
    const b = next.get(id);
    if (sig(a) === sig(b)) continue;
    const d = (b ?? a)!.played_on;
    if (!from || d < from) from = d;
  }
  return from;
}

/** Coverage report over context records + the imported PDGA rows they came from. */
export function contextCoverage(totalPdga: number, recs: Pick<RoundContextRecord, "layout_node_ids" | "hole_count" | "par" | "distance_ft" | "match_method">[]) {
  const pct = (n: number) => (totalPdga ? +((100 * n) / totalPdga).toFixed(1) : 0);
  const single = recs.filter((r) => r.layout_node_ids.length === 1).length;
  const multi = recs.filter((r) => r.layout_node_ids.length > 1).length;
  return {
    total_pdga_rows: totalPdga,
    matched: recs.length,
    unmatched: totalPdga - recs.length,
    single_layout: single,
    single_layout_pct: pct(single),
    multiple_possible_pools: multi,
    ambiguous_match: recs.filter((r) => r.match_method === "AMBIGUOUS").length,
    hole_count_pct: pct(recs.filter((r) => r.hole_count != null).length),
    par_pct: pct(recs.filter((r) => r.par != null).length),
    length_pct: pct(recs.filter((r) => r.distance_ft != null).length),
  };
}
