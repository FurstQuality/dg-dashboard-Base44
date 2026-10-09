import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  mergePlatformConfig,
  mergeNotificationPrefs,
  mergePrivacyPrefs,
  type PlatformConfig,
  type NotificationPrefs,
  type PrivacyPrefs,
} from "@/lib/platform-config";

/** Public read: anyone (even signed-out visitors) can read platform config. */
export const getPlatformConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("admin_settings")
    .select("platform_config")
    .eq("id", true)
    .maybeSingle();
  const raw = (data?.platform_config ?? null) as Partial<PlatformConfig> | null;
  return mergePlatformConfig(raw);
});

/** Admin-only save. Verifies super_admin before writing. */
export const savePlatformConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { config: PlatformConfig }) => input)
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["super_admin", "admin"])
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (
      supabaseAdmin.from("admin_settings") as unknown as {
        upsert: (
          v: unknown,
          o: { onConflict: string },
        ) => Promise<{ error: { message: string } | null }>;
      }
    ).upsert({ id: true, platform_config: data.config }, { onConflict: "id" });
    if (error) throw error;
    return { ok: true };
  });

export const getMyPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // notification_prefs / privacy_prefs are column-revoked from the
    // `authenticated` role so members cannot read each other's settings.
    // Read them server-side for the verified caller only.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("notification_prefs, privacy_prefs")
      .eq("id", context.userId)
      .maybeSingle();
    const row = (data ?? {}) as {
      notification_prefs?: Partial<NotificationPrefs> | null;
      privacy_prefs?: Partial<PrivacyPrefs> | null;
    };
    return {
      notifications: mergeNotificationPrefs(row.notification_prefs),
      privacy: mergePrivacyPrefs(row.privacy_prefs),
    };
  });

export const saveMyPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { notifications?: NotificationPrefs; privacy?: PrivacyPrefs }) => input)
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.notifications) patch.notification_prefs = data.notifications;
    if (data.privacy) patch.privacy_prefs = data.privacy;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await (
      context.supabase.from("profiles") as unknown as {
        update: (v: Record<string, unknown>) => {
          eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
      }
    )
      .update(patch)
      .eq("id", context.userId);
    if (error) throw error;
    return { ok: true };
  });
