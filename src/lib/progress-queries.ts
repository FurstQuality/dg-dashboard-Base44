/**
 * Shared cache keys and refresh windows for the progress / trophies surface,
 * so the hub, quests and every ranking board dedupe requests and stay warm
 * between visits. Mirrors the tracker and community query layers.
 */
export const progressKeys = {
  all: ["progress"] as const,
  hub: (username: string) => ["progress", "hub", username] as const,
  quests: (userId: string | null | undefined) => ["progress", "quests", userId ?? "anon"] as const,
  xpBoard: (mode: "all" | "week") => ["progress", "board", "xp", mode] as const,
  roundsBoard: () => ["progress", "board", "rounds"] as const,
  acesBoard: () => ["progress", "board", "aces"] as const,
};

export const PROGRESS_STALE = {
  /** Your own level, badges and trophies: refresh on revisit after a minute. */
  hub: 60_000,
  /** Quest rotation changes daily, not by the second. */
  quests: 2 * 60_000,
  /** Leaderboards are comparative — five minutes is plenty. */
  boards: 5 * 60_000,
} as const;
