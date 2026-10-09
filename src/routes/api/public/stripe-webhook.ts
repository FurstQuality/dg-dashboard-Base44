import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: { handlers: { POST: async ({ request }) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secret || !key) return new Response("stripe_not_configured", { status: 503 });
    const { getStripe } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { handleStripeWebhook } = await import("@/lib/stripe-webhook.server");
    return handleStripeWebhook(request, { stripe: getStripe(), admin: supabaseAdmin, secret, live: key.startsWith("sk_live_") || key.startsWith("rk_live_") });
  } } },
});
