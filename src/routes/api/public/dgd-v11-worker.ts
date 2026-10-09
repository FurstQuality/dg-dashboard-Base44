import { createFileRoute } from "@tanstack/react-router";

/** Background V1.1 shadow worker, called by the database scheduler. Token-verified. */
export const Route = createFileRoute("/api/public/dgd-v11-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-dgd-worker-token") ?? "";
        if (!/^[a-f0-9]{64}$/.test(token)) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: ok } = await (supabaseAdmin as any).rpc("dgd_v11_worker_token_ok", { _token: token });
        if (!ok) return new Response("Unauthorized", { status: 401 });
        try {
          const { processDgdV11Jobs } = await import("@/lib/dgd-v1/shadow.server");
          const r = await processDgdV11Jobs(supabaseAdmin, 25);
          // Full batch: more work is likely waiting, so wake the next run instead of waiting for the hourly backstop.
          if (r.claimed >= 25) await (supabaseAdmin as any).rpc("dgd_v11_wake_worker").catch(() => null);
          const { processTierJobs } = await import("@/lib/dgd-tier/tier.server");
          const t = await processTierJobs(supabaseAdmin, 25).catch(() => ({ tier_jobs: 0, tier_done: 0, tier_failed: 1 }));
          return Response.json({ ...r, ...t });
        } catch {
          return new Response("Worker error", { status: 500 });
        }
      },
    },
  },
});
