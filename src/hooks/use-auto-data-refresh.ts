/**
 * Keeps a signed-in player's own PDGA data current without any sync button.
 *
 * Shared sources (tournament listings, courses, live scoring) refresh on the
 * server timer. This hook covers the one thing that is personal: the player's
 * official rating, sanctioned rounds and upcoming PDGA schedule. It runs quietly
 * when their copy is stale and never shows a toast.
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  PDGA_SERVER_FUNCTIONS,
  getLastPdgaSyncAt,
  syncAllPdgaData,
  type SyncMyPdgaEventsFn,
  type SyncMyPdgaFromProfileFn,
} from "@/lib/pdga-sync";

/** How old a player's PDGA copy may get before we refresh it in the background. */
const STALE_AFTER_MS = 60 * 60 * 1000;
/** How often we re-check staleness while the app stays open. */
const CHECK_EVERY_MS = 10 * 60 * 1000;

export function useAutoDataRefresh(userId: string | undefined) {
  const queryClient = useQueryClient();
  const syncProfile = useServerFn(PDGA_SERVER_FUNCTIONS.syncMyPdgaFromProfile);
  const syncEvents = useServerFn(PDGA_SERVER_FUNCTIONS.syncMyPdgaEvents);
  const running = useRef(false);

  useEffect(() => {
    if (!userId) return;

    async function maybeSync() {
      if (running.current) return;
      const lastAt = getLastPdgaSyncAt();
      if (lastAt && Date.now() - new Date(lastAt).getTime() < STALE_AFTER_MS) return;
      running.current = true;
      try {
        await syncAllPdgaData(
          {
            syncProfile: syncProfile as unknown as SyncMyPdgaFromProfileFn,
            syncEvents: syncEvents as unknown as SyncMyPdgaEventsFn,
          },
          { silent: true, queryClient },
        );
      } catch {
        /* the next check retries — nothing for the player to do */
      } finally {
        running.current = false;
      }
    }

    void maybeSync();
    const timer = window.setInterval(() => void maybeSync(), CHECK_EVERY_MS);
    const onFocus = () => void maybeSync();
    const onVisible = () => {
      if (document.visibilityState === "visible") void maybeSync();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, queryClient, syncProfile, syncEvents]);
}
