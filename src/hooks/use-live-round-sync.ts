/**
 * Keeps a player's own round data live everywhere in the app.
 *
 * Rounds reach DG Dashboard from three places: rounds scored here, PDGA
 * sanctioned rounds pulled from a player's PDGA page, and UDisc rounds brought
 * in from a UDisc export. Whichever way a round lands — and whichever device
 * it landed on — this hook hears about the change and refreshes every cached
 * view of rounds, ratings and stats, so no screen shows a stale number.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { invalidatePlayerDataQueries } from "@/lib/pdga-sync";
import { channelNonce } from "@/lib/realtime";

/** Collapse bursts (a whole scorecard saving hole by hole) into one refresh. */
const REFRESH_DEBOUNCE_MS = 1200;

export function useLiveRoundSync(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    let timer: number | undefined;
    const refresh = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(
        () => invalidatePlayerDataQueries(queryClient),
        REFRESH_DEBOUNCE_MS,
      );
    };

    const channel = supabase
      // A fresh topic every mount: reusing a topic returns the channel that is
      // already subscribed, and adding listeners to it throws.
      .channel(`player-round-data:${userId}:${channelNonce()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rounds", filter: `created_by=eq.${userId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "external_rounds",
          filter: `user_id=eq.${userId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "round_ratings", filter: `user_id=eq.${userId}` },
        refresh,
      )
      .subscribe();

    return () => {
      if (timer) window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
