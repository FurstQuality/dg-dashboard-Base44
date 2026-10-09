/**
 * Course build-out: make every course in an area playable, then fill in real
 * tee and basket coordinates wherever they are publicly mapped.
 *
 * Admin-only. Nothing here guesses a coordinate — a course with no mapped pins
 * still gets a scoreable main layout, and its holes simply show as needing pins.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BUILDOUT_AREA_KEYS, findBuildoutArea } from "@/lib/course-buildout-areas";

const AreaInput = z.object({
  areaKey: z.enum(BUILDOUT_AREA_KEYS as [string, ...string[]]),
  limit: z.number().int().min(1).max(200).optional(),
});

type Ctx = {
  supabase: { rpc: (fn: string, args: unknown) => Promise<{ data: unknown }> };
  userId: string;
};

async function assertAdmin(context: Ctx) {
  const [admin, superAdmin] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
  ]);
  if (!admin.data && !superAdmin.data) {
    throw new Error("Only admins can run the course build-out.");
  }
}

/** One layout that has been added to a course, and how much of it is mapped. */
export type LayoutPinStatus = {
  id: string;
  name: string;
  /** Holes the layout says it plays. */
  holeCount: number;
  /** Hole rows on file within that hole count. */
  holes: number;
  pinned: number;
  halfPinned: number;
  /** Hole rows numbered above the layout's hole count — nothing asks for these. */
  extraHoles: number;
};

export type BuildoutProgress = {
  areaKey: string;
  courses: number;
  playable: number;
  /** Layouts added across the area. Only these ask to be mapped. */
  layouts: number;
  layoutsFullyPinned: number;
  holesTotal: number;
  holesWithPins: number;
  /** Holes with one real coordinate on file and one still missing. */
  holesHalfPinned: number;
  coursesFullyPinned: number;
  coursesNeedingPins: Array<{
    id: string;
    name: string;
    city: string | null;
    holeCount: number | null;
    holes: number;
    pinned: number;
    /** Holes needing a single pin to finish — the quickest wins. */
    halfPinned: number;
    /** Every added layout on this course, so nothing unmapped hides. */
    layouts: LayoutPinStatus[];
  }>;
  /**
   * Courses with no layout added yet. These are not counted as unmapped holes —
   * there is nothing to map until a layout exists.
   */
  coursesWithoutLayouts: Array<{
    id: string;
    name: string;
    city: string | null;
    holeCount: number | null;
  }>;
};

/** How far along an area is: playable layouts, and holes with real pins. */
export const getBuildoutProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AreaInput.parse(raw))
  .handler(async ({ data, context }): Promise<BuildoutProgress> => {
    await assertAdmin(context as unknown as Ctx);
    const area = findBuildoutArea(data.areaKey);
    if (!area) throw new Error("Unknown area.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: courses, error } = await supabaseAdmin
      .from("courses")
      .select("id, name, city, hole_count")
      .gte("latitude", area.box.south)
      .lte("latitude", area.box.north)
      .gte("longitude", area.box.west)
      .lte("longitude", area.box.east)
      .eq("moderation_status", "approved")
      .order("city", { ascending: true });
    if (error) throw error;

    const ids = (courses ?? []).map((c) => c.id as string);
    const holeRows = await loadHoleRows(supabaseAdmin, ids);

    const needingPins: BuildoutProgress["coursesNeedingPins"] = [];
    const withoutLayouts: BuildoutProgress["coursesWithoutLayouts"] = [];
    let playable = 0;
    let layoutCount = 0;
    let layoutsFullyPinned = 0;
    let holesTotal = 0;
    let holesWithPins = 0;
    let holesHalfPinned = 0;
    let coursesFullyPinned = 0;

    for (const course of courses ?? []) {
      const stats = holeRows.get(course.id as string);
      // No layout added means nothing to map yet — it is a build job, not a
      // mapping job, so it stays out of the pin totals entirely.
      if (!stats || !stats.layouts.length) {
        withoutLayouts.push({
          id: course.id as string,
          name: course.name as string,
          city: (course.city as string | null) ?? null,
          holeCount: (course.hole_count as number | null) ?? null,
        });
        continue;
      }

      playable += 1;
      layoutCount += stats.layouts.length;
      layoutsFullyPinned += stats.layouts.filter((l) => l.holes > 0 && l.pinned === l.holes).length;
      holesTotal += stats.holes;
      holesWithPins += stats.pinned;
      holesHalfPinned += stats.halfPinned;

      if (stats.holes > 0 && stats.pinned === stats.holes) coursesFullyPinned += 1;
      else
        needingPins.push({
          id: course.id as string,
          name: course.name as string,
          city: (course.city as string | null) ?? null,
          holeCount: (course.hole_count as number | null) ?? null,
          holes: stats.holes,
          pinned: stats.pinned,
          halfPinned: stats.halfPinned,
          layouts: stats.layouts,
        });
    }

    // Closest to finished first: a course needing one basket is a two-minute job,
    // a course with nothing mapped needs a full walk.
    needingPins.sort((a, b) => {
      const left = a.holes > 0 ? a.holes - a.pinned : Number.MAX_SAFE_INTEGER;
      const right = b.holes > 0 ? b.holes - b.pinned : Number.MAX_SAFE_INTEGER;
      if (left !== right) return left - right;
      return b.halfPinned - a.halfPinned;
    });

    return {
      areaKey: area.key,
      courses: (courses ?? []).length,
      playable,
      layouts: layoutCount,
      layoutsFullyPinned,
      holesTotal,
      holesWithPins,
      holesHalfPinned,
      coursesFullyPinned,
      coursesNeedingPins: needingPins.slice(0, 100),
      coursesWithoutLayouts: withoutLayouts.slice(0, 100),
    };
  });

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

type CourseHoleStats = {
  holes: number;
  pinned: number;
  halfPinned: number;
  layouts: LayoutPinStatus[];
};

/**
 * Mapping progress per course, measured one added layout at a time.
 *
 * Only layouts that exist are counted, and within a layout only holes numbered
 * up to that layout's hole count. A course with no layout returns nothing, and
 * hole rows left over above the hole count are reported separately rather than
 * counted as work — an old 18-hole import sitting under a 9-hole layout should
 * not make the layout look half mapped forever.
 */
async function loadHoleRows(
  supabaseAdmin: AdminClient,
  courseIds: string[],
): Promise<Map<string, CourseHoleStats>> {
  const out = new Map<string, CourseHoleStats>();
  if (!courseIds.length) return out;

  for (let i = 0; i < courseIds.length; i += 50) {
    const slice = courseIds.slice(i, i + 50);
    const { data: layouts } = await supabaseAdmin
      .from("course_layouts")
      .select("id, course_id, name, hole_count, is_default")
      .in("course_id", slice)
      .order("is_default", { ascending: false });
    if (!layouts?.length) continue;

    const layoutMeta = new Map<string, { courseId: string; status: LayoutPinStatus }>();
    for (const l of layouts) {
      const status: LayoutPinStatus = {
        id: l.id as string,
        name: (l.name as string | null) ?? "Layout",
        holeCount: (l.hole_count as number | null) ?? 0,
        holes: 0,
        pinned: 0,
        halfPinned: 0,
        extraHoles: 0,
      };
      layoutMeta.set(l.id as string, { courseId: l.course_id as string, status });
      const entry = out.get(l.course_id as string) ?? {
        holes: 0,
        pinned: 0,
        halfPinned: 0,
        layouts: [],
      };
      entry.layouts.push(status);
      out.set(l.course_id as string, entry);
    }

    const { data: holes } = await supabaseAdmin
      .from("holes")
      .select("layout_id, number, basket_lat, tee_lat")
      .in("layout_id", [...layoutMeta.keys()]);

    for (const h of holes ?? []) {
      const meta = layoutMeta.get(h.layout_id as string);
      if (!meta) continue;
      const status = meta.status;
      const number = (h.number as number | null) ?? 0;
      // A hole numbered above what the layout plays is not part of this layout.
      if (status.holeCount > 0 && number > status.holeCount) {
        status.extraHoles += 1;
        continue;
      }
      const entry = out.get(meta.courseId);
      if (!entry) continue;

      status.holes += 1;
      entry.holes += 1;
      const hasTee = h.tee_lat != null;
      const hasBasket = h.basket_lat != null;
      if (hasTee && hasBasket) {
        status.pinned += 1;
        entry.pinned += 1;
      } else if (hasTee || hasBasket) {
        status.halfPinned += 1;
        entry.halfPinned += 1;
      }
    }
  }
  return out;
}

export type LayoutBuildResult = {
  areaKey: string;
  scanned: number;
  layoutsCreated: number;
  holesCreated: number;
  skippedNoHoleCount: Array<{ id: string; name: string }>;
};

/**
 * Give every course in the area a scoreable main layout. Hole count comes from
 * the course record; par defaults to 3 per hole, which is what an unmeasured
 * hole is until someone measures it.
 */
export const buildAreaLayouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AreaInput.parse(raw))
  .handler(async ({ data, context }): Promise<LayoutBuildResult> => {
    await assertAdmin(context as unknown as Ctx);
    const area = findBuildoutArea(data.areaKey);
    if (!area) throw new Error("Unknown area.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: courses, error } = await supabaseAdmin
      .from("courses")
      .select("id, name, hole_count")
      .gte("latitude", area.box.south)
      .lte("latitude", area.box.north)
      .gte("longitude", area.box.west)
      .lte("longitude", area.box.east)
      .eq("moderation_status", "approved")
      .limit(data.limit ?? 200);
    if (error) throw error;

    const result: LayoutBuildResult = {
      areaKey: area.key,
      scanned: (courses ?? []).length,
      layoutsCreated: 0,
      holesCreated: 0,
      skippedNoHoleCount: [],
    };

    for (const course of courses ?? []) {
      const courseId = course.id as string;
      const holeCount = course.hole_count as number | null;

      const { data: existing } = await supabaseAdmin
        .from("course_layouts")
        .select("id")
        .eq("course_id", courseId)
        .limit(1);
      if (existing?.length) continue;

      if (!holeCount || holeCount < 1 || holeCount > 36) {
        result.skippedNoHoleCount.push({ id: courseId, name: course.name as string });
        continue;
      }

      const { data: layout, error: layoutErr } = await supabaseAdmin
        .from("course_layouts")
        .insert({
          course_id: courseId,
          name: "Main layout",
          hole_count: holeCount,
          par_total: holeCount * 3,
          is_default: true,
        })
        .select("id")
        .single();
      if (layoutErr || !layout) continue;
      result.layoutsCreated += 1;

      const holes = Array.from({ length: holeCount }, (_, i) => ({
        layout_id: layout.id as string,
        number: i + 1,
        par: 3,
      }));
      const { error: holesErr } = await supabaseAdmin.from("holes").insert(holes);
      if (!holesErr) result.holesCreated += holeCount;
    }

    return result;
  });

export type PinImportResult = {
  areaKey: string;
  mappedSites: number;
  coursesMatched: number;
  holesPinned: number;
  unnumberedPins: number;
  inferredHoleNumbers: number;
  /** Extra tee pads recognised as a second pad on a hole, not a new hole. */
  alternateTeePads: number;
  layoutsUpdated: number;
  /** Courses with mapped pins but no layout added yet — build a layout first. */
  skippedNoLayout: number;
  matches: Array<{ course: string; holesPinned: number; note: string | null }>;
};

/**
 * Import every publicly mapped tee pad and basket in the area and write them
 * onto the matching course's default layout, with measured hole distances.
 */
export const importMappedHolePins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AreaInput.parse(raw))
  .handler(async ({ data, context }): Promise<PinImportResult> => {
    await assertAdmin(context as unknown as Ctx);
    const area = findBuildoutArea(data.areaKey);
    if (!area) throw new Error("Unknown area.");

    const { fetchMappedSites, pairPinsIntoHoles, distanceMeters, distanceFeet, nameLooksLikeSame } =
      await import("@/lib/course-holes.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const sites = await fetchMappedSites(area.box);
    const result: PinImportResult = {
      areaKey: area.key,
      mappedSites: sites.length,
      coursesMatched: 0,
      holesPinned: 0,
      unnumberedPins: 0,
      inferredHoleNumbers: 0,
      alternateTeePads: 0,
      layoutsUpdated: 0,
      skippedNoLayout: 0,
      matches: [],
    };

    const { data: courses } = await supabaseAdmin
      .from("courses")
      .select("id, name, latitude, longitude, hole_count")
      .gte("latitude", area.box.south - 0.02)
      .lte("latitude", area.box.north + 0.02)
      .gte("longitude", area.box.west - 0.02)
      .lte("longitude", area.box.east + 0.02)
      .eq("moderation_status", "approved");

    // One course can be mapped as several OSM sites (a site plus loose pin
    // clusters). Collect every pin for a course first, then number them once.
    type Bucket = {
      name: string;
      holeCount: number | null;
      pins: Awaited<typeof sites>[number]["pins"];
    };
    const buckets = new Map<string, Bucket>();

    for (const site of sites) {
      if (!site.pins.length) continue;

      // Match by proximity, then confirm with the name when both have one.
      let match: { id: string; name: string; holeCount: number | null } | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const c of courses ?? []) {
        if (c.latitude == null || c.longitude == null) continue;
        const d = distanceMeters(
          { lat: site.lat, lng: site.lng },
          { lat: c.latitude as number, lng: c.longitude as number },
        );
        if (d > 900) continue;
        const nameOk = site.name ? nameLooksLikeSame(site.name, c.name as string) : true;
        const score = nameOk ? d : d + 600;
        if (score < bestDist) {
          bestDist = score;
          match = {
            id: c.id as string,
            name: c.name as string,
            holeCount: (c.hole_count as number | null) ?? null,
          };
        }
      }
      if (!match) continue;

      const bucket = buckets.get(match.id) ?? {
        name: match.name,
        holeCount: match.holeCount,
        pins: [],
      };
      bucket.pins.push(...site.pins);
      buckets.set(match.id, bucket);
    }

    for (const [courseId, bucket] of buckets) {
      const paired = pairPinsIntoHoles(bucket.pins, bucket.holeCount);
      result.unnumberedPins += paired.unnumbered;
      result.inferredHoleNumbers += paired.inferred;
      result.alternateTeePads += paired.alternateTees;
      const usable = paired.holes.filter((h) => h.tee || h.basket);
      if (!usable.length) continue;

      // Only layouts somebody has already added are mapped. Importing pins is
      // never a reason to invent a layout, and a course with none is left to the
      // build step.
      const { data: layoutRows } = await supabaseAdmin
        .from("course_layouts")
        .select("id, hole_count")
        .eq("course_id", courseId);
      if (!layoutRows?.length) {
        result.skippedNoLayout += 1;
        continue;
      }

      let pinned = 0;
      for (const layout of layoutRows) {
        const layoutId = layout.id as string;
        const layoutHoles = (layout.hole_count as number | null) ?? 0;
        // A 21-hole layout does not want a 24th basket written into it.
        const forLayout = layoutHoles > 0 ? usable.filter((h) => h.number <= layoutHoles) : usable;
        if (!forLayout.length) continue;
        const { data: rows } = await supabaseAdmin
          .from("holes")
          .select("id, number, tee_lat, tee_lng, basket_lat, basket_lng")
          .eq("layout_id", layoutId);
        const byNumber = new Map<
          number,
          {
            id: string;
            hasPins: boolean;
            hasTee: boolean;
            hasBasket: boolean;
            tee: { lat: number; lng: number } | null;
            basket: { lat: number; lng: number } | null;
          }
        >();
        for (const row of rows ?? []) {
          const hasTee = row.tee_lat != null && row.tee_lng != null;
          const hasBasket = row.basket_lat != null && row.basket_lng != null;
          byNumber.set(row.number as number, {
            id: row.id as string,
            hasPins: hasTee && hasBasket,
            hasTee,
            hasBasket,
            tee: hasTee ? { lat: row.tee_lat as number, lng: row.tee_lng as number } : null,
            basket: hasBasket
              ? { lat: row.basket_lat as number, lng: row.basket_lng as number }
              : null,
          });
        }

        let layoutTouched = false;
        for (const hole of forLayout) {
          const existing = byNumber.get(hole.number);
          if (existing?.hasPins) continue; // never overwrite pins already on file

          const patch: {
            tee_lat?: number;
            tee_lng?: number;
            basket_lat?: number;
            basket_lng?: number;
            distance_ft?: number;
          } = {};
          // Keep whichever side is already on file and only fill the gap.
          if (hole.tee && !existing?.hasTee) {
            patch.tee_lat = hole.tee.lat;
            patch.tee_lng = hole.tee.lng;
          }
          if (hole.basket && !existing?.hasBasket) {
            patch.basket_lat = hole.basket.lat;
            patch.basket_lng = hole.basket.lng;
          }
          if (!Object.keys(patch).length) continue;

          const tee = existing?.tee ?? hole.tee;
          const basket = existing?.basket ?? hole.basket;
          if (tee && basket) patch.distance_ft = distanceFeet(tee, basket);

          if (existing) {
            const { error } = await supabaseAdmin.from("holes").update(patch).eq("id", existing.id);
            if (!error) {
              pinned += 1;
              layoutTouched = true;
            }
          } else {
            const { error } = await supabaseAdmin
              .from("holes")
              .insert({ layout_id: layoutId, number: hole.number, par: 3, ...patch });
            if (!error) {
              pinned += 1;
              layoutTouched = true;
            }
          }
        }
        if (layoutTouched) result.layoutsUpdated += 1;
      }

      if (pinned > 0) {
        result.coursesMatched += 1;
        result.holesPinned += pinned;
        const notes: string[] = [];
        if (paired.inferred > 0)
          notes.push(`${paired.inferred} holes placed in walking order — confirm the numbering`);
        if (paired.alternateTees > 0)
          notes.push(`${paired.alternateTees} extra tee pads treated as second pads`);
        if (paired.unnumbered > 0)
          notes.push(`${paired.unnumbered} mapped pins could not be placed`);
        result.matches.push({
          course: bucket.name,
          holesPinned: pinned,
          note: notes.length ? notes.join(" · ") : null,
        });
      }
    }

    return result;
  });

/* ------------------------------------------------------------------ *
 * Library-wide layout wiring
 *
 * The nationwide sweep adds courses with a hole count but no layout, so those
 * courses cannot be scored and their holes never appear in any mapping list.
 * These two functions cover the whole library rather than one area: report what
 * is unwired, then wire it. Nothing here invents a hole count — a course that
 * does not know how many holes it plays is listed for a human instead.
 * ------------------------------------------------------------------ */

type Pageable<T> = (from: number, to: number) => Promise<T[]>;

/** PostgREST caps a response at 1000 rows, so walk it in pages. */
async function pageAll<T>(fetchPage: Pageable<T>): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const rows = await fetchPage(from, from + size - 1);
    out.push(...rows);
    if (rows.length < size) return out;
    if (out.length > 200_000) return out;
  }
}

export type LibraryLayoutHealth = {
  courses: number;
  withLayout: number;
  withoutLayout: number;
  /** No layout and no usable hole count — needs a person, not a backfill. */
  withoutHoleCount: number;
  layouts: number;
  /** Layouts missing hole rows they say they play. */
  layoutsMissingHoles: number;
  /** Layouts whose hole rows run past their stated hole count. */
  layoutsUndercounted: number;
  /** Courses whose headline hole count disagrees with their main layout. */
  coursesHoleCountStale: number;
  samplesWithoutLayout: Array<{ id: string; name: string; city: string | null; holes: number }>;
};

export const getLibraryLayoutHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LibraryLayoutHealth> => {
    await assertAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const courses = await pageAll<{
      id: string;
      name: string;
      city: string | null;
      hole_count: number | null;
    }>(async (from, to) => {
      const { data, error } = await supabaseAdmin
        .from("courses")
        .select("id, name, city, hole_count")
        .eq("moderation_status", "approved")
        .order("name")
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as never;
    });

    const layouts = await pageAll<{
      id: string;
      course_id: string;
      hole_count: number | null;
      is_default: boolean | null;
    }>(async (from, to) => {
      const { data, error } = await supabaseAdmin
        .from("course_layouts")
        .select("id, course_id, hole_count, is_default")
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as never;
    });

    const holes = await pageAll<{ layout_id: string; number: number }>(async (from, to) => {
      const { data, error } = await supabaseAdmin
        .from("holes")
        .select("layout_id, number")
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as never;
    });

    const numbersByLayout = new Map<string, Set<number>>();
    for (const h of holes) {
      if (!h.layout_id) continue;
      const set = numbersByLayout.get(h.layout_id) ?? new Set<number>();
      set.add(h.number);
      numbersByLayout.set(h.layout_id, set);
    }

    const layoutsByCourse = new Map<string, typeof layouts>();
    for (const l of layouts) {
      const list = layoutsByCourse.get(l.course_id) ?? [];
      list.push(l);
      layoutsByCourse.set(l.course_id, list);
    }

    const health: LibraryLayoutHealth = {
      courses: courses.length,
      withLayout: 0,
      withoutLayout: 0,
      withoutHoleCount: 0,
      layouts: layouts.length,
      layoutsMissingHoles: 0,
      layoutsUndercounted: 0,
      coursesHoleCountStale: 0,
      samplesWithoutLayout: [],
    };

    for (const l of layouts) {
      const declared = l.hole_count ?? 0;
      const numbers = numbersByLayout.get(l.id) ?? new Set<number>();
      if (declared > 0) {
        let present = 0;
        for (let n = 1; n <= declared; n += 1) if (numbers.has(n)) present += 1;
        if (present < declared) health.layoutsMissingHoles += 1;
      }
      if (contiguousHoleRun(numbers) > declared) health.layoutsUndercounted += 1;
    }

    for (const c of courses) {
      const own = layoutsByCourse.get(c.id) ?? [];
      if (!own.length) {
        health.withoutLayout += 1;
        if (!usableHoleCount(c.hole_count)) health.withoutHoleCount += 1;
        else if (health.samplesWithoutLayout.length < 12) {
          health.samplesWithoutLayout.push({
            id: c.id,
            name: c.name,
            city: c.city,
            holes: c.hole_count as number,
          });
        }
        continue;
      }
      health.withLayout += 1;
      const main = own.find((l) => l.is_default) ?? own[0]!;
      if (main.hole_count && c.hole_count !== main.hole_count) health.coursesHoleCountStale += 1;
    }

    return health;
  });

/** Highest N where hole rows run 1..N with no gaps. */
function contiguousHoleRun(numbers: Set<number>): number {
  let n = 0;
  while (numbers.has(n + 1)) n += 1;
  return n;
}

function usableHoleCount(value: number | null): boolean {
  return !!value && value >= 1 && value <= 36;
}

export type LibraryBackfillResult = {
  scanned: number;
  layoutsCreated: number;
  holesCreated: number;
  layoutsRecounted: number;
  courseHoleCountsSynced: number;
  skippedNoHoleCount: number;
  /** Courses still waiting after this pass, so the admin knows to run it again. */
  remaining: number;
};

/**
 * Wire up unplayable courses across the whole library, a batch at a time:
 * give each one a main layout with real hole rows, extend a layout whose hole
 * rows run past its stated count, and bring each course's headline hole count
 * back in line with its main layout.
 */
export const backfillLibraryLayouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ limit: z.number().int().min(1).max(300).optional() }).parse(raw ?? {}),
  )
  .handler(async ({ data, context }): Promise<LibraryBackfillResult> => {
    await assertAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.limit ?? 100;

    const result: LibraryBackfillResult = {
      scanned: 0,
      layoutsCreated: 0,
      holesCreated: 0,
      layoutsRecounted: 0,
      courseHoleCountsSynced: 0,
      skippedNoHoleCount: 0,
      remaining: 0,
    };

    // Courses with no layout at all: the ones that cannot be scored today.
    const layoutCourseIds = new Set(
      (
        await pageAll<{ course_id: string }>(async (from, to) => {
          const { data: rows, error } = await supabaseAdmin
            .from("course_layouts")
            .select("course_id")
            .range(from, to);
          if (error) throw error;
          return (rows ?? []) as never;
        })
      ).map((r) => r.course_id),
    );

    const courses = await pageAll<{ id: string; hole_count: number | null }>(async (from, to) => {
      const { data: rows, error } = await supabaseAdmin
        .from("courses")
        .select("id, hole_count")
        .eq("moderation_status", "approved")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return (rows ?? []) as never;
    });

    const pending = courses.filter((c) => !layoutCourseIds.has(c.id));
    const batch = pending.slice(0, limit);
    result.remaining = Math.max(0, pending.length - batch.length);

    for (const course of batch) {
      result.scanned += 1;
      if (!usableHoleCount(course.hole_count)) {
        result.skippedNoHoleCount += 1;
        continue;
      }
      const holeCount = course.hole_count as number;
      const { data: layout, error: layoutErr } = await supabaseAdmin
        .from("course_layouts")
        .insert({
          course_id: course.id,
          name: "Main layout",
          hole_count: holeCount,
          par_total: holeCount * 3,
          is_default: true,
        })
        .select("id")
        .single();
      if (layoutErr || !layout) continue;
      result.layoutsCreated += 1;

      const { error: holesErr } = await supabaseAdmin.from("holes").insert(
        Array.from({ length: holeCount }, (_, i) => ({
          layout_id: layout.id as string,
          number: i + 1,
          par: 3,
        })),
      );
      if (!holesErr) result.holesCreated += holeCount;
    }

    // Layouts whose hole rows run past their stated count: the rows are the
    // evidence, so trust them and raise the count to the last unbroken hole.
    const layouts = await pageAll<{
      id: string;
      course_id: string;
      hole_count: number | null;
      is_default: boolean | null;
    }>(async (from, to) => {
      const { data: rows, error } = await supabaseAdmin
        .from("course_layouts")
        .select("id, course_id, hole_count, is_default")
        .range(from, to);
      if (error) throw error;
      return (rows ?? []) as never;
    });

    const holeRows = await pageAll<{ layout_id: string; number: number; par: number | null }>(
      async (from, to) => {
        const { data: rows, error } = await supabaseAdmin
          .from("holes")
          .select("layout_id, number, par")
          .range(from, to);
        if (error) throw error;
        return (rows ?? []) as never;
      },
    );

    const byLayout = new Map<string, Array<{ number: number; par: number | null }>>();
    for (const h of holeRows) {
      if (!h.layout_id) continue;
      const list = byLayout.get(h.layout_id) ?? [];
      list.push({ number: h.number, par: h.par });
      byLayout.set(h.layout_id, list);
    }

    for (const l of layouts) {
      const rows = byLayout.get(l.id) ?? [];
      const run = contiguousHoleRun(new Set(rows.map((r) => r.number)));
      const declared = l.hole_count ?? 0;
      if (run <= declared || run > 36) continue;
      const par = rows.filter((r) => r.number <= run).reduce((sum, r) => sum + (r.par ?? 3), 0);
      const { error } = await supabaseAdmin
        .from("course_layouts")
        .update({ hole_count: run, par_total: par })
        .eq("id", l.id);
      if (!error) {
        result.layoutsRecounted += 1;
        l.hole_count = run;
      }
    }

    // Headline hole count on the course should match the layout people play.
    const mainByCourse = new Map<string, number>();
    for (const l of layouts) {
      if (!l.hole_count) continue;
      if (l.is_default || !mainByCourse.has(l.course_id))
        mainByCourse.set(l.course_id, l.hole_count);
    }
    for (const course of courses) {
      const main = mainByCourse.get(course.id);
      if (!main || course.hole_count === main) continue;
      const { error } = await supabaseAdmin
        .from("courses")
        .update({ hole_count: main })
        .eq("id", course.id);
      if (!error) result.courseHoleCountsSynced += 1;
    }

    return result;
  });

export type LayoutPromotionResult = {
  coursesProcessed: number;
  layoutsCreated: number;
  layoutsUpdated: number;
  holesCreated: number;
  holesRemoved: number;
  placeholdersRetired: number;
  /** Courses still waiting after this pass. */
  remaining: number;
};

/**
 * Promote the layouts mirrored from UDisc into layouts players can score:
 * real names, hole counts, par totals and lengths, replacing the generic
 * placeholder layout wherever nothing has been mapped on it yet.
 */
export const promoteLibraryLayouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).optional() }).parse(raw ?? {}),
  )
  .handler(async ({ data, context }): Promise<LayoutPromotionResult> => {
    await assertAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { promoteCourseLayouts, coursesAwaitingPromotion, ensurePlayableLayout } =
      await import("@/lib/ingest/layout-promote.server");
    const limit = data.limit ?? 40;

    const pending = await coursesAwaitingPromotion(supabaseAdmin as never, limit + 1);
    const batch = pending.slice(0, limit);

    const result: LayoutPromotionResult = {
      coursesProcessed: 0,
      layoutsCreated: 0,
      layoutsUpdated: 0,
      holesCreated: 0,
      holesRemoved: 0,
      placeholdersRetired: 0,
      remaining: 0,
    };

    for (const courseId of batch) {
      const one = await promoteCourseLayouts(supabaseAdmin as never, courseId);
      if (await ensurePlayableLayout(supabaseAdmin as never, courseId)) one.layoutsCreated += 1;
      result.coursesProcessed += 1;
      result.layoutsCreated += one.layoutsCreated;
      result.layoutsUpdated += one.layoutsUpdated;
      result.holesCreated += one.holesCreated;
      result.holesRemoved += one.holesRemoved;
      result.placeholdersRetired += one.placeholdersRetired;
    }

    const after = await coursesAwaitingPromotion(supabaseAdmin as never, 1);
    result.remaining = after.length;
    return result;
  });

/** One pass of the all-in-one Course Atlas scan. */
export type FullScanPass = {
  coursesRead: number;
  coursesAdded: number;
  listingsRead: number;
  parFilled: number;
  layoutsFromListings: number;
  pinsUpgraded: number;
  sceneLinks: number;
  repairsDone: number;
  geometryCells: number;
  holesMapped: number;
  failed: number;
  /** True when nothing in this pass found work — the scan has caught up. */
  idle: boolean;
};

/**
 * Runs one small slice of every course job in order: find new courses, read
 * listings (par + named layouts), move pins to exact listing spots, link
 * Scene venues, and work the repair queue. Small slices keep each call well
 * under worker time limits; the browser loops until a pass comes back idle.
 */
export const runFullCourseScanPass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FullScanPass> => {
    await assertAdmin(context as unknown as Ctx);
    const out: FullScanPass = {
      coursesRead: 0, coursesAdded: 0, listingsRead: 0, parFilled: 0,
      layoutsFromListings: 0, pinsUpgraded: 0, sceneLinks: 0, repairsDone: 0,
      geometryCells: 0, holesMapped: 0, failed: 0, idle: false,
    };
    const step = async (fn: () => Promise<void>) => {
      try { await fn(); } catch { out.failed += 1; }
    };
    await step(async () => {
      const { discoverUdiscCatalog, importUdiscListing } = await import("@/lib/ingest/udisc-catalog.server");
      const items = await discoverUdiscCatalog(5);
      for (const item of items) {
        out.coursesRead += 1;
        try {
          const r = await importUdiscListing(item.target);
          if (r.status === "imported") out.coursesAdded += 1;
          else if (r.status !== "matched" && r.status !== "skipped") out.failed += 1;
        } catch { out.failed += 1; }
      }
    });
    await step(async () => {
      const { syncCourseListings } = await import("@/lib/course-sources/listing-sync.server");
      const r = await syncCourseListings(20);
      out.listingsRead += r.checked;
      out.parFilled += r.parFilled;
      out.layoutsFromListings += r.draftLayouts;
      out.failed += r.failed;
    });
    await step(async () => {
      const { upgradeApproximatePins } = await import("@/lib/course-pin-upgrade.server");
      const r = await upgradeApproximatePins(15);
      out.pinsUpgraded += r.upgraded;
    });
    await step(async () => {
      const { backfillSceneCourseLinks } = await import("@/lib/course-sources/scene-links.server");
      const r = await backfillSceneCourseLinks(10);
      out.sceneLinks += r.linked;
    });
    await step(async () => {
      const { processCourseRepairQueue } = await import("@/lib/course-sources/job-queue.server");
      const r = await processCourseRepairQueue(5);
      out.repairsDone += r.ok;
    });
    await step(async () => {
      const { harvestGeometryCells } = await import("@/lib/course-geometry/harvest.server");
      const r = await harvestGeometryCells(1);
      out.geometryCells += r.length;
      out.holesMapped += r.reduce((a, c) => a + c.filled, 0);
    });
    out.idle = out.geometryCells === 0 && out.coursesRead === 0 && out.listingsRead === 0 && out.pinsUpgraded === 0 &&
      out.sceneLinks === 0 && out.repairsDone === 0;
    return out;
  });
