/**
 * Admin controls for the nationwide UDisc course sweep.
 *
 * The crawler works through the catalogue on its own tick; these are the manual
 * levers: mirror the public course list, queue the next slice, or read a few
 * listings right now to confirm the sweep is landing.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = {
  supabase: { rpc: (fn: string, args: unknown) => Promise<{ data: unknown }> };
  userId: string;
};

async function assertAdmin(context: Ctx) {
  const [admin, superAdmin] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
  ]);
  if (!admin.data && !superAdmin.data) {
    throw new Error("Only admins can run the nationwide course sweep.");
  }
}

export type UdiscCatalogStatus = {
  total: number;
  pending: number;
  queued: number;
  imported: number;
  matched: number;
  skipped: number;
  failed: number;
  topStates: Array<{ state: string; courses: number }>;
  recent: Array<{
    slug: string;
    name: string | null;
    city: string | null;
    state: string | null;
    status: string;
    courseId: string | null;
  }>;
};

export const getUdiscCatalogStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UdiscCatalogStatus> => {
    await assertAdmin(context as unknown as Ctx);
    const { catalogCounts } = await import("@/lib/ingest/udisc-catalog.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const counts = await catalogCounts();

    const { data: done } = await supabaseAdmin
      .from("udisc_catalog")
      .select("state")
      .in("status", ["imported", "matched"])
      .not("state", "is", null)
      .limit(5000);
    const byState = new Map<string, number>();
    for (const row of done ?? []) {
      const key = String((row as { state: unknown }).state);
      byState.set(key, (byState.get(key) ?? 0) + 1);
    }
    const topStates = Array.from(byState.entries())
      .map(([state, courses]) => ({ state, courses }))
      .sort((a, b) => b.courses - a.courses)
      .slice(0, 8);

    const { data: recent } = await supabaseAdmin
      .from("udisc_catalog")
      .select("slug, name, city, state, status, course_id")
      .in("status", ["imported", "matched", "failed"])
      .order("fetched_at", { ascending: false })
      .limit(10);

    return {
      ...counts,
      topStates,
      recent: (recent ?? []).map((r) => ({
        slug: String(r.slug),
        name: (r.name as string | null) ?? null,
        city: (r.city as string | null) ?? null,
        state: (r.state as string | null) ?? null,
        status: String(r.status),
        courseId: (r.course_id as string | null) ?? null,
      })),
    };
  });

export const syncUdiscCatalogNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ listed: number; added: number }> => {
    await assertAdmin(context as unknown as Ctx);
    const { syncUdiscCatalog } = await import("@/lib/ingest/udisc-catalog.server");
    return syncUdiscCatalog();
  });

export const queueUdiscCatalogBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ limit: z.number().int().min(25).max(1000) }).parse(raw),
  )
  .handler(async ({ data, context }): Promise<{ queued: number }> => {
    await assertAdmin(context as unknown as Ctx);
    const { discoverUdiscCatalog } = await import("@/lib/ingest/udisc-catalog.server");
    const { enqueue } = await import("@/lib/ingest/queue.server");
    const items = await discoverUdiscCatalog(data.limit);
    return { queued: await enqueue(items) };
  });

export const runUdiscCatalogBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ limit: z.number().int().min(1).max(10) }).parse(raw))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      read: number;
      added: number;
      matched: number;
      skipped: number;
      failed: number;
    }> => {
      await assertAdmin(context as unknown as Ctx);
      const { discoverUdiscCatalog, importUdiscListing } =
        await import("@/lib/ingest/udisc-catalog.server");
      const items = await discoverUdiscCatalog(data.limit);
      let added = 0;
      let matched = 0;
      let skipped = 0;
      let failed = 0;
      for (const item of items) {
        try {
          const result = await importUdiscListing(item.target);
          if (result.status === "imported") added += 1;
          else if (result.status === "matched") matched += 1;
          else if (result.status === "skipped") skipped += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }
      return { read: items.length, added, matched, skipped, failed };
    },
  );
