/**
 * Review queue for courses that may be the same venue listed twice.
 * Admin-only. Decisions are recorded, never auto-merged — "different" keeps
 * neighbouring courses in one park apart for good.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertAdmin({ supabase, userId }: Ctx) {
  const [a, s] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
  ]);
  if (!a.data && !s.data) throw new Error("Only admins can review course matches.");
}

export type MatchCourse = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  hole_count: number | null;
  source: string | null;
  sources: string[];
};

export type CourseMatchCandidate = {
  id: string;
  confidence: "high" | "medium" | "low";
  distance_m: number;
  reasons: string[];
  a: MatchCourse;
  b: MatchCourse;
};

const COURSE_COLS = "id, name, city, state, hole_count, source, course_sources(source)";

function toCourse(r: any): MatchCourse {
  return {
    id: r.id,
    name: r.name,
    city: r.city,
    state: r.state,
    hole_count: r.hole_count,
    source: r.source,
    sources: (r.course_sources ?? []).map((s: any) => s.source),
  };
}

export const listCourseMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ offset: z.number().int().min(0).default(0) }).parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const sb = (context as Ctx).supabase;
    const { data: rows, count, error } = await sb
      .from("course_match_candidates")
      .select(
        `id, confidence, distance_m, reasons, a:courses!course_match_candidates_course_a_fkey(${COURSE_COLS}), b:courses!course_match_candidates_course_b_fkey(${COURSE_COLS})`,
        { count: "exact" },
      )
      .eq("status", "pending")
      .order("confidence")
      .order("distance_m")
      .range(data.offset, data.offset + 24);
    if (error) throw new Error("Couldn't load possible duplicates.");
    const rank = { high: 0, medium: 1, low: 2 } as const;
    const list: CourseMatchCandidate[] = (rows ?? [])
      .filter((r: any) => r.a && r.b)
      .map((r: any) => ({
        id: r.id,
        confidence: r.confidence,
        distance_m: Number(r.distance_m),
        reasons: Array.isArray(r.reasons) ? r.reasons : [],
        a: toCourse(r.a),
        b: toCourse(r.b),
      }))
      .sort((x: CourseMatchCandidate, y: CourseMatchCandidate) => rank[x.confidence] - rank[y.confidence]);
    return { total: count ?? 0, rows: list };
  });

export const decideCourseMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["same", "different"]),
        note: z.string().max(300).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    const { error } = await ctx.supabase
      .from("course_match_candidates")
      .update({
        status: data.status,
        note: data.note ?? null,
        decided_by: ctx.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error("Couldn't save that decision.");
    return { ok: true };
  });

export const refreshCourseMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    const { data, error } = await ctx.supabase.rpc("refresh_course_match_candidates");
    if (error) throw new Error("Couldn't check for duplicates right now.");
    return { updated: Number(data ?? 0) };
  });

export const mergeCoursePair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), keepId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    const { error } = await ctx.supabase.rpc("merge_course_pair", {
      _candidate_id: data.id,
      _keep_id: data.keepId,
    });
    if (error) throw new Error(error.message?.startsWith("P") ? "Couldn't join those courses." : error.message || "Couldn't join those courses.");
    return { ok: true };
  });
