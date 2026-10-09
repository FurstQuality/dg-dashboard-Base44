import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin-only: run the multi-stage PDGA resolver for one PDGA number and store
 * the result with full provenance. Users cannot trigger ingestion for
 * arbitrary players.
 */
export const runPdgaIntelSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        pdgaNumber: z.string().regex(/^\d{1,7}$/),
        maxEvents: z.number().int().min(0).max(200).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_platform_admin", {
      _uid: context.userId,
    });
    if (!isAdmin) throw new Error("Only platform admins can run PDGA source sync.");
    const { collectPdgaIntel } = await import("./pdga-intel/collect");
    const { createPoliteFetcher } = await import("./pdga-intel/fetcher");
    const payload = await collectPdgaIntel(data.pdgaNumber, createPoliteFetcher(), {
      maxEvents: data.maxEvents ?? 40,
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.rpc(
      "pdga_src_apply" as never,
      { p: payload } as never,
    );
    if (error) throw new Error("Couldn't save the PDGA data. Try again shortly.");
    return {
      result: JSON.parse(JSON.stringify(res ?? null)) as Record<string, number | boolean> | null,
      rounds: payload.rounds.length,
      events: payload.events.length,
      issues: payload.issues.length,
    };
  });
