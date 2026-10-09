import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PendingRound = {
  id: string;
  course_name: string;
  started_at: string;
  status: string;
  scores_verified: boolean;
};

export type PendingCourse = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  hole_count: number;
  moderation_status: string;
  is_ghost: boolean;
};

export type PendingSubmission = {
  id: string;
  label: string;
  created_at: string;
  kind: "course_edit" | "rating_profile";
};

export type PendingDataSummary = {
  unfinishedRounds: PendingRound[];
  unverifiedRounds: PendingRound[];
  placeholderCourses: PendingCourse[];
  pendingCourses: PendingCourse[];
  submissions: PendingSubmission[];
};

/**
 * One read for everything of mine that is not finished, not verified, or still
 * waiting on a reviewer. Scoped to the signed-in user through RLS.
 */
export const listPendingData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingDataSummary> => {
    const { supabase, userId } = context;

    const [roundsRes, coursesRes, editsRes, profilesRes] = await Promise.all([
      supabase
        .from("rounds")
        .select("id, started_at, status, scores_verified, courses(name)")
        .eq("created_by", userId)
        .order("started_at", { ascending: false })
        .limit(200),
      supabase
        .from("courses")
        .select("id, name, city, state, hole_count, moderation_status, is_ghost")
        .eq("created_by", userId)
        .or("is_ghost.eq.true,moderation_status.eq.pending")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("course_edit_requests")
        .select("id, created_at, status, courses(name)")
        .eq("requested_by", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("course_rating_profiles")
        .select("id, created_at, status, course_name")
        .eq("submitted_by", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    type RoundRow = {
      id: string;
      started_at: string;
      status: string;
      scores_verified: boolean;
      courses: { name: string } | { name: string }[] | null;
    };
    const rounds = ((roundsRes.data ?? []) as unknown as RoundRow[]).map((r) => ({
      id: r.id,
      started_at: r.started_at,
      status: r.status,
      scores_verified: r.scores_verified,
      course_name: Array.isArray(r.courses)
        ? r.courses[0]?.name ?? "Course"
        : r.courses?.name ?? "Course",
    }));

    const courses = (coursesRes.data ?? []) as PendingCourse[];

    return {
      unfinishedRounds: rounds.filter((r) => r.status === "in_progress"),
      unverifiedRounds: rounds.filter((r) => r.status === "completed" && !r.scores_verified),
      placeholderCourses: courses.filter((c) => c.is_ghost),
      pendingCourses: courses.filter((c) => !c.is_ghost && c.moderation_status === "pending"),
      submissions: [
        ...((editsRes.data ?? []) as unknown as {
          id: string;
          created_at: string;
          courses: { name: string } | { name: string }[] | null;
        }[]).map((e) => ({
          id: e.id,
          created_at: e.created_at,
          kind: "course_edit" as const,
          label: `Course edit · ${
            Array.isArray(e.courses) ? e.courses[0]?.name ?? "Course" : e.courses?.name ?? "Course"
          }`,
        })),
        ...((profilesRes.data ?? []) as unknown as {
          id: string;
          created_at: string;
          course_name: string;
        }[]).map((p) => ({
          id: p.id,
          created_at: p.created_at,
          kind: "rating_profile" as const,
          label: `Course rating profile · ${p.course_name}`,
        })),
      ].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    };
  });
