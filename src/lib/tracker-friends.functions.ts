/** Authenticated server function behind the tracker's "Friends are playing" panel. */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadFriendEvents } from "@/lib/tracker/friend-events.server";
import type { FriendEvent } from "@/lib/tracker/friend-events";

export const listFriendEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ events: FriendEvent[]; friendsWithPdga: number; friendsTotal: number }> =>
      loadFriendEvents(context.supabase, context.userId),
  );
