/**
 * Course activity: which courses have upcoming events and which are being
 * played right now. Powers the course directory so players can pick a course
 * based on what is actually happening on it.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type CourseUpcomingEvent = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  source: string;
  tier: string | null;
  url: string | null;
  kind: string;
};

export type CourseActivity = {
  courseId: string;
  upcoming: CourseUpcomingEvent[];
  upcomingCount: number;
  /** Rounds currently in progress on this course. */
  liveRounds: number;
  /** Rounds finished on this course in the last 7 days. */
  recentRounds: number;
};

const Input = z.object({
  courseIds: z.array(z.string().uuid()).min(1).max(80),
});

function publicClient() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

/** Loose venue matching: "Flip City DGC" and "flip city" land on the same key. */
function nameKey(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/disc golf (course|club|park)|dgc\b|\bpark\b|\bcourse\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sortEvents(a: CourseUpcomingEvent, b: CourseUpcomingEvent) {
  return (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999");
}

/**
 * Upcoming events plus live play for a page of courses. Directory events are
 * matched on venue name and city, since synced listings carry no course id.
 */
export const listCourseActivity = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data }): Promise<CourseActivity[]> => {
    const supabase = publicClient();
    const ids = data.courseIds;
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [courseRes, tourneyRes, roundRes] = await Promise.all([
      supabase.from("courses").select("id,name,city,state").in("id", ids),
      supabase
        .from("tournaments")
        .select("id,name,start_date,end_date,course_id,pdga_tier,event_type,location")
        .in("course_id", ids)
        .gte("end_date", today)
        .order("start_date", { ascending: true })
        .limit(400),
      supabase
        .from("rounds")
        .select("id,course_id,status,started_at")
        .in("course_id", ids)
        .gte("started_at", weekAgo)
        .limit(2000),
    ]);

    const courses = (courseRes.data ?? []) as {
      id: string;
      name: string;
      city: string | null;
      state: string | null;
    }[];

    // Build lookup keys for the synced directory match.
    const byName = new Map<string, string[]>();
    for (const c of courses) {
      const key = nameKey(c.name);
      if (!key) continue;
      byName.set(key, [...(byName.get(key) ?? []), c.id]);
    }

    const activity = new Map<string, CourseActivity>(
      ids.map((id) => [
        id,
        { courseId: id, upcoming: [], upcomingCount: 0, liveRounds: 0, recentRounds: 0 },
      ]),
    );

    for (const t of (tourneyRes.data ?? []) as {
      id: string;
      name: string;
      start_date: string | null;
      end_date: string | null;
      course_id: string | null;
      pdga_tier: string | null;
      event_type: string | null;
    }[]) {
      if (!t.course_id) continue;
      const entry = activity.get(t.course_id);
      if (!entry) continue;
      entry.upcoming.push({
        id: t.id,
        name: t.name,
        startDate: t.start_date,
        endDate: t.end_date,
        source: "dashboard",
        tier: t.pdga_tier,
        url: null,
        kind: t.event_type ?? "tournament",
      });
    }

    // Synced listings: pull the upcoming window once, then match by venue name.
    const states = Array.from(
      new Set(courses.map((c) => (c.state ?? "").trim()).filter(Boolean)),
    ).slice(0, 20);
    let dirQuery = supabase
      .from("event_directory")
      .select("id,name,venue_name,city,state,start_date,end_date,source,tier,url,kind")
      .gte("start_date", today)
      .order("start_date", { ascending: true })
      .limit(3000);
    if (states.length > 0) dirQuery = dirQuery.in("state", states);
    const { data: dirRows } = await dirQuery;

    for (const row of (dirRows ?? []) as {
      id: string;
      name: string;
      venue_name: string | null;
      city: string | null;
      state: string | null;
      start_date: string | null;
      end_date: string | null;
      source: string;
      tier: string | null;
      url: string | null;
      kind: string;
    }[]) {
      const keys = [nameKey(row.venue_name), nameKey(row.name)].filter(Boolean);
      let matched: string[] = [];
      for (const k of keys) {
        const hit = byName.get(k);
        if (hit) {
          matched = hit;
          break;
        }
      }
      if (matched.length === 0) continue;
      for (const courseId of matched) {
        const entry = activity.get(courseId);
        if (!entry) continue;
        entry.upcoming.push({
          id: row.id,
          name: row.name,
          startDate: row.start_date,
          endDate: row.end_date,
          source: row.source,
          tier: row.tier,
          url: row.url,
          kind: row.kind,
        });
      }
    }

    for (const r of (roundRes.data ?? []) as {
      course_id: string;
      status: string;
    }[]) {
      const entry = activity.get(r.course_id);
      if (!entry) continue;
      if (r.status === "in_progress") entry.liveRounds += 1;
      else if (r.status === "completed") entry.recentRounds += 1;
    }

    return [...activity.values()].map((a) => {
      const sorted = a.upcoming.sort(sortEvents);
      return { ...a, upcoming: sorted.slice(0, 3), upcomingCount: sorted.length };
    });
  });
