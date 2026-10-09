/**
 * Entity editor — governed edits, revisions, revert queue, and field registry.
 *
 * Applies to five entities: course_rating_profile, course, tournament, league, profile.
 * - Owners can edit their own record (subject to per-field editable_by_owner flag).
 * - Super admins can edit anything.
 * - Every edit writes an entity_revisions row.
 * - Reverts by admins apply instantly; owner-initiated reverts queue as revert_requests.
 */
import { createServerFn } from "@tanstack/react-start";
import { ADMIN_LIMITS } from "@/lib/admin-queries";
import { FIELD_DATA_TYPES } from "@/lib/field-registry-meta";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const ENTITY_KINDS = [
  "course_rating_profile",
  "course",
  "tournament",
  "league",
  "profile",
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

const TABLE: Record<EntityKind, string> = {
  course_rating_profile: "course_rating_profiles",
  course: "courses",
  tournament: "tournaments",
  league: "leagues",
  profile: "profiles",
};

const OWNER_COL: Record<EntityKind, string> = {
  course_rating_profile: "submitted_by",
  course: "created_by",
  tournament: "owner_id",
  league: "owner_id",
  profile: "id",
};

const LABEL: Record<EntityKind, string> = {
  course_rating_profile: "Course rating profile",
  course: "Course",
  tournament: "Tournament",
  league: "League",
  profile: "User profile",
};

export const ENTITY_LABELS = LABEL;

const entityKindSchema = z.enum(ENTITY_KINDS);

async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  return Boolean(data);
}

// ---------- Field registry ----------

export const listFields = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ entity_type: entityKindSchema }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("field_registry")
      .select("*")
      .eq("entity_type", data.entity_type)
      .order("order_index", { ascending: true })
      .limit(ADMIN_LIMITS.fieldRegistry);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const DATA_TYPES = FIELD_DATA_TYPES;


export const updateField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z
          .object({
            label: z.string().min(1).max(120).optional(),
            help_text: z.string().max(600).nullable().optional(),
            field_group: z.string().min(1).max(60).optional(),
            source_key: z.string().max(160).nullable().optional(),
            data_type: z.enum(DATA_TYPES).optional(),
            order_index: z.number().int().optional(),
            editable_by_owner: z.boolean().optional(),
            editable_by_admin: z.boolean().optional(),
            visible_to_public: z.boolean().optional(),
            required: z.boolean().optional(),
            deprecated: z.boolean().optional(),
            options: z.any().nullable().optional(),
          })
          .strict(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const admin = await isAdmin(context.supabase, context.userId);
    if (!admin) throw new Error("Only admins can change the field registry.");
    const { error } = await context.supabase
      .from("field_registry")
      .update(data.patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        entity_type: entityKindSchema,
        field_key: z
          .string()
          .min(1)
          .max(120)
          .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers, and underscores only."),
        label: z.string().min(1).max(120),
        data_type: z.enum(DATA_TYPES).default("text"),
        field_group: z.string().min(1).max(60).default("General"),
        help_text: z.string().max(600).nullable().optional(),
        source_key: z.string().max(160).nullable().optional(),
        order_index: z.number().int().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const admin = await isAdmin(context.supabase, context.userId);
    if (!admin) throw new Error("Only admins can change the field registry.");
    const { data: row, error } = await context.supabase
      .from("field_registry")
      .insert({
        entity_type: data.entity_type,
        field_key: data.field_key,
        label: data.label,
        data_type: data.data_type,
        field_group: data.field_group,
        help_text: data.help_text ?? null,
        source_key: data.source_key ?? null,
        order_index: data.order_index ?? 100,
      })
      .select("id")
      .single();
    if (error) {
      throw new Error(
        error.code === "23505" || /duplicate key/i.test(error.message)
          ? "That field key already exists for this entity."
          : error.message,
      );
    }
    return { ok: true, id: row.id };
  });

export const deleteField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const admin = await isAdmin(context.supabase, context.userId);
    if (!admin) throw new Error("Only admins can change the field registry.");
    const { error } = await context.supabase.from("field_registry").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// ---------- Read entity ----------

export const getEntity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ entity_type: entityKindSchema, id: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const table = TABLE[data.entity_type];
    const { data: row, error } = await context.supabase
      .from(table as any)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Not found.");
    const admin = await isAdmin(context.supabase, context.userId);
    const ownerCol = OWNER_COL[data.entity_type];
    const isOwner = (row as any)[ownerCol] === context.userId;
    return {
      row: row as any,
      permissions: { admin, owner: isOwner, canEdit: admin || isOwner },
    };
  });

// ---------- Update entity ----------

export const updateEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        entity_type: entityKindSchema,
        id: z.string().uuid(),
        patch: z.record(z.string(), z.any()),
        note: z.string().max(400).nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const table = TABLE[data.entity_type];
    const ownerCol = OWNER_COL[data.entity_type];

    // load current row
    const { data: current, error: readErr } = await supabase
      .from(table as any)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error("Record not found.");

    const admin = await isAdmin(supabase, userId);
    const isOwner = (current as any)[ownerCol] === userId;
    if (!admin && !isOwner) throw new Error("You don't have permission to edit this record.");

    // load field registry to filter allowed keys
    const { data: fields, error: fErr } = await supabase
      .from("field_registry")
      .select("field_key, editable_by_owner, editable_by_admin, deprecated")
      .eq("entity_type", data.entity_type);
    if (fErr) throw new Error(fErr.message);

    const allowedKeys = new Set(
      (fields ?? [])
        .filter((f: any) =>
          f.deprecated ? false : admin ? f.editable_by_admin : f.editable_by_owner,
        )
        .map((f: any) => f.field_key),
    );

    const cleanedPatch: Record<string, unknown> = {};
    const beforeSlice: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data.patch)) {
      if (!allowedKeys.has(k)) continue;
      if ((current as any)[k] === v) continue;
      cleanedPatch[k] = v;
      beforeSlice[k] = (current as any)[k];
    }

    if (Object.keys(cleanedPatch).length === 0) {
      return { ok: true, changed: 0 };
    }

    const { error: updErr } = await supabase
      .from(table as any)
      .update(cleanedPatch)
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);

    await supabase.from("entity_revisions").insert({
      entity_type: data.entity_type,
      entity_id: data.id,
      changed_by: userId,
      before_data: beforeSlice as any,
      after_data: cleanedPatch as any,
      note: data.note ?? null,
    });

    return { ok: true, changed: Object.keys(cleanedPatch).length };
  });

// ---------- Revisions ----------

export const listRevisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ entity_type: entityKindSchema, id: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    // RLS handles visibility (admin sees all; user sees their own edits).
    const { data: rows, error } = await context.supabase
      .from("entity_revisions")
      .select("*")
      .eq("entity_type", data.entity_type)
      .eq("entity_id", data.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    // attach editor display names
    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.changed_by).filter(Boolean)));
    let profiles: Record<string, { display_name: string; username: string }> = {};
    if (userIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, display_name, username")
        .in("id", userIds);
      profiles = Object.fromEntries(
        (profs ?? []).map((p: any) => [
          p.id,
          { display_name: p.display_name, username: p.username },
        ]),
      );
    }
    return (rows ?? []).map((r: any) => ({ ...r, editor: profiles[r.changed_by] ?? null }));
  });

// ---------- Revert ----------

export const revertToRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ revision_id: z.string().uuid(), note: z.string().max(400).optional() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rev, error: revErr } = await supabase
      .from("entity_revisions")
      .select("*")
      .eq("id", data.revision_id)
      .maybeSingle();
    if (revErr) throw new Error(revErr.message);
    if (!rev) throw new Error("Revision not found.");

    const admin = await isAdmin(supabase, userId);
    const ownerCol = OWNER_COL[rev.entity_type as EntityKind];
    const table = TABLE[rev.entity_type as EntityKind];
    const { data: current } = await supabase
      .from(table as any)
      .select("*")
      .eq("id", rev.entity_id)
      .maybeSingle();
    if (!current) throw new Error("Record no longer exists.");
    const isOwner = (current as any)[ownerCol] === userId;

    if (!admin) {
      if (!isOwner) throw new Error("Not permitted.");
      // Queue for admin review
      const { data: reqRow, error: rrErr } = await supabase
        .from("revert_requests")
        .insert({
          revision_id: rev.id,
          entity_type: rev.entity_type,
          entity_id: rev.entity_id,
          requested_by: userId,
          review_note: data.note ?? null,
        })
        .select("id")
        .single();
      if (rrErr) throw new Error(rrErr.message);
      return { ok: true, queued: true, request_id: reqRow.id };
    }

    // Admin: apply the "before_data" (undo the edit) — swap values back.
    const before = (rev.before_data ?? {}) as Record<string, unknown>;
    if (Object.keys(before).length === 0) {
      return { ok: true, applied: 0 };
    }
    const patch: Record<string, unknown> = {};
    const newBefore: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(before)) {
      newBefore[k] = (current as any)[k];
      patch[k] = v;
    }
    const { error: updErr } = await supabase
      .from(table as any)
      .update(patch)
      .eq("id", rev.entity_id);
    if (updErr) throw new Error(updErr.message);
    await supabase.from("entity_revisions").insert({
      entity_type: rev.entity_type,
      entity_id: rev.entity_id,
      changed_by: userId,
      before_data: newBefore as any,
      after_data: patch as any,
      note: `Revert of revision ${rev.id.slice(0, 8)}${data.note ? ` — ${data.note}` : ""}`,
    });
    return { ok: true, queued: false, applied: Object.keys(patch).length };
  });

// ---------- Revert queue (admin) ----------

export const listRevertRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await isAdmin(context.supabase, context.userId);
    if (!admin) return [];
    const { data, error } = await context.supabase
      .from("revert_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const userIds = Array.from(
      new Set((data ?? []).flatMap((r: any) => [r.requested_by, r.reviewed_by]).filter(Boolean)),
    );
    let profiles: Record<string, { display_name: string; username: string }> = {};
    if (userIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, display_name, username")
        .in("id", userIds);
      profiles = Object.fromEntries(
        (profs ?? []).map((p: any) => [
          p.id,
          { display_name: p.display_name, username: p.username },
        ]),
      );
    }
    return (data ?? []).map((r: any) => ({
      ...r,
      requester: profiles[r.requested_by] ?? null,
      reviewer: r.reviewed_by ? (profiles[r.reviewed_by] ?? null) : null,
    }));
  });

export const reviewRevertRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        request_id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        review_note: z.string().max(400).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const admin = await isAdmin(supabase, userId);
    if (!admin) throw new Error("Admin only.");

    const { data: req, error: rErr } = await supabase
      .from("revert_requests")
      .select("*")
      .eq("id", data.request_id)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!req) throw new Error("Request not found.");
    if (req.status !== "pending") throw new Error("Already reviewed.");

    if (data.decision === "approved") {
      // Apply the revert now.
      const { data: rev } = await supabase
        .from("entity_revisions")
        .select("*")
        .eq("id", req.revision_id)
        .maybeSingle();
      if (rev) {
        const table = TABLE[rev.entity_type as EntityKind];
        const { data: current } = await supabase
          .from(table as any)
          .select("*")
          .eq("id", rev.entity_id)
          .maybeSingle();
        if (current) {
          const before = (rev.before_data ?? {}) as Record<string, unknown>;
          const patch: Record<string, unknown> = {};
          const newBefore: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(before)) {
            newBefore[k] = (current as any)[k];
            patch[k] = v;
          }
          if (Object.keys(patch).length) {
            await supabase
              .from(table as any)
              .update(patch)
              .eq("id", rev.entity_id);
            await supabase.from("entity_revisions").insert({
              entity_type: rev.entity_type,
              entity_id: rev.entity_id,
              changed_by: userId,
              before_data: newBefore as any,
              after_data: patch as any,
              note: `Admin-approved revert of ${rev.id.slice(0, 8)}`,
            });
          }
        }
      }
    }

    const { error: uErr } = await supabase
      .from("revert_requests")
      .update({
        status: data.decision,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.review_note ?? null,
      })
      .eq("id", data.request_id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });

export const listMyRevertRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("revert_requests")
      .select("*")
      .eq("requested_by", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
