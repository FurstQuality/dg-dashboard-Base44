import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/iap-webhook")({
  server: { handlers: { POST: async ({ request }) => {
    const { handleIapWebhook } = await import("@/lib/iap-webhook.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return handleIapWebhook(request, { admin: supabaseAdmin, secret: process.env.IAP_WEBHOOK_SECRET,
      environment: process.env.DGD_SANDBOX === "1" ? "SANDBOX" : "PRODUCTION" });
  } } },
});
