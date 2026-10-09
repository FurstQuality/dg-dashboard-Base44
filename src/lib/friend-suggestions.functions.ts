import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SuggestionRow } from "@/lib/friend-suggestions";

/**
 * Location-aware friend suggestions for the authenticated caller: local club
 * mates and players in your city or home course rank ahead of friends-of-friends
 * and same-state players.
 */
export const getFriendSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z.object({ limit: z.number().int().min(1).max(50).optional() }).parse(raw ?? {}),
  )
  .handler(async ({ data, context }): Promise<SuggestionRow[]> => {
    const { fetchFriendSuggestions } = await import("@/lib/friend-suggestions.server");
    return fetchFriendSuggestions(context.userId, data.limit ?? 12);
  });
