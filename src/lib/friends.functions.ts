/**
 * Friends data layer — authenticated, bounded, block-aware.
 *
 * Every read and write for the Friends hub goes through here so notifications,
 * block scoping, and limits stay consistent with the rest of Community.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { FRIEND_LIMITS } from "./community-queries";

export type FriendshipStatus = "pending" | "accepted" | "declined" | "blocked";

export type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
};

export type FriendProfileLite = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  home_course: string | null;
  pdga_rating: number | null;
};

export type FriendSuggestion = {
  user_id: string;
  mutual_count: number;
  shared_clubs?: number;
  same_city?: boolean;
  same_home_course?: boolean;
  same_state?: boolean;
  score?: number;
};

export type ExternalInvite = {
  id: string;
  invite_token: string;
  pdga_number: string;
  display_name: string | null;
  pdga_rating: number | null;
  location: string | null;
  created_at: string;
};

export type FriendsHub = {
  rows: FriendshipRow[];
  profiles: Record<string, FriendProfileLite>;
  suggestions: FriendSuggestion[];
  externalInvites: ExternalInvite[];
  /** Accepted-friend count (exact). */
  friendCount: number;
  /** Mutual friends per user id, for friends and suggestions alike. */
  mutuals: Record<string, number>;
};

const PROFILE_COLS = "id, username, display_name, avatar_url, home_course, pdga_rating";

/** Users the caller blocked, or who blocked the caller — hidden everywhere. */
async function loadHiddenIds(
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<Set<string>> {
  const [outgoing, incoming] = await Promise.all([
    supabase.from("blocks").select("blocked_id").eq("blocker_id", userId).limit(1000),
    supabase.from("blocks").select("blocker_id").eq("blocked_id", userId).limit(1000),
  ]);
  const hidden = new Set<string>();
  for (const r of (outgoing.data ?? []) as Array<{ blocked_id: string }>) hidden.add(r.blocked_id);
  for (const r of (incoming.data ?? []) as Array<{ blocker_id: string }>) hidden.add(r.blocker_id);
  return hidden;
}

/** Everything the Friends hub renders in one authenticated round trip. */
export const getFriendsHub = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FriendsHub> => {
    const { supabase, userId } = context;

    const [friendshipsRes, invitesRes, countRes, hidden] = await Promise.all([
      supabase
        .from("friendships")
        .select("id, requester_id, addressee_id, status, created_at")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(FRIEND_LIMITS.friendshipScan),
      supabase
        .from("pdga_friend_invites")
        .select("id, invite_token, pdga_number, display_name, pdga_rating, location, created_at")
        .eq("inviter_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(FRIEND_LIMITS.placeholders),
      supabase
        .from("friendships")
        .select("id", { count: "exact", head: true })
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq("status", "accepted"),
      loadHiddenIds(supabase as never, userId),
    ]);

    const otherOf = (r: FriendshipRow) =>
      r.requester_id === userId ? r.addressee_id : r.requester_id;
    const rows = ((friendshipsRes.data ?? []) as FriendshipRow[]).filter(
      (r) => r.status !== "blocked" && !hidden.has(otherOf(r)),
    );
    const externalInvites = (invitesRes.data ?? []) as ExternalInvite[];

    // Suggestions: local clubs and nearby players first, then friends-of-friends,
    // padded with newest players.
    const { fetchFriendSuggestions } = await import("@/lib/friend-suggestions.server");
    let suggestions: FriendSuggestion[] = (
      await fetchFriendSuggestions(userId, FRIEND_LIMITS.suggestions).catch(
        () => [] as FriendSuggestion[],
      )
    ).filter((s) => !hidden.has(s.user_id));

    const excluded = new Set<string>([userId, ...hidden]);
    for (const r of rows) {
      excluded.add(r.requester_id);
      excluded.add(r.addressee_id);
    }
    for (const s of suggestions) excluded.add(s.user_id);

    if (suggestions.length < 6) {
      const { data: fresh } = await supabase
        .from("profiles")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(FRIEND_LIMITS.freshProfiles);
      const extras = ((fresh ?? []) as Array<{ id: string }>)
        .filter((p) => !excluded.has(p.id))
        .slice(0, FRIEND_LIMITS.suggestions - suggestions.length)
        .map((p) => ({ user_id: p.id, mutual_count: 0 }));
      suggestions = [...suggestions, ...extras];
    }

    const ids = new Set<string>();
    for (const r of rows) {
      ids.add(r.requester_id);
      ids.add(r.addressee_id);
    }
    for (const s of suggestions) ids.add(s.user_id);
    const idList = [...ids].filter((id) => id && id !== userId);

    const profiles: Record<string, FriendProfileLite> = {};
    if (idList.length) {
      const { data } = await supabase
        .from("profiles")
        .select(PROFILE_COLS)
        .in("id", idList.slice(0, FRIEND_LIMITS.profileHydration));
      for (const p of (data ?? []) as FriendProfileLite[]) profiles[p.id] = p;
    }

    // Mutual counts: how many of my friends are also friends with each id.
    const myFriendIds = new Set(rows.filter((r) => r.status === "accepted").map(otherOf));
    const mutuals: Record<string, number> = {};
    for (const s of suggestions) mutuals[s.user_id] = s.mutual_count;
    if (myFriendIds.size && myFriendIds.size <= FRIEND_LIMITS.mutualScanFriends) {
      const friendIdList = [...myFriendIds];
      const { data: theirFriendships } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(
          `requester_id.in.(${friendIdList.join(",")}),addressee_id.in.(${friendIdList.join(",")})`,
        )
        .limit(FRIEND_LIMITS.mutualScanRows);
      const counts = new Map<string, Set<string>>();
      for (const r of (theirFriendships ?? []) as Array<{
        requester_id: string;
        addressee_id: string;
      }>) {
        const pairs: Array<[string, string]> = [
          [r.requester_id, r.addressee_id],
          [r.addressee_id, r.requester_id],
        ];
        for (const [a, b] of pairs) {
          // `b` is a friend-of-my-friend `a`; count a as a mutual for b.
          if (!myFriendIds.has(a) || b === userId) continue;
          const set = counts.get(b) ?? new Set<string>();
          set.add(a);
          counts.set(b, set);
        }
      }
      for (const [id, set] of counts) mutuals[id] = set.size;
    }

    return {
      rows,
      profiles,
      suggestions,
      externalInvites,
      friendCount: countRes.count ?? rows.filter((r) => r.status === "accepted").length,
      mutuals,
    };
  });

/** Player search for the Discover tab — excludes self and blocked users. */
export const searchPlayers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ q: z.string().trim().min(1).max(80) }).parse(raw))
  .handler(async ({ data, context }): Promise<FriendProfileLite[]> => {
    const { supabase, userId } = context;
    const hidden = await loadHiddenIds(supabase as never, userId);
    // Escape PostgREST `or` filter separators in user input.
    const q = data.q.replace(/[,()]/g, " ").trim();
    if (!q) return [];
    const { data: rows } = await supabase
      .from("profiles")
      .select(PROFILE_COLS)
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%,home_course.ilike.%${q}%`)
      .neq("id", userId)
      .limit(FRIEND_LIMITS.search);
    return ((rows ?? []) as FriendProfileLite[]).filter((p) => !hidden.has(p.id));
  });

/** Send a friend request and notify the target. */
export const sendFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ targetId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.targetId === userId) throw new Error("You can't add yourself.");

    const hidden = await loadHiddenIds(supabase as never, userId);
    if (hidden.has(data.targetId)) throw new Error("That player isn't available to add.");

    const { data: existing } = await supabase
      .from("friendships")
      .select("id, status")
      .or(
        `and(requester_id.eq.${userId},addressee_id.eq.${data.targetId}),and(requester_id.eq.${data.targetId},addressee_id.eq.${userId})`,
      )
      .maybeSingle();
    if (existing)
      return { kind: "already_related" as const, status: (existing as { status: string }).status };

    const { error } = await supabase.from("friendships").insert({
      requester_id: userId,
      addressee_id: data.targetId,
      status: "pending",
    } as never);
    if (error) throw new Error(error.message);

    // The notification is written by a database trigger on `friendships`, so it
    // lands for every path that creates a request.
    return { kind: "sent" as const };
  });

/** Accept or decline an incoming request. Only the addressee can answer. */
export const respondToFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ id: z.string().uuid(), accept: z.boolean() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, status")
      .eq("id", data.id)
      .maybeSingle();
    const rel = row as FriendshipRow | null;
    if (!rel || rel.addressee_id !== userId)
      throw new Error("That request is no longer available.");
    if (rel.status !== "pending")
      throw new Error(
        rel.status === "accepted"
          ? "You're already friends."
          : "That request has already been answered.",
      );

    const { error } = await supabase
      .from("friendships")
      .update({ status: data.accept ? "accepted" : "declined" } as never)
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);

    // Acceptance notifies the requester through the same trigger.
    return { ok: true as const, requesterId: rel.requester_id };
  });

/** Remove a friendship, cancel an outgoing request, or clear a declined row. */
export const removeFriendship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("id", data.id)
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Cancel a pending PDGA placeholder invite. */
export const cancelPdgaInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("pdga_friend_invites")
      .update({ status: "cancelled" } as never)
      .eq("id", data.id)
      .eq("inviter_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
