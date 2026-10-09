// Server-only helpers for course-auto-populate.functions.ts.
// Kept out of the .functions.ts module so tss-serverfn-split can produce
// a thin server-fn wrapper without dropping module-scope helpers.
import { z } from "zod";
import { recordObservation, recordSnapshot } from "@/lib/data-intel/snapshots.server";
import {
  fetchHtml as fetchPdgaHtml,
  findCourse as findPdgaCourse,
  extractEventsFromCoursePage,
  parseEvent,
  type PdgaLookupRow,
  type PdgaMatchedCourse,
  type PdgaRoundSummary,
} from "@/lib/pdga-course-lookup.functions";
import { fetchUdiscHtml, searchUdiscCourse } from "@/lib/udisc-course.functions";
import {
  parseUdiscCoursePage,
  parseUdiscReviews,
  type UdiscCourseParsed,
  type UdiscReview,
} from "@/lib/scene-parser";

export const RefreshInput = z.object({
  courseId: z.string().uuid(),
  sources: z
    .array(z.enum(["pdga", "dgs", "udisc"]))
    .optional()
    .default(["pdga", "dgs", "udisc"]),
});

export type SourceStatus = "ok" | "not_found" | "error";
export type SourceKey = "pdga" | "dgs" | "udisc";

export function nameSimilarity(a: string, b: string): number {
  const na = a
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const nb = b
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!na.length || !nb.length) return 0;
  const setB = new Set(nb);
  const hit = na.filter((w) => setB.has(w)).length;
  return Math.round((hit / Math.max(na.length, nb.length)) * 100);
}

export async function resolvePdgaForCourse(
  courseName: string,
  state: string | null,
): Promise<{
  status: SourceStatus;
  matched?: PdgaMatchedCourse | null;
  rows: PdgaLookupRow[];
  summaries: PdgaRoundSummary[];
  events: string[];
  confidence: number;
  error?: string;
}> {
  try {
    const matched = await findPdgaCourse(courseName);
    if (!matched)
      return { status: "not_found", rows: [], summaries: [], events: [], confidence: 0 };
    const nameScore = nameSimilarity(courseName, matched.name);
    if (nameScore < 40) {
      return {
        status: "not_found",
        matched,
        rows: [],
        summaries: [],
        events: [],
        confidence: nameScore,
      };
    }
    const html = await fetchPdgaHtml(matched.url);
    const hits = extractEventsFromCoursePage(html).slice(0, 6);
    const rows: PdgaLookupRow[] = [];
    const summaries: PdgaRoundSummary[] = [];
    const events: string[] = [];
    for (const hit of hits) {
      try {
        const evHtml = await fetchPdgaHtml(`https://www.pdga.com/tour/event/${hit.event_ref}`);
        const parsed = parseEvent(evHtml, hit.event_ref);
        if (parsed.rows.length) {
          rows.push(...parsed.rows);
          summaries.push(...parsed.summaries);
          events.push(hit.event_ref);
        }
      } catch {
        // ignore individual event failures
      }
    }
    const confidence = Math.min(
      100,
      nameScore + (state && matched.name.length ? 10 : 0) + Math.min(30, events.length * 6),
    );
    return {
      status: rows.length ? "ok" : "not_found",
      matched,
      rows,
      summaries,
      events,
      confidence,
    };
  } catch (e) {
    return {
      status: "error",
      rows: [],
      summaries: [],
      events: [],
      confidence: 0,
      error: e instanceof Error ? e.message : "PDGA lookup failed",
    };
  }
}

/**
 * Resolve a course on UDisc. Candidate slugs come from UDisc's public sitemap
 * (their search page is client-rendered, so scraping it never worked); we fetch
 * the top matches and keep the page whose parsed name/state scores best, then
 * pull the reviews tab for the full community review list.
 */
export async function resolveUdiscForCourse(
  courseName: string,
  state: string | null,
  city?: string | null,
): Promise<{
  status: SourceStatus;
  course?: (UdiscCourseParsed & { reviews_all?: UdiscReview[] }) | null;
  confidence: number;
  error?: string;
}> {
  try {
    const { findUdiscCourseUrls } = await import("@/lib/udisc-sitemap.server");
    let candidates = (await findUdiscCourseUrls(courseName, city ?? state, 3)).map((c) => c.url);
    if (!candidates.length) {
      const hit = await searchUdiscCourse(courseName, state);
      candidates = hit ? [hit.url] : [];
    }
    if (!candidates.length) return { status: "not_found", confidence: 0 };

    let best: { parsed: UdiscCourseParsed; confidence: number } | null = null;
    for (const [index, url] of candidates.entries()) {
      let parsed: UdiscCourseParsed | null = null;
      try {
        parsed = parseUdiscCoursePage(await fetchUdiscHtml(url), url);
      } catch {
        continue;
      }
      if (!parsed) continue;
      const score = nameSimilarity(courseName, parsed.name);
      const stateMatch =
        state && parsed.state
          ? parsed.state.toLowerCase().includes(state.toLowerCase()) ||
            state.toLowerCase().includes(parsed.state.toLowerCase())
          : false;
      const cityMatch =
        city && parsed.city
          ? parsed.city.toLowerCase().includes(city.toLowerCase()) ||
            city.toLowerCase().includes(parsed.city.toLowerCase())
          : false;
      const confidence = Math.min(
        100,
        score +
          (stateMatch ? 15 : 0) +
          (cityMatch ? 10 : 0) +
          (parsed.layouts.length ? 10 : 0) +
          // Break ties toward the better sitemap token match.
          Math.max(0, 6 - index * 3),
      );
      if (!best || confidence > best.confidence) best = { parsed, confidence };
      if (confidence >= 90) break;
    }
    if (!best || best.confidence < 40) {
      return {
        status: "not_found",
        course: best?.parsed ?? null,
        confidence: best?.confidence ?? 0,
      };
    }

    // Reviews live on a sub-page; failures here must not lose the course data.
    let reviewsAll: UdiscReview[] = best.parsed.reviews;
    try {
      const reviewsHtml = await fetchUdiscHtml(`${best.parsed.url.replace(/\/$/, "")}/reviews`);
      const parsedReviews = parseUdiscReviews(reviewsHtml, 40);
      if (parsedReviews.length > reviewsAll.length) reviewsAll = parsedReviews;
    } catch {
      /* keep the reviews visible on the course page */
    }

    return {
      status: "ok",
      course: { ...best.parsed, reviews_all: reviewsAll },
      confidence: best.confidence,
    };
  } catch (e) {
    return {
      status: "error",
      confidence: 0,
      error: e instanceof Error ? e.message : "UDisc lookup failed",
    };
  }
}

/**
 * Fill gaps on the canonical `courses` row from UDisc data. Only writes fields
 * that are currently empty so curated/verified values are never overwritten.
 */

export async function backfillCourseFromUdisc(
  admin: any,
  courseId: string,
  udisc: UdiscCourseParsed,
): Promise<string[]> {
  const { data: row } = await admin
    .from("courses")
    .select(
      "latitude, longitude, description, city, state, country, hole_count, year_established, designer",
    )
    .eq("id", courseId)
    .maybeSingle();
  if (!row) return [];

  const patch: Record<string, unknown> = {};
  const validCoord =
    udisc.latitude != null &&
    udisc.longitude != null &&
    Math.abs(udisc.latitude) <= 90 &&
    Math.abs(udisc.longitude) <= 180 &&
    !(udisc.latitude === 0 && udisc.longitude === 0);
  if (row.latitude == null && row.longitude == null && validCoord) {
    patch.latitude = udisc.latitude;
    patch.longitude = udisc.longitude;
  }
  if (!row.description && udisc.description) patch.description = udisc.description.slice(0, 1000);
  if (!row.city && udisc.city) patch.city = udisc.city;
  if (!row.state && udisc.state) patch.state = udisc.state;
  if (!row.country && udisc.country) patch.country = udisc.country;
  if (!row.hole_count && udisc.holes) patch.hole_count = udisc.holes;
  if (!row.year_established && udisc.established_year)
    patch.year_established = udisc.established_year;
  if (!row.designer && udisc.designer) patch.designer = udisc.designer;

  const fields = Object.keys(patch);
  if (!fields.length) return [];
  await admin.from("courses").update(patch).eq("id", courseId);
  return fields;
}

export async function resolveDgsFromExistingLinks(courseId: string): Promise<{
  status: SourceStatus;
  url?: string | null;
  data?: Record<string, unknown> | null;
  confidence: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("tournaments")
    .select("dgs_course_url, dgs_course_id")
    .eq("course_id", courseId)
    .not("dgs_course_url", "is", null)
    .limit(1);
  const hit = rows?.[0];
  if (!hit?.dgs_course_url) return { status: "not_found", confidence: 0 };

  try {
    const html = await fetch(hit.dgs_course_url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0)" },
    }).then((r) => (r.ok ? r.text() : ""));
    const { parseSceneCoursePage } = await import("@/lib/scene-parser");
    const parsed = html ? parseSceneCoursePage(html, hit.dgs_course_url) : null;
    return {
      status: "ok",
      url: hit.dgs_course_url,
      data: parsed as unknown as Record<string, unknown>,
      confidence: 80,
    };
  } catch {
    return { status: "ok", url: hit.dgs_course_url, data: null, confidence: 60 };
  }
}

export async function upsertSource(
  admin: any,
  courseId: string,
  source: SourceKey,
  payload: {
    external_id?: string | null;
    canonical_url?: string | null;
    matched_name?: string | null;
    raw: unknown;
    confidence: number;
    last_error?: string | null;
  },
) {
  await admin.from("course_sources").upsert(
    {
      course_id: courseId,
      source,
      external_id: payload.external_id ?? null,
      canonical_url: payload.canonical_url ?? null,
      matched_name: payload.matched_name ?? null,
      raw: payload.raw as never,
      confidence: payload.confidence,
      last_error: payload.last_error ?? null,
      last_fetched_at: new Date().toISOString(),
    },
    { onConflict: "course_id,source" },
  );
  if (payload.external_id && payload.raw != null) {
    const snapshotId = await recordSnapshot({
      source, entityType: "course", externalId: payload.external_id,
      sourceUrl: payload.canonical_url, payload: payload.raw,
    }).catch(() => null);
    await recordObservation({
      entityType: "course", entityId: courseId, field: `${source}_id`, source,
      value: payload.external_id, snapshotId,
    }).catch(() => null);
  }
}

export async function replaceLayouts(
  admin: any,
  courseId: string,
  source: SourceKey,
  layouts: Array<{
    layout_name: string;
    holes: number | null;
    par: number | null;
    length_ft: number | null;
    difficulty: string | null;
    data?: Record<string, unknown>;
  }>,
) {
  await admin
    .from("course_layout_profiles")
    .delete()
    .eq("course_id", courseId)
    .eq("source", source);
  if (!layouts.length) return;
  await admin.from("course_layout_profiles").insert(
    layouts.map((l) => ({
      course_id: courseId,
      source,
      layout_name: l.layout_name,
      holes: l.holes,
      par: l.par,
      length_ft: l.length_ft,
      difficulty: l.difficulty,
      data: (l.data ?? {}) as never,
    })),
  );
}
