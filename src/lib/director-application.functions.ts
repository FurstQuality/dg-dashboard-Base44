/**
 * Event Director applications.
 *
 * Directing events is an approved role, not a self-serve switch: a player
 * applies, an admin reviews. The database enforces this too — the
 * `guard_director_review` trigger strips status/review fields from any write
 * that is not made by an admin, and tournament/league INSERT policies require
 * `public.is_approved_director(auth.uid())`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type DirectorStatus = "pending" | "approved" | "rejected" | "revoked";

const StatusSchema = z.enum(["pending", "approved", "rejected", "revoked"]);

async function assertReviewer(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const [admin, superAdmin] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
  ]);
  if (!admin.data && !superAdmin.data) throw new Error("Admin only");
}

/** Server-side guard for any director-only write. */
export async function assertApprovedDirector(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("is_approved_director", { _user: userId });
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("Event Director access is required. Apply for director access first.");
  }
}

export const getMyDirectorApplication = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("director_profiles")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { application: data ?? null };
  });

const ApplySchema = z.object({
  org_name: z.string().trim().max(120).optional(),
  region: z.string().trim().max(120).optional(),
  experience: z.string().trim().max(2000).optional(),
  pitch: z.string().trim().max(2000).optional(),
  pdga_number: z.number().int().positive().max(9_999_999).optional(),
  contact_email: z.string().trim().email().max(160).optional(),
});

export const applyForDirector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ApplySchema.parse(raw ?? {}))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("director_profiles").upsert(
      {
        user_id: context.userId,
        org_name: data.org_name ?? null,
        region: data.region ?? null,
        experience: data.experience ?? null,
        pitch: data.pitch ?? null,
        pdga_number: data.pdga_number ?? null,
        contact_email: data.contact_email ?? null,
        applied_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listDirectorApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ status: StatusSchema.optional() }).parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertReviewer(supabase, userId);

    let q = supabase
      .from("director_profiles")
      .select("*")
      .order("applied_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r) => r.user_id);
    const profiles: Record<
      string,
      { id: string; display_name: string | null; username: string | null; avatar_url: string | null }
    > = {};
    if (ids.length) {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", ids);
      for (const row of p ?? []) profiles[row.id] = row;
    }
    return { rows: rows ?? [], profiles };
  });

const ReviewSchema = z.object({
  user_id: z.string().uuid(),
  status: StatusSchema,
  notes: z.string().trim().max(1000).optional(),
});

export const reviewDirectorApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ReviewSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertReviewer(supabase, userId);

    const { error } = await supabase
      .from("director_profiles")
      .update({
        status: data.status,
        reviewer_notes: data.notes ?? null,
        approved_by: userId,
        approved_at: data.status === "approved" ? new Date().toISOString() : null,
      })
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);

    await supabase.from("notifications").insert({
      user_id: data.user_id,
      type: "event",
      actor_id: userId,
      data: {
        title:
          data.status === "approved"
            ? "You're approved to run events on DG Dashboard"
            : data.status === "rejected"
              ? "Your Event Director application needs another look"
              : "Your Event Director access changed",
        body: data.notes ?? null,
        link: "/director",
      },
    });
    return { ok: true };
  });
