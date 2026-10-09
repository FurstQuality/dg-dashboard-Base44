/**
 * Nationwide UDisc course catalogue.
 *
 * UDisc's public sitemap (`/sitemap/courses.xml`, advertised in their
 * robots.txt) lists every public course page. We mirror that list into
 * `udisc_catalog` once, then work through it a bounded batch at a time on the
 * normal crawler tick: read the course page, match it to a course we already
 * have, and only create a new course row when nothing matches. Non-US listings
 * are marked skipped so the US sweep stays focused.
 *
 * Server-only. Writes use the service-role client because the catalogue is
 * shared app data, not per-user rows.
 */
import { normalizeStateCode, US_STATES } from "@/lib/us-states";
import { slugify } from "@/lib/course-import.server";
import type { EnqueueItem } from "./queue.server";
import { recordSnapshot } from "@/lib/data-intel/snapshots.server";

/** Never write more than this many catalogue rows in a single sync pass. */
const SYNC_CHUNK = 500;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type CatalogCounts = {
  total: number;
  pending: number;
  queued: number;
  imported: number;
  matched: number;
  skipped: number;
  failed: number;
};

export async function catalogCounts(): Promise<CatalogCounts> {
  const db = await admin();
  const count = async (status?: string) => {
    let q = db.from("udisc_catalog").select("slug", { count: "exact", head: true });
    if (status) q = q.eq("status", status);
    const { count: n } = await q;
    return n ?? 0;
  };
  const [total, pending, queued, imported, matched, skipped, failed] = await Promise.all([
    count(),
    count("new"),
    count("queued"),
    count("imported"),
    count("matched"),
    count("skipped"),
    count("failed"),
  ]);
  return { total, pending, queued, imported, matched, skipped, failed };
}

/**
 * How likely a listing is to be a US course, judged from its slug alone: the
 * sitemap carries no location, and the sweep should not work through the world
 * alphabetically before it reaches Indiana. Slugs whose words match a town or
 * state we already have courses in score highest, plain-English slugs next,
 * anything transliterated last.
 */
async function usLikelihoodScorer(): Promise<(tokens: string[]) => number> {
  const db = await admin();
  const known = new Set<string>();
  const { data } = await db
    .from("courses")
    .select("city, state")
    .not("city", "is", null)
    .limit(8000);
  for (const row of data ?? []) {
    for (const word of String((row as { city: unknown }).city ?? "")
      .toLowerCase()
      .split(/[^a-z]+/)) {
      if (word.length > 3) known.add(word);
    }
  }
  for (const s of US_STATES) {
    for (const word of s.name.toLowerCase().split(/[^a-z]+/)) {
      if (word.length > 3) known.add(word);
    }
  }
  return (tokens) => {
    if (!tokens.length) return 0;
    const ascii = tokens.every((t) => /^[a-z0-9]+$/.test(t));
    if (!ascii) return 0;
    if (tokens.some((t) => known.has(t))) return 3;
    return tokens.length > 1 ? 2 : 1;
  };
}

/**
 * Mirror the UDisc sitemap into `udisc_catalog`. Existing rows are left alone,
 * so this is safe to re-run whenever new courses are published.
 */
export async function syncUdiscCatalog(): Promise<{ listed: number; added: number }> {
  const { loadUdiscCourseIndex } = await import("@/lib/udisc-sitemap.server");
  const entries = await loadUdiscCourseIndex();
  const db = await admin();
  const score = await usLikelihoodScorer();
  let added = 0;
  for (let i = 0; i < entries.length; i += SYNC_CHUNK) {
    const rows = entries.slice(i, i + SYNC_CHUNK).map((e) => ({
      slug: e.slug,
      url: e.url,
      status: "new",
      us_score: score(e.tokens),
    }));
    const { data } = await db
      .from("udisc_catalog")
      .upsert(rows as never, { onConflict: "slug", ignoreDuplicates: true })
      .select("slug");
    added += data?.length ?? 0;
  }
  // Rows added before scoring existed (or before we learned a new town) are
  // re-scored here so the sweep order stays US-first.
  const buckets = new Map<number, string[]>();
  for (const e of entries) {
    const value = score(e.tokens);
    if (!value) continue;
    const list = buckets.get(value) ?? [];
    list.push(e.slug);
    buckets.set(value, list);
  }
  for (const [value, slugs] of buckets) {
    for (let i = 0; i < slugs.length; i += SYNC_CHUNK) {
      await db
        .from("udisc_catalog")
        .update({ us_score: value } as never)
        .eq("status", "new")
        .neq("us_score", value)
        .in("slug", slugs.slice(i, i + SYNC_CHUNK));
    }
  }

  return { listed: entries.length, added };
}

/**
 * Take the next slice of unread listings and turn it into queue work. Rows are
 * flipped to `queued` immediately so two ticks never claim the same listing.
 */
export async function discoverUdiscCatalog(limit: number): Promise<EnqueueItem[]> {
  if (limit <= 0) return [];
  const db = await admin();
  // Listings sit in one of two waiting states: "new" straight off the national
  // list, or "queued" once a batch has lined them up. Both still need reading —
  // claiming only "new" left every queued listing stranded forever.
  const { data } = await db
    .from("udisc_catalog")
    .select("slug")
    .in("status", ["new", "queued"])
    .order("us_score", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(limit);
  const slugs = (data ?? []).map((r) => String(r.slug));
  if (!slugs.length) return [];
  // Bumping updated_at on claim rotates the queue, so a listing that cannot be
  // read never blocks the ones behind it.
  await db
    .from("udisc_catalog")
    .update({ status: "queued", updated_at: new Date().toISOString() } as never)
    .in("slug", slugs);

  return slugs.map((slug) => ({
    source: "udisc" as const,
    kind: "directory" as const,
    target: slug,
    // Behind every regional sweep and refresh: the national catalogue is a
    // long tail that must never crowd out keeping known courses current.
    priority: 240,
  }));
}

function isUnitedStates(country: string | null, state: string | null): boolean {
  const c = (country ?? "").trim().toLowerCase();
  if (c) {
    // UDisc reports either the ISO code ("US") or the full country name.
    if (c === "us" || c === "usa" || /(united states|u\.s\.a?\.)/.test(c)) return true;
    return false;
  }
  return !!normalizeStateCode(state);
}

async function crawlerUserId(): Promise<string | null> {
  const db = await admin();
  const { data } = await db
    .from("user_roles")
    .select("user_id")
    .in("role", ["super_admin", "admin"])
    .limit(1)
    .maybeSingle();
  return data ? String(data.user_id) : null;
}

const norm = (value: string | null | undefined) =>
  (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(disc golf|dgc|course|courses|park)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function milesApart(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (aLat - bLat) * 69;
  const dLon = (aLon - bLon) * 69 * Math.cos((aLat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

export type CatalogImportResult = {
  status: "matched" | "imported" | "skipped" | "failed";
  courseId: string | null;
  note: string;
};

/**
 * Read one UDisc listing and fold it into the course library: enrich the
 * course we already have, or add the course when it is genuinely new.
 */
export async function importUdiscListing(slug: string): Promise<CatalogImportResult> {
  const db = await admin();
  const { data: row } = await db
    .from("udisc_catalog")
    .select("slug, url")
    .eq("slug", slug)
    .maybeSingle();
  const url = row?.url ?? `https://udisc.com/courses/${slug}`;

  const { fetchUdiscHtml } = await import("@/lib/udisc-course.functions");
  const { parseUdiscCoursePage } = await import("@/lib/scene-parser");
  const parsed = parseUdiscCoursePage(await fetchUdiscHtml(url), url);
  // Keep the parsed source copy even if the course is later skipped.
  await recordSnapshot({ source: "udisc", entityType: "course", externalId: slug, sourceUrl: url, payload: parsed, parserVersion: "udisc-catalog" }).catch(() => null);
  if (!parsed?.name) {
    await db
      .from("udisc_catalog")
      .update({
        status: "failed",
        last_error: "Could not read that course page",
        fetched_at: new Date().toISOString(),
      } as never)
      .eq("slug", slug);
    return { status: "failed", courseId: null, note: `${slug}: unreadable` };
  }

  const state = normalizeStateCode(parsed.state) ?? parsed.state ?? null;
  const base = {
    name: parsed.name,
    city: parsed.city,
    state,
    country: parsed.country,
    hole_count: parsed.holes,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    fetched_at: new Date().toISOString(),
    last_error: null,
  };

  if (!isUnitedStates(parsed.country, parsed.state)) {
    await db
      .from("udisc_catalog")
      .update({ ...base, status: "skipped" } as never)
      .eq("slug", slug);
    return { status: "skipped", courseId: null, note: `${parsed.name}: outside the US` };
  }

  // Already linked from an earlier pass or a course-page refresh.
  const { data: linked } = await db
    .from("course_sources")
    .select("course_id")
    .eq("source", "udisc")
    .eq("canonical_url", url)
    .maybeSingle();

  let courseId = linked ? String(linked.course_id) : null;

  // Otherwise look for the same course under a different source: same name in
  // the same state, or an unnamed match within two miles.
  if (!courseId) {
    const target = norm(parsed.name);
    let q = db.from("courses").select("id, name, city, state, latitude, longitude").limit(400);
    q = state ? q.eq("state", state) : q.ilike("name", `%${parsed.name.slice(0, 24)}%`);
    const { data: nearby } = await q;
    const candidates = (nearby ?? []) as Array<{
      id: string;
      name: string | null;
      city: string | null;
      state: string | null;
      latitude: number | null;
      longitude: number | null;
    }>;
    const byName = candidates.find((c) => {
      const n = norm(c.name);
      return !!n && (n === target || n.includes(target) || target.includes(n));
    });
    const byCoord =
      parsed.latitude != null && parsed.longitude != null
        ? candidates.find(
            (c) =>
              c.latitude != null &&
              c.longitude != null &&
              milesApart(parsed.latitude!, parsed.longitude!, c.latitude, c.longitude) < 2 &&
              norm(c.name).split(" ")[0] === target.split(" ")[0],
          )
        : undefined;
    courseId = (byName ?? byCoord)?.id ?? null;
  }

  const { backfillCourseFromUdisc, upsertSource, replaceLayouts } =
    await import("@/lib/course-auto-populate.server");

  // Course pages no longer print a headline hole count, so fall back to the
  // hole count of the layout that is actually listed first.
  const layoutHoles = (parsed.layouts ?? []).find((l) => l.holes != null)?.holes ?? null;

  let created = false;
  if (!courseId) {
    const createdBy = await crawlerUserId();
    if (!createdBy) {
      await db
        .from("udisc_catalog")
        .update({
          ...base,
          status: "failed",
          last_error: "No admin account to own new courses",
        } as never)
        .eq("slug", slug);
      return { status: "failed", courseId: null, note: `${parsed.name}: no owner account` };
    }
    const { data: inserted, error } = await db
      .from("courses")
      .insert({
        name: parsed.name,
        // Keep UDisc's own short id as the suffix so our slug stays traceable.
        slug: `${slugify(parsed.name)}-${slug.split("-").pop() ?? slug.slice(-5)}`,
        description: parsed.description ? parsed.description.slice(0, 1000) : null,
        city: parsed.city,
        state,
        country: "USA",
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        hole_count: parsed.holes ?? layoutHoles ?? 18,
        hole_count_verified: parsed.holes != null || layoutHoles != null,
        year_established: parsed.established_year,
        designer: parsed.designer,
        created_by: createdBy,
        moderation_status: "approved",
        source: "udisc",
        source_ref: slug,
        enriched_at: new Date().toISOString(),
        enrichment_source: "udisc_catalog",
      } as never)
      .select("id")
      .maybeSingle();
    if (error || !inserted) {
      await db
        .from("udisc_catalog")
        .update({
          ...base,
          status: "failed",
          last_error: (error?.message ?? "Could not add that course").slice(0, 500),
        } as never)
        .eq("slug", slug);
      return {
        status: "failed",
        courseId: null,
        note: `${parsed.name}: ${error?.message ?? "insert failed"}`,
      };
    }
    courseId = String(inserted.id);
    created = true;
  } else {
    await backfillCourseFromUdisc(db, courseId, parsed);
  }

  await upsertSource(db, courseId, "udisc", {
    canonical_url: url,
    matched_name: parsed.name,
    raw: parsed as unknown as Record<string, unknown>,
    confidence: created ? 100 : 85,
  });
  await replaceLayouts(
    db,
    courseId,
    "udisc",
    (parsed.layouts ?? []).map((l) => ({
      layout_name: l.name,
      holes: l.holes ?? null,
      par: l.par ?? null,
      length_ft: l.length_ft ?? null,
      difficulty: l.difficulty ?? null,
      data: l as unknown as Record<string, unknown>,
    })),
  );

  // Mirrored layouts are reference data until they are promoted; without this
  // step the course is listed but cannot be scored on the layout UDisc lists.
  const { promoteCourseLayouts, ensurePlayableLayout } = await import("./layout-promote.server");
  await promoteCourseLayouts(db as never, courseId);
  // Some listings publish no layouts at all; the course still has to be scoreable.
  await ensurePlayableLayout(db as never, courseId);

  await db
    .from("udisc_catalog")
    .update({ ...base, status: created ? "imported" : "matched", course_id: courseId } as never)
    .eq("slug", slug);

  return {
    status: created ? "imported" : "matched",
    courseId,
    note: `${parsed.name}${state ? `, ${state}` : ""}: ${created ? "added" : "matched"}`,
  };
}
