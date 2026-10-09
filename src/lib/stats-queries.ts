/**
 * Centralized StatLink query keys, row caps, stale times, and the rolling
 * history window. Every /stats and /rounds read goes through these constants
 * so one player's history can never pull an unbounded number of rows.
 */

/** Row caps for StatLink reads. Raise deliberately — never remove. */
export const STATS_LIMITS = {
  /** Rounds pulled for rating/scoring/skill aggregates. */
  rounds: 400,
  /** Rounds listed in a source-scoped history table. */
  historyRounds: 200,
  /** Hole-level score rows pulled for scoring/skill splits. */
  holeScores: 8000,
  /** Courses summarized in the Course Book. */
  courseBook: 200,
  /** Native rounds listed on /rounds. */
  nativeRounds: 100,
  /** Friends' in-progress rounds shown on /rounds. */
  friendRounds: 30,
  /** Upcoming planned events shown on /rounds. */
  plannedEvents: 20,
  /** Verified PDGA rounds scanned for event mastery. */
  masteryRounds: 600,
  /** Range/round throws scanned for per-disc performance. */
  discThrows: 2000,
} as const;


/**
 * Default rolling window for stats aggregates, in months. Ratings and
 * scoring trends are only meaningful over recent play; older rounds stay in
 * the database and are reachable by passing an explicit wider window.
 */
export const STATS_WINDOW_MONTHS = 24;

/** ISO date (YYYY-MM-DD) marking the start of the rolling stats window. */
export function statsWindowStart(
  months: number = STATS_WINDOW_MONTHS,
  now: Date = new Date(),
): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCMonth(d.getUTCMonth() - Math.max(1, Math.round(months)));
  return d.toISOString().slice(0, 10);
}

/** Stale times (ms) — stats change at most once per round or rating update. */
export const STATS_STALE = {
  rounds: 60_000,
  aggregates: 120_000,
  ratings: 300_000,
} as const;

export type StatsSourceKey = "pdga" | "udisc" | "chainlink" | "all";

/** Query keys for StatLink and round-history reads. */
export const statsKeys = {
  roundHistory: (userId: string | undefined) => ["round-history", userId] as const,
  sourceRounds: (userId: string | undefined, source: StatsSourceKey) =>
    ["stats", "source-rounds", userId, source] as const,
  ratings: (userId: string | undefined) => ["stats", "ratings", userId] as const,
  snapshot: (userId: string | undefined, source: StatsSourceKey) =>
    ["stats", "snapshot", userId, source] as const,
  pdgaLab: (userId: string | undefined) => ["stats", "pdga-lab", userId] as const,
  scoring: (userId: string | undefined, source: StatsSourceKey) =>
    ["stats", "scoring", userId, source] as const,
  skills: (userId: string | undefined, source: StatsSourceKey) =>
    ["stats", "skills", userId, source] as const,
  shots: (userId: string | undefined) => ["stats", "shots", userId] as const,
  courseBook: (userId: string | undefined) => ["stats", "course-book", userId] as const,
  goals: (userId: string | undefined) => ["stats", "goals", userId] as const,
  readiness: (userId: string | undefined) => ["stats", "readiness", userId] as const,
  mastery: (userId: string | undefined, limit: number) =>
    ["stats", "event-mastery", userId, limit] as const,
  discPerformance: (userId: string | undefined) => ["stats", "disc-performance", userId] as const,
  trackerHoles: (userId: string | undefined) => ["stats", "tracker-holes", userId] as const,
} as const;

