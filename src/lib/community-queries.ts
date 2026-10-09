/**
 * Single source of truth for Community query keys, bounded read limits, and
 * stale times. Mirrors `play-queries.ts` / `director-queries.ts` so a limit is
 * never raised in one place and forgotten in another.
 */

export const COMMUNITY_LIMITS = {
  /** Upcoming outreach events shown on the Community overview. */
  overviewEvents: 4,
  /** Clubs shown on the overview (counts come from an exact count query). */
  overviewClubs: 4,
  /** Friend requests / suggested players shown on the overview. */
  overviewPeople: 6,

  /** Recent network notifications on the overview. */
  overviewActivity: 6,
  /** Outreach events per page in the directory. */
  outreachPage: 24,
  /** Hard ceiling on any single outreach scan. */
  outreachScan: 200,
  /** RSVP rows resolved per page of outreach events. */
  rsvpScan: 2000,
} as const;

export const FRIEND_LIMITS = {
  /** Friendship rows scanned for the hub (friends + requests combined). */
  friendshipScan: 500,
  /** Pending PDGA placeholder invites shown. */
  placeholders: 100,
  /** Suggested players. */
  suggestions: 12,
  /** Newest-profile padding pool when mutual suggestions are slim. */
  freshProfiles: 48,
  /** Profiles hydrated in one `in()` lookup. */
  profileHydration: 400,
  /** Player search results. */
  search: 20,
  /** Skip mutual math above this friend count (keeps the `or` filter sane). */
  mutualScanFriends: 120,
  /** Ceiling on friend-of-friend rows scanned for mutual counts. */
  mutualScanRows: 3000,
} as const;

export const CLUB_LIMITS = {
  /** Clubs per directory page. */
  directoryPage: 24,
  /** Hard ceiling on a club scan. */
  directoryScan: 200,
  /** Roster rows loaded per club. */
  roster: 200,
  /** Club feed posts loaded per club. */
  clubPosts: 30,
  /** Club-hosted outreach events / league rows. */
  clubEvents: 20,
} as const;

export const COMMUNITY_STALE = {
  /** Counts and unread badges. */
  short: 30_000,
  /** Event listings — change a few times a day. */
  medium: 120_000,
} as const;

export type OutreachScope = "all" | "going" | "hosting";
export type OutreachWhen = "upcoming" | "week" | "month" | "past";

export const communityKeys = {
  overview: (userId: string | null | undefined) => ["community-overview", userId] as const,
  outreachDetail: (userId: string | null | undefined, eventId: string) =>
    ["community-outreach-detail", userId, eventId] as const,
  pdgaInvites: (userId: string | null | undefined) => ["pdga-friend-invites", userId] as const,
  trackerGroups: (userId: string | null | undefined) => ["tracker-groups-hub", userId] as const,
  outreach: (
    userId: string | null | undefined,
    filters: {
      kind: string;
      when: OutreachWhen;
      scope: OutreachScope;
      q: string;
      nearMe: boolean;
      page: number;
    },
  ) =>
    [
      "community-outreach",
      userId,
      filters.kind,
      filters.when,
      filters.scope,
      filters.q,
      filters.nearMe,
      filters.page,
    ] as const,
  friendsHub: (userId: string | null | undefined) => ["friends-hub", userId] as const,
  playerSearch: (userId: string | null | undefined, q: string) =>
    ["player-search", userId, q] as const,
  clubDirectory: (
    userId: string | null | undefined,
    filters: {
      scope: string;
      q: string;
      page: number;
      city?: string;
      state?: string;
      radiusMiles?: number | null;
      lat?: number | null;
      lng?: number | null;
      sort?: string;
    },
  ) =>
    [
      "club-directory",
      userId,
      filters.scope,
      filters.q,
      filters.page,
      filters.city ?? "",
      filters.state ?? "",
      filters.radiusMiles ?? null,
      filters.lat ?? null,
      filters.lng ?? null,
      filters.sort ?? "suggested",
    ] as const,
  clubMembers: (userId: string | null | undefined, clubId: string) =>
    ["club-members", userId, clubId] as const,
  clubDetail: (userId: string | null | undefined, slug: string) =>
    ["club-detail", userId, slug] as const,
};
