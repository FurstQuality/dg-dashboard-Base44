/**
 * Shared helpers for surfacing live-round status across the tracker.
 *
 * A single `tracker_live_scores` row is emitted per (player, round) each time
 * we sync PDGA's live-scoring API. This module reduces those rows into two
 * indexes the UI can consume everywhere: latest-per-player and per-event.
 *
 * A player is "actively playing" when their latest round has started but
 * hasn't been marked complete. That drives the big LIVE ROUND indicators.
 */
import type { TrackerLiveScoreRow } from "@/lib/tracker.functions";

export type LiveMemberStatus = {
  score: TrackerLiveScoreRow;
  active: boolean; // round in progress right now
  completed: boolean; // round finished
  toPar: number;
  thru: number;
  total: number;
  place: number | null;
  round: number | null;
};

export type LiveEventStatus = {
  eventId: string;
  activeCount: number;
  completedCount: number;
  totalTracked: number;
  latestRound: number | null;
  lastSyncedAt: string | null;
};

export function isActivelyPlaying(row: TrackerLiveScoreRow): boolean {
  if (row.completed) return false;
  if (!row.round_started) return false;
  // Some feeds report `round_started` before a card actually tees; require
  // either a positive thru count or a nonzero total so we don't flash LIVE on
  // stale rows.
  const thru = row.thru ?? 0;
  const total = row.total ?? 0;
  return thru > 0 || total !== 0;
}

/** Latest score row per pdga_number (input assumed sorted desc by sync time). */
export function buildLiveMemberIndex(scores: TrackerLiveScoreRow[]): Map<string, LiveMemberStatus> {
  const out = new Map<string, LiveMemberStatus>();
  for (const s of scores) {
    if (out.has(s.pdga_number)) continue;
    out.set(s.pdga_number, {
      score: s,
      active: isActivelyPlaying(s),
      completed: !!s.completed,
      toPar: s.to_par ?? 0,
      thru: s.thru ?? 0,
      total: s.total ?? 0,
      place: s.running_place ?? s.place ?? null,
      round: s.round_number ?? null,
    });
  }
  return out;
}

export function buildLiveEventIndex(scores: TrackerLiveScoreRow[]): Map<string, LiveEventStatus> {
  const out = new Map<string, LiveEventStatus>();
  // Only count the newest row per (event, pdga_number) so historic rounds
  // don't inflate the counters.
  const seen = new Set<string>();
  for (const s of scores) {
    const key = `${s.event_id}:${s.pdga_number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cur = out.get(s.event_id) ?? {
      eventId: s.event_id,
      activeCount: 0,
      completedCount: 0,
      totalTracked: 0,
      latestRound: null,
      lastSyncedAt: null,
    };
    cur.totalTracked += 1;
    if (isActivelyPlaying(s)) cur.activeCount += 1;
    if (s.completed) cur.completedCount += 1;
    if (s.round_number != null && (cur.latestRound == null || s.round_number > cur.latestRound)) {
      cur.latestRound = s.round_number;
    }
    if (!cur.lastSyncedAt || s.last_synced_at > cur.lastSyncedAt) {
      cur.lastSyncedAt = s.last_synced_at;
    }
    out.set(s.event_id, cur);
  }
  return out;
}

export { formatToPar } from "@/lib/score-display";
