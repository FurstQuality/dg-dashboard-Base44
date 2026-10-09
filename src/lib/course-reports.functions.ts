import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CourseReportKind, CourseReportStatus } from "@/lib/rewards";

export type CourseReportRow = {
  id: string;
  course_id: string;
  hole_number: number | null;
  reporter_id: string;
  kind: CourseReportKind;
  severity: string;
  description: string | null;
  status: CourseReportStatus;
  confirm_count: number;
  resolved_count: number;
  not_found_count: number;
  created_at: string;
  expires_at: string;
  reporter_name?: string | null;
  my_vote?: "confirm" | "resolved" | "not_found" | null;
  is_mine?: boolean;
};

const COLUMNS =
  "id, course_id, hole_number, reporter_id, kind, severity, description, status, confirm_count, resolved_count, not_found_count, created_at, expires_at";

/** Live conditions players have reported for one course. */
export const listCourseReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => z.object({ course_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }): Promise<{ reports: CourseReportRow[] }> => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("course_reports")
      .select(COLUMNS)
      .eq("course_id", data.course_id)
      .in("status", ["open", "confirmed"])
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);

    const reports = (rows ?? []) as CourseReportRow[];
    if (!reports.length) return { reports };

    const [votes, profiles] = await Promise.all([
      supabase
        .from("course_report_votes")
        .select("report_id, vote")
        .eq("user_id", userId)
        .in(
          "report_id",
          reports.map((r) => r.id),
        ),
      supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", [...new Set(reports.map((r) => r.reporter_id))]),
    ]);

    const voteMap = new Map(
      ((votes.data ?? []) as { report_id: string; vote: CourseReportRow["my_vote"] }[]).map((v) => [
        v.report_id,
        v.vote,
      ]),
    );
    const nameMap = new Map(
      ((profiles.data ?? []) as { id: string; display_name?: string }[]).map((p) => [
        p.id,
        p.display_name ?? null,
      ]),
    );

    return {
      reports: reports.map((r) => ({
        ...r,
        my_vote: voteMap.get(r.id) ?? null,
        reporter_name: nameMap.get(r.reporter_id) ?? null,
        is_mine: r.reporter_id === userId,
      })),
    };
  });

/** File a condition report so the next card knows before they tee off. */
export const createCourseReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) =>
    z
      .object({
        course_id: z.string().uuid(),
        kind: z.string().min(1),
        severity: z.enum(["minor", "moderate", "blocking"]).default("moderate"),
        hole_number: z.number().int().min(1).max(36).nullable().optional(),
        description: z.string().max(1000).nullable().optional(),
        lat: z.number().min(-90).max(90).nullable().optional(),
        lng: z.number().min(-180).max(180).nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("course_reports").insert({
      course_id: data.course_id,
      reporter_id: userId,
      kind: data.kind as CourseReportKind,
      severity: data.severity,
      hole_number: data.hole_number ?? null,
      description: data.description?.trim() || null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Confirm a report, mark it cleared, or say it isn't there. */
export const voteCourseReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) =>
    z
      .object({
        report_id: z.string().uuid(),
        vote: z.enum(["confirm", "resolved", "not_found"]),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("course_report_votes").insert({
      report_id: data.report_id,
      user_id: userId,
      vote: data.vote,
    });
    if (error) {
      if (error.message.includes("duplicate") || error.code === "23505") {
        throw new Error("You already weighed in on this one.");
      }
      throw new Error(error.message);
    }
    return { ok: true as const };
  });

/** Reporter fixes their own report (kind, hole, note). Lifecycle fields stay DB-guarded. */
export const updateCourseReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) =>
    z
      .object({
        report_id: z.string().uuid(),
        kind: z.string().min(1),
        hole_number: z.number().int().min(1).max(36).nullable().optional(),
        description: z.string().max(1000).nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("course_reports")
      .update({
        kind: data.kind as CourseReportKind,
        hole_number: data.hole_number ?? null,
        description: data.description?.trim() || null,
      })
      .eq("id", data.report_id)
      .eq("reporter_id", userId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("We couldn't update that report.");
    if (!row) throw new Error("You can only edit reports you made.");
    return { ok: true as const };
  });

/** Reporter removes their own report. */
export const deleteCourseReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => z.object({ report_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("course_reports")
      .delete()
      .eq("id", data.report_id)
      .eq("reporter_id", userId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("We couldn't remove that report.");
    if (!row) throw new Error("You can only remove reports you made.");
    return { ok: true as const };
  });
