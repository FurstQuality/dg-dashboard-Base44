/**
 * Course Book — aggregates courses the player has ever played across
 * DG rounds, UDisc/PDGA/manual external imports; and manages the
 * per-course scrapbook (photos, scorecards, notes).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type PlayedCourse = {
  course_key: string;
  display_name: string;
  location: string | null;
  sources: string[]; // 'chainlink' | 'udisc' | 'pdga' | 'manual' | 'event'
  course_id: string | null;
  cover_url: string | null;
  round_count: number;
  /** Tournaments and league nights played here with no scored round on file. */
  event_count: number;
  /** Events (tournaments, league nights) this course hosted for the player. */
  event_names: string[];
  last_played: string | null;
  best_to_par: number | null;
  best_rating: number | null;
  entry_id: string | null;
  media_count: number;
  pinned: boolean;
  notes: string | null;
};

function normKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/* ------------------------------------------------------------------ */
/* List all played courses (union of rounds + external_rounds + book)  */
/* ------------------------------------------------------------------ */
export const listPlayedCourses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { collectPlayedCourses } = await import("./played-courses.server");

    const [played, entries, media] = await Promise.all([
      collectPlayedCourses(supabase, userId),
      supabase
        .from("course_book_entries")
        .select("id, course_key, display_name, location, notes, pinned, course_id")
        .eq("user_id", userId),
      supabase.from("course_book_media").select("entry_id").eq("user_id", userId),
    ]);
    if (entries.error) throw new Error(entries.error.message);
    if (media.error) throw new Error(media.error.message);

    const map = new Map<string, PlayedCourse>();
    for (const [key, c] of played) {
      map.set(key, {
        ...c,
        sources: [...c.sources],
        entry_id: null,
        media_count: 0,
        pinned: false,
        notes: null,
      });
    }

    // Merge book entries (may exist without any round yet, or add pin/notes).
    const mediaCount = new Map<string, number>();
    for (const m of (media.data ?? []) as Array<{ entry_id: string }>) {
      mediaCount.set(m.entry_id, (mediaCount.get(m.entry_id) ?? 0) + 1);
    }
    for (const e of (entries.data ?? []) as Array<{
      id: string;
      course_key: string;
      display_name: string;
      location: string | null;
      notes: string | null;
      pinned: boolean;
      course_id: string | null;
    }>) {
      const cur: PlayedCourse = map.get(e.course_key) ?? {
        course_key: e.course_key,
        display_name: e.display_name,
        location: e.location,
        sources: [],
        course_id: e.course_id,
        cover_url: null,
        round_count: 0,
        event_count: 0,
        event_names: [],
        last_played: null,
        best_to_par: null,
        best_rating: null,
        entry_id: null,
        media_count: 0,
        pinned: false,
        notes: null,
      };
      cur.entry_id = e.id;
      cur.pinned = e.pinned;
      cur.notes = e.notes;
      cur.media_count = mediaCount.get(e.id) ?? 0;
      cur.course_id = cur.course_id ?? e.course_id;
      cur.display_name = e.display_name || cur.display_name;
      cur.location = cur.location ?? e.location;
      map.set(e.course_key, cur);
    }

    const list = Array.from(map.values());
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const ad = a.last_played ?? "";
      const bd = b.last_played ?? "";
      if (ad !== bd) return ad < bd ? 1 : -1;
      return a.display_name.localeCompare(b.display_name);
    });
    return list;
  });

/* ------------------------------------------------------------------ */
/* Get-or-create entry for a course_key                                 */
/* ------------------------------------------------------------------ */
export const openCourseBookEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z
      .object({
        course_key: z.string().min(1),
        display_name: z.string().min(1),
        location: z.string().nullish(),
        course_id: z.string().uuid().nullish(),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const key = normKey(data.course_key);
    const existing = await supabase
      .from("course_book_entries")
      .select("*")
      .eq("user_id", userId)
      .eq("course_key", key)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) return existing.data as { id: string };
    const ins = await supabase
      .from("course_book_entries")
      .insert({
        user_id: userId,
        course_key: key,
        display_name: data.display_name,
        location: data.location ?? null,
        course_id: data.course_id ?? null,
      })
      .select("*")
      .single();
    if (ins.error) throw new Error(ins.error.message);
    return ins.data as { id: string };
  });

/* ------------------------------------------------------------------ */
/* Get entry with media, plus rounds played on that course              */
/* ------------------------------------------------------------------ */
export const getCourseBookEntry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ entryId: z.string().uuid() }).parse(v))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const entry = await supabase
      .from("course_book_entries")
      .select("*")
      .eq("id", data.entryId)
      .eq("user_id", userId)
      .maybeSingle();
    if (entry.error) throw new Error(entry.error.message);
    if (!entry.data) throw new Error("Course book entry not found");
    const row = entry.data as {
      id: string;
      course_key: string;
      display_name: string;
      location: string | null;
      notes: string | null;
      pinned: boolean;
      course_id: string | null;
    };

    const media = await supabase
      .from("course_book_media")
      .select("*")
      .eq("entry_id", row.id)
      .order("created_at", { ascending: false });
    if (media.error) throw new Error(media.error.message);

    // Sign paths for view.
    const signed: Array<{
      id: string;
      kind: "photo" | "scorecard" | "video";
      url: string;
      path: string;
      caption: string | null;
      taken_on: string | null;
      created_at: string;
    }> = [];
    for (const m of (media.data ?? []) as Array<{
      id: string;
      kind: "photo" | "scorecard" | "video";
      storage_path: string;
      caption: string | null;
      taken_on: string | null;
      created_at: string;
    }>) {
      const { data: url } = await supabase.storage
        .from("course-book")
        .createSignedUrl(m.storage_path, 60 * 60 * 24);
      signed.push({
        id: m.id,
        kind: m.kind,
        url: url?.signedUrl ?? "",
        path: m.storage_path,
        caption: m.caption,
        taken_on: m.taken_on,
        created_at: m.created_at,
      });
    }

    // Round history on this course (union across chainlink + external).
    const key = row.course_key;
    const [chain, ext] = await Promise.all([
      row.course_id
        ? supabase
            .from("rounds")
            .select("id, started_at, layout_id, course_layouts(name)")
            .eq("created_by", userId)
            .eq("course_id", row.course_id)
            .order("started_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null }),
      supabase
        .from("external_rounds")
        .select("id, source, played_on, to_par, round_rating, layout_name, event_name, score")
        .eq("user_id", userId)
        .order("played_on", { ascending: false })
        .limit(500),
    ]);
    if (chain.error) throw new Error((chain as { error: { message: string } }).error.message);
    if (ext.error) throw new Error(ext.error.message);

    const rounds: Array<{
      id: string;
      source: string;
      played_on: string;
      layout: string | null;
      event: string | null;
      to_par: number | null;
      rating: number | null;
      score: number | null;
    }> = [];
    for (const r of (chain.data ?? []) as Array<{
      id: string;
      started_at: string;
      course_layouts: { name: string } | null;
    }>) {
      rounds.push({
        id: r.id,
        source: "chainlink",
        played_on: r.started_at.slice(0, 10),
        layout: r.course_layouts?.name ?? null,
        event: null,
        to_par: null,
        rating: null,
        score: null,
      });
    }
    for (const r of (ext.data ?? []) as Array<{
      id: string;
      source: string;
      played_on: string;
      to_par: number | null;
      round_rating: number | null;
      layout_name: string | null;
      event_name: string | null;
      score: number | null;
      course_name?: string;
    }>) {
      // Match ext rounds by name (need course_name — refetch minimal set).
    }

    // Re-fetch ext with course_name filter (server-side).
    const extMatch = await supabase
      .from("external_rounds")
      .select(
        "id, source, played_on, to_par, round_rating, layout_name, event_name, score, course_name",
      )
      .eq("user_id", userId)
      .ilike("course_name", row.display_name)
      .order("played_on", { ascending: false })
      .limit(500);
    if (!extMatch.error) {
      for (const r of (extMatch.data ?? []) as Array<{
        id: string;
        source: string;
        played_on: string;
        to_par: number | null;
        round_rating: number | null;
        layout_name: string | null;
        event_name: string | null;
        score: number | null;
        course_name: string;
      }>) {
        if (normKey(r.course_name) !== key) continue;
        rounds.push({
          id: r.id,
          source: r.source,
          played_on: r.played_on,
          layout: r.layout_name,
          event: r.event_name,
          to_par: r.to_par,
          rating: r.round_rating,
          score: r.score,
        });
      }
    }
    rounds.sort((a, b) => (a.played_on < b.played_on ? 1 : -1));

    return { entry: row, media: signed, rounds };
  });

/* ------------------------------------------------------------------ */
/* Update entry (notes, pinned, display name/location)                  */
/* ------------------------------------------------------------------ */
export const updateCourseBookEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z
      .object({
        entryId: z.string().uuid(),
        notes: z.string().nullish(),
        pinned: z.boolean().optional(),
        display_name: z.string().min(1).optional(),
        location: z.string().nullish(),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const patch: {
      notes?: string | null;
      pinned?: boolean;
      display_name?: string;
      location?: string | null;
    } = {};
    if (data.notes !== undefined) patch.notes = data.notes ?? null;
    if (data.pinned !== undefined) patch.pinned = data.pinned;
    if (data.display_name !== undefined) patch.display_name = data.display_name;
    if (data.location !== undefined) patch.location = data.location ?? null;
    const { error } = await supabase
      .from("course_book_entries")
      .update(patch)
      .eq("id", data.entryId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Add media row after client-side upload                              */
/* ------------------------------------------------------------------ */
export const addCourseBookMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z
      .object({
        entryId: z.string().uuid(),
        kind: z.enum(["photo", "scorecard", "video"]),
        storage_path: z.string().min(1),
        caption: z.string().nullish(),
        taken_on: z.string().nullish(),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("course_book_media")
      .insert({
        entry_id: data.entryId,
        user_id: userId,
        kind: data.kind,
        storage_path: data.storage_path,
        caption: data.caption ?? null,
        taken_on: data.taken_on ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/* ------------------------------------------------------------------ */
/* Delete media                                                         */
/* ------------------------------------------------------------------ */
export const deleteCourseBookMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const row = await supabase
      .from("course_book_media")
      .select("storage_path")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (row.error) throw new Error(row.error.message);
    if (row.data) {
      await supabase.storage.from("course-book").remove([row.data.storage_path]);
    }
    const del = await supabase
      .from("course_book_media")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (del.error) throw new Error(del.error.message);
    return { ok: true };
  });
