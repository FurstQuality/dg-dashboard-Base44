/**
 * Admin reads and controls for the outside-data crawler.
 *
 * Everything here is admin-gated: the crawler state is shared app data, and a
 * signed-in player has no reason to see or steer it.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type IngestOverview = {
  paused: boolean;
  pauseReason: string | null;
  lastRunAt: string | null;
  budget: { used: number; total: number; day: string };
  batchSize: number;
  queue: { pending: number; running: number; dead: number; success: number };
  byKind: Array<{ kind: string; pending: number }>;
  regions: Array<{
    state: string;
    ring: number;
    events: number;
    courses: number;
    lastSweptAt: string | null;
  }>;
  runs: Array<{
    startedAt: string;
    finishedAt: string | null;
    claimed: number;
    succeeded: number;
    failed: number;
    discovered: number;
    pagesUsed: number;
    errors: string[];
  }>;
  recentErrors: Array<{ source: string; kind: string; target: string; error: string }>;
  health: {
    events: { total: number; placed: number; refreshedToday: number };
    courses: { total: number; placed: number; refreshedMonth: number };
    players: number;
    eventsBySource: Array<{ source: string; total: number; placed: number }>;
  };
};

async function assertAdmin(context: {
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> };
  userId: string;
}): Promise<void> {
  const [admin, superAdmin] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
  ]);
  if (!admin.data && !superAdmin.data) throw new Error("Admins only");
}

export const getIngestOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IngestOverview> => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [state, regions, runs, queue, errors] = await Promise.all([
      supabaseAdmin.from("ingest_state").select("*").eq("id", "singleton").maybeSingle(),
      supabaseAdmin
        .from("ingest_regions")
        .select("state_code, ring, events_seen, courses_seen, last_directory_at")
        .order("priority", { ascending: true })
        .limit(60),
      supabaseAdmin
        .from("ingest_runs")
        .select(
          "started_at, finished_at, claimed, succeeded, failed, discovered, pages_used, errors",
        )
        .order("started_at", { ascending: false })
        .limit(10),
      supabaseAdmin.from("ingest_queue").select("status, kind, next_run_at").limit(5000),
      supabaseAdmin
        .from("ingest_queue")
        .select("source, kind, target, last_error")
        .not("last_error", "is", null)
        .order("updated_at", { ascending: false })
        .limit(8),
    ]);

    const rows = (queue.data ?? []) as Array<{
      status: string;
      kind: string;
      next_run_at: string;
    }>;
    const now = Date.now();
    // "Waiting" means due now; anything scheduled ahead is a planned refresh.
    const isDue = (r: { status: string; next_run_at: string }) =>
      r.status === "pending" && Date.parse(r.next_run_at) <= now;
    const countBy = (status: string) => rows.filter((r) => r.status === status).length;
    const kinds = Array.from(new Set(rows.map((r) => r.kind))).map((kind) => ({
      kind,
      pending: rows.filter((r) => r.kind === kind && isDue(r)).length,
    }));

    // Data health: how much of the mirror is current and mappable.
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const [
      eventsTotal,
      eventsPlaced,
      eventsFresh,
      coursesTotal,
      coursesPlaced,
      coursesFresh,
      playersTotal,
      eventSources,
    ] = await Promise.all([
      supabaseAdmin.from("event_directory").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("event_directory")
        .select("id", { count: "exact", head: true })
        .not("latitude", "is", null),
      supabaseAdmin
        .from("event_directory")
        .select("id", { count: "exact", head: true })
        .gte("refreshed_at", dayAgo),
      supabaseAdmin.from("courses").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("courses")
        .select("id", { count: "exact", head: true })
        .not("latitude", "is", null),
      supabaseAdmin
        .from("courses")
        .select("id", { count: "exact", head: true })
        .gte("updated_at", monthAgo),
      supabaseAdmin.from("pdga_kb_players").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("event_directory").select("source, latitude").limit(5000),
    ]);

    const sourceRows = (eventSources.data ?? []) as Array<{
      source: string;
      latitude: number | null;
    }>;
    const eventsBySource = Array.from(new Set(sourceRows.map((r) => r.source))).map((source) => ({
      source,
      total: sourceRows.filter((r) => r.source === source).length,
      placed: sourceRows.filter((r) => r.source === source && r.latitude != null).length,
    }));

    const s = (state.data ?? {}) as Record<string, unknown>;

    return {
      paused: Boolean(s["paused"]),
      pauseReason: (s["pause_reason"] as string | null) ?? null,
      lastRunAt: (s["last_run_at"] as string | null) ?? null,
      budget: {
        used: Number(s["pages_used_today"] ?? 0),
        total: Number(s["daily_page_budget"] ?? 0),
        day: String(s["budget_day"] ?? ""),
      },
      batchSize: Number(s["batch_size"] ?? 0),
      queue: {
        pending: rows.filter(isDue).length,
        running: countBy("running"),
        dead: countBy("dead"),
        success: rows.filter((r) => r.status === "success" || (r.status === "pending" && !isDue(r)))
          .length,
      },
      byKind: kinds.sort((a, b) => b.pending - a.pending),
      regions: ((regions.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        state: String(r["state_code"] ?? ""),
        ring: Number(r["ring"] ?? 0),
        events: Number(r["events_seen"] ?? 0),
        courses: Number(r["courses_seen"] ?? 0),
        lastSweptAt: (r["last_directory_at"] as string | null) ?? null,
      })),
      runs: ((runs.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        startedAt: String(r["started_at"] ?? ""),
        finishedAt: (r["finished_at"] as string | null) ?? null,
        claimed: Number(r["claimed"] ?? 0),
        succeeded: Number(r["succeeded"] ?? 0),
        failed: Number(r["failed"] ?? 0),
        discovered: Number(r["discovered"] ?? 0),
        pagesUsed: Number(r["pages_used"] ?? 0),
        errors: (r["errors"] as string[] | null) ?? [],
      })),
      recentErrors: ((errors.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        source: String(r["source"] ?? ""),
        kind: String(r["kind"] ?? ""),
        target: String(r["target"] ?? ""),
        error: String(r["last_error"] ?? ""),
      })),
      health: {
        events: {
          total: Number(eventsTotal.count ?? 0),
          placed: Number(eventsPlaced.count ?? 0),
          refreshedToday: Number(eventsFresh.count ?? 0),
        },
        courses: {
          total: Number(coursesTotal.count ?? 0),
          placed: Number(coursesPlaced.count ?? 0),
          refreshedMonth: Number(coursesFresh.count ?? 0),
        },
        players: Number(playersTotal.count ?? 0),
        eventsBySource: eventsBySource.sort((a, b) => b.total - a.total),
      },
    };
  });

/** Run one batch right now (admin button). */
export const runIngestNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { runIngestTick } = await import("@/lib/ingest/run.server");
    return runIngestTick();
  });

export const setIngestPaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { paused: boolean }) => z.object({ paused: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { pauseIngest, resumeIngest } = await import("@/lib/ingest/queue.server");
    if (data.paused) await pauseIngest("Paused by an admin");
    else await resumeIngest();
    return { ok: true, paused: data.paused };
  });

/** Put failed items back in line (admin button). */
export const retryDeadIngestItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("ingest_queue")
      .update({
        status: "pending",
        attempts: 0,
        last_error: null,
        next_run_at: new Date().toISOString(),
      } as never)
      .eq("status", "dead")
      .select("id");
    return { requeued: data?.length ?? 0 };
  });
