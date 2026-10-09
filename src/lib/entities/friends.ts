import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getFriendSuggestions } from "@/lib/friend-suggestions.functions";

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

export type FriendsPageData = {
  rows: FriendshipRow[];
  profiles: Record<string, FriendProfileLite>;
  suggestions: FriendSuggestion[];
  externalInvites: ExternalInvite[];
};

/**
 * Everything the Friends page needs — friendships, hydrated profiles,
 * suggestions (padded with newest players if slim), and external PDGA
 * invites. Mutations invalidate ["friends-page", userId] to refetch.
 */
export function friendsPageQueryOptions(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["friends-page", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<FriendsPageData> => {
      if (!userId) {
        return { rows: [], profiles: {}, suggestions: [], externalInvites: [] };
      }
      const [{ data: fs }, sugg, { data: invs }] = await Promise.all([
        supabase
          .from("friendships")
          .select("id, requester_id, addressee_id, status, created_at")
          .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
          .order("created_at", { ascending: false }),
        getFriendSuggestions({ data: { limit: 12 } }).catch(() => [] as FriendSuggestion[]),
        supabase
          .from("pdga_friend_invites")
          .select(
            "id, invite_token, pdga_number, display_name, pdga_rating, location, created_at, status",
          )
          .eq("inviter_id", userId)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
      ]);
      const rows = (fs as FriendshipRow[]) ?? [];
      const externalInvites = (invs as ExternalInvite[] | null) ?? [];
      let suggestions = (sugg ?? []) as FriendSuggestion[];

      if (suggestions.length < 6) {
        const excluded = new Set<string>([userId]);
        rows.forEach((r) => {
          excluded.add(r.requester_id);
          excluded.add(r.addressee_id);
        });
        suggestions.forEach((s) => excluded.add(s.user_id));
        const { data: fresh } = await supabase
          .from("profiles")
          .select("id")
          .not("id", "in", `(${[...excluded].join(",")})`)
          .order("created_at", { ascending: false })
          .limit(24);
        const extras = ((fresh as Array<{ id: string }> | null) ?? [])
          .filter((p) => !excluded.has(p.id))
          .slice(0, 12 - suggestions.length)
          .map((p) => ({ user_id: p.id, mutual_count: 0 }));
        suggestions = [...suggestions, ...extras];
      }

      const ids = new Set<string>();
      rows.forEach((r) => {
        ids.add(r.requester_id);
        ids.add(r.addressee_id);
      });
      suggestions.forEach((s) => ids.add(s.user_id));
      const idList = [...ids].filter((id) => id && id !== userId);
      const profiles: Record<string, FriendProfileLite> = {};
      if (idList.length) {
        const { data } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, home_course, pdga_rating")
          .in("id", idList);
        ((data as FriendProfileLite[] | null) ?? []).forEach((p) => {
          profiles[p.id] = p;
        });
      }
      return { rows, profiles, suggestions, externalInvites };
    },
  });
}

export type FriendId = string;

/**
 * All accepted-friend user ids for the given user. Central to every social
 * surface (Feed, Play, Community, Tracker) so filtering stays consistent.
 */
export function friendIdsQueryOptions(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["friend-ids", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<FriendId[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id, status")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq("status", "accepted");
      if (error) throw error;
      const ids = (data ?? [])
        .map((f) => (f.requester_id === userId ? f.addressee_id : f.requester_id))
        .filter((id): id is string => !!id && id !== userId);
      return [...new Set(ids)];
    },
  });
}

export type FriendPlayingRow = {
  round_id: string;
  started_at: string;
  player_id: string;
  player_name: string;
  player_username: string | null;
  course_name: string | null;
};

/**
 * Friends currently mid-round. One canonical query — consumed by Feed,
 * Play Overview, and Community Overview so every surface renders the same list.
 */
export function friendsPlayingNowQueryOptions(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["friends-playing-now", userId],
    enabled: !!userId,
    staleTime: 20_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<FriendPlayingRow[]> => {
      if (!userId) return [];
      const { data: friendships } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id, status")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq("status", "accepted");
      const friendIds = [
        ...new Set(
          (friendships ?? [])
            .map((f) => (f.requester_id === userId ? f.addressee_id : f.requester_id))
            .filter((id): id is string => !!id && id !== userId),
        ),
      ];
      if (!friendIds.length) return [];
      const { data: rounds } = await supabase
        .from("rounds")
        .select("id, started_at, created_by, course_id")
        .in("created_by", friendIds)
        .eq("status", "in_progress")
        .order("started_at", { ascending: false })
        .limit(8);
      const rows = rounds ?? [];
      if (!rows.length) return [];
      const courseIds = [...new Set(rows.map((r) => r.course_id).filter(Boolean) as string[])];
      const [{ data: courses }, { data: profiles }] = await Promise.all([
        courseIds.length
          ? supabase.from("courses").select("id, name").in("id", courseIds)
          : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
        supabase.from("profiles").select("id, display_name, username").in("id", friendIds),
      ]);
      const cmap = new Map((courses ?? []).map((c) => [c.id, c.name]));
      const pmap = new Map(
        (profiles ?? []).map((p) => [
          p.id,
          {
            name: (p.display_name || p.username || "Friend") as string,
            username: (p.username as string | null) ?? null,
          },
        ]),
      );
      return rows.map((r) => {
        const info = pmap.get(r.created_by);
        return {
          round_id: r.id,
          started_at: r.started_at,
          player_id: r.created_by,
          player_name: info?.name ?? "Friend",
          player_username: info?.username ?? null,
          course_name: (r.course_id ? cmap.get(r.course_id) : null) ?? null,
        };
      });
    },
  });
}
