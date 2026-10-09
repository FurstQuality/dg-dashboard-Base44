/**
 * Venue resolution for PDGA-sanctioned events.
 * -------------------------------------------
 * Course analytics must never be keyed off an event name. An event name is not
 * a course, and looking one up as if it were produced cards like
 * "NWI Club Challenge 2026 · SSA 45.6".
 *
 * The pipeline is always venue-first:
 *
 *   1. Find the VENUE for the event from published sources, in confidence order
 *      a. PDGA layout details on the event page (authoritative, per round)
 *      b. Disc Golf Scene event page course link (published before PDGA layouts)
 *      c. UDisc course index, matched on the event title / location tokens
 *   2. Use that venue NAME to look up course data
 *      a. the app's own `courses` row (targeted name/city queries)
 *      b. `dgcr_courses` (PDGA course directory mirror) for holes / par
 *      c. the UDisc course page for holes when nothing else has them
 *   3. Attach rating data (SSA, stroke value) from approved
 *      `course_rating_profiles`, matched by course id then by course name.
 *
 * Every step is best-effort: callers get `null` rather than a guess, so the UI
 * can say "Course to be announced" instead of inventing analytics.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractSceneCourseLink,
  extractSceneEventLink,
  parseSceneCoursePage,
  parseUdiscCoursePage,
} from "@/lib/scene-parser";
import { parseEventSchedule } from "@/lib/pdga-lab.functions";
import { findUdiscCourseUrls, tokenizeCourseName } from "@/lib/udisc-sitemap.server";

const UA = "Mozilla/5.0 (compatible; DGDashboard/1.0)";

/** Where the venue name came from — surfaced in the UI as provenance. */
export type VenueSource = "pdga" | "disc_golf_scene" | "udisc";

export type ResolvedEventVenue = {
  /** Venue name exactly as published (e.g. "Countryside Park"). */
  venue_name: string;
  /** App course row when the venue can be tied to one. */
  course_id: string | null;
  /** Canonical course name to display (app course name when linked). */
  course_name: string;
  /** Layout published alongside the venue, when any. */
  layout_name: string | null;
  round_number: number;
  city: string | null;
  state: string | null;
  hole_count: number | null;
  par_total: number | null;
  /** Scratch scoring average for the layout, when a rating profile exists. */
  ssa: number | null;
  stroke_value: number | null;
  dgs_course_url: string | null;
  udisc_url: string | null;
  source: VenueSource;
};

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .replace(/\b(disc golf (course|park)|dgc|course|park)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type CourseRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  hole_count: number | null;
  is_ghost: boolean | null;
};

const COURSE_SELECT = "id, name, city, state, hole_count, is_ghost";

/**
 * Tie a venue to an app course row. Name matches win, but a ghost placeholder
 * never beats a real course in the same town — that is exactly the
 * "Countryside Park" vs "Glenn Christopher Nicholson Disc Golf Course" case.
 */
export function pickCourseForVenue(
  venueName: string,
  city: string | null,
  state: string | null,
  rows: CourseRow[],
): CourseRow | null {
  const target = norm(venueName);
  const inTown = rows.filter(
    (r) =>
      !!city &&
      norm(r.city) === norm(city) &&
      (!state || !r.state || r.state.toLowerCase() === state.toLowerCase()),
  );
  const real = (list: CourseRow[]) => list.filter((r) => !r.is_ghost);

  const nameMatches = rows.filter((r) => {
    const n = norm(r.name);
    return !!n && (n === target || n.includes(target) || target.includes(n));
  });
  const realNameMatch = real(nameMatches)[0];
  if (realNameMatch) return realNameMatch;

  const realInTown = real(inTown);
  if (realInTown.length === 1) return realInTown[0];

  return nameMatches[0] ?? null;
}

/** Escape a value for use inside a PostgREST `or(...)` filter. */
const safeFilterValue = (value: string) => value.replace(/[(),.*%]/g, " ").trim();

/**
 * Look up the app's course row for a venue name. Uses targeted name and city
 * queries — a plain `select()` silently caps at 1000 rows, so a large course
 * table would hide the correct venue.
 */
async function lookupAppCourse(
  supabase: SupabaseClient,
  venueName: string,
  city: string | null,
  state: string | null,
): Promise<CourseRow | null> {
  const byId = new Map<string, CourseRow>();
  const collect = (rows: CourseRow[] | null) => {
    for (const r of rows ?? []) byId.set(r.id, r);
  };

  const tokens = tokenizeCourseName(venueName)
    .filter((t) => t.length >= 4)
    .slice(0, 4)
    .map(safeFilterValue)
    .filter(Boolean);
  if (tokens.length) {
    const { data } = await supabase
      .from("courses")
      .select(COURSE_SELECT)
      .eq("moderation_status", "approved")
      .or(tokens.map((t) => `name.ilike.%${t}%`).join(","))
      .limit(100);
    collect(data as CourseRow[] | null);
  }
  if (city) {
    const { data } = await supabase
      .from("courses")
      .select(COURSE_SELECT)
      .eq("moderation_status", "approved")
      .ilike("city", city)
      .limit(100);
    collect(data as CourseRow[] | null);
  }
  if (byId.size === 0) return null;
  return pickCourseForVenue(venueName, city, state, Array.from(byId.values()));
}

/** PDGA course-directory mirror — used for holes / par when we have no row. */
async function lookupDirectoryCourse(
  supabase: SupabaseClient,
  venueName: string,
  city: string | null,
): Promise<{ hole_count: number | null; par_total: number | null } | null> {
  const tokens = tokenizeCourseName(venueName)
    .filter((t) => t.length >= 4)
    .slice(0, 3)
    .map(safeFilterValue)
    .filter(Boolean);
  if (!tokens.length) return null;
  let query = supabase
    .from("dgcr_courses")
    .select("name, park_name, city, state, hole_count, pars")
    .or(tokens.map((t) => `name.ilike.%${t}%,park_name.ilike.%${t}%`).join(","))
    .limit(50);
  if (city) query = query.ilike("city", city);
  const { data } = await query;
  const rows = (data ?? []) as Array<{
    name: string | null;
    park_name: string | null;
    hole_count: number | null;
    pars: number[] | null;
  }>;
  const target = norm(venueName);
  const hit =
    rows.find((r) => norm(r.name) === target || norm(r.park_name) === target) ??
    rows.find((r) => norm(r.name).includes(target) || target.includes(norm(r.name))) ??
    rows[0];
  if (!hit) return null;
  const par = Array.isArray(hit.pars) && hit.pars.length ? hit.pars.reduce((a, b) => a + b, 0) : null;
  return { hole_count: hit.hole_count ?? null, par_total: par };
}

/** Approved rating profile for a resolved course, by id then by name. */
async function lookupRatingProfile(
  supabase: SupabaseClient,
  courseId: string | null,
  courseName: string,
): Promise<{ ssa: number | null; stroke_value: number | null; par_total: number | null } | null> {
  const select = "course_id, course_name, ssa, stroke_value, par_total";
  if (courseId) {
    const { data } = await supabase
      .from("course_rating_profiles")
      .select(select)
      .eq("status", "approved")
      .eq("course_id", courseId)
      .limit(1);
    const hit = (data ?? [])[0] as { ssa: number | null; stroke_value: number | null; par_total: number | null } | undefined;
    if (hit) return { ssa: hit.ssa, stroke_value: hit.stroke_value, par_total: hit.par_total };
  }
  const safe = safeFilterValue(courseName);
  if (!safe) return null;
  const { data } = await supabase
    .from("course_rating_profiles")
    .select(select)
    .eq("status", "approved")
    .ilike("course_name", `%${safe}%`)
    .limit(5);
  const rows = (data ?? []) as Array<{
    course_name: string | null;
    ssa: number | null;
    stroke_value: number | null;
    par_total: number | null;
  }>;
  const target = norm(courseName);
  const hit = rows.find((r) => norm(r.course_name) === target) ?? rows[0];
  return hit ? { ssa: hit.ssa, stroke_value: hit.stroke_value, par_total: hit.par_total } : null;
}

type VenueCandidate = {
  venue_name: string;
  layout_name: string | null;
  round_number: number;
  city: string | null;
  state: string | null;
  hole_count: number | null;
  par_total: number | null;
  dgs_course_url: string | null;
  udisc_url: string | null;
  source: VenueSource;
};

/** Step 1a — PDGA layout details, the authoritative per-round venue list. */
async function venuesFromPdga(eventRef: string): Promise<VenueCandidate[]> {
  const html = await fetchHtml(`https://www.pdga.com/tour/event/${eventRef}`);
  if (!html) return [];
  const rows = parseEventSchedule(html, eventRef);
  const byRound = new Map<number, VenueCandidate>();
  for (const r of rows) {
    if (!r.course_name || byRound.has(r.round_number)) continue;
    byRound.set(r.round_number, {
      venue_name: r.course_name,
      layout_name: r.course_layout,
      round_number: r.round_number,
      city: null,
      state: null,
      hole_count: null,
      par_total: null,
      dgs_course_url: null,
      udisc_url: null,
      source: "pdga",
    });
  }
  return Array.from(byRound.values()).sort((a, b) => a.round_number - b.round_number);
}

/** Step 1b — Disc Golf Scene publishes the venue as soon as the event is up. */
async function venueFromScene(
  supabase: SupabaseClient,
  eventRef: string,
): Promise<VenueCandidate | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cached } = await supabaseAdmin
    .from("pdga_dgs_links")
    .select("dgs_event_url, dgs_event_slug, dgs_course_url, dgs_course_name")
    .eq("event_ref", eventRef)
    .maybeSingle();

  let dgsEventUrl = (cached?.dgs_event_url as string | null) ?? null;
  let dgsEventSlug = (cached?.dgs_event_slug as string | null) ?? null;
  let courseUrl = (cached?.dgs_course_url as string | null) ?? null;
  let venueName = (cached?.dgs_course_name as string | null) ?? null;

  if (!dgsEventUrl) {
    const pdgaHtml = await fetchHtml(`https://www.pdga.com/tour/event/${eventRef}`);
    const link = pdgaHtml ? extractSceneEventLink(pdgaHtml) : null;
    if (link) {
      dgsEventUrl = link.url;
      dgsEventSlug = link.slug;
    }
  }
  if (!dgsEventUrl) return null;

  if (!courseUrl) {
    const sceneHtml = await fetchHtml(dgsEventUrl);
    const link = sceneHtml ? extractSceneCourseLink(sceneHtml, dgsEventUrl) : null;
    if (link) {
      courseUrl = link.url;
      venueName = link.name ?? venueName;
      await supabaseAdmin.from("pdga_dgs_links").upsert(
        {
          event_ref: eventRef,
          dgs_event_url: dgsEventUrl,
          dgs_event_slug: dgsEventSlug,
          dgs_course_url: link.url,
          dgs_course_id: link.id,
          dgs_course_slug: link.slug,
          dgs_course_name: link.name,
          resolved_at: new Date().toISOString(),
        } as never,
        { onConflict: "event_ref" },
      );
    }
  }
  if (!courseUrl) return null;

  const courseHtml = await fetchHtml(courseUrl);
  const parsed = courseHtml ? parseSceneCoursePage(courseHtml, courseUrl) : null;
  const name = parsed?.name ?? venueName;
  if (!name) return null;
  void supabase; // reads for Scene go through the cached link table only.
  return {
    venue_name: name,
    layout_name: null,
    round_number: 1,
    city: parsed?.city ?? null,
    state: parsed?.state ?? null,
    hole_count: parsed?.holes ?? null,
    par_total: parsed?.par ?? null,
    dgs_course_url: courseUrl,
    udisc_url: null,
    source: "disc_golf_scene",
  };
}

/**
 * Step 1c — UDisc. Last resort when neither PDGA nor Scene names the venue:
 * match the event title against the UDisc course index and verify the page.
 */
async function venueFromUdisc(
  eventTitle: string | null,
  location: string | null,
): Promise<VenueCandidate | null> {
  if (!eventTitle) return null;
  // Event titles are often "<Event> at <Venue>" — the venue half is the signal.
  const atSplit = eventTitle.split(/\s+at\s+/i);
  const hint = atSplit.length > 1 ? atSplit[atSplit.length - 1] : eventTitle;
  const city = location ? location.split(",")[0]?.trim() || null : null;
  const matches = await findUdiscCourseUrls(hint, city, 2).catch(() => []);
  const best = matches[0];
  if (!best || best.score < 20) return null;
  const html = await fetchHtml(best.url);
  const parsed = html ? parseUdiscCoursePage(html, best.url) : null;
  if (!parsed?.name) return null;
  return {
    venue_name: parsed.name,
    layout_name: null,
    round_number: 1,
    city: parsed.city,
    state: parsed.state,
    hole_count: parsed.holes,
    par_total: null,
    dgs_course_url: null,
    udisc_url: best.url,
    source: "udisc",
  };
}

/** Enrich a discovered venue with app course data, holes/par and rating data. */
async function enrichVenue(
  supabase: SupabaseClient,
  candidate: VenueCandidate,
): Promise<ResolvedEventVenue> {
  const match = await lookupAppCourse(
    supabase,
    candidate.venue_name,
    candidate.city,
    candidate.state,
  );
  const courseName = match?.name ?? candidate.venue_name;
  let holeCount = match?.hole_count ?? candidate.hole_count ?? null;
  let parTotal = candidate.par_total;

  if (holeCount == null || parTotal == null) {
    const dir = await lookupDirectoryCourse(supabase, courseName, candidate.city).catch(() => null);
    holeCount = holeCount ?? dir?.hole_count ?? null;
    parTotal = parTotal ?? dir?.par_total ?? null;
  }

  const profile = await lookupRatingProfile(supabase, match?.id ?? null, courseName).catch(
    () => null,
  );

  return {
    venue_name: candidate.venue_name,
    course_id: match?.id ?? null,
    course_name: courseName,
    layout_name: candidate.layout_name,
    round_number: candidate.round_number,
    city: candidate.city ?? match?.city ?? null,
    state: candidate.state ?? match?.state ?? null,
    hole_count: holeCount,
    par_total: parTotal ?? profile?.par_total ?? null,
    ssa: profile?.ssa ?? null,
    stroke_value: profile?.stroke_value ?? null,
    dgs_course_url: candidate.dgs_course_url,
    udisc_url: candidate.udisc_url,
    source: candidate.source,
  };
}

/**
 * Resolve every venue an event plays, newest-confidence-first, then look up
 * course data by venue name. Returns an empty array when no source names a
 * venue — callers must not substitute the event name.
 */
export async function resolveEventVenues(
  supabase: SupabaseClient,
  eventRef: string,
  opts: { eventTitle?: string | null; location?: string | null } = {},
): Promise<ResolvedEventVenue[]> {
  const ref = eventRef.replace(/^pdga:/i, "").trim();
  if (!/^\d{1,9}$/.test(ref)) return [];

  let candidates = await venuesFromPdga(ref).catch(() => []);
  if (candidates.length === 0) {
    const scene = await venueFromScene(supabase, ref).catch(() => null);
    if (scene) candidates = [scene];
  }
  if (candidates.length === 0) {
    const udisc = await venueFromUdisc(opts.eventTitle ?? null, opts.location ?? null).catch(
      () => null,
    );
    if (udisc) candidates = [udisc];
  }
  if (candidates.length === 0) return [];

  const resolved: ResolvedEventVenue[] = [];
  for (const c of candidates) resolved.push(await enrichVenue(supabase, c));
  return resolved;
}

/** Single-venue convenience wrapper (round 1 / primary venue). */
export async function resolveEventVenue(
  supabase: SupabaseClient,
  eventRef: string,
  opts: { eventTitle?: string | null; location?: string | null } = {},
): Promise<ResolvedEventVenue | null> {
  const all = await resolveEventVenues(supabase, eventRef, opts);
  return all[0] ?? null;
}
