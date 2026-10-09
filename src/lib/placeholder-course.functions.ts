/**
 * Placeholder ("dummy") courses. Directors sometimes need to schedule an event
 * at a course that isn't in the library yet — a brand-new layout, a temporary
 * setup, or a course nobody has built. This creates a name-only course row so
 * the event can reference it, marked `is_ghost` so it stays out of the public
 * course directory until somebody builds real holes and layouts for it.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  name: z.string().trim().min(3).max(120),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(40).optional(),
  hole_count: z.number().int().min(1).max(36).optional(),
});

export type PlaceholderCourseResult = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  hole_count: number;
  /** True when an existing course matched and was reused instead of created. */
  reused: boolean;
};

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const createPlaceholderCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => Input.parse(raw))
  .handler(async ({ data, context }): Promise<PlaceholderCourseResult> => {
    const name = data.name.trim();
    const city = data.city?.trim() || null;
    const state = data.state?.trim() || null;
    const holeCount = data.hole_count ?? 18;

    // Reuse an existing course when the name already matches — a placeholder
    // must never fork a second copy of a course players already scored on.
    const { data: matchKey } = await context.supabase.rpc("course_match_key", { _name: name });
    if (typeof matchKey === "string" && matchKey.length > 3) {
      const token = name
        .replace(/[^A-Za-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3)[0];
      if (token) {
        const { data: candidates } = await context.supabase
          .from("courses")
          .select("id, name, city, state, hole_count")
          .ilike("name", `%${token}%`)
          .limit(25);
        for (const c of candidates ?? []) {
          const { data: key } = await context.supabase.rpc("course_match_key", { _name: c.name });
          if (key === matchKey) {
            return {
              id: c.id,
              name: c.name,
              city: c.city,
              state: c.state,
              hole_count: c.hole_count ?? holeCount,
              reused: true,
            };
          }
        }
      }
    }

    // Placeholders are approved so the event can read them right away, and
    // `is_ghost` keeps them out of the public directory and duplicate checks.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("courses")
      .insert({
        name,
        slug: `placeholder-${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`,
        city,
        state,
        hole_count: holeCount,
        created_by: context.userId,
        moderation_status: "approved",
        is_ghost: true,
        source: "placeholder",
      })
      .select("id, name, city, state, hole_count")
      .single();
    if (error) throw new Error(error.message);

    return {
      id: row.id,
      name: row.name,
      city: row.city,
      state: row.state,
      hole_count: row.hole_count ?? holeCount,
      reused: false,
    };
  });
