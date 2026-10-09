import { useEffect, useState } from "react";
import { channelNonce } from "@/lib/realtime";
import { supabase } from "@/integrations/supabase/client";

export function useUnreadNotifications(userId: string | null | undefined) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        const { count: c } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .is("read_at", null);
        if (!cancelled) setCount(c ?? 0);
      } catch {
        // Network aborts happen whenever the user navigates mid-request.
        // Keep the previous badge count instead of surfacing a console error.
      }
    };
    load();

    // Unique channel name per mount: reusing a name returns the already
    // subscribed channel, and adding listeners after subscribe() throws.
    const channel = supabase
      .channel(`notif:${userId}:${channelNonce()}`)

      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return count;
}
