import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ tierKey: z.string().min(1).max(80), interval: z.enum(["month", "year"]) }).parse(input))
  .handler(async ({ data, context }) => {
    if (!process.env.STRIPE_SECRET_KEY?.trim() || !process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
      return { error: "stripe_not_configured", message: "Payments are not available yet. Please try again after setup is complete." };
    }
    const { getStripe } = await import("./stripe.server");
    const { createHostedCheckout } = await import("./billing-checkout.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return createHostedCheckout(data, { stripe: getStripe(), admin: supabaseAdmin, db: context.supabase,
      userId: context.userId, email: context.claims.email as string | undefined });
  });

export const createBillingPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!process.env.STRIPE_SECRET_KEY?.trim()) return { error: "stripe_not_configured", message: "Payments are not configured yet." };
    const { getStripe } = await import("./stripe.server");
    const { createHostedPortal } = await import("./billing-checkout.server");
    return createHostedPortal({ stripe: getStripe(), db: context.supabase, userId: context.userId });
  });

/** Admin: manually grant an entitlement override to a user. */
export const grantOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    userId: z.string().uuid(), tierKey: z.string().min(1).max(80),
    reason: z.string().trim().max(1000).optional(), expiresAt: z.string().datetime().nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context as { supabase: any; userId: string };
    const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
      _user_id: actorId,
      _role: "super_admin",
    });
    if (roleError || isAdmin !== true) throw new Error("forbidden");

    const { error } = await supabase.from("entitlement_overrides").insert({
      user_id: data.userId,
      tier_key: data.tierKey,
      reason: data.reason ?? null,
      granted_by: actorId,
      expires_at: data.expiresAt ?? null,
    });
    if (error) throw error;
    return { ok: true };
  });

/** Admin: revoke all overrides for a given user. */
export const revokeOverrides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context as { supabase: any; userId: string };
    const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
      _user_id: actorId,
      _role: "super_admin",
    });
    if (roleError || isAdmin !== true) throw new Error("forbidden");

    const { error } = await supabase
      .from("entitlement_overrides")
      .delete()
      .eq("user_id", data.userId);
    if (error) throw error;
    return { ok: true };
  });
