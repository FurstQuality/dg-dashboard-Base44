/**
 * Verified course data for event prep.
 *
 * Two jobs:
 *  - `getCourseFacts` returns the same course facts the course directory shows
 *    (location, holes, par, length, PDGA listing) plus the verified scoring
 *    profile already on file for that course.
 *  - `pullVerifiedCourseRating` reads real PDGA tournament rounds played at the
 *    course and turns them into a scratch average (SSA) and stroke value, then
 *    stores it as a course rating profile so every prep tool uses the same
 *    verified number.
 *
 * Nothing here estimates: if PDGA has no rated rounds for the course, the
 * verified block comes back empty and the UI says so.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import {
  fetchHtml,
  findCourse,
  extractEventsFromCoursePage,
  parseEvent,
  type PdgaRoundSummary,
} from "@/lib/pdga-course-lookup.functions";

export type VerifiedEventRound = {
  eventRef: string;
  eventName: string | null;
  eventDate: string | null;
  round: number;
  ssa: number | null;
  strokeValue: number | null;
  ratedRounds: number;
  winningScore: number | null;
  medianScore: number | null;
};

export type VerifiedCourseRating = {
  /** approved = admin-confirmed, pending = pulled and awaiting review. */
  status: "approved" | "pending";
  ssa: number | null;
  strokeValue: number | null;
  parTotal: number | null;
  sampleSize: number;
  pdgaCourseName: string | null;
  pdgaCourseUrl: string | null;
  eventRefs: string[];
  rounds: VerifiedEventRound[];
  updatedAt: string | null;
};

export type CoursePdgaHistory = {
  pdgaRounds: number;
  totalRounds: number;
  avgSsa: number | null;
  avgRoundRating: number | null;
  avgScore: number | null;
  bestRoundRating: number | null;
  lastPlayedOn: string | null;
};

export type CourseFacts = {
  courseId: string | null;
  name: string;
  city: string | null;
  state: string | null;
  holeCount: number | null;
  holeCountVerified: boolean;
  parTotal: number | null;
  distanceTotal: number | null;
  layoutName: string | null;
  designer: string | null;
  yearEstablished: number | null;
  difficulty: string | null;
  pdgaUrl: string | null;
  pdgaRating: number | null;
  pdgaRatingVotes: number | null;
  holesOnFile: number;
  holesWithDistance: number;
  verified: VerifiedCourseRating | null;
  /** Aggregated PDGA-rated rounds already on file for this course. */
  history: CoursePdgaHistory | null;
};

const factsInput = z.object({
  courseId: z.string().uuid().nullable().optional(),
  courseName: z.string().min(1).max(200),
  /** PDGA event refs for the event using this course, when it is a PDGA event. */
  eventRefs: z.array(z.string().min(1)).max(6).optional(),
});

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : null;
  return n != null && Number.isFinite(n) ? n : null;
};

type ProfileRow = {
  status: string | null;
  ssa: number | string | null;
  stroke_value: number | string | null;
  par_total: number | null;
  sample_size: number | null;
  pdga_course_name: string | null;
  pdga_course_url: string | null;
  event_refs: string[] | null;
  round_summaries: unknown;
  updated_at: string | null;
};

function shapeRounds(raw: unknown): VerifiedEventRound[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const row = (r ?? {}) as Record<string, unknown>;
      const round = num(row.round);
      if (round == null) return null;
      return {
        eventRef: typeof row.event_ref === "string" ? row.event_ref : "",
        eventName: typeof row.event_name === "string" ? row.event_name : null,
        eventDate: typeof row.event_date === "string" ? row.event_date : null,
        round,
        ssa: num(row.ssa),
        strokeValue: num(row.stroke_value),
        ratedRounds: num(row.n) ?? 0,
        winningScore: num(row.winning_score),
        medianScore: num(row.median_score),
      } satisfies VerifiedEventRound;
    })
    .filter((r): r is VerifiedEventRound => r !== null)
    .slice(0, 24);
}

function shapeProfile(row: ProfileRow | null): VerifiedCourseRating | null {
  if (!row) return null;
  return {
    status: row.status === "approved" ? "approved" : "pending",
    ssa: num(row.ssa),
    strokeValue: num(row.stroke_value),
    parTotal: row.par_total ?? null,
    sampleSize: row.sample_size ?? 0,
    pdgaCourseName: row.pdga_course_name,
    pdgaCourseUrl: row.pdga_course_url,
    eventRefs: row.event_refs ?? [],
    rounds: shapeRounds(row.round_summaries),
    updatedAt: row.updated_at,
  };
}

const PROFILE_SELECT =
  "status, ssa, stroke_value, par_total, sample_size, pdga_course_name, pdga_course_url, event_refs, round_summaries, updated_at";

export const getCourseFacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => factsInput.parse(raw))
  .handler(async ({ data, context }): Promise<CourseFacts> => {
    const { supabase } = context;
    const facts: CourseFacts = {
      courseId: data.courseId ?? null,
      name: data.courseName,
      city: null,
      state: null,
      holeCount: null,
      holeCountVerified: false,
      parTotal: null,
      distanceTotal: null,
      layoutName: null,
      designer: null,
      yearEstablished: null,
      difficulty: null,
      pdgaUrl: null,
      pdgaRating: null,
      pdgaRatingVotes: null,
      holesOnFile: 0,
      holesWithDistance: 0,
      verified: null,
      history: null,
    };

    if (data.courseId) {
      const { data: course } = await supabase
        .from("courses")
        .select(
          "id, name, city, state, hole_count, hole_count_verified, difficulty, designer, year_established, pdga_url, pdga_rating, pdga_rating_votes",
        )
        .eq("id", data.courseId)
        .maybeSingle();
      if (course) {
        facts.name = course.name ?? data.courseName;
        facts.city = course.city ?? null;
        facts.state = course.state ?? null;
        facts.holeCount = course.hole_count ?? null;
        facts.holeCountVerified = !!course.hole_count_verified;
        facts.difficulty = course.difficulty ?? null;
        facts.designer = course.designer ?? null;
        facts.yearEstablished = course.year_established ?? null;
        facts.pdgaUrl = course.pdga_url ?? null;
        facts.pdgaRating = num(course.pdga_rating);
        facts.pdgaRatingVotes = course.pdga_rating_votes ?? null;
      }

      const { data: layouts } = await supabase
        .from("course_layouts")
        .select("id, name, hole_count, par_total, distance_total, is_default")
        .eq("course_id", data.courseId)
        .order("is_default", { ascending: false })
        .limit(5);
      const layout = (layouts ?? [])[0] ?? null;
      if (layout) {
        facts.layoutName = layout.name ?? null;
        facts.parTotal = layout.par_total ?? null;
        facts.distanceTotal = layout.distance_total ?? null;
        if (facts.holeCount == null) facts.holeCount = layout.hole_count ?? null;

        const { data: holes } = await supabase
          .from("holes")
          .select("distance_ft")
          .eq("layout_id", layout.id)
          .limit(40);
        facts.holesOnFile = (holes ?? []).length;
        facts.holesWithDistance = (holes ?? []).filter((h) => h.distance_ft != null).length;
      }

      const { data: profiles } = await supabase
        .from("course_rating_profiles")
        .select(PROFILE_SELECT)
        .eq("course_id", data.courseId)
        .in("status", ["approved", "pending"])
        .order("status", { ascending: true })
        .order("updated_at", { ascending: false })
        .limit(5);
      const rows = (profiles ?? []) as ProfileRow[];
      facts.verified = shapeProfile(rows.find((r) => r.status === "approved") ?? rows[0] ?? null);
    } else {
      const { data: profiles } = await supabase
        .from("course_rating_profiles")
        .select(PROFILE_SELECT)
        .ilike("course_name", data.courseName)
        .order("updated_at", { ascending: false })
        .limit(1);
      facts.verified = shapeProfile(((profiles ?? []) as ProfileRow[])[0] ?? null);
    }

    // Rounds already imported from PDGA at this course. These are real rated
    // rounds, aggregated nightly into course_intel.
    let intelQuery = supabase
      .from("course_intel")
      .select(
        "pdga_rounds_count, rounds_count, avg_ssa, avg_round_rating, avg_score, best_round_rating, last_played_on",
      )
      .limit(1);
    intelQuery = data.courseId
      ? intelQuery.eq("course_id", data.courseId)
      : intelQuery.ilike("course_name", data.courseName);
    const { data: intelRows } = await intelQuery;
    const intel = (intelRows ?? [])[0] ?? null;
    if (intel) {
      facts.history = {
        pdgaRounds: intel.pdga_rounds_count ?? 0,
        totalRounds: intel.rounds_count ?? 0,
        avgSsa: num(intel.avg_ssa),
        avgRoundRating: num(intel.avg_round_rating),
        avgScore: num(intel.avg_score),
        bestRoundRating: intel.best_round_rating ?? null,
        lastPlayedOn: intel.last_played_on ?? null,
      };
    }

    return facts;
  });

/* ------------------------------------------------------------------ */

const median = (values: number[]): number | null => {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.floor(sorted.length / 2)];
};

export type PullVerifiedResult = {
  ok: boolean;
  message: string;
  verified: VerifiedCourseRating | null;
};

/**
 * Read PDGA's own course page, verify each listed event references that
 * course, and fit SSA + stroke value from the published score↔rating pairs.
 */
export const pullVerifiedCourseRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => factsInput.parse(raw))
  .handler(async ({ data, context }): Promise<PullVerifiedResult> => {
    const { supabase, userId } = context;

    if (data.courseId) {
      const { data: approved } = await supabase
        .from("course_rating_profiles")
        .select(PROFILE_SELECT)
        .eq("course_id", data.courseId)
        .eq("status", "approved")
        .maybeSingle();
      if (approved) {
        return {
          ok: true,
          message: "This course already has a confirmed rating from PDGA rounds.",
          verified: shapeProfile(approved as ProfileRow),
        };
      }
    }

    let matched: Awaited<ReturnType<typeof findCourse>> = null;
    try {
      matched = await findCourse(data.courseName);
    } catch {
      return {
        ok: false,
        message: "PDGA didn't answer just now. Try again in a minute.",
        verified: null,
      };
    }
    if (!matched) {
      return {
        ok: false,
        message: `PDGA has no course directory listing for "${data.courseName}".`,
        verified: null,
      };
    }

    let eventRefs: string[] = [...(data.eventRefs ?? [])];
    try {
      const html = await fetchHtml(matched.url);
      for (const hit of extractEventsFromCoursePage(html)) {
        if (!eventRefs.includes(hit.event_ref)) eventRefs.push(hit.event_ref);
      }
      eventRefs = eventRefs.slice(0, 8);
    } catch {
      if (eventRefs.length === 0) {
        return {
          ok: false,
          message: "We couldn't read the PDGA course page just now.",
          verified: null,
        };
      }
    }
    if (!eventRefs.length) {
      return {
        ok: false,
        message: `PDGA lists no tournaments played at ${matched.name} yet.`,
        verified: null,
      };
    }

    const summaries: PdgaRoundSummary[] = [];
    const usedRefs: string[] = [];
    for (const ref of eventRefs) {
      try {
        // PDGA's own course record is what lists these events at this course,
        // so the listing is the verification; the event page only supplies the
        // published score/rating pairs.
        const html = await fetchHtml(`https://www.pdga.com/tour/event/${ref}`);
        const parsed = parseEvent(html, ref);
        const rated = parsed.summaries.filter((s) => s.ssa != null && s.stroke_value != null);
        if (!rated.length) continue;
        summaries.push(...rated);
        usedRefs.push(ref);
      } catch {
        // Skip an event PDGA won't serve; the others still count.
      }
    }

    const ssa = median(summaries.map((s) => s.ssa!).filter((v) => v != null));
    const strokeValue = median(summaries.map((s) => s.stroke_value!).filter((v) => v != null));
    const sampleSize = summaries.reduce((sum, s) => sum + (s.n ?? 0), 0);

    if (ssa == null || strokeValue == null || sampleSize < 5) {
      return {
        ok: false,
        message: `PDGA hasn't published enough rated rounds at ${matched.name} to set a verified course rating yet.`,
        verified: null,
      };
    }

    const roundSummaries = summaries.slice(0, 24).map((s) => ({
      event_ref: s.event_ref,
      event_name: s.event_name,
      event_date: s.event_date,
      round: s.round,
      ssa: s.ssa,
      stroke_value: s.stroke_value,
      n: s.n,
      winning_score: s.winning_score,
      winning_rating: s.winning_rating,
      median_score: s.median_score,
    }));

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });

    const { data: inserted, error } = await supabase
      .from("course_rating_profiles")
      .insert({
        course_id: data.courseId ?? null,
        course_name: data.courseName,
        pdga_course_ref: matched.slug,
        pdga_course_name: matched.name,
        pdga_course_url: matched.url,
        ssa: Math.round(ssa * 10) / 10,
        stroke_value: Math.round(strokeValue * 100) / 100,
        sample_size: sampleSize,
        event_refs: usedRefs,
        round_summaries: roundSummaries as unknown as Json,
        rated_rounds: [] as unknown as Json,
        matched_course: matched as unknown as Json,
        notes: `Fitted from ${usedRefs.length} PDGA event${usedRefs.length === 1 ? "" : "s"} played at ${matched.name}.`,
        status: "pending",
        locked: false,
        auto_populated: true,
        submitted_by: userId,
      })
      .select("id")
      .single();
    if (error) {
      return { ok: false, message: error.message, verified: null };
    }

    if (isAdmin) {
      await supabase
        .from("course_rating_profiles")
        .update({
          status: "approved",
          locked: true,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", inserted.id);
    }

    return {
      ok: true,
      message: `Pulled ${sampleSize} rated PDGA rounds from ${usedRefs.length} event${usedRefs.length === 1 ? "" : "s"} at ${matched.name}.`,
      verified: {
        status: isAdmin ? "approved" : "pending",
        ssa: Math.round(ssa * 10) / 10,
        strokeValue: Math.round(strokeValue * 100) / 100,
        parTotal: null,
        sampleSize,
        pdgaCourseName: matched.name,
        pdgaCourseUrl: matched.url,
        eventRefs: usedRefs,
        rounds: shapeRounds(roundSummaries),
        updatedAt: new Date().toISOString(),
      },
    };
  });
