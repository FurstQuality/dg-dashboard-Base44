/**
 * Durable retry queue for course repairs (course_ingest_jobs).
 * A repair that fails or leaves unreadable listings is queued; the 5-minute
 * timer retries it with exponential backoff, reclaiming jobs whose run died
 * mid-way (stale "running" lease). After MAX_ATTEMPTS the job stops as error.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { repairCourse } from "./listing-sync.server";

const MAX_ATTEMPTS = 5;
const LEASE_MS = 10 * 60_000;
const BASE_BACKOFF_MS = 60 * 60_000;

export async function enqueueCourseRepair(courseId: string, requestedBy: string | null, error: string) {
  const { data: open } = await supabaseAdmin
    .from("course_ingest_jobs")
    .select("id")
    .eq("course_id", courseId)
    .in("status", ["pending", "running"])
    .limit(1);
  if (open?.length) return;
  await supabaseAdmin.from("course_ingest_jobs").insert({
    course_id: courseId,
    target_source: "all",
    status: "pending",
    attempts: 1,
    last_error: error.slice(0, 500),
    requested_by: requestedBy,
    next_run_at: new Date(Date.now() + BASE_BACKOFF_MS).toISOString(),
  });
}

export async function processCourseRepairQueue(limit = 10) {
  const now = new Date();
  const staleLease = new Date(now.getTime() - LEASE_MS).toISOString();
  const { data: jobs } = await supabaseAdmin
    .from("course_ingest_jobs")
    .select("id, course_id, attempts, status, updated_at")
    .or(
      `and(status.eq.pending,next_run_at.lte.${now.toISOString()}),and(status.eq.running,updated_at.lt.${staleLease})`,
    )
    .order("next_run_at", { ascending: true })
    .limit(limit);
  let ok = 0;
  let retried = 0;
  let gaveUp = 0;
  for (const job of jobs ?? []) {
    // Claim with a compare-and-set so overlapping timers never double-run a job.
    const { data: claimed } = await supabaseAdmin
      .from("course_ingest_jobs")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", job.status)
      .eq("updated_at", job.updated_at)
      .select("id");
    if (!claimed?.length) continue;
    let error: string | null = null;
    let result: Record<string, unknown> | null = null;
    try {
      const r = await repairCourse(job.course_id);
      result = { ...r };
      if (r.failed > 0) error = `${r.failed} listing(s) could not be read`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const attempts = (job.attempts ?? 0) + 1;
    if (!error) {
      ok++;
      await supabaseAdmin
        .from("course_ingest_jobs")
        .update({ status: "ok", attempts, result: result as never, last_error: null, finished_at: new Date().toISOString() })
        .eq("id", job.id);
    } else if (attempts >= MAX_ATTEMPTS) {
      gaveUp++;
      await supabaseAdmin
        .from("course_ingest_jobs")
        .update({ status: "error", attempts, last_error: error.slice(0, 500), finished_at: new Date().toISOString() })
        .eq("id", job.id);
    } else {
      retried++;
      await supabaseAdmin
        .from("course_ingest_jobs")
        .update({
          status: "pending",
          attempts,
          last_error: error.slice(0, 500),
          next_run_at: new Date(Date.now() + BASE_BACKOFF_MS * 2 ** (attempts - 1)).toISOString(),
        })
        .eq("id", job.id);
    }
  }
  return { claimed: jobs?.length ?? 0, ok, retried, gaveUp };
}
