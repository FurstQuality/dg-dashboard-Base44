/**
 * Single source of truth for Event Director query keys, bounded read limits,
 * and stale times. Every Director surface imports from here so cache keys stay
 * consistent and a limit is never raised in one place and forgotten in another.
 */

export const DIRECTOR_LIMITS = {
  /** Events shown in the cockpit (soonest first). */
  cockpitEvents: 6,
  /** Registration rows per page in the registrations desk. */
  registrationsPage: 50,
  /** Cap on profile ids resolved for a registration player search. */
  registrationsSearchPlayers: 200,
  /** Checklist items surfaced per event. */
  checklist: 12,
  /** Staff rows per event. */
  staff: 25,
  /** Player search results when adding staff. */
  staffSearch: 8,
  /** Events returned to the desk pickers per role bucket. */
  eventOptions: 50,
  /** Leagues listed on the hosted-leagues desk. */
  hostedLeagues: 100,
  /** Recent roster actions in the audit trail. */
  audit: 20,
} as const;

export const DIRECTOR_STALE = {
  /** Registration + live event data that moves during an event. */
  short: 30_000,
  /** Event structure: divisions, rounds, checklist. */
  medium: 120_000,
  /** Print kit source data — changes rarely once an event is built. */
  long: 300_000,
} as const;

/**
 * Polling intervals for live organizer surfaces. Paired with
 * `refetchIntervalInBackground: false` so a hidden tab stops asking.
 */
export const DIRECTOR_POLL = {
  /** Check-in board and guest list during an event. */
  live: 20_000,
  /** Station lists — the set of events on the desk changes slowly. */
  stations: 120_000,
} as const;

export const directorKeys = {
  cockpit: (userId: string | null | undefined) => ["director-cockpit", userId] as const,
  events: (userId: string | null | undefined, search = "") =>
    ["director-events", userId, search] as const,
  registrations: (
    userId: string | null | undefined,
    filters: {
      tournamentId?: string;
      status?: string;
      paid?: string;
      search?: string;
      page?: number;
    },
  ) =>
    [
      "director-registrations",
      userId,
      filters.tournamentId ?? "all",
      filters.status ?? "all",
      filters.paid ?? "all",
      filters.search ?? "",
      filters.page ?? 0,
    ] as const,
  kit: (tournamentId: string | null | undefined) => ["director-kit", tournamentId] as const,
  staff: (tournamentId: string | null | undefined) => ["director-staff", tournamentId] as const,
  checklist: (tournamentId: string | null | undefined) =>
    ["director-checklist", tournamentId] as const,
  audit: (tournamentId: string | null | undefined) => ["director-audit", tournamentId] as const,
  leagues: (userId: string | null | undefined) => ["director-leagues", userId] as const,
  /** Check-in stations available to the signed-in organizer. */
  checkinStations: () => ["checkin", "stations"] as const,
  checkinBoard: (kind: string | null | undefined, id: string | null | undefined) =>
    ["checkin", "board", kind ?? null, id ?? null] as const,
  kioskGuests: (kind: string | null | undefined, id: string | null | undefined) =>
    ["kiosk", "guests", kind ?? null, id ?? null] as const,
  series: () => ["my-series"] as const,
  seriesReport: (seriesId: string) => ["series-report", seriesId] as const,
  linkableEvents: () => ["linkable-events"] as const,
};
