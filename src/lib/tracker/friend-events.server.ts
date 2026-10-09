/**
 * Server-only loader for "Friends are playing".
 *
 * Friend registrations come from PDGA's published field cache matched against
 * friends' linked PDGA numbers — the caller never reads a friend's private
 * schedule. Conflicts compare against the caller's own tracked events and
 * committed schedule rows only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePdgaNumber, pdgaNumberQueryValues } from "@/lib/pdga-number";
import {
  findConflicts,
  friendEventSort,
  groupRegistrationsByEvent,
  type FriendEvent,
  type FriendEventConflict,
  type FriendRegistration,
} from "@/lib/tracker/friend-events";

/** Hard read bounds so this surface can never fan out unbounded. */
export const FRIEND_EVENT_LIMITS = {
  friendships: 300,
  friends: 300,
  field: 1500,
  events: 60,
  groups: 100,
  trackedEvents: 200,
  schedule: 200,
} as const;

/** Statuses that mean the caller actually intends to play. */
const COMMITTED_STATUSES = ["registered", "confirmed", "waitlisted"] as const;

export async function loadFriendEvents(
  supabase: SupabaseClient,
  userId: string,
  options: { today?: string } = {},
): Promise<{ events: FriendEvent[]; friendsWithPdga: number; friendsTotal: number }> {
  const today = options.today ?? new Date().toISOString().slice(0, 10);

  const { data: links, error: linkError } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .limit(FRIEND_EVENT_LIMITS.friendships);
  if (linkError) throw new Error(linkError.message);

  const friendIds = Array.from(
    new Set(
      ((links ?? []) as Array<{ requester_id: string; addressee_id: string }>)
        .map((l) => (l.requester_id === userId ? l.addressee_id : l.requester_id))
        .filter((id) => id !== userId),
    ),
  );
  if (!friendIds.length) return { events: [], friendsWithPdga: 0, friendsTotal: 0 };

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, username, pdga_number")
    .in("id", friendIds)
    .not("pdga_number", "is", null)
    .limit(FRIEND_EVENT_LIMITS.friends);
  if (profileError) throw new Error(profileError.message);

  const friendsByNumber = new Map<string, Omit<FriendRegistration, "division" | "rating">>();
  for (const p of (profiles ?? []) as Array<{
    id: string;
    display_name: string | null;
    username: string | null;
    pdga_number: string | null;
  }>) {
    const num = normalizePdgaNumber(p.pdga_number);
    if (!num) continue;
    friendsByNumber.set(num, {
      userId: p.id,
      displayName: p.display_name ?? p.username ?? `#${num}`,
      username: p.username,
      pdgaNumber: num,
    });
  }
  if (!friendsByNumber.size) {
    return { events: [], friendsWithPdga: 0, friendsTotal: friendIds.length };
  }

  // Query every stored spelling, then key results by the normalized number.
  const numbers = Array.from(friendsByNumber.keys());
  const { data: fieldRows, error: fieldError } = await supabase
    .from("pdga_event_field")
    .select("event_ref, pdga_number, division, rating")
    .in("pdga_number", pdgaNumberQueryValues(numbers))
    .limit(FRIEND_EVENT_LIMITS.field);
  if (fieldError) throw new Error(fieldError.message);

  const byEvent = groupRegistrationsByEvent(
    (
      (fieldRows ?? []) as Array<{
        event_ref: string;
        pdga_number: string;
        division: string | null;
        rating: number | null;
      }>
    ).flatMap((r) => {
      const pdgaNumber = normalizePdgaNumber(r.pdga_number);
      if (!pdgaNumber) return [];
      return [
        {
          eventRef: r.event_ref,
          pdgaNumber,
          division: r.division,
          rating: r.rating,
        },
      ];
    }),
    friendsByNumber,
  );
  if (!byEvent.size) {
    return { events: [], friendsWithPdga: friendsByNumber.size, friendsTotal: friendIds.length };
  }

  const refs = Array.from(byEvent.keys()).slice(0, FRIEND_EVENT_LIMITS.field);
  const { data: kbRows } = await supabase
    .from("pdga_kb_events")
    .select("pdga_event_id, name, tier, start_date, end_date, city, state, country, pdga_url")
    .in("pdga_event_id", refs)
    .gte("start_date", today)
    .order("start_date", { ascending: true })
    .limit(FRIEND_EVENT_LIMITS.events);

  const { data: groups } = await supabase
    .from("tracker_groups")
    .select("id")
    .eq("owner_id", userId)
    .limit(FRIEND_EVENT_LIMITS.groups);
  const groupIds = ((groups ?? []) as Array<{ id: string }>).map((g) => g.id);

  const [{ data: trackedRows }, { data: scheduleRows }] = await Promise.all([
    groupIds.length
      ? supabase
          .from("tracker_group_events")
          .select("name, pdga_event_ref, event_date")
          .in("group_id", groupIds)
          .limit(FRIEND_EVENT_LIMITS.trackedEvents)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    supabase
      .from("scheduled_events")
      .select("title, starts_on, ends_on, status")
      .eq("user_id", userId)
      .in("status", COMMITTED_STATUSES as unknown as string[])
      .gte("starts_on", today)
      .limit(FRIEND_EVENT_LIMITS.schedule),
  ]);

  const trackedRefs = new Set<string>();
  const commitments: Array<
    FriendEventConflict & { startDate: string | null; endDate: string | null }
  > = [];
  for (const row of (trackedRows ?? []) as Array<{
    name: string | null;
    pdga_event_ref: string | null;
    event_date: string | null;
  }>) {
    if (row.pdga_event_ref) trackedRefs.add(row.pdga_event_ref);
    if (row.event_date) {
      commitments.push({
        title: row.name ?? "Tracked event",
        startDate: row.event_date,
        endDate: row.event_date,
        source: "tracked",
      });
    }
  }
  for (const row of (scheduleRows ?? []) as Array<{
    title: string;
    starts_on: string | null;
    ends_on: string | null;
  }>) {
    commitments.push({
      title: row.title,
      startDate: row.starts_on,
      endDate: row.ends_on ?? row.starts_on,
      source: "schedule",
    });
  }

  const events: FriendEvent[] = (
    (kbRows ?? []) as Array<{
      pdga_event_id: string;
      name: string | null;
      tier: string | null;
      start_date: string | null;
      end_date: string | null;
      city: string | null;
      state: string | null;
      country: string | null;
      pdga_url: string | null;
    }>
  ).map((row) => {
    const range = { startDate: row.start_date, endDate: row.end_date ?? row.start_date };
    const location =
      [row.city, row.state, row.country]
        .map((p) => p?.trim())
        .filter((p): p is string => !!p)
        .join(", ") || null;
    return {
      eventRef: row.pdga_event_id,
      name: row.name,
      tier: row.tier,
      startDate: range.startDate,
      endDate: range.endDate,
      location,
      pdgaUrl: row.pdga_url ?? `https://www.pdga.com/tour/event/${row.pdga_event_id}`,
      tracked: trackedRefs.has(row.pdga_event_id),
      friends: byEvent.get(row.pdga_event_id) ?? [],
      conflicts: findConflicts(range, commitments).filter((c) => c.title !== row.name),
    };
  });

  events.sort(friendEventSort);
  return { events, friendsWithPdga: friendsByNumber.size, friendsTotal: friendIds.length };
}
