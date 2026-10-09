/** Shared React Query keys and stale times for tracker surfaces. */

export const trackerKeys = {
  watchlist: () => ["tracker", "watchlist"] as const,
  groups: () => ["tracker", "groups"] as const,
  /** One crew tracker bundle — shared by the crew page and its player pages. */
  group: (groupId: string) => ["tracker", "group", groupId] as const,
  /** Posted round results for one tracked event. */
  eventResults: (groupId: string, eventId: string) =>
    ["tracker", "event-results", groupId, eventId] as const,
  liveSchedule: (limit: number) => ["tracker", "pdga-schedule", limit] as const,
  nearbySchedule: (radius: number, limit: number) =>
    ["tracker", "pdga-schedule-nearby", radius, limit] as const,
  preview: (eventRef: string, division: string | null) =>
    ["tracker", "preview", eventRef, division ?? "auto"] as const,
  friendEvents: () => ["tracker", "friend-events"] as const,
  eventSearch: (query: string) => ["tracker", "event-search", query] as const,
};

export const TRACKER_STALE = {
  /** Saved events change when the user acts, so a short window is fine. */
  watchlist: 60_000,
  /** Crew bundles only move on sync or an explicit edit. */
  group: 60_000,
  /** Posted results change when the crew types them in. */
  eventResults: 60_000,
  /** PDGA's cached registry only moves on refresh. */
  schedule: 10 * 60_000,
  /** Previews read cached field/round data; refetch on demand instead. */
  preview: 2 * 60_000,
} as const;

export const liveKeys = {
  /** Friends currently on the course — events plus in-app rounds. */
  friendsLiveNow: () => ["live", "friends-now"] as const,
  /** One friend's full card at one event. */
  friendCard: (eventRef: string, pdgaNumber: string) =>
    ["live", "friend-card", eventRef, pdgaNumber] as const,
};

/**
 * One shared refresh cadence for anything that moves while play happens.
 * Every interval pauses in a hidden tab (`refetchIntervalInBackground: false`)
 * so a background tab never polls.
 */
export const LIVE_POLL = {
  /** Cards in play: scores, thru, place. */
  live: 30_000,
  /** Registrations and field strength. */
  field: 3 * 60_000,
  /** Standings and leaderboards between rounds. */
  standings: 2 * 60_000,
  /** Slow-moving event detail: courses, layouts, schedule. */
  detail: 60 * 60_000,
} as const;

/** Spread into a useQuery config to poll only while the tab is visible. */
export function livePolling(intervalMs: number, enabled = true) {
  return {
    refetchInterval: enabled ? intervalMs : (false as const),
    refetchIntervalInBackground: false,
    staleTime: Math.max(5_000, Math.floor(intervalMs / 2)),
  };
}
