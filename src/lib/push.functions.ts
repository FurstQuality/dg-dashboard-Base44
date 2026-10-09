import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertPushEndpoint, safeNotificationPath } from "./push-safety";

export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  return process.env.VAPID_PUBLIC_KEY || "";
});

const SubSchema = z.object({
  endpoint: z.string().url().max(2048),
  p256dh: z.string().min(1).max(512),
  auth: z.string().min(1).max(512),
  userAgent: z.string().max(512).optional(),
});

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SubSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    assertPushEndpoint(data.endpoint);
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.userAgent ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ endpoint: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("push_subscriptions").delete().eq("endpoint", data.endpoint);
    return { ok: true as const };
  });

/**
 * Send a push to a specific user. Called from other server functions after
 * creating an in-app notification row. Silently no-ops if the user has no
 * push subscriptions or VAPID isn't configured. Invalid/expired subscriptions
 * (404/410 from push service) are pruned.
 */
export const pushToUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        title: z.string().min(1).max(120),
        body: z.string().max(400).optional(),
        url: z.string().max(512).optional(),
        tag: z.string().max(120).optional(),
        /** Urgent alerts (score conflicts, event cancellations) bypass quiet hours. */
        urgent: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || "mailto:noreply@dgdashboard.app";
    if (!publicKey || !privateKey) return { ok: false as const, sent: 0, reason: "no_vapid" };

    // Authorization: an authenticated caller may only push to a target when a
    // matching in-app notification row already links them (actor -> user) — i.e.
    // the app just created a legitimate notification for that recipient. This
    // prevents any signed-in user from spamming arbitrary devices with
    // attacker-controlled titles/URLs. Self-pushes (test/debug) are allowed.
    if (data.userId !== context.userId) {
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: notif } = await context.supabase
        .from("notifications")
        .select("id")
        .eq("user_id", data.userId)
        .eq("actor_id", context.userId)
        .gte("created_at", since)
        .limit(1)
        .maybeSingle();
      if (!notif) {
        return { ok: false as const, sent: 0, reason: "forbidden" };
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Respect the recipient's push channel and quiet hours (nightly window plus
    // tournament days from tee off through awards). In-app notification rows are
    // untouched; only the device push is held back.
    if (!data.urgent) {
      const { holdPushForQuietHours } = await import("@/lib/quiet-hours.server");
      const held = await holdPushForQuietHours(data.userId);
      if (held) return { ok: true as const, sent: 0, reason: held };
    }

    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", data.userId);
    if (!subs || subs.length === 0) return { ok: true as const, sent: 0 };

    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails(subject, publicKey, privateKey);

    const payload = JSON.stringify({
      title: data.title,
      body: data.body ?? "",
      url: safeNotificationPath(data.url),
      tag: data.tag,
    });

    let sent = 0;
    const toDelete: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          assertPushEndpoint(s.endpoint);
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 60 * 60 * 24 },
          );
          sent++;
        } catch (err: unknown) {
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) toDelete.push(s.id);
        }
      }),
    );
    if (toDelete.length) await supabaseAdmin.from("push_subscriptions").delete().in("id", toDelete);
    return { ok: true as const, sent };
  });
