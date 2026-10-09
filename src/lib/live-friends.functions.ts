/**
 * Client-callable entry points for "Live now" — friends' live scoring.
 *
 * Reads run as the signed-in player so friend visibility and RLS apply.
 * The refresh action is rate-limited by the registry's own sync timestamp, so
 * viewers can't stack PDGA requests on top of the scheduled sync.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadFriendLiveCard, loadFriendsLiveNow } from "@/lib/live/friend-live.server";
import type { FriendsLiveNow } from "@/lib/live/friend-live";

/** Shortest gap between viewer-triggered refreshes of the same event. */
const MANUAL_REFRESH_COOLDOWN_MS = 25_000;

export const listFriendsLiveNow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FriendsLiveNow> => {
    return loadFriendsLiveNow(context.supabase, context.userId);
  });

export const getFriendLiveCard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ eventRef: z.string().min(1), pdgaNumber: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    return loadFriendLiveCard(context.supabase, data.eventRef, data.pdgaNumber);
  });

export const refreshFriendsLiveNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ eventRef: z.string().min(1).optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const live = await loadFriendsLiveNow(context.supabase, context.userId);
    const refs = data.eventRef
      ? live.events.filter((e) => e.eventRef === data.eventRef).map((e) => e.eventRef)
      : live.events.map((e) => e.eventRef);
    if (!refs.length) {
      return { refreshed: 0, skipped: 0, message: "No live events to refresh right now." };
    }

    const cutoff = Date.now() - MANUAL_REFRESH_COOLDOWN_MS;
    const due = live.events.filter((e) => {
      if (!refs.includes(e.eventRef)) return false;
      if (!e.lastSyncedAt) return true;
      return new Date(e.lastSyncedAt).getTime() < cutoff;
    });
    if (!due.length) {
      return { refreshed: 0, skipped: refs.length, message: "Scores are already up to date." };
    }

    const { syncEventLiveScores } = await import("@/lib/live/pdga-live.server");
    let refreshed = 0;
    for (const event of due.slice(0, 5)) {
      const result = await syncEventLiveScores(event.eventRef);
      if (result.ok) refreshed += 1;
    }
    return {
      refreshed,
      skipped: refs.length - due.length,
      message:
        refreshed > 0
          ? `Updated live scoring for ${refreshed} event${refreshed === 1 ? "" : "s"}.`
          : "Couldn't reach live scoring just now — we'll keep trying in the background.",
    };
  });
