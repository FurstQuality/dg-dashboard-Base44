/**
 * Server-only helpers behind the personal tournament watchlist.
 *
 * The watchlist deliberately reuses `tracker_groups` / `tracker_group_events`
 * (one auto-provisioned personal group per user) so live PDGA sync, tee times,
 * results, alerts, and calendar code keep working with no parallel table.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePdgaNumber } from "@/lib/pdga-number";

import { PERSONAL_TRACKER_NAME } from "./tracker-watchlist-shared";
export { PERSONAL_TRACKER_NAME } from "./tracker-watchlist-shared";

/** Hard bounds so watchlist reads can never fan out unbounded. */
export const WATCHLIST_LIMITS = {
  events: 100,
  members: 200,
  rounds: 400,
} as const;

export type TrackedEvent = {
  id: string;
  groupId: string;
  groupName: string;
  isPersonal: boolean;
  name: string;
  pdgaEventRef: string | null;
  tier: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  url: string | null;
  eventStatus: string | null;
  liveStatus: string | null;
  liveCurrentRound: number | null;
  lastSyncedAt: string | null;
  /** "live" while play is underway, "upcoming" before it, "past" after. */
  phase: "live" | "upcoming" | "past";
  playersTracked: number;
  roundsPublished: number;
};

import { meetsOn } from "@/lib/league-recurrence";

/** Today's date in ISO (YYYY-MM-DD), used for phase bucketing. */
export function todayIso(now: Date = new Date(), timeZone = "America/Chicago"): string {
  // Calendar day in US local time, so an evening league night isn't already
  // "tomorrow" in UTC. en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Bucket an event into live / upcoming / past from its dates and PDGA live
 * status. PDGA's own live status wins when it says play is underway.
 */
export function eventPhase(input: {
  startDate: string | null;
  endDate: string | null;
  liveStatus: string | null;
  eventStatus: string | null;
  today?: string;
  /** Event title and kind, so a league season isn't called live on an off day. */
  name?: string | null;
  kind?: string | null;
}): "live" | "upcoming" | "past" {
  const today = input.today ?? todayIso();
  const live = (input.liveStatus ?? "").toLowerCase();
  const start = input.startDate;
  const end0 = input.endDate ?? input.startDate;
  // A multi-week series (league night, sanctioned weekly singles) is only
  // underway on the days it actually meets — never across the whole season.
  const offDay =
    !!start && start <= today && (end0 ?? start) >= today && !meetsOn({ name: input.name, start_date: start, end_date: end0 }, today);
  if ((live === "live" || live === "in_progress") && !offDay) return "live";
  const end = input.endDate ?? input.startDate;
  if (!start) return "upcoming";
  if (end && end < today) return "past";
  if (start <= today && (!end || end >= today)) {
    if (live === "complete") return "past";
    // A league season runs for weeks but only plays one night a week — between
    // meetings the next night is still upcoming, not underway.
    if (offDay) return "upcoming";
    return "live";
  }
  return "upcoming";
}

/**
 * Find — or create — the caller's personal tracker group. Idempotent: repeated
 * calls always resolve to the same group id.
 */
export async function ensurePersonalTrackerGroup(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ id: string; name: string }> {
  const { data: existing, error } = await supabase
    .from("tracker_groups")
    .select("id, name")
    .eq("owner_id", userId)
    .eq("name", PERSONAL_TRACKER_NAME)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (existing) return { id: existing.id as string, name: existing.name as string };

  const { data: created, error: insertError } = await supabase
    .from("tracker_groups")
    .insert({
      owner_id: userId,
      name: PERSONAL_TRACKER_NAME,
      description:
        "Tournaments you're following. Saved events sync tee times, pools, and results from PDGA.",
    })
    .select("id, name")
    .single();
  if (insertError) throw new Error(insertError.message);
  return { id: created.id as string, name: created.name as string };
}

/** Sort key: live first, then soonest upcoming, then most recent past. */
export function watchlistSort(a: TrackedEvent, b: TrackedEvent): number {
  const rank = { live: 0, upcoming: 1, past: 2 } as const;
  if (rank[a.phase] !== rank[b.phase]) return rank[a.phase] - rank[b.phase];
  const av = a.startDate ?? "9999-12-31";
  const bv = b.startDate ?? "9999-12-31";
  return a.phase === "past" ? bv.localeCompare(av) : av.localeCompare(bv);
}

/**
 * Notifies accepted friends who are registered in an event's published PDGA
 * field that the caller just started tracking it. Registration comes from the
 * PDGA field cache only — no friend's private schedule is read. Failures are
 * swallowed: a notification is never allowed to fail the tracking action.
 */
export async function notifyFriendsOfTracking(
  supabase: SupabaseClient,
  userId: string,
  input: { pdgaEventRef: string; eventName: string; trackerEventId: string },
): Promise<number> {
  try {
    const { data: field } = await supabase
      .from("pdga_event_field")
      .select("pdga_number")
      .eq("event_ref", input.pdgaEventRef)
      .limit(WATCHLIST_LIMITS.members);
    const numbers = new Set(
      ((field ?? []) as Array<{ pdga_number: string | null }>)
        .map((r) => normalizePdgaNumber(r.pdga_number))
        .filter((n): n is string => Boolean(n)),
    );
    if (!numbers.size) return 0;

    const { data: links } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .limit(WATCHLIST_LIMITS.members);
    const friendIds = Array.from(
      new Set(
        ((links ?? []) as Array<{ requester_id: string; addressee_id: string }>)
          .map((l) => (l.requester_id === userId ? l.addressee_id : l.requester_id))
          .filter((id) => id && id !== userId),
      ),
    );
    if (!friendIds.length) return 0;

    // Match on normalized numbers rather than stored formatting so a legacy
    // "#12345" profile value still lines up with the PDGA field.
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, pdga_number")
      .in("id", friendIds)
      .not("pdga_number", "is", null)
      .limit(WATCHLIST_LIMITS.members);
    const recipients = ((profiles ?? []) as Array<{ id: string; pdga_number: string | null }>)
      .filter((p) => {
        const normalized = normalizePdgaNumber(p.pdga_number);
        return normalized ? numbers.has(normalized) : false;
      })
      .map((p) => p.id);
    if (!recipients.length) return 0;

    const { error } = await supabase.from("notifications").insert(
      recipients.map((id) => ({
        user_id: id,
        actor_id: userId,
        type: "event" as const,
        data: {
          kind: "friend_tracking_event",
          event_name: input.eventName,
          pdga_event_ref: input.pdgaEventRef,
          tracker_event_id: input.trackerEventId,
        },
      })),
    );
    if (error) return 0;
    return recipients.length;
  } catch {
    return 0;
  }
}
