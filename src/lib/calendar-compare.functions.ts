/**
 * Calendar comparison + share — coordinate rounds with friends.
 *
 * Uses admin client after verifying accepted friendship + share opt-in.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type FriendRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  calendar_shared_with_friends: boolean;
};

type SchedRow = {
  id: string;
  title: string;
  source: string;
  status: string;
  starts_on: string | null;
  ends_on: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
};

/** Return accepted friends with a share-opt-in flag for the compare picker. */
export const listFriendsForCompare = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (error) { console.error("[db]", error.message); throw new Error("Something went wrong on our side. Please try again."); }
    const ids = Array.from(
      new Set(
        (data ?? [])
          .map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id))
          .filter((id): id is string => !!id && id !== userId),
      ),
    );
    if (ids.length === 0) return [] as FriendRow[];
    const { data: profs, error: pe } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, calendar_shared_with_friends")
      .in("id", ids);
    if (pe) throw new Error(pe.message);
    return (profs ?? []) as FriendRow[];
  });

/**
 * Fetch schedules for the caller plus selected friend IDs, filtered to a date range.
 * Only friends who have opted in are returned; missing/opted-out friends are omitted.
 */
export const getCalendarsForCompare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { friendIds: string[]; from: string; to: string }) =>
    z
      .object({
        friendIds: z.array(z.string().uuid()).max(20),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { friendIds, from, to } = data;

    // Verify each friendId is an accepted friend of the caller.
    let allowedFriendIds: string[] = [];
    if (friendIds.length > 0) {
      const { data: fs, error } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id, status")
        .eq("status", "accepted")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
      if (error) { console.error("[db]", error.message); throw new Error("Something went wrong on our side. Please try again."); }
      const friendSet = new Set(
        (fs ?? []).map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id)),
      );
      allowedFriendIds = friendIds.filter((id) => friendSet.has(id));
    }

    // Load caller profile + allowed friends' profiles.
    const profileIds = [userId, ...allowedFriendIds];
    const { data: profs, error: pe } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, calendar_shared_with_friends")
      .in("id", profileIds);
    if (pe) throw new Error(pe.message);
    const profileMap = new Map<string, FriendRow>();
    for (const p of (profs ?? []) as FriendRow[]) profileMap.set(p.id, p);

    // Filter out friends who opted out of sharing.
    const visibleFriendIds = allowedFriendIds.filter(
      (id) => profileMap.get(id)?.calendar_shared_with_friends !== false,
    );

    // Server-side read across users → use admin client after authorization.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userIds = [userId, ...visibleFriendIds];
    const { data: rows, error: se } = await supabaseAdmin
      .from("scheduled_events")
      .select("id, user_id, title, source, status, starts_on, ends_on, location, city, state")
      .in("user_id", userIds)
      .not("starts_on", "is", null)
      .lte("starts_on", to)
      .or(`ends_on.gte.${from},ends_on.is.null`)
      .neq("status", "withdrawn")
      .neq("status", "cancelled")
      .order("starts_on", { ascending: true });
    if (se) throw new Error(se.message);

    // Group by user.
    const byUser = new Map<string, SchedRow[]>();
    for (const uid of userIds) byUser.set(uid, []);
    for (const r of (rows ?? []) as Array<SchedRow & { user_id: string }>) {
      const list = byUser.get(r.user_id);
      if (!list) continue;
      // Filter events fully before `from`
      if (r.ends_on && r.ends_on < from) continue;
      if (!r.ends_on && r.starts_on && r.starts_on < from) continue;
      const { user_id: _uid, ...rest } = r;
      list.push(rest);
    }

    return {
      me: profileMap.get(userId) ?? null,
      participants: userIds
        .map((uid) => ({
          profile: profileMap.get(uid) ?? null,
          events: byUser.get(uid) ?? [],
          shared:
            uid === userId ? true : profileMap.get(uid)?.calendar_shared_with_friends !== false,
        }))
        .filter((p) => !!p.profile),
      hidden_friend_ids: allowedFriendIds.filter((id) => !visibleFriendIds.includes(id)),
    };
  });

/** Update the caller's own share-with-friends preference. */
export const setCalendarShareWithFriends = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { enabled: boolean }) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ calendar_shared_with_friends: data.enabled })
      .eq("id", userId);
    if (error) { console.error("[db]", error.message); throw new Error("Something went wrong on our side. Please try again."); }
    return { ok: true };
  });

/**
 * Create a "casual round" invitation: adds a scheduled_event on the caller's
 * calendar and sends a notification to each invited friend so they can add it
 * to theirs from the Notifications tray.
 */
export const proposeRoundWithFriends = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      friendIds: string[];
      date: string;
      title: string;
      location?: string | null;
      notes?: string | null;
    }) =>
      z
        .object({
          friendIds: z.array(z.string().uuid()).min(1).max(20),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          title: z.string().trim().min(1).max(200),
          location: z.string().max(200).nullable().optional(),
          notes: z.string().max(1000).nullable().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify accepted friendship for every recipient.
    const { data: fs, error } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (error) { console.error("[db]", error.message); throw new Error("Something went wrong on our side. Please try again."); }
    const friendSet = new Set(
      (fs ?? []).map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id)),
    );
    const recipients = data.friendIds.filter((id) => friendSet.has(id));
    if (recipients.length === 0) throw new Error("No valid friends selected");

    // Insert own scheduled_event (RLS-scoped).
    const { data: mine, error: ie } = await supabase
      .from("scheduled_events")
      .insert({
        user_id: userId,
        source: "manual",
        status: "interested",
        title: data.title,
        starts_on: data.date,
        ends_on: data.date,
        location: data.location ?? null,
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (ie) throw new Error(ie.message);

    // Notify each friend (admin client — cross-user inserts).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = recipients.map((rid) => ({
      user_id: rid,
      actor_id: userId,
      type: "event" as const,
      data: {
        kind: "round_invite",
        title: data.title,
        date: data.date,
        location: data.location ?? null,
        notes: data.notes ?? null,
        scheduled_event_id: mine.id,
      },
    }));
    const { error: ne } = await supabaseAdmin.from("notifications").insert(rows);
    if (ne) throw new Error(ne.message);

    return { scheduled_event_id: mine.id, invited: recipients.length };
  });
