import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ADMIN_LIMITS } from "@/lib/admin-queries";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

const summarySchema = z.object({
  round: z.number(),
  ssa: z.number().nullable(),
  stroke_value: z.number().nullable(),
  winning_score: z.number().nullable(),
  winning_rating: z.number().nullable(),
  n: z.number(),
});

const ratedRoundSchema = z.object({
  played_on: z.string().nullable(),
  score: z.number().nullable(),
  round_rating: z.number().nullable(),
});

const submitSchema = z.object({
  course_id: z.string().uuid().nullable(),
  course_name: z.string().min(1).max(200),
  pdga_course_ref: z.string().nullable().optional(),
  pdga_course_name: z.string().nullable().optional(),
  pdga_course_url: z.string().url().nullable().optional(),
  ssa: z.number(),
  stroke_value: z.number(),
  par_total: z.number().int().nullable().optional(),
  sample_size: z.number().int().min(1),
  event_refs: z.array(z.string()).default([]),
  round_summaries: z.array(summarySchema).default([]),
  rated_rounds: z.array(ratedRoundSchema).default([]),
  matched_course: z.record(z.string(), z.any()).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const submitCourseRatingProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => submitSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // If a locked/approved profile already exists for this course_id, block.
    if (data.course_id) {
      const { data: existing } = await supabase
        .from("course_rating_profiles")
        .select("id, status, locked")
        .eq("course_id", data.course_id)
        .eq("status", "approved")
        .maybeSingle();
      if (existing) {
        throw new Error(
          "This course already has an approved rating profile. Contact an admin to update it.",
        );
      }
    }

    // Super admins are trusted contributors — auto-approve their submissions
    // so the ingested data becomes the live course profile immediately.
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    const autoApprove = Boolean(isAdmin);
    const nowIso = new Date().toISOString();

    // RLS INSERT policy requires status='pending' AND submitted_by=auth.uid().
    // Always insert as pending, then flip to approved as a follow-up update
    // (super-admins have a manage-all policy that permits that update).
    const { data: inserted, error } = await supabase
      .from("course_rating_profiles")
      .insert({
        course_id: data.course_id,
        course_name: data.course_name,
        pdga_course_ref: data.pdga_course_ref ?? null,
        pdga_course_name: data.pdga_course_name ?? null,
        pdga_course_url: data.pdga_course_url ?? null,
        ssa: data.ssa,
        stroke_value: data.stroke_value,
        par_total: data.par_total ?? null,
        sample_size: data.sample_size,
        event_refs: data.event_refs,
        round_summaries: data.round_summaries,
        rated_rounds: data.rated_rounds,
        matched_course: (data.matched_course ?? null) as Json | null,
        notes: data.notes ?? null,
        status: "pending",
        locked: false,
        submitted_by: userId,
      })
      .select("id, status")
      .single();

    if (error) throw new Error(error.message);

    if (autoApprove) {
      const { data: approved, error: upErr } = await supabase
        .from("course_rating_profiles")
        .update({
          status: "approved",
          locked: true,
          reviewed_by: userId,
          reviewed_at: nowIso,
        })
        .eq("id", inserted.id)
        .select("id, status")
        .single();
      if (upErr) throw new Error(upErr.message);
      return { id: approved.id, status: approved.status as "pending" | "approved" };
    }
    return { id: inserted.id, status: inserted.status as "pending" | "approved" };
  });

/**
 * Returns the most-recent rating profile the current user submitted for a
 * given course (matched by course_id when present, otherwise course_name).
 * Used by the Course Ratings Analyzer to rehydrate previously-ingested
 * PDGA data (rated rounds, event refs, matched course) so the user can see
 * where their data ended up after closing the dialog.
 */
export const getLatestCourseRatingSubmission = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        course_id: z.string().uuid().nullable().optional(),
        course_name: z.string().min(1).max(200).nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("course_rating_profiles")
      .select("*")
      .eq("submitted_by", userId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data.course_id) q = q.eq("course_id", data.course_id);
    else if (data.course_name) q = q.ilike("course_name", data.course_name);
    else return null;
    const { data: row, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const listMyCourseRatingSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("course_rating_profiles")
      .select(
        "id, course_id, course_name, status, ssa, stroke_value, sample_size, created_at, reviewed_at, rejection_reason",
      )
      .eq("submitted_by", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listPendingCourseRatingProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { data, error } = await supabase
      .from("course_rating_profiles")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(ADMIN_LIMITS.courseRatingQueue);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const decisionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  rejection_reason: z.string().max(1000).optional(),
});

export const reviewCourseRatingProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => decisionSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    if (data.action === "approve") {
      const { error } = await supabase
        .from("course_rating_profiles")
        .update({
          status: "approved",
          locked: true,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("course_rating_profiles")
        .update({
          status: "rejected",
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          rejection_reason: data.rejection_reason ?? "Rejected by admin",
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const getApprovedCourseRatingProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        course_id: z.string().uuid().nullable().optional(),
        course_name: z.string().min(1).max(200).nullable().optional(),
      })
      .refine((v) => Boolean(v.course_id || v.course_name), {
        message: "course_id or course_name is required",
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Prefer course_id, fall back to case-insensitive name match. Name-only
    // profiles are common when data was ingested from PDGA URLs before a
    // canonical course row existed.
    if (data.course_id) {
      const { data: row, error } = await supabase
        .from("course_rating_profiles")
        .select("*")
        .eq("course_id", data.course_id)
        .eq("status", "approved")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (row) return row;
    }
    if (data.course_name) {
      const { data: row, error } = await supabase
        .from("course_rating_profiles")
        .select("*")
        .ilike("course_name", data.course_name)
        .eq("status", "approved")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return row;
    }
    return null;
  });
