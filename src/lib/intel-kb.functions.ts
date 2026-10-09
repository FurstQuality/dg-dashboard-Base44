import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export type CourseIntel = {
  course_key: string;
  course_id: string | null;
  course_name: string | null;
  rounds_count: number;
  pdga_rounds_count: number;
  udisc_rounds_count: number;
  avg_ssa: number | null;
  avg_stroke_value: number | null;
  avg_round_rating: number | null;
  avg_to_par: number | null;
  best_round_rating: number | null;
  hardest_score: number | null;
  easiest_score: number | null;
  last_played_on: string | null;
};

export const getCourseIntel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { courseId?: string | null; courseName?: string | null }) =>
    z
      .object({
        courseId: z.string().uuid().nullable().optional(),
        courseName: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CourseIntel | null> => {
    const { supabase } = context;
    if (data.courseId) {
      const { data: byId } = await supabase
        .from("course_intel")
        .select("*")
        .eq("course_key", `id:${data.courseId}`)
        .maybeSingle();
      if (byId) return byId as CourseIntel;
    }
    if (data.courseName) {
      const norm = normalize(data.courseName);
      const { data: byName } = await supabase
        .from("course_intel")
        .select("*")
        .eq("course_key", norm)
        .maybeSingle();
      if (byName) return byName as CourseIntel;
    }
    return null;
  });

export type HoleIntel = {
  layout_id: string;
  hole_number: number;
  par: number | null;
  scores_count: number;
  avg_strokes: number | null;
  ace_count: number;
  eagle_count: number;
  birdie_count: number;
  par_count: number;
  bogey_count: number;
  double_plus_count: number;
  c1_putts_made: number;
  c1_putts_missed: number;
  c2_putts_made: number;
  c2_putts_missed: number;
  throw_in_count: number;
  longest_throw_ft: number | null;
  ob_strokes_total: number;
};

export const getLayoutHoleIntel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { layoutId: string }) => z.object({ layoutId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<HoleIntel[]> => {
    const { supabase } = context;
    const { data: rows } = await supabase
      .from("hole_intel")
      .select("*")
      .eq("layout_id", data.layoutId)
      .order("hole_number", { ascending: true });
    return (rows ?? []) as HoleIntel[];
  });
