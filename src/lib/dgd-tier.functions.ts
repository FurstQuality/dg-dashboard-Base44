import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Admin-only: process queued Tier jobs now instead of waiting for the background worker. */
export const runTierJobsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const [{ data: a }, { data: sa }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
    ]);
    const isAdmin = !!a || !!sa;
    if (!isAdmin) throw new Error("Only admins can run Tier updates.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processTierJobs } = await import("@/lib/dgd-tier/tier.server");
    return processTierJobs(supabaseAdmin as any, 200);
  });
