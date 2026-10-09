/**
 * Phase 5A — source-agnostic V1.1 input. Pure: turns canonical physical
 * rounds (PDGA, UDisc, DG Dashboard native) into V1.1 candidate rounds without
 * touching V1.1 mathematics. One canonical round = at most one observation.
 */
import type { CandRound, Prediction } from "./candidate";
import type { CanonicalRoundInput, EligibilityResult } from "./engine";
import { isUdiscRatingEligible } from "@/lib/udisc-eligibility";

/** Most specific exclusion among a round's UDisc records. */
export function udiscExclusionCode(classes: (string | null | undefined)[]): string {
  if (classes.some((c) => c === "DOUBLES" || c === "TEAM")) return "TEAM_OR_DOUBLES";
  if (classes.some((c) => c === "SINGLES_SOLO")) return "SOLO_ROUND";
  return "UNKNOWN_FORMAT";
}

export type ShadowSource = "pdga" | "udisc" | "app";
export type RoundCategory = "sanctioned_tournament" | "unsanctioned_tournament" | "league" | "casual" | "practice";
export type RatingStatus = "UNRATED" | "PROVISIONAL" | "ESTABLISHED";

/** Preview-only evidence thresholds; revisited during Phase 5B calibration. */
export const STATUS_RULES = { established_min_rounds: 8, established_max_sigma: 6 } as const;

export type RoundMeta = {
  id: string;
  user_id: string;
  played_on: string;
  sources: ShadowSource[];
  origin: ShadowSource;
  category: RoundCategory;
  course_name: string | null;
  layout_name: string | null;
  event_name: string | null;
  division: string | null;
  par: number | null;
  score: number | null;
  pdga_round_rating: number | null;
  /** Native UDisc rating, source-owned; never replaced by a DGD value. */
  udisc_round_rating: number | null;
  legacy_round_rating: number | null;
  state: EligibilityResult["state"];
  reason_codes: string[];
  duplicate_of: string | null;
};

export type ExternalMeta = {
  id: string;
  event_name: string | null;
  pdga_event_ref: string | null;
  division: string | null;
  round_rating: number | null;
  chainlink_rating: number | null;
  source?: string | null;
  round_format_class?: string | null;
  /** PDGA "counts toward current official rating" flag. A PDGA concept only. */
  included?: boolean | null;
  format?: string | null;
};

/**
 * Phase 5A.2 addendum: PDGA's current-rating-window status never decides DGD
 * eligibility. A canonical round marked ineligible only because every PDGA
 * record says included=false (singles, no other source) is restored to
 * "rated" so the model can use it. The PDGA flag itself is left untouched;
 * duplicate, score, layout and import-artifact checks still apply downstream.
 */
export function restoreHistoricalPdga(rounds: CanonicalRoundInput[], ext: Map<string, ExternalMeta>): { rounds: CanonicalRoundInput[]; restored: Set<string> } {
  const restored = new Set<string>();
  const out = rounds.map((r) => {
    if (r.canonical_eligibility !== "ineligible" || (r.format ?? "singles") !== "singles") return r;
    const rows = r.sources.filter((s) => s.source_table === "external_rounds").map((s) => ext.get(s.source_row_id));
    if (!rows.length || rows.some((x) => !x)) return r;
    const pdga = rows.filter((x) => x!.source === "pdga");
    if (!pdga.length || pdga.length !== rows.length) return r;
    if (!pdga.every((x) => x!.included === false && (x!.format ?? "singles") === "singles")) return r;
    restored.add(r.id);
    return { ...r, canonical_eligibility: "rated" as const };
  });
  return { rounds: out, restored };
}

const SOURCE_ORDER: ShadowSource[] = ["pdga", "udisc", "app"];
const norm = (s: string): ShadowSource | null => (s === "pdga" ? "pdga" : s === "udisc" ? "udisc" : s === "app" ? "app" : null);
const LEAGUE_RE = /\b(league|weekly|glow|night|doubles night|bag tag|tag)\b/i;
const TOURNEY_RE = /\b(open|classic|championship|tournament|invitational|series|cup)\b/i;

/** Stable 31-bit hash, used only to keep unrelated rounds in separate groups. */
export function hash31(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 2_000_000_000;
}

export function roundCategory(sources: ShadowSource[], eventName: string | null, practice: boolean): RoundCategory {
  if (practice) return "practice";
  if (sources.includes("pdga")) return "sanctioned_tournament";
  if (eventName && LEAGUE_RE.test(eventName)) return "league";
  if (eventName && TOURNEY_RE.test(eventName)) return "unsanctioned_tournament";
  return "casual";
}

/**
 * Builds candidate rounds plus display metadata. Eligibility comes from the
 * shared V1 rules (source-agnostic). A safety pass collapses exact twins
 * (same player, day, score, course) that canonicalization left separate and
 * unresolved, so a physical round never influences DGD twice.
 */
export function toShadowRounds(
  rounds: CanonicalRoundInput[],
  elig: EligibilityResult[],
  ext: Map<string, ExternalMeta>,
  opts: { udiscRule?: boolean } = {},
): { cand: CandRound[]; meta: Map<string, RoundMeta> } {
  const eById = new Map(elig.map((e) => [e.canonical_round_id, e]));
  const meta = new Map<string, RoundMeta>();
  const twins = new Map<string, string>();
  const sorted = [...rounds].sort((a, b) => b.sources.length - a.sources.length || a.id.localeCompare(b.id));
  const cand: CandRound[] = [];
  const eventOrdinal = new Map<string, number>();

  for (const r of sorted) {
    const e = eById.get(r.id);
    const srcs = [...new Set(r.sources.map((s) => norm(s.source)).filter((x): x is ShadowSource => !!x))].sort(
      (a, b) => SOURCE_ORDER.indexOf(a) - SOURCE_ORDER.indexOf(b),
    );
    const extRows = r.sources.filter((s) => s.source_table === "external_rounds").map((s) => ext.get(s.source_row_id)).filter(Boolean) as ExternalMeta[];
    const pdgaExt = extRows.find((x) => x.pdga_event_ref) ?? null;
    const eventName = pdgaExt?.event_name ?? extRows.find((x) => x.event_name)?.event_name ?? null;
    const pdgaRating = r.sources.find((s) => s.source === "pdga")?.source_round_rating ?? pdgaExt?.round_rating ?? null;
    const udiscExt = extRows.filter((x) => x.source === "udisc");
    const udiscRating = r.sources.find((s) => s.source === "udisc")?.source_round_rating ?? udiscExt.find((x) => x.round_rating != null)?.round_rating ?? null;
    // UDisc preservation rule: UDisc-only evidence counts only for singles with 2+ players.
    const udiscBlock = opts.udiscRule !== false && !srcs.includes("pdga") && udiscExt.length > 0 && !udiscExt.some((x) => isUdiscRatingEligible(x.round_format_class))
      ? udiscExclusionCode(udiscExt.map((x) => x.round_format_class))
      : null;
    const legacy = extRows.find((x) => x.chainlink_rating != null)?.chainlink_rating ?? pdgaRating;
    const m: RoundMeta = {
      id: r.id, user_id: r.user_id, played_on: r.played_on, sources: srcs.length ? srcs : ["app"], origin: srcs[0] ?? "app",
      category: roundCategory(srcs, eventName, r.canonical_eligibility === "practice"),
      course_name: r.course_name, layout_name: r.layout_name, event_name: eventName,
      division: pdgaExt?.division ?? extRows.find((x) => x.division)?.division ?? null,
      par: r.par_played ?? null, score: r.score, pdga_round_rating: pdgaRating, udisc_round_rating: udiscRating, legacy_round_rating: legacy,
      state: e?.state ?? "INELIGIBLE", reason_codes: e?.reason_codes ?? ["OTHER"], duplicate_of: null,
    };
    if (udiscBlock && m.state === "ELIGIBLE") {
      m.state = "EXCLUDED";
      m.reason_codes = [udiscBlock];
    }
    const twinKey = `${r.user_id}|${r.played_on}|${r.score}|${r.course_key ?? ""}`;
    if (r.score != null && r.course_key && r.duplicate_resolution !== "KEEP_SEPARATE") {
      const first = twins.get(twinKey);
      if (first) {
        m.state = "EXCLUDED";
        m.reason_codes = ["DUPLICATE"];
        m.duplicate_of = first;
      } else twins.set(twinKey, r.id);
    }
    meta.set(r.id, m);
    if (m.state !== "ELIGIBLE" || r.score == null || !e) continue;

    // Field context only for a real shared event round; casual rounds get a
    // unique group so unrelated players at the same course never form a field.
    let event: string;
    let roundNumber: number;
    if (pdgaExt?.pdga_event_ref) {
      const ek = `pdga:${pdgaExt.pdga_event_ref}|${r.played_on}|${r.user_id}`;
      const ord = (eventOrdinal.get(ek) ?? 0) + 1;
      eventOrdinal.set(ek, ord);
      event = `pdga:${pdgaExt.pdga_event_ref}`;
      roundNumber = (hash31(event) % 10_000_000) * 10 + ord;
    } else {
      event = `round:${r.id}`;
      roundNumber = 2_000_000_000 + (hash31(r.id) % 100_000_000);
    }
    cand.push({
      id: r.id, player: r.user_id, played_on: r.played_on, event, round_number: roundNumber,
      division: m.division, score: r.score, round_rating: pdgaRating,
      node: e.layout_known && e.layout_key ? e.layout_key : null,
      pools: e.layout_known ? 1 : r.layout_mapping === "POSSIBLE" ? 2 : 0,
      layout_name: r.layout_name ?? r.course_name, par: r.par_played ?? null, holes: r.hole_count, distance_ft: null,
    });
  }
  return { cand, meta };
}

export function ratingStatus(eligible: number, sigma: number | null): RatingStatus {
  if (!eligible || sigma == null) return "UNRATED";
  if (eligible >= STATUS_RULES.established_min_rounds && sigma <= STATUS_RULES.established_max_sigma) return "ESTABLISHED";
  return "PROVISIONAL";
}

export type Coverage = {
  physical_rounds: number;
  pdga: number;
  udisc: number;
  app: number;
  multi_source: number;
  eligible: number;
  ineligible: number;
  pending_review: number;
  source_records: number;
};

/** Per-player coverage. Source counts are physical rounds touched by a source, never summed into a total. */
export function coverageFor(metas: RoundMeta[]): Coverage {
  const c: Coverage = { physical_rounds: metas.length, pdga: 0, udisc: 0, app: 0, multi_source: 0, eligible: 0, ineligible: 0, pending_review: 0, source_records: 0 };
  for (const m of metas) {
    for (const s of m.sources) c[s]++;
    c.source_records += m.sources.length;
    if (m.sources.length > 1) c.multi_source++;
    if (m.state === "ELIGIBLE") c.eligible++;
    else if (m.state === "PENDING_REVIEW") c.pending_review++;
    else c.ineligible++;
  }
  return c;
}

/** Diagnostic only — share of effective evidence (Kalman gain) by origin. Never feeds the rating. */
export function sourceMix(preds: Prediction[], meta: Map<string, RoundMeta>) {
  const acc: Record<string, number> = { pdga: 0, udisc: 0, app: 0, multi_source: 0 };
  let tot = 0;
  for (const p of preds) {
    const m = meta.get(p.id);
    if (!m) continue;
    const k = m.sources.length > 1 ? "multi_source" : m.origin;
    acc[k] += p.gain;
    tot += p.gain;
  }
  return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, tot ? +(v / tot).toFixed(3) : 0]));
}

/** Eligibility rate and reason distribution per origin source. */
export function sourceQuality(metas: RoundMeta[]) {
  const out: Record<string, { rounds: number; eligible: number; rate: number | null; reasons: Record<string, number> }> = {};
  for (const s of SOURCE_ORDER) out[s] = { rounds: 0, eligible: 0, rate: null, reasons: {} };
  for (const m of metas) {
    for (const s of m.sources) {
      const o = out[s];
      o.rounds++;
      if (m.state === "ELIGIBLE") o.eligible++;
      else for (const code of m.reason_codes.length ? m.reason_codes : [m.state]) o.reasons[code] = (o.reasons[code] ?? 0) + 1;
    }
  }
  for (const o of Object.values(out)) o.rate = o.rounds ? +(o.eligible / o.rounds).toFixed(3) : null;
  return out;
}

/**
 * Residual (expected − actual) by origin, stratified by layout knowledge and
 * category. Excludes first rounds (no prior). Analysis input only.
 */
export function residualsBySource(preds: Prediction[], meta: Map<string, RoundMeta>) {
  type Acc = { n: number; sum: number; ss: number };
  const groups = new Map<string, Acc>();
  const add = (k: string, x: number) => {
    const g = groups.get(k) ?? { n: 0, sum: 0, ss: 0 };
    g.n++; g.sum += x; g.ss += x * x;
    groups.set(k, g);
  };
  for (const p of preds) {
    if (p.prior_events < 1) continue;
    const m = meta.get(p.id);
    if (!m) continue;
    const src = m.sources.length > 1 ? "multi_source" : m.origin;
    const x = p.expected - p.actual;
    add(`${src}`, x);
    add(`${src}|layout:${p.layout_level}`, x);
    add(`${src}|category:${m.category}`, x);
  }
  return [...groups.entries()]
    .map(([key, g]) => {
      const mean = g.sum / g.n;
      const sd = g.n > 1 ? Math.sqrt(Math.max(0, (g.ss - g.n * mean * mean) / (g.n - 1))) : null;
      const se = sd != null ? sd / Math.sqrt(g.n) : null;
      return { key, n: g.n, mean_residual: +mean.toFixed(2), ci95: se != null ? [+(mean - 1.96 * se).toFixed(2), +(mean + 1.96 * se).toFixed(2)] : null };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Stable fingerprint of a stored round row (for diff-only writes). */
export function rowHash(row: Record<string, unknown>) {
  const keys = Object.keys(row).filter((k) => k !== "row_hash" && k !== "created_at").sort();
  return hash31(keys.map((k) => `${k}=${typeof row[k] === "number" ? (row[k] as number).toFixed(4) : String(row[k])}`).join("&")).toString(36);
}

/** Decides incremental vs replay from the earliest changed row. */
export function replayMode(changedDates: string[], lastProcessed: string | null): { mode: "noop" | "full_build" | "incremental" | "historical_replay"; from: string | null } {
  if (!changedDates.length) return { mode: "noop", from: null };
  const from = [...changedDates].sort()[0];
  if (!lastProcessed) return { mode: "full_build", from };
  if (from > lastProcessed) return { mode: "incremental", from };
  return { mode: "historical_replay", from };
}
