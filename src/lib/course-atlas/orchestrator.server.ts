/**
 * Course Atlas orchestrator — the durable, server-side "Update Course Atlas" run.
 *
 * One row in course_atlas_runs is the run. The existing 5-minute background
 * timer (and the Update button, once) calls advanceAtlasRun(), which claims a
 * short lease, does one small slice of every course job, and adds the results
 * to the run's totals. Closing the browser never stops it; three passes in a
 * row with nothing to do mark it done.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AtlasStage = "discover" | "listings" | "locations" | "maps" | "layouts" | "repairs";

export type AtlasTotals = {
  coursesChecked: number;
  coursesAdded: number;
  listingsRead: number;
  parFilled: number;
  locationsImproved: number;
  sceneLinks: number;
  mapRegions: number;
  mapSpotsFilled: number;
  layoutsCreated: number;
  layoutsUpdated: number;
  holesCreated: number;
  repairsDone: number;
  failed: number;
};

export const EMPTY_TOTALS: AtlasTotals = {
  coursesChecked: 0, coursesAdded: 0, listingsRead: 0, parFilled: 0, locationsImproved: 0,
  sceneLinks: 0, mapRegions: 0, mapSpotsFilled: 0, layoutsCreated: 0, layoutsUpdated: 0,
  holesCreated: 0, repairsDone: 0, failed: 0,
};

/** Per-stage outcome of the latest pass: whether it found work, or its source was delayed. */
export type StageState = { worked: number; delayed: boolean; at: string };

async function runPass(): Promise<{ t: AtlasTotals; stages: Record<AtlasStage, StageState>; idle: boolean }> {
  const t: AtlasTotals = { ...EMPTY_TOTALS };
  const at = new Date().toISOString();
  const stages = {} as Record<AtlasStage, StageState>;
  const step = async (stage: AtlasStage, fn: () => Promise<number>) => {
    try {
      const worked = await fn();
      stages[stage] = { worked, delayed: false, at };
    } catch {
      t.failed += 1;
      stages[stage] = { worked: 0, delayed: true, at };
    }
  };

  await step("discover", async () => {
    const { discoverUdiscCatalog, importUdiscListing } = await import("@/lib/ingest/udisc-catalog.server");
    const items = await discoverUdiscCatalog(5);
    for (const item of items) {
      t.coursesChecked += 1;
      try {
        const r = await importUdiscListing(item.target);
        if (r.status === "imported") t.coursesAdded += 1;
        else if (r.status !== "matched" && r.status !== "skipped") t.failed += 1;
      } catch {
        t.failed += 1;
      }
    }
    return items.length;
  });
  await step("listings", async () => {
    const { syncCourseListings } = await import("@/lib/course-sources/listing-sync.server");
    const r = await syncCourseListings(20);
    t.listingsRead += r.checked;
    t.parFilled += r.parFilled;
    t.layoutsCreated += r.draftLayouts;
    t.failed += r.failed;
    return r.checked;
  });
  await step("locations", async () => {
    const { upgradeApproximatePins } = await import("@/lib/course-pin-upgrade.server");
    const r = await upgradeApproximatePins(15);
    t.locationsImproved += r.upgraded;
    const { backfillSceneCourseLinks } = await import("@/lib/course-sources/scene-links.server");
    const s = await backfillSceneCourseLinks(10);
    t.sceneLinks += s.linked;
    return r.upgraded + s.linked;
  });
  await step("maps", async () => {
    const { harvestGeometryCells } = await import("@/lib/course-geometry/harvest.server");
    const r = await harvestGeometryCells(1);
    t.mapRegions += r.length;
    t.mapSpotsFilled += r.reduce((a, c) => a + c.filled, 0);
    if (r.some((c) => c.error)) throw new Error("map source delayed");
    return r.length;
  });
  await step("layouts", async () => {
    const { promoteCourseLayouts, coursesAwaitingPromotion, ensurePlayableLayout } = await import(
      "@/lib/ingest/layout-promote.server"
    );
    const batch = await coursesAwaitingPromotion(supabaseAdmin as never, 20);
    for (const courseId of batch) {
      const one = await promoteCourseLayouts(supabaseAdmin as never, courseId);
      if (await ensurePlayableLayout(supabaseAdmin as never, courseId)) one.layoutsCreated += 1;
      t.layoutsCreated += one.layoutsCreated;
      t.layoutsUpdated += one.layoutsUpdated;
      t.holesCreated += one.holesCreated;
    }
    return batch.length;
  });
  await step("repairs", async () => {
    const { processCourseRepairQueue } = await import("@/lib/course-sources/job-queue.server");
    const r = await processCourseRepairQueue(5);
    t.repairsDone += r.ok;
    return r.ok;
  });

  const idle = Object.values(stages).every((s) => s.worked === 0 && !s.delayed);
  return { t, stages, idle };
}

function addTotals(a: Partial<AtlasTotals>, b: AtlasTotals): AtlasTotals {
  const out = { ...EMPTY_TOTALS };
  for (const k of Object.keys(out) as (keyof AtlasTotals)[]) out[k] = (Number(a[k]) || 0) + b[k];
  return out;
}

/** Claims the running run (if any, and not already leased) and advances it one pass. */
export async function advanceAtlasRun(): Promise<{ advanced: boolean; status?: string }> {
  const now = new Date();
  const { data: run } = await supabaseAdmin
    .from("course_atlas_runs")
    .select("id, lease_until, passes, idle_passes, totals")
    .eq("status", "running")
    .maybeSingle();
  if (!run) return { advanced: false };
  if (run.lease_until && new Date(run.lease_until) > now) return { advanced: false, status: "busy" };

  // Compare-and-set lease so two timers never run the same pass.
  const lease = new Date(now.getTime() + 4 * 60_000).toISOString();
  let claim = supabaseAdmin.from("course_atlas_runs").update({ lease_until: lease }).eq("id", run.id).eq("status", "running");
  claim = run.lease_until ? claim.eq("lease_until", run.lease_until) : claim.is("lease_until", null);
  const { data: claimed } = await claim.select("id");
  if (!claimed?.length) return { advanced: false, status: "busy" };

  try {
    const { t, stages, idle } = await runPass();
    const idlePasses = idle ? run.idle_passes + 1 : 0;
    const finished = idlePasses >= 3;
    await supabaseAdmin
      .from("course_atlas_runs")
      .update({
        passes: run.passes + 1,
        idle_passes: idlePasses,
        totals: addTotals(run.totals as Partial<AtlasTotals>, t),
        stages,
        last_pass_at: new Date().toISOString(),
        lease_until: null,
        last_error: null,
        ...(finished ? { status: "done", finished_at: new Date().toISOString() } : {}),
      })
      .eq("id", run.id);
    return { advanced: true, status: finished ? "done" : "running" };
  } catch (e) {
    await supabaseAdmin
      .from("course_atlas_runs")
      .update({ lease_until: null, last_error: (e instanceof Error ? e.message : "Pass failed").slice(0, 300) })
      .eq("id", run.id);
    return { advanced: false, status: "error" };
  }
}
