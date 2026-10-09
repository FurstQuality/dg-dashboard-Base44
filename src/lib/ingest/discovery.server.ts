/**
 * Discovery for the background crawler.
 *
 * Turns "what we don't know yet" into queue rows, wave by wave: the home state
 * first, neighbouring states next, then the rest of the country. Bounded on
 * every pass so a tick can never enqueue an unbounded pile of work.
 */
import { enqueue, type EnqueueItem } from "./queue.server";

/** Never add more than this many rows in one tick. */
const MAX_NEW_PER_TICK = 400;
/** Skip discovery entirely while this much work is already waiting. */
const BACKLOG_CEILING = 1200;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Region = { state_code: string; ring: number; priority: number };

async function activeRegions(): Promise<Region[]> {
  const db = await admin();
  const { data } = await db
    .from("ingest_regions")
    .select("state_code, ring, priority")
    .eq("active", true)
    .eq("paused", false)
    .order("priority", { ascending: true });
  return (data ?? []) as Region[];
}

/** Queue the state listing sweeps (Disc Golf Scene + PDGA) for each wave. */
async function discoverDirectories(regions: Region[]): Promise<EnqueueItem[]> {
  const items: EnqueueItem[] = [];
  for (const region of regions) {
    for (const source of ["pdga", "disc_golf_scene"] as const) {
      items.push({
        source,
        kind: "directory",
        target: region.state_code,
        region: region.state_code,
        priority: region.priority,
      });
    }
  }
  return items;
}

/** Queue UDisc enrichment for courses that have never been matched. */
async function discoverCourses(regions: Region[], limit: number): Promise<EnqueueItem[]> {
  if (limit <= 0) return [];
  const db = await admin();
  // Nationwide: every active state, ordered by the wave priority below.
  const nearby = regions.map((r) => r.state_code);
  if (!nearby.length) return [];

  const { data: matched } = await db
    .from("course_sources")
    .select("course_id")
    .eq("source", "udisc")
    .limit(5000);
  const done = new Set((matched ?? []).map((r) => String(r.course_id)));

  const { data: courses } = await db
    .from("courses")
    .select("id, state")
    .in("state", nearby)
    .limit(6000);

  const priorityByState = new Map(regions.map((r) => [r.state_code, r.priority]));
  return (courses ?? [])
    .filter((c) => !done.has(String(c.id)))
    .slice(0, limit)
    .map((c) => ({
      source: "udisc" as const,
      kind: "course" as const,
      target: String(c.id),
      region: c.state ?? null,
      // Behind the full course refresh: UDisc matching is a bonus, keeping the
      // core course record current is not.
      priority: (priorityByState.get(String(c.state)) ?? 60) + 45,
    }));
}

/**
 * Queue PDGA profiles for every player number the app knows about: members,
 * tracked players, and everyone showing up in the fields of events we mirror —
 * that last group is how coverage grows beyond the people already here.
 */
async function discoverPlayers(limit: number): Promise<EnqueueItem[]> {
  if (limit <= 0) return [];
  const db = await admin();
  const numbers = new Set<string>();
  const addNumber = (value: unknown) => {
    const n = String(value ?? "").trim();
    if (/^\d{3,7}$/.test(n)) numbers.add(n);
  };

  const { data: profiles } = await db
    .from("profiles")
    .select("pdga_number")
    .not("pdga_number", "is", null)
    .limit(500);
  for (const row of profiles ?? []) addNumber((row as { pdga_number: unknown }).pdga_number);

  const { data: members } = await db
    .from("tracker_group_members")
    .select("pdga_number")
    .not("pdga_number", "is", null)
    .limit(1000);
  for (const row of members ?? []) addNumber((row as { pdga_number: unknown }).pdga_number);

  // Players seen in mirrored event fields, most recently synced first.
  const { data: field } = await db
    .from("pdga_event_field")
    .select("pdga_number, synced_at")
    .not("pdga_number", "is", null)
    .order("synced_at", { ascending: false })
    .limit(3000);
  for (const row of field ?? []) addNumber((row as { pdga_number: unknown }).pdga_number);

  return Array.from(numbers)
    .slice(0, limit)
    .map((n) => ({
      source: "pdga" as const,
      kind: "player" as const,
      target: n,
      priority: 25,
    }));
}

/**
 * Queue the full three-source refresh (PDGA + Disc Golf Scene + UDisc) for
 * courses, so nobody has to open a course page and press refresh. Courses
 * people actually play come first, then nearby courses, then the rest. Once a
 * course is in the queue it re-runs on its own cycle, so this only ever adds
 * courses that have never been picked up.
 */
async function discoverCourseSources(regions: Region[], limit: number): Promise<EnqueueItem[]> {
  if (limit <= 0) return [];
  const db = await admin();

  const { data: queued } = await db
    .from("ingest_queue")
    .select("target")
    .eq("source", "internal")
    .eq("kind", "course")
    .limit(5000);
  const already = new Set((queued ?? []).map((r) => String(r.target)));

  const items: EnqueueItem[] = [];
  const seen = new Set<string>();
  const add = (id: string, region: string | null, priority: number) => {
    if (!id || already.has(id) || seen.has(id) || items.length >= limit) return;
    seen.add(id);
    items.push({ source: "internal", kind: "course", target: id, region, priority });
  };

  // 1. Courses with played rounds in the app.
  const { data: played } = await db
    .from("rounds")
    .select("course_id")
    .not("course_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);
  for (const row of played ?? []) add(String(row.course_id), null, 15);

  // 2. Courses in the home/neighbour waves.
  const nearby = regions.filter((r) => r.ring <= 2);
  const priorityByState = new Map(nearby.map((r) => [r.state_code, r.priority + 25]));
  if (nearby.length) {
    const { data: local } = await db
      .from("courses")
      .select("id, state")
      .in(
        "state",
        nearby.map((r) => r.state_code),
      )
      .limit(2000);
    for (const row of local ?? []) {
      add(String(row.id), row.state ?? null, priorityByState.get(String(row.state)) ?? 70);
    }
  }

  // 3. Everything else, slowly.
  if (items.length < limit) {
    const { data: rest } = await db.from("courses").select("id, state").limit(2000);
    for (const row of rest ?? []) add(String(row.id), row.state ?? null, 120);
  }

  return items;
}

/**
 * Work through UDisc's national course list. The catalogue itself is mirrored
 * on the first pass (and topped up when it runs dry), then read a slice at a
 * time so the whole country lands over weeks without ever flooding a tick.
 */
async function discoverUdiscNational(limit: number): Promise<EnqueueItem[]> {
  if (limit <= 0) return [];
  const { catalogCounts, syncUdiscCatalog, discoverUdiscCatalog } =
    await import("./udisc-catalog.server");
  const counts = await catalogCounts();
  if (!counts.pending) {
    // Empty on the first run; later, a re-sync picks up newly published courses.
    try {
      await syncUdiscCatalog();
    } catch {
      return [];
    }
  }
  return discoverUdiscCatalog(limit);
}

/** One bounded discovery pass. Returns how many new rows were queued. */
export async function runDiscovery(): Promise<{ enqueued: number; skipped: boolean }> {
  const db = await admin();
  const { count } = await db
    .from("ingest_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if ((count ?? 0) > BACKLOG_CEILING) return { enqueued: 0, skipped: true };

  const regions = await activeRegions();
  // Reserved slices so one kind of work can never starve the others: state
  // listings first, then players, then the full course refresh, then the
  // national UDisc catalogue, then UDisc matching with whatever room is left.
  const items: EnqueueItem[] = [];
  items.push(...(await discoverDirectories(regions)));
  items.push(...(await discoverPlayers(80)));
  items.push(...(await discoverCourseSources(regions, 80)));
  items.push(...(await discoverUdiscNational(120)));
  items.push(...(await discoverCourses(regions, Math.max(0, MAX_NEW_PER_TICK - items.length))));

  const enqueued = await enqueue(items.slice(0, MAX_NEW_PER_TICK));

  return { enqueued, skipped: false };
}
