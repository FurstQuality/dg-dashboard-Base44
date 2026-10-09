/**
 * Live course condition rules. Mirrors the database functions
 * respond_course_condition / set_course_report_state / course_conditions_tick;
 * the database is authoritative — this module is for UI display and tests.
 */
import { distanceFt, type LatLng } from "./geometry";

export type Lifecycle =
  | "REPORTED" | "NEEDS_CONFIRMATION" | "CONFIRMED" | "PLANNED" | "IN_PROGRESS"
  | "POSSIBLY_RESOLVED" | "RESOLVED" | "DISMISSED" | "EXPIRED";
export type Priority = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "SAFETY";
/** @deprecated use Priority */
export type Severity = Priority;
export type Freshness = "FRESH" | "NEEDS_CONFIRMATION" | "STALE" | "ARCHIVED";
export type Confidence = "UNVERIFIED" | "COMMUNITY_CONFIRMED" | "STEWARD_VERIFIED" | "OFFICIAL";
export type Response = "STILL_THERE" | "RESOLVED" | "INCORRECT" | "NOT_SURE";

export const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  REPORTED: "Reported", NEEDS_CONFIRMATION: "Needs a recheck", CONFIRMED: "Confirmed",
  PLANNED: "Fix planned", IN_PROGRESS: "Being fixed", POSSIBLY_RESOLVED: "Possibly fixed",
  RESOLVED: "Resolved", DISMISSED: "Dismissed", EXPIRED: "Archived",
};
export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  UNVERIFIED: "Not yet verified", COMMUNITY_CONFIRMED: "Confirmed by players",
  STEWARD_VERIFIED: "Verified by a steward", OFFICIAL: "Official",
};
export const PRIORITY_LABEL: Record<Priority, string> = {
  INFO: "Info", LOW: "Low", MEDIUM: "Medium", HIGH: "High", SAFETY: "Safety",
};

/** Default windows; the live values come from course_condition_categories. */
export type CategoryRule = { key: string; label: string; recheck_days: number; stale_days: number; archive_days: number; duplicate_radius_ft: number };
export const DEFAULT_CATEGORIES: CategoryRule[] = [
  { key: "DOWNED_TREE", label: "Tree or limb down", recheck_days: 4, stale_days: 10, archive_days: 60, duplicate_radius_ft: 50 },
  { key: "TRASH", label: "Trash", recheck_days: 2, stale_days: 5, archive_days: 20, duplicate_radius_ft: 40 },
  { key: "BASKET", label: "Basket problem", recheck_days: 10, stale_days: 30, archive_days: 120, duplicate_radius_ft: 30 },
  { key: "FLOODING", label: "Flooding or mud", recheck_days: 1, stale_days: 3, archive_days: 14, duplicate_radius_ft: 80 },
  { key: "CONSTRUCTION", label: "Construction", recheck_days: 21, stale_days: 60, archive_days: 240, duplicate_radius_ft: 80 },
  { key: "SAFETY", label: "Safety hazard", recheck_days: 3, stale_days: 7, archive_days: 90, duplicate_radius_ft: 50 },
  { key: "OTHER", label: "Something else", recheck_days: 5, stale_days: 14, archive_days: 60, duplicate_radius_ft: 40 },
];
const FALLBACK: CategoryRule = DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1];
export function ruleFor(category: string | null | undefined, rules = DEFAULT_CATEGORIES): CategoryRule {
  return rules.find((r) => r.key === category) ?? FALLBACK;
}

const CLOSED: Lifecycle[] = ["RESOLVED", "DISMISSED", "EXPIRED"];
export const isActive = (l: Lifecycle) => !CLOSED.includes(l);

export function canSetState(
  to: Lifecycle | "REOPEN",
  who: { isSteward: boolean; isReporter: boolean; signedIn: boolean },
  priority: Priority = "MEDIUM",
): boolean {
  if (!who.signedIn) return false;
  if (to === "REOPEN") return who.isSteward;
  if (["CONFIRMED", "PLANNED", "IN_PROGRESS", "DISMISSED"].includes(to)) return who.isSteward;
  if (to === "RESOLVED") return who.isSteward || (who.isReporter && priority !== "SAFETY");
  return false;
}

/** Community response outcome. Reporter's own responses and repeat answers never count. */
export function applyResponses(
  current: Lifecycle,
  priority: Priority,
  responses: { user_id: string; response: Response }[],
  reporterId: string,
): { lifecycle: Lifecycle; confirm: number; resolved: number; disputes: number } {
  const latest = new Map<string, Response>();
  for (const r of responses) if (r.user_id !== reporterId) latest.set(r.user_id, r.response);
  const vals = [...latest.values()];
  const confirm = vals.filter((v) => v === "STILL_THERE").length;
  const resolved = vals.filter((v) => v === "RESOLVED").length;
  const disputes = vals.filter((v) => v === "INCORRECT").length;
  let lifecycle = current;
  const last = responses.filter((r) => r.user_id !== reporterId).at(-1)?.response;
  if (last === "STILL_THERE" && ["REPORTED", "NEEDS_CONFIRMATION", "POSSIBLY_RESOLVED"].includes(current)) lifecycle = "CONFIRMED";
  else if (last === "RESOLVED" && priority !== "SAFETY" && resolved >= 2 && resolved > confirm) lifecycle = "POSSIBLY_RESOLVED";
  return { lifecycle, confirm, resolved, disputes };
}

export function freshnessOf(
  r: { lifecycle: Lifecycle; priority: Priority; category?: string | null; created_at: string; last_confirmed_at?: string | null; last_observed_at?: string | null },
  now = new Date(),
  rules = DEFAULT_CATEGORIES,
): Freshness {
  if (!isActive(r.lifecycle)) return "FRESH";
  const rule = ruleFor(r.category, rules);
  const seen = new Date(r.last_confirmed_at ?? r.last_observed_at ?? r.created_at).getTime();
  const days = (now.getTime() - seen) / 86_400_000;
  if (r.priority !== "SAFETY" && days > rule.archive_days) return "ARCHIVED";
  if (days > rule.stale_days) return "STALE";
  if (days > rule.recheck_days) return "NEEDS_CONFIRMATION";
  return "FRESH";
}

export function needsVerification(
  r: { lifecycle: Lifecycle; severity?: Priority; priority?: Priority; category?: string | null; created_at: string; last_confirmed_at?: string | null },
  now = new Date(),
): boolean {
  const f = freshnessOf({ ...r, priority: r.priority ?? r.severity ?? "MEDIUM" }, now);
  return f === "NEEDS_CONFIRMATION" || f === "STALE";
}

/** Sort for public display: safety first, then priority, then confidence, then freshness. */
const P_RANK: Record<Priority, number> = { SAFETY: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
const C_RANK: Record<Confidence, number> = { OFFICIAL: 0, STEWARD_VERIFIED: 1, COMMUNITY_CONFIRMED: 2, UNVERIFIED: 3 };
const F_RANK: Record<Freshness, number> = { FRESH: 0, NEEDS_CONFIRMATION: 1, STALE: 2, ARCHIVED: 3 };
export function sortConditions<T extends { priority: Priority; confidence: Confidence; freshness_state: Freshness }>(rows: T[]): T[] {
  return rows.slice().sort((a, b) =>
    P_RANK[a.priority] - P_RANK[b.priority] || C_RANK[a.confidence] - C_RANK[b.confidence] || F_RANK[a.freshness_state] - F_RANK[b.freshness_state]);
}

export function findNearbyOpenIssue<T extends { lat: number; lng: number; lifecycle: Lifecycle; category?: string | null }>(
  at: LatLng, existing: T[], opts: { category?: string | null; radiusFt?: number } = {},
): T | null {
  const radius = opts.radiusFt ?? ruleFor(opts.category).duplicate_radius_ft;
  let best: T | null = null;
  let bestD = Infinity;
  for (const r of existing) {
    if (!isActive(r.lifecycle)) continue;
    if (opts.category && r.category && r.category !== opts.category) continue;
    const d = distanceFt(at, [r.lat, r.lng]);
    if (d <= radius && d < bestD) { best = r; bestD = d; }
  }
  return best;
}

export type CourseLiveStatus = "OPEN" | "OPEN_WITH_CONDITIONS" | "PARTIALLY_CLOSED" | "CLOSED" | "UNKNOWN";
/** Summary shown on course pages. Community reports never publish a closure. */
export function courseStatusSummary(
  official: CourseLiveStatus | null,
  active: { priority: Priority; freshness_state: Freshness }[],
) {
  const current = active.filter((a) => a.freshness_state !== "ARCHIVED");
  const safety = current.filter((a) => a.priority === "SAFETY").length;
  const high = current.filter((a) => a.priority === "HIGH").length;
  const status: CourseLiveStatus =
    official === "CLOSED" || official === "PARTIALLY_CLOSED" ? official
      : current.length ? "OPEN_WITH_CONDITIONS"
      : official ?? "UNKNOWN";
  return { status, active: current.length, safety, highPriority: high + safety };
}

export function maintenanceStats(
  rows: { lifecycle: Lifecycle; category?: string | null; hole_number?: number | null; created_at: string; resolved_at?: string | null }[],
) {
  const resolved = rows.filter((r) => r.lifecycle === "RESOLVED" && r.resolved_at);
  const avgDays = resolved.length
    ? resolved.reduce((s, r) => s + (new Date(r.resolved_at!).getTime() - new Date(r.created_at).getTime()), 0) /
      resolved.length / 86_400_000
    : null;
  const count = (key: (r: (typeof rows)[number]) => string | null) => {
    const m = new Map<string, number>();
    for (const r of rows) { const k = key(r); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const byHoleCategory = count((r) => (r.hole_number != null && r.category ? `${r.hole_number}|${r.category}` : null));
  return {
    submitted: rows.length,
    open: rows.filter((r) => isActive(r.lifecycle)).length,
    resolved: resolved.length,
    avgResolutionDays: avgDays == null ? null : Math.round(avgDays * 10) / 10,
    byCategory: count((r) => r.category ?? null),
    byHole: count((r) => (r.hole_number != null ? String(r.hole_number) : null)),
    recurring: byHoleCategory.filter(([, n]) => n >= 3).map(([k, n]) => {
      const [hole, category] = k.split("|");
      return { hole: Number(hole), category, count: n };
    }),
  };
}
