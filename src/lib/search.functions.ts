import { createServerFn } from "@tanstack/react-start";
import { orFilterText } from "@/lib/postgrest-safe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ q: z.string().min(1).max(100) });

export type SearchHit =
  | {
      kind: "player";
      id: string;
      title: string;
      subtitle: string;
      to: string;
      params: Record<string, string>;
    }
  | {
      kind: "course";
      id: string;
      title: string;
      subtitle: string;
      to: string;
      params: Record<string, string>;
    }
  | {
      kind: "club";
      id: string;
      title: string;
      subtitle: string;
      to: string;
      params: Record<string, string>;
    };

export const globalSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => Input.parse(v))
  .handler(async ({ data, context }): Promise<SearchHit[]> => {
    const { supabase } = context;
    const term = data.q.trim();
    const like = `%${orFilterText(term)}%`;

    const [players, courses, clubs] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .or(`username.ilike.${like},display_name.ilike.${like}`)
        .limit(6),
      supabase.from("courses").select("id, name, slug, city, state").ilike("name", like).limit(6),
      supabase.from("clubs").select("id, name, slug").ilike("name", like).limit(6),
    ]);

    const results: SearchHit[] = [];

    for (const p of players.data ?? []) {
      results.push({
        kind: "player",
        id: p.id,
        title: p.display_name || p.username,
        subtitle: `@${p.username}`,
        to: "/u/$username",
        params: { username: p.username },
      });
    }
    for (const c of courses.data ?? []) {
      results.push({
        kind: "course",
        id: c.id,
        title: c.name,
        subtitle: [c.city, c.state].filter(Boolean).join(", ") || "Course",
        to: "/courses/$courseId",
        params: { courseId: c.id },
      });
    }
    for (const c of clubs.data ?? []) {
      results.push({
        kind: "club",
        id: c.id,
        title: c.name,
        subtitle: "Club",
        to: "/clubs/$slug",
        params: { slug: c.slug },
      });
    }

    return results;
  });
