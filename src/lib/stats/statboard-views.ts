/**
 * Statboard view model — one source of truth for the Statboard tabs, their
 * URL values, and legacy ?tab= links. Research is listed separately because
 * it only appears for testers/admins (the server still gates its data).
 */
export const STATBOARD_VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "ratings", label: "Ratings" },
  { id: "rounds", label: "Rounds" },
  { id: "courses", label: "Courses" },
  { id: "scoring", label: "Scoring" },
  { id: "development", label: "Development" },
  { id: "pdga", label: "PDGA Statboard" },
  { id: "udisc", label: "UDisc Statboard" },
] as const;

export type StatboardView = (typeof STATBOARD_VIEWS)[number]["id"] | "research";

const LEGACY: Record<string, StatboardView> = {
  history: "rounds",
  skill: "development",
  goals: "development",
  target: "development",
  events: "pdga",
};

const ALL = new Set<string>([...STATBOARD_VIEWS.map((v) => v.id), "research"]);

/** Resolve ?view= (or a legacy ?tab=) to a view. Research falls back to Overview when not allowed. */
export function resolveStatboardView(
  view: string | undefined,
  legacyTab: string | undefined,
  researchAllowed: boolean,
  fallback: StatboardView = "overview",
): StatboardView {
  const raw = view ?? legacyTab;
  if (!raw) return fallback;
  const v = (LEGACY[raw] ?? raw) as StatboardView;
  if (!ALL.has(v)) return fallback;
  if (v === "research" && !researchAllowed) return "overview";
  return v;
}

export const DEFAULT_VIEW_STORAGE_KEY = "statboard-default-view";

/** Averages of the newest N ratings (newest first). Null when fewer than N exist. */
export function recentAverages(ratingsNewestFirst: number[], windows = [5, 10, 20]) {
  return windows.map((n) => {
    const xs = ratingsNewestFirst.slice(0, n);
    return { n, avg: xs.length === n ? Math.round(xs.reduce((a, b) => a + b, 0) / n) : null };
  });
}

/**
 * Trend only when the sample supports it: needs 10+ rounds and a gap between
 * the last 5 and the 5 before larger than `threshold` points.
 */
export function recentTrend(
  ratingsNewestFirst: number[],
  threshold: number,
): "up" | "down" | "flat" | null {
  if (ratingsNewestFirst.length < 10) return null;
  const a = ratingsNewestFirst.slice(0, 5).reduce((x, y) => x + y, 0) / 5;
  const b = ratingsNewestFirst.slice(5, 10).reduce((x, y) => x + y, 0) / 5;
  if (a - b > threshold) return "up";
  if (b - a > threshold) return "down";
  return "flat";
}
