import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Admin: re-read a course's listings, refresh par/draft layouts, fix its pin. */
export const repairCourseData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ courseId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const [{ data: a }, { data: sa }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
    ]);
    if (!a && !sa) throw new Error("Only admins can repair course data.");
    const { repairCourse } = await import("@/lib/course-sources/listing-sync.server");
    const { enqueueCourseRepair } = await import("@/lib/course-sources/job-queue.server");
    let r;
    try {
      r = await repairCourse(data.courseId);
    } catch (e) {
      await enqueueCourseRepair(data.courseId, context.userId, e instanceof Error ? e.message : String(e));
      throw new Error("Repair didn't finish. It's queued and will retry automatically.");
    }
    if (r.failed > 0) {
      await enqueueCourseRepair(data.courseId, context.userId, `${r.failed} listing(s) could not be read`);
    }
    return {
      retryQueued: r.failed > 0,
      listingsRead: r.parsed,
      listingsFailed: r.failed,
      parFilled: r.parFilled,
      draftLayouts: r.draftLayouts,
      pin: r.pin,
    };
  });
