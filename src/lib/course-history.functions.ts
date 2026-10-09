import { validUdiscRating } from "./udisc-eligibility";
/**
 * "How have I shot here before?" — the caller's own past rounds on one course,
 * pulled from DG Dashboard rounds plus imported PDGA / Disc Golf Scene / UDisc
 * rounds. Only the signed-in player's own history is returned, and only solo
 * (singles) rounds — doubles and team rounds don't reflect how the player
 * scores on their own, so they're left out.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSinglesAppRound, isSinglesExternalRound } from "@/lib/singles-only";

export type PastCourseRound = {
  id: string;
  /** ISO date (day precision) the round was played. */
  playedOn: string;
  source: "app" | "pdga" | "disc_golf_scene" | "udisc";
  layoutName: string | null;
  eventName: string | null;
  strokes: number | null;
  toPar: number | null;
  rating: number | null;
  holes: number | null;
};

export type CourseHistory = {
  courseName: string;
  rounds: PastCourseRound[];
  /** Rounds actually played, even when some have no score on file. */
  roundCount: number;
  bestStrokes: number | null;
  avgStrokes: number | null;
  bestToPar: number | null;
  avgToPar: number | null;
  bestRating: number | null;
  avgRating: number | null;
  lastRating: number | null;
  /** Newest rating minus the average, so the widget can show a trend. */
  ratingTrend: number | null;
  lastPlayed: string | null;
};

export type CourseHistoryOption = {
  courseId: string | null;
  courseName: string;
  rounds: number;
  lastPlayed: string | null;
};

const MAX_ROUNDS = 60;

/** Same normalization the Course Book uses, so both agree on what one course is. */
function normalizeCourseKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    // "Rogers Lakewood Park Disc Golf Course" and "Rogers Lakewood Park" are one course.
    .replace(/\s*(\(.*\)|-)?\s*(disc golf course|disc golf park|disc golf|dgc)$/, "")
    .trim();
}

/**
 * PDGA imports often store the event title as course_name and the real course
 * as the prefix of layout_name ("Rogers Lakewood Park - Blue Tees"). Returns the
 * course and the layout part so PDGA rounds land on the right course and layout.
 */
function externalCourse(row: { course_name: string | null; event_name: string | null; layout_name: string | null }): {
  course: string | null;
  layout: string | null;
} {
  const course = (row.course_name ?? "").trim();
  const event = (row.event_name ?? "").trim();
  const layout = (row.layout_name ?? "").trim();
  const courseIsEvent = !course || (event && normalizeCourseKey(course) === normalizeCourseKey(event));
  if (courseIsEvent && layout.includes(" - ")) {
    const i = layout.indexOf(" - ");
    return { course: layout.slice(0, i).trim(), layout: layout.slice(i + 3).trim() || null };
  }
  return { course: course || null, layout: layout || null };
}


function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return +(values.reduce((s, v) => s + v, 0) / values.length).toFixed(1);
}

function day(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function summarize(courseName: string, rounds: PastCourseRound[]): CourseHistory {
  const sorted = [...rounds].sort((a, b) => (a.playedOn < b.playedOn ? 1 : -1));
  const strokes = sorted.map((r) => r.strokes).filter((v): v is number => v != null);
  const toPar = sorted.map((r) => r.toPar).filter((v): v is number => v != null);
  const ratings = sorted.map((r) => r.rating).filter((v): v is number => v != null);
  const avgRating = ratings.length
    ? Math.round(ratings.reduce((s, v) => s + v, 0) / ratings.length)
    : null;
  const lastRating = ratings[0] ?? null;
  return {
    courseName,
    rounds: sorted.slice(0, MAX_ROUNDS),
    roundCount: sorted.length,
    bestStrokes: strokes.length ? Math.min(...strokes) : null,
    avgStrokes: avg(strokes),
    bestToPar: toPar.length ? Math.min(...toPar) : null,
    avgToPar: avg(toPar),
    bestRating: ratings.length ? Math.max(...ratings) : null,
    avgRating,
    lastRating,
    ratingTrend: lastRating != null && avgRating != null ? lastRating - avgRating : null,
    lastPlayed: sorted[0]?.playedOn ?? null,
  };
}

type Client = {
  from: (table: string) => any;
};

type NativeRatingRow = {
  id: string;
  round_id: string | null;
  course_id: string | null;
  layout_id: string | null;
  total_strokes: number | null;
  par_total: number | null;
  score_to_par: number | null;
  round_rating: number | null;
  chainlink_rating: number | null;
  holes_played: number | null;
  created_at: string;
};

type ExternalRow = {
  id: string;
  source: string | null;
  format: string | null;
  course_name: string | null;
  layout_name: string | null;
  event_name: string | null;
  division: string | null;
  played_on: string | null;
  created_at: string;
  score: number | null;
  to_par: number | null;
  round_rating: number | null;
  mock_pdga_rating: number | null;
};

/** Course ids whose name matches the requested course, plus every stored alias name. */
async function resolveCourseIds(
  supabase: Client,
  courseName: string,
  courseId: string | null,
): Promise<{ ids: string[]; names: Set<string> }> {
  const key = normalizeCourseKey(courseName);
  const names = new Set<string>([key]);
  const ids = new Set<string>();
  if (courseId) ids.add(courseId);

  const first = courseName.trim().split(/\s+/)[0] ?? courseName.trim();
  if (first.length >= 3) {
    const res = await supabase
      .from("courses")
      .select("id, name")
      .ilike("name", `%${first}%`)
      .limit(200);
    for (const row of (res.data ?? []) as Array<{ id: string; name: string | null }>) {
      if (!row.name) continue;
      if (normalizeCourseKey(row.name) !== key) continue;
      ids.add(row.id);
      names.add(normalizeCourseKey(row.name));
    }
  }
  return { ids: Array.from(ids), names };
}

/**
 * Past rounds the caller played on one course. Matching is by normalized course
 * name so imported rounds line up with DG Dashboard course records.
 */
export const getCourseHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        courseName: z.string().trim().min(2).max(160),
        courseId: z.string().uuid().nullish(),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }): Promise<CourseHistory> => {
    const { supabase, userId } = context as unknown as { supabase: Client; userId: string };
    const { ids, names } = await resolveCourseIds(supabase, data.courseName, data.courseId ?? null);

    const rounds: PastCourseRound[] = [];

    if (ids.length > 0) {
      const res = await supabase
        .from("round_ratings")
        .select(
          "id, round_id, course_id, layout_id, total_strokes, par_total, score_to_par, round_rating, chainlink_rating, holes_played, created_at",
        )
        .eq("user_id", userId)
        .in("course_id", ids)
        .order("created_at", { ascending: false })
        .limit(MAX_ROUNDS);
      const rows = (res.data ?? []) as NativeRatingRow[];

      const layoutIds = Array.from(
        new Set(rows.map((r) => r.layout_id).filter((v): v is string => !!v)),
      );
      const layoutNames = new Map<string, string>();
      if (layoutIds.length > 0) {
        const layoutRes = await supabase
          .from("course_layouts")
          .select("id, name")
          .in("id", layoutIds);
        for (const l of (layoutRes.data ?? []) as Array<{ id: string; name: string | null }>) {
          if (l.name) layoutNames.set(l.id, l.name);
        }
      }

      const roundIds = Array.from(
        new Set(rows.map((r) => r.round_id).filter((v): v is string => !!v)),
      );
      const playedAt = new Map<string, string>();
      const soloRoundIds = new Set<string>();
      if (roundIds.length > 0) {
        const roundRes = await supabase
          .from("rounds")
          .select("id, started_at, created_at, play_format, team_size")
          .in("id", roundIds);
        for (const r of (roundRes.data ?? []) as Array<{
          id: string;
          started_at: string | null;
          created_at: string;
          play_format: string | null;
          team_size: number | null;
        }>) {
          playedAt.set(r.id, day(r.started_at ?? r.created_at) ?? "");
          if (isSinglesAppRound(r)) soloRoundIds.add(r.id);
        }
      }

      for (const r of rows) {
        // Skip doubles/team rounds — the score isn't the player's own.
        if (r.round_id && !soloRoundIds.has(r.round_id)) continue;
        const toPar =
          r.score_to_par ??
          (r.total_strokes != null && r.par_total != null ? r.total_strokes - r.par_total : null);
        rounds.push({
          id: r.id,
          playedOn: (r.round_id ? playedAt.get(r.round_id) : null) || day(r.created_at) || "",
          source: "app",
          layoutName: r.layout_id ? (layoutNames.get(r.layout_id) ?? null) : null,
          eventName: null,
          strokes: r.total_strokes,
          toPar,
          rating: r.round_rating ?? r.chainlink_rating ?? null,
          holes: r.holes_played,
        });
      }
    }

    const first = data.courseName.trim().split(/\s+/)[0] ?? data.courseName.trim();
    const extRes = await supabase
      .from("external_rounds")
      .select(
        "id, source, format, course_name, layout_name, event_name, division, played_on, created_at, score, to_par, round_rating, mock_pdga_rating",
      )
      .eq("user_id", userId)
      .or(`course_name.ilike.%${first.replace(/[,()%]/g, "")}%,layout_name.ilike.%${first.replace(/[,()%]/g, "")}%`)
      .order("played_on", { ascending: false })
      .limit(200);
    for (const row of (extRes.data ?? []) as ExternalRow[]) {
      const ec = externalCourse(row);
      if (!ec.course) continue;
      if (!names.has(normalizeCourseKey(ec.course))) continue;
      // Imported doubles/team rounds are excluded the same way.
      if (!isSinglesExternalRound(row)) continue;
      const source =
        row.source === "udisc"
          ? "udisc"
          : row.source === "disc_golf_scene"
            ? "disc_golf_scene"
            : "pdga";
      rounds.push({
        id: row.id,
        playedOn: day(row.played_on) || day(row.created_at) || "",
        source,
        layoutName: ec.layout,
        eventName: row.event_name,
        strokes: row.score,
        toPar: row.to_par,
        rating:
          source === "udisc"
            ? validUdiscRating(row.round_rating)
            : (row.round_rating ?? row.mock_pdga_rating ?? null),
        holes: null,
      });
    }

    return summarize(data.courseName.trim(), rounds);
  });

/** Courses the caller has already played, newest first — the widget's picker. */
export const listPlayedCourseOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CourseHistoryOption[]> => {
    const { supabase, userId } = context as unknown as { supabase: Client; userId: string };

    const buckets = new Map<string, CourseHistoryOption>();
    const add = (name: string, courseId: string | null, playedOn: string | null) => {
      const key = normalizeCourseKey(name);
      if (!key) return;
      const existing = buckets.get(key);
      if (!existing) {
        buckets.set(key, { courseId, courseName: name.trim(), rounds: 1, lastPlayed: playedOn });
        return;
      }
      existing.rounds++;
      if (!existing.courseId && courseId) existing.courseId = courseId;
      if (playedOn && (!existing.lastPlayed || playedOn > existing.lastPlayed)) {
        existing.lastPlayed = playedOn;
      }
    };

    const nativeRes = await supabase
      .from("round_ratings")
      .select("course_id, round_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(600);
    const nativeRows = (nativeRes.data ?? []) as Array<{
      course_id: string | null;
      round_id: string | null;
      created_at: string;
    }>;

    // Counts here must match the solo-only history below.
    const nativeRoundIds = Array.from(
      new Set(nativeRows.map((r) => r.round_id).filter((v): v is string => !!v)),
    );
    const soloRounds = new Set<string>();
    if (nativeRoundIds.length > 0) {
      const res = await supabase
        .from("rounds")
        .select("id, play_format, team_size")
        .in("id", nativeRoundIds);
      for (const r of (res.data ?? []) as Array<{
        id: string;
        play_format: string | null;
        team_size: number | null;
      }>) {
        if (isSinglesAppRound(r)) soloRounds.add(r.id);
      }
    }
    const courseIds = Array.from(
      new Set(nativeRows.map((r) => r.course_id).filter((v): v is string => !!v)),
    );
    const courseNames = new Map<string, string>();
    if (courseIds.length > 0) {
      const res = await supabase.from("courses").select("id, name").in("id", courseIds);
      for (const c of (res.data ?? []) as Array<{ id: string; name: string | null }>) {
        if (c.name) courseNames.set(c.id, c.name);
      }
    }
    for (const r of nativeRows) {
      if (r.round_id && !soloRounds.has(r.round_id)) continue;
      const name = r.course_id ? courseNames.get(r.course_id) : null;
      if (!name) continue;
      add(name, r.course_id, day(r.created_at));
    }

    const extRes = await supabase
      .from("external_rounds")
      .select("course_name, event_name, format, layout_name, division, played_on, created_at")
      .eq("user_id", userId)
      .order("played_on", { ascending: false })
      .limit(1000);
    const extRows = ((extRes.data ?? []) as Array<{
      course_name: string | null;
      event_name: string | null;
      format: string | null;
      layout_name: string | null;
      division: string | null;
      played_on: string | null;
      created_at: string;
    }>).filter(isSinglesExternalRound);

    // Imported rounds sometimes carry the event name in the course field. This
    // list is a course picker, so resolve names against the course directory and
    // drop anything that is only an event title.
    const extNames = Array.from(
      new Set(extRows.map((r) => (externalCourse(r).course ?? "").trim()).filter((n) => n.length > 1)),
    );
    const courseByKey = new Map<string, { id: string; name: string }>();
    if (extNames.length > 0) {
      const res = await supabase.from("courses").select("id, name").in("name", extNames);
      for (const c of (res.data ?? []) as Array<{ id: string; name: string | null }>) {
        if (!c.name) continue;
        const key = normalizeCourseKey(c.name);
        if (key && !courseByKey.has(key)) courseByKey.set(key, { id: c.id, name: c.name });
      }
    }

    for (const r of extRows) {
      const name = (externalCourse(r).course ?? "").trim();
      if (name.length < 2) continue;
      const match = courseByKey.get(normalizeCourseKey(name));
      const eventName = (r.event_name ?? "").trim();
      if (!match && eventName && normalizeCourseKey(eventName) === normalizeCourseKey(name)) {
        continue;
      }
      add(match?.name ?? name, match?.id ?? null, day(r.played_on) || day(r.created_at));
    }

    return Array.from(buckets.values()).sort((a, b) => {
      if (a.lastPlayed && b.lastPlayed && a.lastPlayed !== b.lastPlayed)
        return a.lastPlayed < b.lastPlayed ? 1 : -1;
      if (a.lastPlayed && !b.lastPlayed) return -1;
      if (!a.lastPlayed && b.lastPlayed) return 1;
      return b.rounds - a.rounds;
    });
  });
