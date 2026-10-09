/**
 * PDGA Knowledgebase — read-only lookups for any signed-in user.
 * Backed by SECURITY DEFINER RPCs that project only safe columns.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const QuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  limit: z.number().int().min(1).max(50).optional().default(15),
});

export type KbCourse = {
  id: string;
  pdga_course_id: string | null;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  hole_count: number | null;
  latitude: number | null;
  longitude: number | null;
  designer: string | null;
  pdga_url: string | null;
};

export type KbPlayer = {
  id: string;
  pdga_number: number;
  name: string;
  rating: number | null;
  class: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  career_wins: number | null;
  pdga_url: string | null;
};

export type KbEvent = {
  id: string;
  pdga_event_id: string;
  name: string;
  tier: string | null;
  start_date: string | null;
  end_date: string | null;
  host_club: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pdga_url: string | null;
  course_refs: string[] | null;
};

export const kbSearchCourses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => QuerySchema.parse(d))
  .handler(async ({ data, context }): Promise<KbCourse[]> => {
    const { data: rows, error } = await context.supabase.rpc("pdga_kb_search_courses", {
      _q: data.q,
      _limit: data.limit,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as KbCourse[];
  });

export const kbSearchPlayers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => QuerySchema.parse(d))
  .handler(async ({ data, context }): Promise<KbPlayer[]> => {
    const { data: rows, error } = await context.supabase.rpc("pdga_kb_search_players", {
      _q: data.q,
      _limit: data.limit,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as KbPlayer[];
  });

export const kbSearchEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => QuerySchema.parse(d))
  .handler(async ({ data, context }): Promise<KbEvent[]> => {
    const { data: rows, error } = await context.supabase.rpc("pdga_kb_search_events", {
      _q: data.q,
      _limit: data.limit,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as KbEvent[];
  });
