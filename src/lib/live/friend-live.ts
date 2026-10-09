/**
 * Pure types and helpers for "Live now" — friends who are on the course right
 * now, either in a sanctioned event with published live scoring or in an
 * in-app round they're scoring with DG Dashboard.
 *
 * Nothing here invents a score: a friend only appears because PDGA published a
 * live card for their player number, or because they started a round in the app
 * and you're accepted friends.
 */

export type FriendLivePlayer = {
  userId: string | null;
  displayName: string;
  username: string | null;
  pdgaNumber: string;
  division: string | null;
  roundNumber: number;
  thru: number;
  holeCount: number | null;
  place: number | null;
  total: number | null;
  toPar: number | null;
  roundToPar: number | null;
  teeTime: string | null;
  cardNumber: string | null;
  completed: boolean;
  roundStarted: boolean;
  holeScores: number[] | null;
  holePars: number[] | null;
  lastSyncedAt: string | null;
};

export type FriendLiveEvent = {
  eventRef: string;
  name: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  tier: string | null;
  pdgaUrl: string;
  lastSyncedAt: string | null;
  syncStatus: string | null;
  players: FriendLivePlayer[];
};

export type FriendLiveRound = {
  roundId: string;
  playerId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  courseName: string | null;
  startedAt: string | null;
  holesPlayed: number;
  totalStrokes: number;
  totalPar: number;
  lastScoreAt: string | null;
};

export type FriendsLiveNow = {
  events: FriendLiveEvent[];
  rounds: FriendLiveRound[];
  friendsPlaying: number;
  friendsWithPdga: number;
  oldestSyncedAt: string | null;
  fetchedAt: string;
};

/** Keep the most advanced round we have for each player number. */
export function latestRoundPerPlayer<T extends { pdgaNumber: string; roundNumber: number }>(
  rows: T[],
): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    const current = best.get(row.pdgaNumber);
    if (!current || row.roundNumber > current.roundNumber) best.set(row.pdgaNumber, row);
  }
  return [...best.values()];
}

/** Someone is "on the course" when their card is started but not finished. */
export function isOnTheCourse(p: FriendLivePlayer): boolean {
  return (p.roundStarted || p.thru > 0) && !p.completed;
}

/** Live cards first, then furthest along, then best score. */
export function liveEventSort(a: FriendLiveEvent, b: FriendLiveEvent): number {
  const aLive = a.players.filter(isOnTheCourse).length;
  const bLive = b.players.filter(isOnTheCourse).length;
  if (aLive !== bLive) return bLive - aLive;
  if (b.players.length !== a.players.length) return b.players.length - a.players.length;
  return a.name.localeCompare(b.name);
}

export function livePlayerSort(a: FriendLivePlayer, b: FriendLivePlayer): number {
  const aLive = isOnTheCourse(a) ? 0 : 1;
  const bLive = isOnTheCourse(b) ? 0 : 1;
  if (aLive !== bLive) return aLive - bLive;
  if (a.place != null && b.place != null && a.place !== b.place) return a.place - b.place;
  if (a.place != null && b.place == null) return -1;
  if (b.place != null && a.place == null) return 1;
  return a.displayName.localeCompare(b.displayName);
}

/** "-4", "E", "+2" — the way players read a score. */
export { formatToPar } from "@/lib/score-display";

/** Dates a live sync should cover: today, plus events that started earlier. */
export function isEventInPlay(
  startDate: string | null,
  endDate: string | null,
  today: string,
): boolean {
  const start = startDate ?? endDate;
  const end = endDate ?? startDate;
  if (!start || !end) return false;
  return start <= today && today <= end;
}
