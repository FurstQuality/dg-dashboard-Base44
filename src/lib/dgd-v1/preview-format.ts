/**
 * Phase 4 — player-facing wording for the DGD preview. Pure and browser-safe.
 * Components display values supplied by the read layer; nothing here converts
 * latent skill into a rating.
 */

export type DgdModelView = "production" | "preview";
export const DGD_MODEL_STORAGE_KEY = "dgd:model-view";

/** Preview is only shown to authorized users who chose it and have data; otherwise Production. */
export function resolveModelView(choice: DgdModelView | null, allowed: boolean, available: boolean): DgdModelView {
  return allowed && available && choice === "preview" ? "preview" : "production";
}

export const SOURCE_BADGES = {
  pdga: { label: "OFFICIAL PDGA", tone: "border-primary/40 bg-primary/10 text-primary" },
  udisc: { label: "UDISC", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
  dgd: { label: "DGD NATIVE", tone: "border-accent/40 bg-accent/10 text-accent" },
} as const;

export const STATUS_LABEL: Record<string, string> = {
  rated: "Rated",
  provisional: "Provisional",
  not_rated: "Not rated",
  pending_review: "Pending review",
  excluded: "Excluded",
};

const fmt = (n: number, d = 1) => (Number.isInteger(n) ? String(Math.abs(n)) : Math.abs(n).toFixed(d));

/** "Beat expectation by 2.7" / "1.3 over expectation" — positive means better than expected. */
export function strokesVsExpectation(v: number | null | undefined): string | null {
  if (v == null) return null;
  if (Math.abs(v) < 0.05) return "Right on expectation";
  return v > 0 ? `${fmt(v)} better than expected` : `${fmt(v)} worse than expected`;
}

/** FORM_VALUE is a level on the Skill scale; FORM_MINUS_SKILL is a difference. Never show the difference as "Form". */
export function formLabels(formValue: number | null | undefined, formMinusSkill: number | null | undefined, rounds: number) {
  const ok = rounds >= 5 && formValue != null && formMinusSkill != null;
  return {
    form: { label: "Form", value: ok ? fmt(formValue!) : null },
    vsSkill: { label: "Form vs Rating", value: ok ? `${formMinusSkill! >= 0 ? "+" : "−"}${fmt(formMinusSkill!)}` : null },
  };
}

export function formWording(delta: number | null | undefined, rounds: number): { label: string; value: string | null } {
  if (delta == null || rounds < 5) return { label: "Not enough recent rounds", value: null };
  if (Math.abs(delta) < 1) return { label: "In line with rating", value: `${delta >= 0 ? "+" : "−"}${fmt(delta)}` };
  return { label: delta > 0 ? "Above rating" : "Below rating", value: `${delta > 0 ? "+" : "−"}${fmt(delta)}` };
}

export function confidenceBand(c: number | null | undefined): string {
  if (c == null) return "Unknown";
  if (c >= 85) return "High";
  if (c >= 65) return "Moderate";
  return "Low";
}

/** Tiny movements are reported as steady so we don't overstate noise. */
export function changeWording(v: number | null | undefined, threshold = 0.5): string {
  if (v == null) return "—";
  if (Math.abs(v) < threshold) return "Steady";
  return `${v > 0 ? "+" : "−"}${fmt(v)}`;
}

export function courseDayWording(adj: number | null | undefined): string | null {
  if (adj == null) return null;
  if (Math.abs(adj) < 0.5) return "Played about as usual";
  return `${fmt(adj)} strokes ${adj > 0 ? "harder" : "easier"} than usual`;
}

export type PreviewRound = {
  pre_expected: number | null;
  score: number;
  pre_strokes_vs_expectation: number | null;
  round_performance_display: number | null;
  display_before: number | null;
  display_after: number | null;
  confidence_before: number | null;
  layout_knowledge: string | null;
  status: string;
  status_reason: string | null;
};

/** "Why did my DGD change?" — built only from stored audit values. */
export function explainChange(r: PreviewRound) {
  if (r.status !== "rated" && r.status !== "provisional") {
    return { headline: `This round didn't change your DGD${r.status_reason ? ` — ${r.status_reason.toLowerCase()}` : ""}.`, lines: [] };
  }
  const change = r.display_after != null && r.display_before != null ? r.display_after - r.display_before : null;
  const perf = r.round_performance_display;
  const rel =
    perf == null || r.display_before == null
      ? null
      : Math.abs(perf - r.display_before) < 1
        ? "about the same as your current Skill"
        : perf > r.display_before
          ? "stronger than your current Skill"
          : "weaker than your current Skill";
  const lines: { label: string; value: string }[] = [];
  if (rel) lines.push({ label: "Round performance", value: rel });
  if (r.pre_expected != null) lines.push({ label: "Expected score", value: r.pre_expected.toFixed(1) });
  lines.push({ label: "Actual score", value: String(r.score) });
  const s = strokesVsExpectation(r.pre_strokes_vs_expectation);
  if (s) lines.push({ label: "Versus expectation", value: s });
  lines.push({ label: "Evidence quality", value: confidenceBand(r.confidence_before) });
  if (r.layout_knowledge) lines.push({ label: "Layout knowledge", value: r.layout_knowledge });
  if (r.display_before != null) lines.push({ label: "Previous Skill", value: r.display_before.toFixed(1) });
  if (r.display_after != null) lines.push({ label: "New Skill", value: r.display_after.toFixed(1) });
  if (change != null) lines.push({ label: "Change", value: `${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(1)}` });
  return { headline: "Your DGD changed because:", lines };
}

// ---------- Phase 5A: freshness, status, history filters ----------

export type Freshness = {
  last_calculated_at?: string | null;
  latest_source_change_at?: string | null;
  recalculation_pending?: boolean | null;
  last_job_status?: string | null;
  open_job?: string | null;
};
export type FreshnessState = "CURRENT" | "STALE" | "REBUILDING" | "ERROR";
const STALE_AFTER_MS = 15 * 60_000;

/** Never shows stale V1.1 as current. */
export function freshnessState(f: Freshness | null | undefined, now = Date.now()): FreshnessState {
  if (!f || !f.last_calculated_at) return f?.open_job ? "REBUILDING" : "STALE";
  const changed = f.latest_source_change_at ? Date.parse(f.latest_source_change_at) : 0;
  const calc = Date.parse(f.last_calculated_at);
  const pending = !!f.recalculation_pending || changed > calc;
  if (!pending) return "CURRENT";
  if (f.last_job_status === "failed") return "ERROR";
  if (f.open_job === "processing" || (f.open_job && now - changed < STALE_AFTER_MS)) return "REBUILDING";
  return "STALE";
}

function ago(iso: string, now: number) {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function freshnessWording(f: Freshness | null | undefined, now = Date.now()): { state: FreshnessState; text: string } {
  const state = freshnessState(f, now);
  if (state === "CURRENT") return { state, text: `Updated ${ago(f!.last_calculated_at!, now)}` };
  if (state === "REBUILDING") return { state, text: "New round detected · Updating" };
  if (state === "ERROR") return { state, text: "Preview couldn't update — showing your last saved results" };
  return { state, text: "Preview temporarily out of date" };
}

export const RATING_STATUS_LABEL: Record<string, string> = {
  UNRATED: "Unrated",
  PROVISIONAL: "Provisional",
  ESTABLISHED: "Established",
};

export const HISTORY_SOURCE_FILTERS = [
  { id: null, label: "All sources" },
  { id: "pdga", label: "PDGA" },
  { id: "udisc", label: "UDisc" },
  { id: "app", label: "DGD Native" },
] as const;

export const HISTORY_CATEGORY_FILTERS = [
  { id: null, label: "Any type" },
  { id: "sanctioned_tournament", label: "PDGA tournament" },
  { id: "unsanctioned_tournament", label: "Other tournament" },
  { id: "league", label: "League" },
  { id: "casual", label: "Casual" },
  { id: "practice", label: "Practice" },
] as const;

export const SOURCE_BADGE_BY_ID: Record<string, keyof typeof SOURCE_BADGES> = { pdga: "pdga", udisc: "udisc", app: "dgd" };

/** Indexed change from the first point so unlike scales can sit side by side without implying equivalence. */
export function indexedSeries(values: (number | null)[]): (number | null)[] {
  const first = values.find((v) => v != null);
  if (first == null) return values.map(() => null);
  return values.map((v) => (v == null ? null : +(v - first).toFixed(2)));
}
