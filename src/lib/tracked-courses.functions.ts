import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TrackedCourse = {
  id: string;
  course_id: string | null;
  course_name: string;
  location: string | null;
  created_at: string;
};

/** Courses the caller has saved for Course Analytics. */
export const listTrackedCourses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ courses: TrackedCourse[] }> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("tracked_courses")
      .select("id, course_id, course_name, location, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { courses: (data ?? []) as TrackedCourse[] };
  });

/** Save a course so its past-event scoring stays one click away. */
export const trackCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) =>
    z
      .object({
        course_id: z.string().uuid().optional().nullable(),
        course_name: z.string().min(1).max(200),
        location: z.string().max(200).optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const name = data.course_name.trim();
    if (!name) throw new Error("That course needs a name before it can be tracked.");

    let existing: { id: string } | null = null;
    if (data.course_id) {
      const { data: row, error } = await supabase
        .from("tracked_courses")
        .select("id")
        .eq("user_id", userId)
        .eq("course_id", data.course_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      existing = (row as { id: string } | null) ?? null;
    } else {
      const { data: row, error } = await supabase
        .from("tracked_courses")
        .select("id")
        .eq("user_id", userId)
        .is("course_id", null)
        .ilike("course_name", name)
        .maybeSingle();
      if (error) throw new Error(error.message);
      existing = (row as { id: string } | null) ?? null;
    }
    if (existing) return { duplicate: true as const };

    const { error } = await supabase.from("tracked_courses").insert({
      user_id: userId,
      course_id: data.course_id ?? null,
      course_name: name,
      location: data.location ?? null,
    });
    if (error) throw new Error(error.message);
    return { duplicate: false as const };
  });

/** Stop tracking a course. */
export const untrackCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("tracked_courses")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
