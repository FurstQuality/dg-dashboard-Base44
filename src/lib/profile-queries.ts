/**
 * Shared cache keys and refresh windows for player profiles, so the profile
 * page, friend actions and follow toggles all read and invalidate one entry.
 */
export const profileKeys = {
  all: ["player-profile"] as const,
  player: (username: string) => ["player-profile", username] as const,
};

export const PROFILE_STALE = {
  /** Profiles change slowly; a minute keeps navigation instant. */
  player: 60_000,
} as const;
