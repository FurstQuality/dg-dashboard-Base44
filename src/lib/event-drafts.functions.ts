import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EventDraftRow } from "@/lib/event-draft-state";
import { readSnapshot } from "@/lib/event-draft-state";

const kindSchema = z.enum(["league", "tournament"]);

const listSchema = z.object({ kind: kindSchema.optional() });

const saveSchema = z.object({
  id: z.string().uuid().optional(),
  kind: kindSchema,
  title: z.string().max(200).nullable().optional(),
  step: z.number().int().min(0).max(40),
  series_id: z.string().uuid().nullable().optional(),
  state: z.object({ v: z.number(), fields: z.record(z.string(), z.unknown()) }),
});

const idSchema = z.object({ id: z.string().uuid() });

const SELECT = "id, kind, title, step, series_id, state, created_at, updated_at";

function toRow(row: Record<string, unknown>): EventDraftRow {
  return {
    id: row['id'] as string,
    kind: row['kind'] as EventDraftRow["kind"],
    title: (row['title'] as string | null) ?? null,
    step: (row['step'] as number) ?? 0,
    series_id: (row['series_id'] as string | null) ?? null,
    state: readSnapshot(row['state']) ? { v: 1, fields: readSnapshot(row['state'])! } : null,
    created_at: row['created_at'] as string,
    updated_at: row['updated_at'] as string,
  };
}

/** Unfinished builder drafts for the signed-in user, newest first. */
export const listEventDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<EventDraftRow[]> => {
    let query = context.supabase
      .from("event_setup_drafts")
      .select(SELECT)
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (data.kind) query = query.eq("kind", data.kind);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => toRow(r as Record<string, unknown>));
  });

/** One draft by id. */
export const getEventDraft = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }): Promise<EventDraftRow | null> => {
    const { data: row, error } = await context.supabase
      .from("event_setup_drafts")
      .select(SELECT)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ? toRow(row as Record<string, unknown>) : null;
  });

/** Create or update a draft. Returns the draft id and save time. */
export const saveEventDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string; updated_at: string }> => {
    const payload = {
      user_id: context.userId,
      kind: data.kind,
      title: data.title?.trim() ? data.title.trim().slice(0, 200) : null,
      step: data.step,
      series_id: data.series_id ?? null,
      state: data.state as unknown as never,
    };

    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("event_setup_drafts")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .select("id, updated_at")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (row) return { id: row.id, updated_at: row.updated_at };
      // The draft was discarded elsewhere — fall through and create a new one.
    }

    const { data: created, error: insertError } = await context.supabase
      .from("event_setup_drafts")
      .insert(payload)
      .select("id, updated_at")
      .single();
    if (insertError) throw new Error(insertError.message);
    return { id: created.id, updated_at: created.updated_at };
  });

/** Remove a draft — used by Discard and after a successful publish. */
export const deleteEventDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("event_setup_drafts")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
