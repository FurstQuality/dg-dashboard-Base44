/**
 * Single source of truth for Play section query keys, bounded read limits, and
 * stale times. Components import from here so cache keys stay consistent and a
 * limit is never raised in one place and forgotten in another.
 */

export const PLAY_LIMITS = {
  formWindowDays: 30,
  myCourses: 6,
  nearbyCourses: 6,
  friendActivity: 6,
  events: 5,
  practiceHistory: 20,
} as const;

export const PLAY_STALE = {
  /** Activity that changes as you play. */
  short: 60_000,
  /** Course book / schedule data that changes a few times a day. */
  medium: 120_000,
  /** Geo results — expensive and effectively static while you stand still. */
  long: 300_000,
} as const;

export const playKeys = {
  form: (userId: string | null | undefined) =>
    ["play-form", userId, PLAY_LIMITS.formWindowDays] as const,
  myCourses: (userId: string | null | undefined) => ["play-my-courses", userId] as const,
  nearbyCourses: (lat?: number, lng?: number) => ["play-nearby-courses", lat, lng] as const,
  friendActivity: (userId: string | null | undefined) => ["play-friend-activity", userId] as const,
  events: (userId: string | null | undefined) => ["play-events", userId] as const,
  practiceSummary: (userId: string | null | undefined) => ["practice-summary", userId] as const,
  practiceHistory: (userId: string | null | undefined) => ["practice-history", userId] as const,
};
