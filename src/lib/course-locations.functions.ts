/**
 * Review queue for courses with no usable location. Admin-only; a reviewer
 * places a course by pasting real coordinates — nothing is guessed.
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
  if (!a.data && !s.data) throw new Error("Only admins can review course locations.");
}

export type UnlocatedCourse = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  hole_count: number | null;
  source_url: string | null;
};

export const listUnlocatedCourses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ search: z.string().max(80).default(""), offset: z.number().int().min(0).default(0) }).parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const sb = (context as Ctx).supabase;
    let q = sb
      .from("courses")
      .select("id, name, city, state, hole_count, course_sources(canonical_url)", { count: "exact" })
      .eq("location_quality", "unknown")
      .or("latitude.is.null,longitude.is.null")
      .eq("is_ghost", false)
      .order("state")
      .order("name")
      .range(data.offset, data.offset + 49);
    if (data.search.trim()) q = q.ilike("name", `%${data.search.trim().replace(/[%_,()]/g, "")}%`);
    const { data: rows, count, error } = await q;
    if (error) throw new Error("Couldn't load the course list.");
    return {
      total: count ?? 0,
      rows: (rows ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        city: r.city,
        state: r.state,
        hole_count: r.hole_count,
        source_url: r.course_sources?.find((s: any) => s.canonical_url)?.canonical_url ?? null,
      })) as UnlocatedCourse[],
    };
  });

export const setCourseLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        courseId: z.string().uuid(),
        lat: z.number().min(17).max(72),
        lng: z.number().min(-180).max(-64),
        quality: z.enum(["verified_gps", "source_coordinate", "address_geocoded", "park_geocoded"]),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { error } = await (context as Ctx).supabase
      .from("courses")
      .update({ latitude: data.lat, longitude: data.lng, location_quality: data.quality })
      .eq("id", data.courseId);
    if (error) throw new Error("Couldn't save that location.");
    return { ok: true };
  });
