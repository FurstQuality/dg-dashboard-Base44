import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { rpc: (fn: string, args: unknown) => Promise<{ data: unknown }> }; userId: string };

async function assertAdmin(context: Ctx) {
  const [a, s] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
  ]);
  if (!a.data && !s.data) throw new Error("Only admins can run the geometry harvester.");
}

export type HarvestStatus = {
  cells: { total: number; done: number; pending: number; running: number; error: number };
  sitesFound: number;
  coursesMatched: number;
  holesFilled: number;
  observations: { total: number; accepted: number; needsReview: number; unmatched: number; conflict: number; rejected: number };
  review: Array<{ courseId: string; name: string; city: string | null; state: string | null; pins: number }>;
};

export const getHarvestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HarvestStatus> => {
    await assertAdmin(context as unknown as Ctx);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const cellCount = async (st?: string) => {
      let q = db.from("geometry_harvest_cells").select("id", { count: "exact", head: true });
      if (st) q = q.eq("status", st);
      return (await q).count ?? 0;
    };
    const obsCount = async (st?: string) => {
      let q = db.from("course_geometry_observations").select("id", { count: "exact", head: true });
      if (st) q = q.eq("match_state", st);
      return (await q).count ?? 0;
    };
    const [total, done, pending, running, error, oTotal, accepted, needsReview, unmatched, conflict, rejected, sums, reviewRows] = await Promise.all([
      cellCount(), cellCount("done"), cellCount("pending"), cellCount("running"), cellCount("error"),
      obsCount(), obsCount("accepted"), obsCount("needs_review"), obsCount("unmatched"), obsCount("conflict"), obsCount("rejected"),
      db.from("geometry_harvest_cells").select("sites_found, courses_matched, holes_filled").gt("sites_found", 0).limit(5000),
      db.from("course_geometry_observations").select("course_id").eq("match_state", "needs_review").not("course_id", "is", null).limit(5000),
    ]);
    const s = (sums.data ?? []).reduce((a, r) => ({ sites: a.sites + r.sites_found, matched: a.matched + r.courses_matched, filled: a.filled + r.holes_filled }), { sites: 0, matched: 0, filled: 0 });
    const perCourse = new Map<string, number>();
    for (const r of reviewRows.data ?? []) perCourse.set(r.course_id!, (perCourse.get(r.course_id!) ?? 0) + 1);
    const top = [...perCourse.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
    const { data: names } = top.length
      ? await db.from("courses").select("id, name, city, state").in("id", top.map(([id]) => id))
      : { data: [] };
    const nm = new Map((names ?? []).map((c) => [c.id, c]));
    return {
      cells: { total, done, pending, running, error },
      sitesFound: s.sites, coursesMatched: s.matched, holesFilled: s.filled,
      observations: { total: oTotal, accepted, needsReview, unmatched, conflict, rejected },
      review: top.map(([id, pins]) => ({ courseId: id, name: nm.get(id)?.name ?? "Course", city: nm.get(id)?.city ?? null, state: nm.get(id)?.state ?? null, pins })),
    };
  });

export const runHarvestNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as unknown as Ctx);
    const { harvestGeometryCells } = await import("@/lib/course-geometry/harvest.server");
    const r = await harvestGeometryCells(1);
    return r.reduce((a, c) => ({ cells: a.cells + 1, sites: a.sites + c.sites, filled: a.filled + c.filled, review: a.review + c.review, failed: a.failed + (c.error ? 1 : 0) }), { cells: 0, sites: 0, filled: 0, review: 0, failed: 0 });
  });

export const reviewCourseGeometry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ courseId: z.string().uuid(), action: z.enum(["accept", "reject"]) }).parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as Ctx);
    if (data.action === "accept") {
      const { acceptCourseObservations } = await import("@/lib/course-geometry/harvest.server");
      return { holes: await acceptCourseObservations(data.courseId) };
    }
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    await db.from("course_geometry_observations").update({ match_state: "rejected" }).eq("course_id", data.courseId).eq("match_state", "needs_review");
    return { holes: 0 };
  });

export type UnassignedPinCourse = { courseId: string; name: string; state: string | null; pins: number; layouts: Array<{ id: string; name: string; holes: number }> };

/** Courses whose map pins carry hole numbers but couldn't be placed (several holes share each number). */
export const getUnassignedPinCourses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UnassignedPinCourse[]> => {
    await assertAdmin(context as unknown as Ctx);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: obs } = await db.from("course_geometry_observations").select("id, course_id")
      .not("course_id", "is", null).not("hole_ref", "is", null).eq("hole_ref_inferred", false)
      .in("match_state", ["matched", "accepted"]).limit(5000);
    const ids = (obs ?? []).map((o) => o.id);
    const linked = new Set<string>();
    for (let i = 0; i < ids.length; i += 300) {
      const part = ids.slice(i, i + 300);
      const [t, b] = await Promise.all([
        db.from("course_tees").select("source_observation_id").in("source_observation_id", part),
        db.from("course_baskets").select("source_observation_id").in("source_observation_id", part),
      ]);
      for (const r of [...(t.data ?? []), ...(b.data ?? [])]) if (r.source_observation_id) linked.add(r.source_observation_id);
    }
    const per = new Map<string, number>();
    for (const o of obs ?? []) if (!linked.has(o.id)) per.set(o.course_id!, (per.get(o.course_id!) ?? 0) + 1);
    const top = [...per.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 40);
    if (!top.length) return [];
    const cids = top.map(([id]) => id);
    const [{ data: cs }, { data: ls }] = await Promise.all([
      db.from("courses").select("id, name, state").in("id", cids),
      db.from("course_layouts").select("id, course_id, name, hole_count").in("course_id", cids).neq("status", "archived"),
    ]);
    const cm = new Map((cs ?? []).map((c) => [c.id, c]));
    return top.map(([id, pins]) => ({
      courseId: id, name: cm.get(id)?.name ?? "Course", state: cm.get(id)?.state ?? null, pins,
      layouts: (ls ?? []).filter((l) => l.course_id === id).map((l) => ({ id: l.id, name: l.name, holes: l.hole_count })),
    }));
  });

/** Attach a course's numbered map pins to the holes of the layout the reviewer picked. Adds tee/basket choices; never changes the layout. */
export const assignPinsToLayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ courseId: z.string().uuid(), layoutId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as Ctx);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: l } = await db.from("course_layouts").select("id").eq("id", data.layoutId).eq("course_id", data.courseId).maybeSingle();
    if (!l) throw new Error("That layout isn't on this course.");
    const { materializePhysicalAssets } = await import("@/lib/course-geometry/harvest.server");
    return { added: await materializePhysicalAssets(db as never, data.courseId, data.layoutId) };
  });

export type MapCoverageState = { state: string; courses: number; unmapped: number; partial: number; starter: number; verified: number };

/** Unmapped / partly mapped / community (starter) / verified map counts per state. */
export const getMapCoverageByState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MapCoverageState[]> => {
    await assertAdmin(context as unknown as Ctx);
    const { data, error } = await (context as unknown as { supabase: { rpc: (f: string) => Promise<{ data: unknown; error: unknown }> } }).supabase.rpc("course_map_coverage_by_state");
    if (error) throw new Error("Couldn't count map coverage right now.");
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      state: String(r.state), courses: Number(r.courses), unmapped: Number(r.unmapped), partial: Number(r.partial), starter: Number(r.starter), verified: Number(r.verified),
    }));
  });
