import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";

type Ctx = { supabase: SupabaseClient; userId: string };

async function assertAdmin(c: Ctx) {
  const [a, s] = await Promise.all([
    c.supabase.rpc("has_role", { _user_id: c.userId, _role: "admin" }),
    c.supabase.rpc("has_role", { _user_id: c.userId, _role: "super_admin" }),
  ]);
  if (!a.data && !s.data) throw new Error("Only admins can update the Course Atlas.");
}

export type AtlasRun = {
  id: string;
  status: "running" | "done" | "stopped";
  started_at: string;
  last_pass_at: string | null;
  finished_at: string | null;
  passes: number;
  totals: Record<string, number>;
  stages: Record<string, { worked: number; delayed: boolean; at: string }>;
  last_error: string | null;
};

export type AtlasOverview = {
  run: AtlasRun | null;
  courses: number;
  onMap: number;
  unlocated: number;
  usableMaps: number;
  completeMaps: number;
  review: { location: number; courseMap: number; duplicate: number; total: number };
};

export const getAtlasOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AtlasOverview> => {
    await assertAdmin(context as unknown as Ctx);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const live = () => db.from("courses").select("id", { count: "exact", head: true }).eq("moderation_status", "approved").eq("is_ghost", false);
    const [run, all, onMap, cov, geo, dup] = await Promise.all([
      db.from("course_atlas_runs").select("id, status, started_at, last_pass_at, finished_at, passes, totals, stages, last_error").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      live(),
      live().not("latitude", "is", null),
      db.rpc("course_map_coverage_by_state"),
      db.from("course_geometry_observations").select("course_id", { count: "exact", head: true }).eq("match_state", "needs_review"),
      db.from("course_match_candidates").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    const rows = (cov.data ?? []) as Array<{ partial: number; starter: number; verified: number }>;
    const starter = rows.reduce((a, r) => a + Number(r.starter), 0);
    const verified = rows.reduce((a, r) => a + Number(r.verified), 0);
    const partial = rows.reduce((a, r) => a + Number(r.partial), 0);
    const courses = all.count ?? 0;
    const located = onMap.count ?? 0;
    const unlocated = Math.max(0, courses - located);
    const courseMap = geo.count ?? 0;
    const duplicate = dup.count ?? 0;
    return {
      run: (run.data as AtlasRun | null) ?? null,
      courses,
      onMap: located,
      unlocated,
      usableMaps: starter + verified + partial,
      completeMaps: verified,
      review: { location: unlocated, courseMap, duplicate, total: unlocated + courseMap + duplicate },
    };
  });

/** Starts (or resumes) the durable update and runs its first pass right away. */
export const startAtlasUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as unknown as Ctx);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: running } = await db.from("course_atlas_runs").select("id").eq("status", "running").maybeSingle();
    if (!running) {
      const { error } = await db.from("course_atlas_runs").insert({ started_by: (context as unknown as Ctx).userId });
      if (error && !/duplicate/i.test(error.message)) throw new Error("We couldn't start the update. Try again.");
    }
    const { advanceAtlasRun } = await import("./orchestrator.server");
    return advanceAtlasRun();
  });

export const stopAtlasUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as unknown as Ctx);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    await db.from("course_atlas_runs").update({ status: "stopped", finished_at: new Date().toISOString(), lease_until: null }).eq("status", "running");
    return { ok: true };
  });
