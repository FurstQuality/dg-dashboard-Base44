/**
 * Workers for the background crawler.
 *
 * Each worker handles one queue item, writes what it learned into the shared
 * tables, and reports back how long to wait before looking at that thing again
 * (plus any follow-up work it discovered). Workers never loop — the run loop
 * owns batching, budget, and pacing.
 */
import { enqueue, type EnqueueItem, type QueueItem } from "./queue.server";
import { fetchHtml, scrapePage } from "./scrape.server";
import {
  parseCoursePage,
  parseEventPage,
  parsePlayerPage,
  type ParsedCourse,
  type ParsedEvent,
  type ParsedPlayer,
} from "@/lib/pdga-kb-parsers";

export type WorkerOutcome = {
  /** Firecrawl pages spent (used against the daily budget). */
  pages: number;
  /** Minutes until this item should be refreshed, or null for one-and-done. */
  refreshInMinutes: number | null;
  /** Follow-up work discovered while running. */
  follow: EnqueueItem[];
  note?: string;
};

const DAY = 1440;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/* ------------------------------ PDGA courses ------------------------------ */

async function runPdgaCourse(item: QueueItem): Promise<WorkerOutcome> {
  const id = item.target;
  const url = `https://www.pdga.com/course-directory/course/${id}`;
  const scrape = await scrapePage(url);
  if (scrape.status !== 200 || (!scrape.html && !scrape.markdown)) {
    throw new Error(`Course page fetch failed (${scrape.status})`);
  }
  const parsed: ParsedCourse | null = parseCoursePage({
    url,
    html: scrape.html,
    markdown: scrape.markdown,
  });
  if (!parsed) throw new Error("Could not read that course page");

  const db = await admin();
  await db.from("pdga_kb_courses").upsert(
    {
      pdga_course_id: parsed.pdga_course_id ?? id,
      name: parsed.name,
      city: parsed.city,
      state: parsed.state,
      country: parsed.country,
      postal_code: parsed.postal_code,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      hole_count: parsed.hole_count,
      designer: parsed.designer,
      year_established: parsed.year_established,
      pdga_url: url,
      raw: { markdown: scrape.markdown?.slice(0, 20_000) ?? null } as never,
      fetched_at: new Date().toISOString(),
    } as never,
    { onConflict: "pdga_course_id" },
  );

  // Fill gaps on the app's own course record.
  const patch = {
    pdga_course_id: parsed.pdga_course_id ?? id,
    pdga_url: url,
    country: parsed.country,
    postal_code: parsed.postal_code,
    hole_count_verified: parsed.hole_count != null,
    enriched_at: new Date().toISOString(),
    enrichment_source: "ingest_pdga",
  };
  const { data: byId } = await db
    .from("courses")
    .select("id")
    .eq("pdga_course_id", parsed.pdga_course_id ?? id)
    .maybeSingle();
  if (byId) {
    await db
      .from("courses")
      .update(patch as never)
      .eq("id", byId.id);
  } else if (parsed.name) {
    await db
      .from("courses")
      .update(patch as never)
      .ilike("name", parsed.name)
      .is("pdga_course_id", null);
  }

  return { pages: 1, refreshInMinutes: 90 * DAY, follow: [], note: parsed.name ?? id };
}

/* ------------------------------ UDisc courses ----------------------------- */

async function runUdiscCourse(item: QueueItem): Promise<WorkerOutcome> {
  const db = await admin();
  const { data: course } = await db
    .from("courses")
    .select("id, name, city, state")
    .eq("id", item.target)
    .maybeSingle();
  if (!course) return { pages: 0, refreshInMinutes: null, follow: [], note: "course gone" };

  const { resolveUdiscForCourse, backfillCourseFromUdisc, upsertSource, replaceLayouts } =
    await import("@/lib/course-auto-populate.server");

  const result = await resolveUdiscForCourse(
    course.name,
    course.state ?? null,
    course.city ?? null,
  );
  if (result.status !== "ok" || !result.course) {
    await upsertSource(db, course.id, "udisc", {
      raw: {},
      confidence: result.confidence,
      last_error: result.error ?? "No UDisc match",
    });
    // Try again much later — the listing may appear.
    return { pages: 0, refreshInMinutes: 60 * DAY, follow: [], note: "no UDisc match" };
  }

  const udisc = result.course;
  await backfillCourseFromUdisc(db, course.id, udisc);
  await upsertSource(db, course.id, "udisc", {
    canonical_url: udisc.url,
    matched_name: udisc.name,
    raw: udisc as unknown as Record<string, unknown>,
    confidence: result.confidence,
  });
  await replaceLayouts(
    db,
    course.id,
    "udisc",
    (udisc.layouts ?? []).map((l) => ({
      layout_name: l.name,
      holes: l.holes ?? null,
      par: l.par ?? null,
      length_ft: l.length_ft ?? null,
      difficulty: l.difficulty ?? null,
      data: l as unknown as Record<string, unknown>,
    })),
  );

  return { pages: 0, refreshInMinutes: 30 * DAY, follow: [], note: udisc.name };
}

/**
 * One listing from UDisc's national course list: read the page, enrich the
 * course we already have, or add it when the country genuinely lacks it.
 */
async function runUdiscCatalogEntry(item: QueueItem): Promise<WorkerOutcome> {
  const { importUdiscListing } = await import("./udisc-catalog.server");
  const result = await importUdiscListing(item.target);
  return {
    pages: 0,
    // Listings are read once; the course itself stays current through the
    // regular three-source refresh.
    refreshInMinutes: null,
    follow: [],
    note: result.note,
  };
}

/* --------------------- Full course source refresh (all 3) ----------------- */

/**
 * The same work the "Refresh sources" button does on a course page: search
 * PDGA, Disc Golf Scene and UDisc, store matches, layouts and hole detail.
 * Re-queued on a cycle so course pages stay current without anyone clicking.
 */
async function runCourseSources(item: QueueItem): Promise<WorkerOutcome> {
  const { refreshCourseSourcesForCourse } = await import("@/lib/course-sources-refresh.server");
  const result = await refreshCourseSourcesForCourse(item.target);
  const hits = (["pdga", "dgs", "udisc"] as const).filter((k) => result.sources[k].status === "ok");
  return {
    // Searching all three sources costs roughly two fetched pages.
    pages: 2,
    // Courses change slowly; check back in three weeks when we matched
    // something, sooner-ish when nothing matched in case a listing appears.
    refreshInMinutes: hits.length ? 21 * DAY : 45 * DAY,
    follow: [],
    note: `${result.course_name}: ${hits.length ? hits.join(" · ") : "no matches"}`,
  };
}

/* ------------------------------- PDGA events ------------------------------ */

function playerNumbersFrom(html: string | undefined): string[] {
  if (!html) return [];
  const found = new Set<string>();
  for (const m of html.matchAll(/\/player\/(\d{3,7})/g)) found.add(m[1]!);
  return Array.from(found).slice(0, 120);
}

async function runPdgaEvent(item: QueueItem): Promise<WorkerOutcome> {
  const id = item.target;
  const url = `https://www.pdga.com/tour/event/${id}`;
  const scrape = await scrapePage(url);
  if (scrape.status !== 200) throw new Error(`Event page fetch failed (${scrape.status})`);

  const parsed: ParsedEvent | null = parseEventPage({
    url,
    html: scrape.html,
    markdown: scrape.markdown,
  });
  if (!parsed) throw new Error("Could not read that event page");

  const db = await admin();
  await db.from("pdga_kb_events").upsert(
    {
      pdga_event_id: parsed.pdga_event_id,
      name: parsed.name,
      tier: parsed.tier,
      start_date: parsed.start_date,
      end_date: parsed.end_date,
      host_club: parsed.host_club,
      city: parsed.city,
      state: parsed.state,
      country: parsed.country,
      postal_code: parsed.postal_code,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      course_refs: parsed.course_refs as never,
      pdga_url: url,
      raw: { markdown: scrape.markdown?.slice(0, 20_000) ?? null } as never,
      fetched_at: new Date().toISOString(),
    } as never,
    { onConflict: "pdga_event_id" },
  );

  // Keep the browsable directory row in step with the detail page.
  const directoryPatch: Record<string, unknown> = { refreshed_at: new Date().toISOString() };
  if (parsed.city) directoryPatch.city = parsed.city;
  if (parsed.state) directoryPatch.state = parsed.state;
  if (parsed.country) directoryPatch.country = parsed.country;
  if (parsed.latitude != null) directoryPatch.latitude = parsed.latitude;
  if (parsed.longitude != null) directoryPatch.longitude = parsed.longitude;
  if (parsed.start_date) directoryPatch.start_date = parsed.start_date;
  if (parsed.end_date) directoryPatch.end_date = parsed.end_date;
  if (parsed.tier) directoryPatch.tier = parsed.tier;
  await db
    .from("event_directory")
    .update(directoryPatch as never)
    .eq("source", "pdga")
    .eq("source_event_id", parsed.pdga_event_id);

  const enrich = {
    postal_code: parsed.postal_code,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    enriched_at: new Date().toISOString(),
  };
  await db
    .from("pdga_events")
    .update(enrich as never)
    .eq("event_ref", parsed.pdga_event_id);
  await db
    .from("pdga_tour_events")
    .update(enrich as never)
    .eq("pdga_event_id", parsed.pdga_event_id);

  const follow: EnqueueItem[] = [
    ...parsed.course_refs.map((ref) => ({
      source: "pdga" as const,
      kind: "course" as const,
      target: ref,
      region: item.region,
      priority: (item.priority ?? 100) + 5,
    })),
    ...playerNumbersFrom(scrape.html).map((num) => ({
      source: "pdga" as const,
      kind: "player" as const,
      target: num,
      region: item.region,
      priority: (item.priority ?? 100) + 20,
    })),
  ];

  // Events in the past never change; upcoming ones are re-read as they approach.
  const start = parsed.start_date ? Date.parse(`${parsed.start_date}T12:00:00Z`) : NaN;
  const daysOut = Number.isFinite(start) ? (start - Date.now()) / 86_400_000 : null;
  const refresh = daysOut == null ? 14 * DAY : daysOut < -3 ? null : daysOut < 7 ? DAY : 7 * DAY;

  return { pages: 1, refreshInMinutes: refresh, follow, note: parsed.name ?? id };
}

/* ------------------------------ PDGA players ------------------------------ */

async function runPdgaPlayer(item: QueueItem): Promise<WorkerOutcome> {
  const url = `https://www.pdga.com/player/${item.target}`;
  const scrape = await scrapePage(url);
  if (scrape.status !== 200) throw new Error(`Player page fetch failed (${scrape.status})`);
  const parsed: ParsedPlayer | null = parsePlayerPage({
    url,
    html: scrape.html,
    markdown: scrape.markdown,
  });
  if (!parsed) throw new Error("Could not read that player page");

  const db = await admin();
  await db.from("pdga_kb_players").upsert(
    {
      pdga_number: parsed.pdga_number,
      name: parsed.name,
      rating: parsed.rating,
      class: parsed.class,
      city: parsed.city,
      state: parsed.state,
      country: parsed.country,
      member_since: parsed.member_since,
      official_status: parsed.official_status,
      career_wins: parsed.career_wins,
      pdga_url: url,
      raw: { markdown: scrape.markdown?.slice(0, 20_000) ?? null } as never,
      fetched_at: new Date().toISOString(),
    } as never,
    { onConflict: "pdga_number" },
  );

  await db.from("pdga_players").upsert(
    {
      pdga_number: String(parsed.pdga_number),
      name: parsed.name,
      current_rating: parsed.rating,
      city: parsed.city,
      state: parsed.state,
      country: parsed.country,
      member_since: parsed.member_since,
      class: parsed.class,
      official_status: parsed.official_status,
      career_wins: parsed.career_wins,
      enriched_at: new Date().toISOString(),
    } as never,
    { onConflict: "pdga_number" },
  );

  return { pages: 1, refreshInMinutes: 21 * DAY, follow: [], note: parsed.name ?? item.target };
}

/* --------------------------- Listing sweeps by state ---------------------- */

async function runSceneDirectory(item: QueueItem): Promise<WorkerOutcome> {
  const state = item.target;
  const { sweepSceneEvents, dedupeDirectoryRows, persistDirectoryRows } =
    await import("@/lib/event-directory.server");
  const startedAt = new Date().toISOString();
  const rows = dedupeDirectoryRows(await sweepSceneEvents({ states: [state.toLowerCase()] }));
  const result = await persistDirectoryRows({
    source: "disc_golf_scene",
    scope: `state:${state}`,
    rows,
    startedAt,
  });
  await markRegionSwept(state, { events: result.upserted });
  return {
    pages: 0,
    refreshInMinutes: 2 * DAY,
    follow: [],
    note: `${state}: ${result.upserted} listings`,
  };
}

async function runPdgaDirectory(item: QueueItem): Promise<WorkerOutcome> {
  const state = item.target;
  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const to = `${today.getUTCFullYear() + 1}-12-31`;
  const url =
    `https://www.pdga.com/tour/search?year=${today.getUTCFullYear()}` +
    `&date_filter%5Bmin%5D%5Bdate%5D=${encodeURIComponent(from)}` +
    `&date_filter%5Bmax%5D%5Bdate%5D=${encodeURIComponent(to)}` +
    `&State%5B%5D=US-${state}&order=StartDate&sort=asc`;

  const html = await fetchHtml(url);
  if (!html) throw new Error(`PDGA listing fetch failed for ${state}`);
  const { parsePdgaSearchPage } = await import("@/lib/pdga-tour-scrape.server");
  const events = parsePdgaSearchPage(html);

  const { persistDirectoryRows } = await import("@/lib/event-directory.server");
  const startedAt = new Date().toISOString();
  const rows = events.map((e) => ({
    source: "pdga" as const,
    source_event_id: e.pdga_event_id,
    url: e.url,
    name: e.name,
    kind: (e.tier === "L" ? "league" : "tournament") as "tournament" | "league",
    tier: e.tier,
    sanctioning: e.sanctioning,
    start_date: e.start_date,
    end_date: e.end_date,
    venue_name: null,
    city: e.city,
    state: e.state,
    country: e.country,
    latitude: null,
    longitude: null,
    registration_status: null,
    field_size: null,
    field_capacity: null,
    cover_url: null,
    pdga_event_ref: e.pdga_event_id,
    discovered_via: `ingest_state:${state}`,
  }));
  const result = await persistDirectoryRows({
    source: "pdga",
    scope: `state:${state}`,
    rows,
    startedAt,
  });
  await markRegionSwept(state, { events: result.upserted });

  // Queue the detail page for each event so locations and courses fill in.
  const follow: EnqueueItem[] = events.slice(0, 60).map((e) => ({
    source: "pdga" as const,
    kind: "event" as const,
    target: e.pdga_event_id,
    region: state,
    priority: (item.priority ?? 100) + 10,
  }));

  return {
    pages: 0,
    refreshInMinutes: 2 * DAY,
    follow,
    note: `${state}: ${result.upserted} PDGA events`,
  };
}

async function markRegionSwept(
  code: string,
  counts: { events?: number; courses?: number },
): Promise<void> {
  const db = await admin();
  const { data } = await db
    .from("ingest_regions")
    .select("events_seen, courses_seen")
    .eq("state_code", code)
    .maybeSingle();
  await db
    .from("ingest_regions")
    .update({
      last_directory_at: new Date().toISOString(),
      events_seen: (data?.events_seen ?? 0) + (counts.events ?? 0),
      courses_seen: (data?.courses_seen ?? 0) + (counts.courses ?? 0),
    } as never)
    .eq("state_code", code);
}

/* -------------------------------- dispatch -------------------------------- */

export async function runQueueItem(item: QueueItem): Promise<WorkerOutcome> {
  const outcome = await dispatch(item);
  if (outcome.follow.length) {
    const added = await enqueue(outcome.follow);
    return { ...outcome, note: outcome.note ? `${outcome.note} (+${added} queued)` : undefined };
  }
  return outcome;
}

async function dispatch(item: QueueItem): Promise<WorkerOutcome> {
  if (item.kind === "course" && item.source === "pdga") return runPdgaCourse(item);
  if (item.kind === "course" && item.source === "udisc") return runUdiscCourse(item);
  if (item.kind === "course" && item.source === "internal") return runCourseSources(item);
  if (item.kind === "event" && item.source === "pdga") return runPdgaEvent(item);
  if (item.kind === "player" && item.source === "pdga") return runPdgaPlayer(item);
  if (item.kind === "directory" && item.source === "disc_golf_scene") {
    return runSceneDirectory(item);
  }
  if (item.kind === "directory" && item.source === "pdga") return runPdgaDirectory(item);
  if (item.kind === "directory" && item.source === "udisc") return runUdiscCatalogEntry(item);
  throw new Error(`No worker for ${item.source}/${item.kind}`);
}

/** How many Firecrawl pages a kind of work costs, used for budget planning. */
export function estimatedPages(item: QueueItem): number {
  if (item.source === "pdga" && item.kind !== "directory") return 1;
  return 0;
}
