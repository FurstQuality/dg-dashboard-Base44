import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INVENTORY_TABLES } from "@/lib/data-intel/registry";

export type DataIntelOverview = {
  counts: Record<string, number | null>;
  queue: { source: string; status: string; count: number }[];
  pdgaJobs: { status: string; count: number }[];
  openConflicts: number | null;
  udiscCatalog: { status: string; count: number }[];
  lastFetch: { source: string; at: string | null }[];
};

const tally = <T extends Record<string, unknown>>(rows: T[], keys: (keyof T)[]) => {
  const m = new Map<string, { row: Record<string, string>; count: number }>();
  for (const r of rows) {
    const k = keys.map((x) => String(r[x])).join("|");
    const cur = m.get(k) ?? {
      row: Object.fromEntries(keys.map((x) => [x, String(r[x])])) as Record<string, string>,
      count: 0,
    };
    cur.count++;
    m.set(k, cur);
  }
  return [...m.values()].map((v) => ({ ...v.row, count: v.count }));
};

/** Admin-only, read-only snapshot of what DGD knows across every source. */
export const getDataIntelOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DataIntelOverview> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isAdmin) throw new Error("Super admin only");

    // Counting is privileged inventory work after the role check above.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {
      from: (t: string) => any;
    };

    const counts: Record<string, number | null> = {};
    await Promise.all(
      INVENTORY_TABLES.map(async (t) => {
        const { count, error } = await db.from(t).select("*", { count: "exact", head: true });
        counts[t] = error ? null : (count ?? 0);
      }),
    );

    const [queue, jobs, conflicts, udisc, pdgaFetch, srcFetch] = await Promise.all([
      db.from("ingest_queue").select("source,status").limit(50000),
      db.from("pdga_kb_sync_jobs").select("status").limit(20000),
      db.from("pdga_src_conflicts").select("*", { count: "exact", head: true }).eq("status", "open"),
      db.from("udisc_catalog").select("status").limit(50000),
      db.from("pdga_src_fetches").select("retrieved_at").order("retrieved_at", { ascending: false }).limit(1),
      db.from("course_sources").select("source,last_fetched_at").order("last_fetched_at", { ascending: false, nullsFirst: false }).limit(1),
    ]);

    return {
      counts,
      queue: tally(queue.data ?? [], ["source", "status"]) as DataIntelOverview["queue"],
      pdgaJobs: tally(jobs.data ?? [], ["status"]) as DataIntelOverview["pdgaJobs"],
      openConflicts: conflicts.error ? null : (conflicts.count ?? 0),
      udiscCatalog: tally(udisc.data ?? [], ["status"]) as DataIntelOverview["udiscCatalog"],
      lastFetch: [
        { source: "PDGA", at: pdgaFetch.data?.[0]?.retrieved_at ?? null },
        { source: "Courses", at: srcFetch.data?.[0]?.last_fetched_at ?? null },
      ],
    };
  });
