/**
 * One source of truth for "every course this player has ever played".
 *
 * Pulls from every place the app records that a player was on a course:
 *   - `rounds` they scored in the app (plus rounds they were a player on)
 *   - `external_rounds` imported from UDisc, PDGA and Disc Golf Scene
 *   - tournaments they registered for (course comes from `tournament_rounds`)
 *   - league nights they signed up for or checked in to (`league_events`)
 *   - PDGA event imports with no course on the round, resolved through the
 *     event directory / PDGA knowledge base venue for that event
 *
 * Server-only: never import this from a component. `*.server.ts` files are
 * blocked from client bundles.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PlayedCourseSource = "chainlink" | "udisc" | "pdga" | "manual" | "event";

export type PlayedCourseStat = {
  course_key: string;
  display_name: string;
  location: string | null;
  sources: PlayedCourseSource[];
  course_id: string | null;
  cover_url: string | null;
  /** Scored rounds on file for this course. */
  round_count: number;
  /** Tournaments / league nights played here with no scored round on file. */
  event_count: number;
  last_played: string | null;
  best_to_par: number | null;
  best_rating: number | null;
  /** Events (tournaments, leagues) this course hosted for the player. */
  event_names: string[];
};

type Client = SupabaseClient<Database>;

export function normalizeCourseKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

function blank(key: string, name: string): PlayedCourseStat {
  return {
    course_key: key,
    display_name: name,
    location: null,
    sources: [],
    course_id: null,
    cover_url: null,
    round_count: 0,
    event_count: 0,
    last_played: null,
    best_to_par: null,
    best_rating: null,
    event_names: [],
  };
}

export async function collectPlayedCourses(
  supabase: Client,
  userId: string,
): Promise<Map<string, PlayedCourseStat>> {
  const map = new Map<string, PlayedCourseStat>();

  const touch = (name: string): PlayedCourseStat | null => {
    const clean = (name ?? "").trim();
    if (!clean) return null;
    const key = normalizeCourseKey(clean);
    const cur = map.get(key) ?? blank(key, clean);
    map.set(key, cur);
    return cur;
  };
  const addSource = (row: PlayedCourseStat, src: PlayedCourseSource) => {
    if (!row.sources.includes(src)) row.sources.push(src);
  };
  const seen = (row: PlayedCourseStat, day: string | null) => {
    if (!day) return;
    const d = day.slice(0, 10);
    if (!row.last_played || d > row.last_played) row.last_played = d;
  };
  const addEvent = (row: PlayedCourseStat, name: string | null) => {
    const clean = (name ?? "").trim();
    if (!clean || row.event_names.includes(clean)) return;
    if (row.event_names.length < 40) row.event_names.push(clean);
  };

  /* ---------- 1. Rounds scored in the app ---------- */
  const [ownRounds, playerRows, ext] = await Promise.all([
    supabase
      .from("rounds")
      .select("id, started_at, course_id, courses(id, name, city, state, cover_url)")
      .eq("created_by", userId)
      .order("started_at", { ascending: false })
      .limit(2000),
    supabase.from("round_players").select("round_id").eq("user_id", userId).limit(2000),
    supabase
      .from("external_rounds")
      .select("source, course_name, event_name, played_on, to_par, round_rating")
      .eq("user_id", userId)
      .order("played_on", { ascending: false })
      .limit(4000),
  ]);

  type CourseJoin = {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    cover_url: string | null;
  } | null;

  const applyCourse = (
    course: CourseJoin,
    day: string | null,
    src: PlayedCourseSource,
    counts: "round" | "event",
    eventName?: string | null,
  ) => {
    if (!course?.name) return;
    const row = touch(course.name);
    if (!row) return;
    row.course_id = row.course_id ?? course.id;
    row.cover_url = row.cover_url ?? course.cover_url;
    row.location =
      row.location ?? ([course.city, course.state].filter(Boolean).join(", ") || null);
    if (counts === "round") row.round_count += 1;
    else row.event_count += 1;
    addSource(row, src);
    seen(row, day);
    addEvent(row, eventName ?? null);
  };

  for (const r of (ownRounds.data ?? []) as Array<{
    started_at: string | null;
    courses: CourseJoin;
  }>) {
    applyCourse(r.courses, r.started_at, "chainlink", "round");
  }

  /* ---------- 2. Rounds someone else scored with this player on the card ---------- */
  const playerRoundIds = ((playerRows.data ?? []) as Array<{ round_id: string }>).map(
    (r) => r.round_id,
  );
  if (playerRoundIds.length > 0) {
    const guestRounds = await supabase
      .from("rounds")
      .select("id, started_at, created_by, courses(id, name, city, state, cover_url)")
      .in("id", playerRoundIds.slice(0, 500));
    for (const r of (guestRounds.data ?? []) as Array<{
      started_at: string | null;
      created_by: string | null;
      courses: CourseJoin;
    }>) {
      if (r.created_by === userId) continue; // already counted above
      applyCourse(r.courses, r.started_at, "chainlink", "round");
    }
  }

  /* ---------- 3. Imported rounds (UDisc, PDGA, Disc Golf Scene, manual) ---------- */
  type ExtRow = {
    source: string | null;
    course_name: string | null;
    event_name: string | null;
    played_on: string;
    to_par: number | null;
    round_rating: number | null;
  };
  const unresolvedEvents = new Map<string, { name: string; last: string }>();
  for (const r of (ext.data ?? []) as ExtRow[]) {
    const src: PlayedCourseSource =
      r.source === "pdga" || r.source === "disc_golf_scene"
        ? "pdga"
        : r.source === "udisc"
          ? "udisc"
          : "manual";
    const courseName = (r.course_name ?? "").trim();
    // PDGA imports with no course use the event name as a placeholder. Those
    // are events, not courses — resolve them from the event directory below.
    if (!courseName || norm(courseName) === norm(r.event_name)) {
      const evt = (r.event_name ?? courseName).trim();
      if (evt) {
        const key = norm(evt);
        const prev = unresolvedEvents.get(key);
        if (!prev || r.played_on > prev.last) unresolvedEvents.set(key, { name: evt, last: r.played_on });
      }
      continue;
    }
    const row = touch(courseName);
    if (!row) continue;
    row.round_count += 1;
    addSource(row, src);
    seen(row, r.played_on);
    addEvent(row, r.event_name);
    if (r.to_par != null && (row.best_to_par == null || r.to_par < row.best_to_par))
      row.best_to_par = r.to_par;
    if (r.round_rating != null && (row.best_rating == null || r.round_rating > row.best_rating))
      row.best_rating = r.round_rating;
  }

  /* ---------- 4. Tournaments the player registered for ---------- */
  const [tRegs, lRegs, lCheckins] = await Promise.all([
    supabase
      .from("tournament_registrations")
      .select("tournament_id")
      .eq("user_id", userId)
      .limit(500),
    supabase.from("league_registrations").select("league_id").eq("user_id", userId).limit(500),
    supabase
      .from("league_event_checkins")
      .select("league_event_id")
      .eq("user_id", userId)
      .limit(1000),
  ]);

  const tournamentIds = Array.from(
    new Set(
      ((tRegs.data ?? []) as Array<{ tournament_id: string | null }>)
        .map((r) => r.tournament_id)
        .filter((v): v is string => !!v),
    ),
  );
  if (tournamentIds.length > 0) {
    const [tRounds, tourns] = await Promise.all([
      supabase
        .from("tournament_rounds")
        .select("tournament_id, course_id, courses(id, name, city, state, cover_url)")
        .in("tournament_id", tournamentIds),
      supabase.from("tournaments").select("id, name, start_date").in("id", tournamentIds),
    ]);
    const meta = new Map<string, { name: string | null; start_date: string | null }>();
    for (const t of (tourns.data ?? []) as Array<{
      id: string;
      name: string | null;
      start_date: string | null;
    }>) {
      meta.set(t.id, { name: t.name, start_date: t.start_date });
    }
    const countedCourse = new Set<string>();
    for (const r of (tRounds.data ?? []) as Array<{
      tournament_id: string;
      courses: CourseJoin;
    }>) {
      if (!r.courses?.name) continue;
      const dedupe = `${r.tournament_id}:${r.courses.id}`;
      if (countedCourse.has(dedupe)) continue;
      countedCourse.add(dedupe);
      const m = meta.get(r.tournament_id);
      applyCourse(r.courses, m?.start_date ?? null, "event", "event", m?.name ?? null);
    }
  }

  /* ---------- 5. League nights ---------- */
  const leagueIds = Array.from(
    new Set(
      ((lRegs.data ?? []) as Array<{ league_id: string | null }>)
        .map((r) => r.league_id)
        .filter((v): v is string => !!v),
    ),
  );
  const checkinEventIds = Array.from(
    new Set(
      ((lCheckins.data ?? []) as Array<{ league_event_id: string | null }>)
        .map((r) => r.league_event_id)
        .filter((v): v is string => !!v),
    ),
  );
  if (leagueIds.length > 0 || checkinEventIds.length > 0) {
    const queries: Array<PromiseLike<{ data: unknown }>> = [];
    if (leagueIds.length > 0) {
      queries.push(
        supabase
          .from("league_events")
          .select("id, name, event_date, league_id, courses(id, name, city, state, cover_url)")
          .in("league_id", leagueIds)
          .limit(1000),
      );
    }
    if (checkinEventIds.length > 0) {
      queries.push(
        supabase
          .from("league_events")
          .select("id, name, event_date, league_id, courses(id, name, city, state, cover_url)")
          .in("id", checkinEventIds.slice(0, 500)),
      );
    }
    const results = await Promise.all(queries);
    const doneEvents = new Set<string>();
    const today = new Date().toISOString().slice(0, 10);
    for (const res of results) {
      for (const e of (res.data ?? []) as Array<{
        id: string;
        name: string | null;
        event_date: string | null;
        courses: CourseJoin;
      }>) {
        if (doneEvents.has(e.id)) continue;
        doneEvents.add(e.id);
        // Only nights that have happened count as "played".
        if (e.event_date && e.event_date > today) continue;
        applyCourse(e.courses, e.event_date, "event", "event", e.name ?? null);
      }
    }
  }

  /* ---------- 6. PDGA event imports with no course on the round ---------- */
  if (unresolvedEvents.size > 0) {
    const names = Array.from(unresolvedEvents.values()).map((e) => e.name);
    const batch = names.slice(0, 200);
    const [dir, kb] = await Promise.all([
      supabase.from("event_directory").select("name, venue_name, city").in("name", batch),
      supabase.from("pdga_kb_events").select("name, course_refs, city").in("name", batch),
    ]);
    const venueByEvent = new Map<string, { venue: string; city: string | null }>();
    for (const d of (dir.data ?? []) as Array<{
      name: string | null;
      venue_name: string | null;
      city: string | null;
    }>) {
      const venue = (d.venue_name ?? "").trim();
      if (!d.name || !venue) continue;
      venueByEvent.set(norm(d.name), { venue, city: d.city });
    }
    for (const k of (kb.data ?? []) as Array<{
      name: string | null;
      course_refs: unknown;
      city: string | null;
    }>) {
      if (!k.name || venueByEvent.has(norm(k.name))) continue;
      const refs = Array.isArray(k.course_refs) ? k.course_refs : [];
      const first = refs
        .map((r) =>
          typeof r === "string"
            ? r
            : r && typeof r === "object" && "name" in r
              ? String((r as { name?: unknown }).name ?? "")
              : "",
        )
        .find((n) => n.trim().length > 1);
      if (first) venueByEvent.set(norm(k.name), { venue: first.trim(), city: k.city });
    }

    for (const [key, evt] of unresolvedEvents) {
      const venue = venueByEvent.get(key);
      if (!venue) continue;
      const row = touch(venue.venue);
      if (!row) continue;
      row.event_count += 1;
      row.location = row.location ?? venue.city ?? null;
      addSource(row, "pdga");
      seen(row, evt.last);
      addEvent(row, evt.name);
    }
  }

  /* ---------- 7. Link name-only courses to the real course record ---------- */
  const unlinked = Array.from(map.values()).filter((r) => !r.course_id);
  if (unlinked.length > 0) {
    const names = unlinked.slice(0, 300).map((r) => r.display_name);
    const found = await supabase
      .from("courses")
      .select("id, name, city, state, cover_url")
      .in("name", names);
    for (const c of (found.data ?? []) as Array<{
      id: string;
      name: string;
      city: string | null;
      state: string | null;
      cover_url: string | null;
    }>) {
      const row = map.get(normalizeCourseKey(c.name));
      if (!row || row.course_id) continue;
      row.course_id = c.id;
      row.cover_url = row.cover_url ?? c.cover_url;
      row.location = row.location ?? ([c.city, c.state].filter(Boolean).join(", ") || null);
    }
  }

  return map;
}
