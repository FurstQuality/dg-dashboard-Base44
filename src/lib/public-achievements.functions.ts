import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type PublicAchievementBadge = {
  key: string;
  earned_at: string;
  name: string;
  icon: string;
  tier: string;
};

/**
 * Public profile badges. `user_achievements` is owner-only at the RLS level,
 * so profile badges are served here with an explicit, minimal projection
 * (badge name/icon/tier + earned date only — no progress or internal fields).
 */
export const getPublicAchievements = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({ userId: z.string().uuid(), limit: z.number().int().min(1).max(24).optional() })
      .parse(raw),
  )
  .handler(async ({ data }): Promise<PublicAchievementBadge[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("user_achievements")
      .select("achievement_key, earned_at, achievements!inner(name, icon, tier)")
      .eq("user_id", data.userId)
      .order("earned_at", { ascending: false })
      .limit(data.limit ?? 12);

    return (
      (rows ?? []) as unknown as Array<{
        achievement_key: string;
        earned_at: string;
        achievements: { name: string; icon: string; tier: string };
      }>
    ).map((r) => ({
      key: r.achievement_key,
      earned_at: r.earned_at,
      name: r.achievements.name,
      icon: r.achievements.icon,
      tier: r.achievements.tier,
    }));
  });
