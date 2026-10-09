import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type PublicProfileHead = {
  displayName: string | null;
  avatarUrl: string | null;
};

/**
 * Minimal public profile projection used for player-profile page metadata
 * (title + ProfilePage structured data). Display name and avatar only.
 */
export const getPublicProfileHead = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => z.object({ username: z.string().min(1).max(64) }).parse(raw))
  .handler(async ({ data }): Promise<PublicProfileHead> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("username", data.username)
      .maybeSingle();

    return {
      displayName: row?.display_name ?? null,
      avatarUrl: row?.avatar_url ?? null,
    };
  });
