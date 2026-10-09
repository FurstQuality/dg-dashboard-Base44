/**
 * Personal tournament watchlist server functions.
 *
 * `trackEventByPdgaRef` is idempotent: saving an event you already follow
 * returns the existing row instead of raising, so a double tap is harmless.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ensurePersonalTrackerGroup,
  notifyFriendsOfTracking,
  eventPhase,
  WATCHLIST_LIMITS,
  watchlistSort,
  type TrackedEvent,
} from "@/lib/tracker-watchlist.server";
import { PERSONAL_TRACKER_NAME } from "@/lib/tracker-watchlist-shared";

export const listTrackedEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ events: TrackedEvent[]; personalGroupId: string }> => {
    const { supabase, userId } = context;
    const personal = await ensurePersonalTrackerGroup(supabase, userId);

    const { data: groups, error: groupError } = await supabase
      .from("tracker_groups")
      .select("id, name")
      .eq("owner_id", userId)
      .limit(WATCHLIST_LIMITS.events);
    if (groupError) throw new Error(groupError.message);
    const groupIds = (groups ?? []).map((g) => g.id as string);
    if (!groupIds.length) return { events: [], personalGroupId: personal.id };
    const groupNames = new Map<string, string>(
      (groups ?? []).map((g) => [g.id as string, g.name as string]),
    );

    const { data: events, error: eventError } = await supabase
      .from("tracker_group_events")
      .select(
        "id, group_id, name, pdga_event_ref, tier, sanctioning_tier, event_date, location, url, event_status, live_status, live_current_round, last_synced_at",
      )
      .in("group_id", groupIds)
      // Only events saved on purpose — crew-schedule discoveries are excluded.
      .eq("auto_added", false)
      .order("event_date", { ascending: false })
      .limit(WATCHLIST_LIMITS.events);
    if (eventError) throw new Error(eventError.message);
    const rows = events ?? [];
    if (!rows.length) return { events: [], personalGroupId: personal.id };

    const eventIds = rows.map((r) => r.id as string);
    const [{ data: rounds }, { data: members }] = await Promise.all([
      supabase
        .from("tracker_event_rounds")
        .select("event_id, round_date")
        .in("event_id", eventIds)
        .limit(WATCHLIST_LIMITS.rounds),
      supabase
        .from("tracker_group_members")
        .select("group_id")
        .in("group_id", groupIds)
        .limit(WATCHLIST_LIMITS.members),
    ]);

    const roundCount = new Map<string, number>();
    const lastRoundDate = new Map<string, string>();
    for (const r of rounds ?? []) {
      const id = r.event_id as string;
      roundCount.set(id, (roundCount.get(id) ?? 0) + 1);
      const d = r.round_date as string | null;
      if (d && (!lastRoundDate.get(id) || d > lastRoundDate.get(id)!)) lastRoundDate.set(id, d);
    }
    const memberCount = new Map<string, number>();
    for (const m of members ?? []) {
      const gid = m.group_id as string;
      memberCount.set(gid, (memberCount.get(gid) ?? 0) + 1);
    }

    const mapped: TrackedEvent[] = rows.map((r) => {
      const groupId = r.group_id as string;
      const startDate = (r.event_date as string | null) ?? null;
      const endDate = lastRoundDate.get(r.id as string) ?? startDate;
      return {
        id: r.id as string,
        groupId,
        groupName: groupNames.get(groupId) ?? "Tracker",
        isPersonal: groupId === personal.id,
        name: (r.name as string) ?? "Untitled event",
        pdgaEventRef: (r.pdga_event_ref as string | null) ?? null,
        tier: (r.tier as string | null) ?? (r.sanctioning_tier as string | null) ?? null,
        startDate,
        endDate,
        location: (r.location as string | null) ?? null,
        url: (r.url as string | null) ?? null,
        eventStatus: (r.event_status as string | null) ?? null,
        liveStatus: (r.live_status as string | null) ?? null,
        liveCurrentRound: (r.live_current_round as number | null) ?? null,
        lastSyncedAt: (r.last_synced_at as string | null) ?? null,
        phase: eventPhase({
          startDate,
          endDate,
          liveStatus: (r.live_status as string | null) ?? null,
          eventStatus: (r.event_status as string | null) ?? null,
          name: (r.name as string | null) ?? null,
          // Tracker rows don't carry a kind, so a titled league is detected by name.
          kind: /\bleagues?\b/i.test((r.name as string | null) ?? "") ? "league" : null,
        }),
        playersTracked: memberCount.get(groupId) ?? 0,
        roundsPublished: roundCount.get(r.id as string) ?? 0,
      };
    });

    mapped.sort(watchlistSort);
    return { events: mapped, personalGroupId: personal.id };
  });

export const trackEventByPdgaRef = createServerFn({ method: "POST" })
  .validator((raw) =>
    z
      .object({
        // PDGA refs are short numeric strings; in-app events use a prefixed
        // app ref (e.g. "dgd-tournament-<uuid>"), so allow room for those too.
        pdga_event_ref: z.string().min(1).max(80),
        name: z.string().min(1).max(200),
        event_date: z.string().max(20).optional().nullable(),
        location: z.string().max(200).optional().nullable(),
        tier: z.string().max(30).optional().nullable(),
        url: z.string().url().max(500).optional().nullable(),
        /** Save into a specific crew tracker instead of the personal one. */
        group_id: z.string().uuid().optional().nullable(),
      })
      .parse(raw),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let groupId = data.group_id ?? null;
    if (groupId) {
      const { data: owned, error } = await supabase
        .from("tracker_groups")
        .select("id")
        .eq("id", groupId)
        .eq("owner_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!owned) throw new Error("That tracker isn't yours to add events to.");
    } else {
      groupId = (await ensurePersonalTrackerGroup(supabase, userId)).id;
    }

    // Idempotent: already following this event in this tracker is a no-op.
    const { data: existing, error: findError } = await supabase
      .from("tracker_group_events")
      .select("id")
      .eq("group_id", groupId)
      .eq("pdga_event_ref", data.pdga_event_ref)
      .limit(1)
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    if (existing) {
      // A crew-schedule discovery becomes a real save once you save it.
      await supabase
        .from("tracker_group_events")
        .update({ auto_added: false })
        .eq("id", existing.id as string);
      try {
        const { hydrateTrackedEvent } = await import("@/lib/tracker/event-hydrate.server");
        await hydrateTrackedEvent(supabase, existing.id as string);
      } catch {
        // Non-fatal.
      }
      return { eventId: existing.id as string, groupId, created: false };
    }

    const { data: created, error } = await supabase
      .from("tracker_group_events")
      .insert({
        group_id: groupId,
        name: data.name,
        event_date: data.event_date || null,
        location: data.location ?? null,
        tier: data.tier ?? null,
        pdga_event_ref: data.pdga_event_ref,
        url: data.url ?? `https://www.pdga.com/tour/event/${data.pdga_event_ref}`,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    // The event row is the tracker's source of truth, so fill it out now from
    // everything the app already knows about this event.
    try {
      const { hydrateTrackedEvent } = await import("@/lib/tracker/event-hydrate.server");
      await hydrateTrackedEvent(supabase, created.id as string);
    } catch {
      // Partial details are fine — the next sync tries again.
    }
    const notified = await notifyFriendsOfTracking(supabase, userId, {
      pdgaEventRef: data.pdga_event_ref,
      eventName: data.name,
      trackerEventId: created.id as string,
    });
    return { eventId: created.id as string, groupId, created: true, friendsNotified: notified };
  });

export const untrackEvent = createServerFn({ method: "POST" })
  .validator((raw) => z.object({ event_id: z.string().uuid() }).parse(raw))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("tracker_group_events")
      .select("id, group_id, tracker_groups!inner(owner_id)")
      .eq("id", data.event_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const owner = (row as { tracker_groups?: { owner_id?: string } } | null)?.tracker_groups
      ?.owner_id;
    if (!row || owner !== userId) throw new Error("That event isn't in one of your trackers.");
    const { error: deleteError } = await supabase
      .from("tracker_group_events")
      .delete()
      .eq("id", data.event_id);
    if (deleteError) throw new Error(deleteError.message);
    return { ok: true };
  });

export { PERSONAL_TRACKER_NAME };
