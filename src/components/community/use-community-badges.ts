import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { channelNonce } from "@/lib/realtime";

export type CommunityBadges = {
  friendRequests: number;
  unreadMessages: number;
};

/**
 * Lightweight counts for the Community subnav.
 * Cheap queries, refreshed on auth + realtime deltas.
 */
export function useCommunityBadges(): CommunityBadges {
  const [badges, setBadges] = useState<CommunityBadges>({ friendRequests: 0, unreadMessages: 0 });

  useEffect(() => {
    let active = true;

    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        if (active) setBadges({ friendRequests: 0, unreadMessages: 0 });
        return;
      }

      // Pending friend requests where I'm the addressee
      const { count: reqCount } = await supabase
        .from("friendships")
        .select("id", { count: "exact", head: true })
        .eq("addressee_id", uid)
        .eq("status", "pending");

      // Unread messages across my conversations
      const { data: members } = await supabase
        .from("conversation_members")
        .select("conversation_id, last_read_at")
        .eq("user_id", uid);

      let unread = 0;
      if (members && members.length) {
        for (const m of members as { conversation_id: string; last_read_at: string | null }[]) {
          const q = supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", m.conversation_id)
            .neq("sender_id", uid);
          const { count } = m.last_read_at ? await q.gt("created_at", m.last_read_at) : await q;
          unread += count ?? 0;
        }
      }

      if (active) {
        setBadges({ friendRequests: reqCount ?? 0, unreadMessages: unread });
      }
    };

    // Navigating away aborts in-flight requests; keep the current badge counts.
    load().catch(() => {});

    // Unique channel name per mount — Supabase reuses channels by name, so a
    // shared name causes "cannot add postgres_changes callbacks after subscribe()"
    // when multiple consumers of this hook mount concurrently.
    const ch = supabase
      .channel(`community-badges-${channelNonce()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_members" }, load)
      .subscribe();

    // Realtime already pushes changes; this poll is only a safety net, so it
    // pauses while the tab is hidden and catches up when the player returns.
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") load().catch(() => {});
    }, 60_000);

    const onVisible = () => {
      if (document.visibilityState === "visible") load().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(ch);
    };
  }, []);

  return badges;
}
