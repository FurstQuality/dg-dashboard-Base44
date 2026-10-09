/**
 * "What I Need To Do" tracker — server functions.
 *
 * Manages the action_items table plus an auto-generated set of system items
 * derived from the player's live stats (rating, rounds imported, PDGA window,
 * upcoming tournaments). System items refresh idempotently by system_key.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { computeRating, type EngineRound } from "@/lib/stats/rating-engine";
import { nextPdgaUpdateDate } from "@/lib/stats/pdga-update";

const CATEGORY = [
  "rating",
  "scoring",
  "tournament",
  "course",
  "community",
  "custom",
  "general",
] as const;
type Category = (typeof CATEGORY)[number];

export type ActionItem = {
  id: string;
  title: string;
  description: string | null;
  category: Category;
  priority: 1 | 2 | 3;
  target_value: number | null;
  current_value: number;
  unit: string | null;
  due_date: string | null;
  is_system: boolean;
  system_key: string | null;
  status: "active" | "done" | "dismissed";
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type Row = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* List + summarize                                                    */
/* ------------------------------------------------------------------ */
export const listActionItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("action_items")
      .select("*")
      .eq("user_id", userId)
      .order("status", { ascending: true })
      .order("priority", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) { console.error("[db]", error.message); throw new Error("Something went wrong on our side. Please try again."); }
    return (data ?? []) as ActionItem[];
  });

/* ------------------------------------------------------------------ */
/* Create / update / status                                            */
/* ------------------------------------------------------------------ */
export const createActionItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(1000).optional().nullable(),
        category: z.enum(CATEGORY).default("general"),
        priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
        target_value: z.number().nullable().optional(),
        current_value: z.number().default(0),
        unit: z.string().trim().max(40).optional().nullable(),
        due_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error, data: row } = await supabase
      .from("action_items")
      .insert({
        user_id: userId,
        title: data.title,
        description: data.description ?? null,
        category: data.category,
        priority: data.priority,
        target_value: data.target_value ?? null,
        current_value: data.current_value,
        unit: data.unit ?? null,
        due_date: data.due_date ?? null,
        is_system: false,
      } as never)
      .select("id")
      .single();
    if (error) { console.error("[db]", error.message); throw new Error("Something went wrong on our side. Please try again."); }
    return { id: (row as { id: string }).id };
  });

export const updateActionItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().trim().max(1000).nullable().optional(),
        priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
        current_value: z.number().optional(),
        target_value: z.number().nullable().optional(),
        due_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Row = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.current_value !== undefined) patch.current_value = data.current_value;
    if (data.target_value !== undefined) patch.target_value = data.target_value;
    if (data.due_date !== undefined) patch.due_date = data.due_date;
    const { error } = await supabase
      .from("action_items")
      .update(patch as never)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) { console.error("[db]", error.message); throw new Error("Something went wrong on our side. Please try again."); }
    return { ok: true };
  });

export const setActionItemStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["active", "done", "dismissed"]),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Row = { status: data.status };
    patch.completed_at = data.status === "done" ? new Date().toISOString() : null;
    const { error } = await supabase
      .from("action_items")
      .update(patch as never)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) { console.error("[db]", error.message); throw new Error("Something went wrong on our side. Please try again."); }
    return { ok: true };
  });

export const deleteActionItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("action_items")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId)
      .eq("is_system", false); // system items can only be dismissed, not deleted
    if (error) { console.error("[db]", error.message); throw new Error("Something went wrong on our side. Please try again."); }
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Auto-refresh system suggestions from live stats                     */
/* ------------------------------------------------------------------ */
type Client = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (k: string, v: string) => Promise<{ data: Row[] | null }>;
    };
  };
};

async function collectRounds(supabase: Client, userId: string): Promise<EngineRound[]> {
  const [ext, native] = await Promise.all([
    supabase
      .from("external_rounds")
      .select("played_on, round_rating, score, ssa, source, format, included")
      .eq("user_id", userId),
    supabase
      .from("round_ratings")
      .select("round_rating, scratch_rating, stroke_value, total_strokes, par_total, created_at")
      .eq("user_id", userId),
  ]);
  const rows: EngineRound[] = [];
  for (const r of ext.data ?? []) {
    rows.push({
      played_on: String(r.played_on ?? ""),
      round_rating: (r.round_rating as number | null) ?? null,
      score: (r.score as number | null) ?? null,
      ssa: r.ssa == null ? null : Number(r.ssa),
      source: (r.source as string | null) ?? null,
      format: (r.format as string | null) ?? "singles",
      included: (r.included as boolean | null) ?? null,
    });
  }
  for (const r of native.data ?? []) {
    const strokes = (r.total_strokes as number | null) ?? null;
    const par = (r.par_total as number | null) ?? null;
    const scratch = (r.scratch_rating as number | null) ?? null;
    let ssa: number | null = null;
    if (scratch != null && par != null) {
      const sv = (r.stroke_value as number | null) ?? 10;
      ssa = par + (1000 - scratch) / sv;
    }
    rows.push({
      played_on: String(r.created_at ?? "").slice(0, 10),
      round_rating: (r.round_rating as number | null) ?? null,
      score: strokes,
      ssa,
      stroke_value: (r.stroke_value as number | null) ?? null,
      source: "app",
      format: "singles",
    });
  }
  return rows;
}

type SystemSpec = {
  key: string;
  title: string;
  description: string;
  category: Category;
  priority: 1 | 2 | 3;
  target: number | null;
  current: number;
  unit: string | null;
  due: string | null;
};

export const refreshActionItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as Client & {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            k: string,
            v: string,
          ) => {
            eq?: (k: string, v: string | boolean) => Promise<{ data: Row[] | null }>;
          } & Promise<{ data: Row[] | null }>;
        };
        upsert: (row: Row, opts?: unknown) => Promise<{ error: { message: string } | null }>;
        delete: () => {
          eq: (
            k: string,
            v: string,
          ) => {
            eq: (
              k: string,
              v: string | boolean,
            ) => {
              in: (k: string, v: string[]) => Promise<{ error: { message: string } | null }>;
              not: (
                k: string,
                op: string,
                v: string[],
              ) => Promise<{ error: { message: string } | null }>;
            };
          };
        };
      };
    };
    const { userId } = context;
    const rounds = await collectRounds(supabase as unknown as Client, userId);
    const rating = computeRating(rounds);
    const nextUpdate = nextPdgaUpdateDate();
    const nextIso = nextUpdate.toISOString().slice(0, 10);

    const specs: SystemSpec[] = [];

    // 1. Establishing / maintaining PDGA rating
    // DGS rounds only count toward the PDGA pool when they have an official
    // round rating — DGS also lists unsanctioned casual events.
    const pdgaRecent = rounds.filter(
      (r) =>
        (r.source === "pdga" || (r.source === "disc_golf_scene" && r.round_rating != null)) &&
        r.format === "singles" &&
        r.included !== false,
    );
    const twelveMonths = 12 * 30.44 * 86_400_000;
    const now = Date.now();
    const pdga12 = pdgaRecent.filter(
      (r) => now - new Date(r.played_on).getTime() <= twelveMonths,
    ).length;
    if (pdga12 < 8) {
      specs.push({
        key: "pdga_min_rounds",
        title: `Play ${8 - pdga12} more PDGA-sanctioned round${8 - pdga12 === 1 ? "" : "s"}`,
        description: `You have ${pdga12} rated round${pdga12 === 1 ? "" : "s"} in the last 12 months. PDGA needs 8 for a stable current rating; below that they extend to 24 months.`,
        category: "rating",
        priority: 1,
        target: 8,
        current: pdga12,
        unit: "rounds",
        due: null,
      });
    }

    // 2. Rounds this cycle (since last PDGA update — encourage cadence)
    specs.push({
      key: "rounds_this_cycle",
      title: "Log 4 rated rounds before the next PDGA update",
      description: `Your next update lands ${nextUpdate.toLocaleDateString(undefined, { month: "long", day: "numeric" })}. Fresh rounds keep the rating current and pull it toward your recent form.`,
      category: "rating",
      priority: 2,
      target: 4,
      current: 0,
      unit: "rounds",
      due: nextIso,
    });

    // 3. Rating-target ladder — next round-number milestone above current
    if (rating.rating != null) {
      const step = 25;
      const nextMilestone = Math.ceil((rating.rating + 1) / step) * step;
      specs.push({
        key: `rating_target_${nextMilestone}`,
        title: `Push your rating to ${nextMilestone}`,
        description: `Current rating: ${rating.rating}. Average round rating of ~${nextMilestone + 15} across your next 8 rated rounds moves the needle.`,
        category: "rating",
        priority: 2,
        target: nextMilestone,
        current: rating.rating,
        unit: "rating",
        due: null,
      });
    }

    // 4. Import your PDGA history when we have none
    if (pdgaRecent.length === 0) {
      specs.push({
        key: "import_pdga",
        title: "Link your PDGA number & import rated rounds",
        description:
          "Head to Progress → Import Rounds. Your PDGA history is the source of truth for ratings — without it we're blending unofficial data.",
        category: "rating",
        priority: 1,
        target: null,
        current: 0,
        unit: null,
        due: null,
      });
    }

    // 5. Community involvement
    specs.push({
      key: "monthly_community",
      title: "Play or host a community event this month",
      description:
        "Cleanups, casuals, and charity meetups build the local scene and earn XP toward community trophies.",
      category: "community",
      priority: 3,
      target: 1,
      current: 0,
      unit: "event",
      due: `${new Date().toISOString().slice(0, 7)}-28`,
    });

    // 6. New course exploration
    specs.push({
      key: "explore_new_course",
      title: "Play a new course this month",
      description: "New venues broaden your rating base and unlock the Explorer achievements.",
      category: "course",
      priority: 3,
      target: 1,
      current: 0,
      unit: "course",
      due: `${new Date().toISOString().slice(0, 7)}-28`,
    });

    // Upsert system items
    for (const s of specs) {
      const client = supabase as unknown as {
        from: (t: string) => {
          upsert: (row: Row, opts: unknown) => Promise<{ error: { message: string } | null }>;
        };
      };
      const { error } = await client.from("action_items").upsert(
        {
          user_id: userId,
          system_key: s.key,
          title: s.title,
          description: s.description,
          category: s.category,
          priority: s.priority,
          target_value: s.target,
          current_value: s.current,
          unit: s.unit,
          due_date: s.due,
          is_system: true,
          status: "active",
        } as Row,
        { onConflict: "user_id,system_key", ignoreDuplicates: false },
      );
      if (error) { console.error("[db]", error.message); throw new Error("Something went wrong on our side. Please try again."); }
    }

    return { refreshed: specs.length };
  });
