/**
 * Pure helpers behind the tracker's "Friends are playing" surface.
 *
 * Nothing here invents data: a friend appears on an event only because PDGA
 * published their registration, and a conflict is only flagged when two known
 * date ranges actually overlap.
 */

export type FriendRegistration = {
  userId: string;
  displayName: string;
  username: string | null;
  pdgaNumber: string;
  division: string | null;
  rating: number | null;
};

export type FriendEventConflict = {
  title: string;
  startDate: string | null;
  endDate: string | null;
  source: "tracked" | "schedule";
};

export type FriendEvent = {
  eventRef: string;
  name: string | null;
  tier: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  pdgaUrl: string;
  /** True when the caller already follows this event in one of their trackers. */
  tracked: boolean;
  friends: FriendRegistration[];
  conflicts: FriendEventConflict[];
};

export type DateRange = { startDate: string | null; endDate: string | null };

/** Inclusive overlap between two ISO date ranges. Unknown dates never overlap. */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  const aStart = a.startDate;
  const bStart = b.startDate;
  if (!aStart || !bStart) return false;
  const aEnd = a.endDate ?? aStart;
  const bEnd = b.endDate ?? bStart;
  return aStart <= bEnd && bStart <= aEnd;
}

/** Soonest first; events without a published start date sort last. */
export function friendEventSort(a: FriendEvent, b: FriendEvent): number {
  const av = a.startDate ?? "9999-12-31";
  const bv = b.startDate ?? "9999-12-31";
  if (av !== bv) return av.localeCompare(bv);
  if (b.friends.length !== a.friends.length) return b.friends.length - a.friends.length;
  return (a.name ?? "").localeCompare(b.name ?? "");
}

/** Highest rating first; unrated friends keep their relative order at the end. */
export function sortFriendsByRating(friends: FriendRegistration[]): FriendRegistration[] {
  return [...friends].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
}

/**
 * Match published field rows to the caller's friends by PDGA number and group
 * them per event. Rows for numbers that belong to nobody the caller knows are
 * dropped.
 */
export function groupRegistrationsByEvent(
  rows: Array<{
    eventRef: string;
    pdgaNumber: string;
    division: string | null;
    rating: number | null;
  }>,
  friendsByNumber: Map<string, Omit<FriendRegistration, "division" | "rating">>,
): Map<string, FriendRegistration[]> {
  const out = new Map<string, FriendRegistration[]>();
  for (const row of rows) {
    const friend = friendsByNumber.get(row.pdgaNumber);
    if (!friend) continue;
    const list = out.get(row.eventRef) ?? [];
    if (list.some((f) => f.pdgaNumber === row.pdgaNumber)) continue;
    list.push({ ...friend, division: row.division, rating: row.rating });
    out.set(row.eventRef, sortFriendsByRating(list));
  }
  return out;
}

/** Commitments of the caller's own that collide with the given event window. */
export function findConflicts(
  event: DateRange,
  commitments: Array<FriendEventConflict & DateRange>,
): FriendEventConflict[] {
  return commitments
    .filter((c) => rangesOverlap(event, c))
    .map((c) => ({ title: c.title, startDate: c.startDate, endDate: c.endDate, source: c.source }));
}
