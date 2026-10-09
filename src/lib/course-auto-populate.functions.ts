/**
 * Auto-populate course data from PDGA + Disc Golf Scene + UDisc.
 * Thin server-fn wrappers; helpers live in course-auto-populate.server.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type CourseAutoPopulateResult = {
  course_id: string;
  course_name: string;
  sources: Record<
    "pdga" | "dgs" | "udisc",
    {
      status: "ok" | "not_found" | "error";
      matched_name?: string | null;
      matched_url?: string | null;
      confidence?: number;
      layouts?: number;
      rounds?: number;
      events?: number;
      /** Community reviews captured from UDisc. */
      reviews?: number;
      /** Course fields filled in from the source. */
      backfilled?: string[];
      error?: string | null;
    }
  >;
  rating_profile: {
    action:
      | "created_pending"
      | "insufficient_data"
      | "existing_approved"
      | "existing_pending"
      | "skipped";
    sample_size?: number;
    ssa?: number;
    stroke_value?: number;
    profile_id?: string;
    reason?: string;
  };
};

export type CourseSourceRow = {
  source: "pdga" | "dgs" | "udisc";
  matched_name: string | null;
  canonical_url: string | null;
  confidence: number | null;
  last_fetched_at: string | null;
  last_error: string | null;
};

export type CourseLayoutRow = {
  source: "pdga" | "dgs" | "udisc";
  layout_name: string;
  holes: number | null;
  par: number | null;
  length_ft: number | null;
  difficulty: string | null;
};

export type CourseUdiscIntel = {
  canonical_url: string | null;
  matched_name: string | null;
  confidence: number | null;
  last_fetched_at: string | null;
  course: import("@/lib/scene-parser").UdiscCourseParsed & {
    reviews_all?: import("@/lib/scene-parser").UdiscReview[];
  };
};

export const refreshCourseSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        courseId: z.string().uuid(),
        sources: z
          .array(z.enum(["pdga", "dgs", "udisc"]))
          .optional()
          .default(["pdga", "dgs", "udisc"]),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }): Promise<CourseAutoPopulateResult> => {
    const { refreshCourseSourcesForCourse } = await import("@/lib/course-sources-refresh.server");
    return refreshCourseSourcesForCourse(data.courseId, {
      sources: data.sources,
      submittedBy: context.userId,
    });
  });

export const getCourseSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ courseId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: sources }, { data: layouts }] = await Promise.all([
      supabase
        .from("course_sources")
        .select("source, matched_name, canonical_url, confidence, last_fetched_at, last_error")
        .eq("course_id", data.courseId)
        .order("source"),
      supabase
        .from("course_layout_profiles")
        .select("source, layout_name, holes, par, length_ft, difficulty")
        .eq("course_id", data.courseId)
        .order("source")
        .order("length_ft", { ascending: false }),
    ]);
    return {
      sources: (sources ?? []) as CourseSourceRow[],
      layouts: (layouts ?? []) as CourseLayoutRow[],
    };
  });

/**
 * Read the cached UDisc payload for a course: community ratings, conditions,
 * amenities, hole distances and reviews captured on the last refresh.
 */
export const getCourseUdiscIntel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ courseId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }): Promise<CourseUdiscIntel | null> => {
    const { data: row } = await context.supabase
      .from("course_sources")
      .select("canonical_url, matched_name, confidence, last_fetched_at, raw")
      .eq("course_id", data.courseId)
      .eq("source", "udisc")
      .maybeSingle();
    if (!row?.raw) return null;
    const raw = row.raw as Record<string, unknown>;
    return {
      canonical_url: row.canonical_url,
      matched_name: row.matched_name,
      confidence: row.confidence,
      last_fetched_at: row.last_fetched_at,
      course: raw as unknown as CourseUdiscIntel["course"],
    };
  });
