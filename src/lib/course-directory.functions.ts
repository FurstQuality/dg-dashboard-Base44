/**
 * Course directory search. Runs server-side so the library stays fast as the
 * course count grows into the thousands.
 */
import { normalizeStateCode } from "@/lib/us-states";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { searchFilter } from "./course-search-filter";
import { applyDirectoryFilters } from "./course-directory-filters.server";


export type DirectoryCourse = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  cover_url: string | null;
  hole_count: number;
  difficulty: string | null;
  source: string | null;
  pdga_rating: number | null;
  pdga_rating_votes: number | null;
  year_established: number | null;
  /** How exact the pin is; city_approximate = town centre only. */
  location_quality: string | null;
  /** Saved scoring layouts. 0 means the course still needs one built. */
  layout_count?: number;
  /** True when a layout carries full builder measurements (par + distance). */
  layout_verified?: boolean;
  /** Best layout aggregates captured in the Course Builder. */
  layout_par?: number | null;
  layout_distance_ft?: number | null;
  /** The layout the course marks as its default (only set when it has several). */
  default_layout_name?: string | null;
  default_layout_par?: number | null;
  layout_mandos?: number;
  layout_water_holes?: number;
};

export type DirectoryPage = {
  courses: DirectoryCourse[];
  total: number;
  page: number;
  pageSize: number;
};

const SearchInput = z.object({
  q: z.string().trim().max(120).optional(),
  state: z.string().trim().max(40).optional(),
  holes: z.string().trim().max(20).optional(), // "9" | "18" | "24+" | "any"
  sort: z.string().trim().max(20).optional(), // name | newest | holes
  // Builder readiness: verified = measured layout, ready = layout exists.
  scoring: z.enum(["any", "verified", "ready", "pending"]).optional(),
  /** Minimum player rating (stars). */
  minRating: z.number().min(0).max(5).optional(),
  /** Course difficulty label as captured in the builder. */
  difficulty: z.string().trim().max(40).optional(),
  /** Earliest year established. */
  minYear: z.number().int().min(1900).max(2100).optional(),
  page: z.number().int().min(1).max(500).optional(),
  pageSize: z.number().int().min(6).max(60).optional(),
});


export type LayoutStat = {
  count: number;
  verified: boolean;
  par: number | null;
  distance: number | null;
  mandos: number;
  waterHoles: number;
  defaultName: string | null;
  defaultPar: number | null;
};

/**
 * Builder-derived layout aggregates per course, so the directory mirrors what
 * the Course Builder captured (measurements, mandos, water holes).
 */
async function layoutStatsByCourse(
  supabase: ReturnType<typeof publicClient>,
  courseIds?: string[],
): Promise<Map<string, LayoutStat>> {
  const cols = "course_id,name,is_default,hole_count,par_total,distance_total,mando_count,water_hole_count";
  // Only the courses being shown when known; otherwise every page (1,000-row cap per request).
  const data = courseIds
    ? courseIds.length
      ? ((await supabase.from("course_layouts").select(cols).neq("status", "draft").in("course_id", courseIds).limit(5000)).data ?? [])
      : []
    : await readAllPages((from, to) =>
        supabase.from("course_layouts").select(cols).neq("status", "draft").order("id").range(from, to),
      );
  const map = new Map<string, LayoutStat>();
  for (const row of (data ?? []) as {
    course_id: string;
    name: string | null;
    is_default: boolean | null;
    hole_count: number | null;
    par_total: number | null;
    distance_total: number | null;
    mando_count: number | null;
    water_hole_count: number | null;
  }[]) {
    const prev = map.get(row.course_id) ?? {
      count: 0,
      verified: false,
      par: null,
      distance: null,
      mandos: 0,
      waterHoles: 0,
      defaultName: null,
      defaultPar: null,
    };
    const verified = (row.hole_count ?? 0) > 0 && (row.distance_total ?? 0) > 0;
    map.set(row.course_id, {
      count: prev.count + 1,
      verified: prev.verified || verified,
      par: Math.max(prev.par ?? 0, row.par_total ?? 0) || null,
      distance: Math.max(prev.distance ?? 0, row.distance_total ?? 0) || null,
      mandos: Math.max(prev.mandos, row.mando_count ?? 0),
      waterHoles: Math.max(prev.waterHoles, row.water_hole_count ?? 0),
      defaultName: prev.defaultName ?? (row.is_default ? row.name : null),
      defaultPar: prev.defaultName ? prev.defaultPar : row.is_default ? row.par_total : null,
    });
  }
  return map;
}

/** Annotates a page of courses with their builder layout status. */
function annotate(rows: DirectoryCourse[], stats: Map<string, LayoutStat>): DirectoryCourse[] {
  return rows.map((c) => {
    const s = stats.get(c.id);
    return {
      ...c,
      layout_count: s?.count ?? 0,
      layout_verified: s?.verified ?? false,
      // One par/length only describes a course with a single layout; with
      // several, cards show the layout count instead of a misleading number.
      layout_par: s && s.count === 1 ? s.par : null,
      layout_distance_ft: s && s.count === 1 ? s.distance : null,
      default_layout_name: s && s.count > 1 ? s.defaultName : null,
      default_layout_par: s && s.count > 1 ? s.defaultPar : null,
      layout_mandos: s?.mandos ?? 0,
      layout_water_holes: s?.waterHoles ?? 0,
    };
  });
}


const COLUMNS =
  "id,name,slug,city,state,country,latitude,longitude,cover_url,hole_count,difficulty,source,pdga_rating,pdga_rating_votes,year_established,location_quality";

/** Reads every page of a query (Data API caps each response at 1,000 rows). */
async function readAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
  max = 60000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return out;
}

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

/** Paged, filtered search across every approved course in the library. */
export const searchCourseDirectory = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => SearchInput.parse(raw))
  .handler(async ({ data }): Promise<DirectoryPage> => {
    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? 24;
    const from = (page - 1) * pageSize;
    const supabase = publicClient();

    let query = applyDirectoryFilters(
      supabase
        .from("courses")
        .select(COLUMNS, { count: "exact" })
        .eq("moderation_status", "approved")
        .not("is_ghost", "is", true)
        .is("merged_into_course_id", null),
      data,
      searchFilter,
    );

    const scoring = data.scoring ?? "any";
    const stats = scoring !== "any" ? await layoutStatsByCourse(supabase) : null;
    if (stats && scoring !== "any") {
      const matching = [...stats.entries()]
        .filter(([, s]) => (scoring === "verified" ? s.verified : s.count > 0))
        .map(([id]) => id);
      if (scoring === "pending") {
        if (matching.length > 0 && matching.length <= 500) {
          // Above this size the exclusion list would blow past URL limits; the
          // page then falls back to annotating readiness without filtering.
          query = query.not("id", "in", `(${matching.join(",")})`);
        }
      } else {
        if (matching.length === 0) return { courses: [], total: 0, page, pageSize };
        query = query.in("id", matching);
      }
    }


    if (data.sort === "holes") query = query.order("hole_count", { ascending: false });
    else if (data.sort === "newest") query = query.order("created_at", { ascending: false });
    else if (data.sort === "rating")
      query = query
        .order("pdga_rating", { ascending: false, nullsFirst: false })
        .order("pdga_rating_votes", { ascending: false, nullsFirst: false });
    else if (data.sort === "oldest")
      query = query.order("year_established", { ascending: true, nullsFirst: false });
    else query = query.order("name", { ascending: true });

    const { data: rows, count, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);

    const pageRows = (rows ?? []) as unknown as DirectoryCourse[];

    return {
      courses: annotate(pageRows, stats ?? (await layoutStatsByCourse(supabase, pageRows.map((r) => r.id)))),
      total: count ?? 0,
      page,
      pageSize,
    };

  });

/**
 * Every mappable course that matches the current filters (not just the visible
 * page), so the directory map can plot and frame the whole result set.
 */
export const listCourseMapPins = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => SearchInput.omit({ page: true, pageSize: true }).parse(raw))
  .handler(async ({ data }): Promise<DirectoryCourse[]> => {
    const supabase = publicClient();
    const scoring = data.scoring ?? "any";
    // Every directory-eligible course with a location is plotted: approved,
    // not a ghost, not joined into another course. No layout or par needed.
    const [stats, all] = await Promise.all([
      layoutStatsByCourse(supabase),
      readAllPages<DirectoryCourse>(async (from, to) => {
        const r = await applyDirectoryFilters(
          supabase
            .from("courses")
            .select(COLUMNS)
            .eq("moderation_status", "approved")
            .not("is_ghost", "is", true)
            .is("merged_into_course_id", null)
            .not("latitude", "is", null)
            .not("longitude", "is", null),
          data,
          searchFilter,
        )
          .order("id", { ascending: true })
          .range(from, to);
        return r as unknown as { data: DirectoryCourse[] | null; error: { message: string } | null };
      }),
    ]);

    // Builder readiness lives in course_layouts, so the pin set applies the
    // same readiness filter the list uses instead of plotting extra courses.
    const annotated = annotate(all, stats);
    if (scoring === "any") return annotated;
    return annotated.filter((c) =>
      scoring === "verified"
        ? !!c.layout_verified
        : scoring === "ready"
          ? (c.layout_count ?? 0) > 0
          : (c.layout_count ?? 0) === 0,
    );
  });


/** States that actually have courses, for the directory filter. */
export const listCourseStates = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ state: string; count: number }[]> => {
    const supabase = publicClient();
    const data = await readAllPages<{ state: string | null }>((from, to) =>
      supabase
        .from("courses")
        .select("state")
        .eq("moderation_status", "approved")
        .not("is_ghost", "is", true)
        .is("merged_into_course_id", null)
        .not("state", "is", null)
        .order("id")
        .range(from, to),
    );
    // Bucket by canonical postal code so "IN" and "Indiana" are one option.
    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      const raw = (row.state as string)?.trim();
      if (!raw) continue;
      const key = normalizeStateCode(raw) ?? raw.toUpperCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => a.state.localeCompare(b.state));
  },
);

export type MapCluster = { lat: number; lng: number; n: number };
export type DirectoryMapView = {
  total: number;
  inView: number;
  /** [south, west, north, east] of every match, for framing the results. */
  bbox: [number, number, number, number] | null;
  clusters: MapCluster[] | null;
  pins: DirectoryCourse[];
};

const ViewInput = SearchInput.omit({ page: true, pageSize: true, sort: true }).extend({
  south: z.number().min(-90).max(90),
  west: z.number().min(-540).max(540),
  north: z.number().min(-90).max(90),
  east: z.number().min(-540).max(540),
  zoom: z.number().min(0).max(22),
  forcePins: z.boolean().optional(),
});

/**
 * Viewport map query: only what is in view, grouped into clusters when a view
 * holds too many courses. Reads canonical courses through one database query.
 */
export const getDirectoryMapView = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ViewInput.parse(raw))
  .handler(async ({ data }): Promise<DirectoryMapView> => {
    const { stateFilterVariants } = await import("./us-states");
    const supabase = publicClient();
    const wrap = (v: number) => ((((v + 180) % 360) + 360) % 360) - 180;
    const span = data.east - data.west;
    const west = span >= 360 ? -180 : wrap(data.west);
    const east = span >= 360 ? 180 : wrap(data.east);
    const { data: r, error } = await supabase.rpc("directory_map_view", {
      _south: data.south,
      _west: west,
      _north: data.north,
      _east: east,
      _zoom: data.zoom,
      _q: data.q || undefined,
      _states: data.state && data.state !== "all" ? stateFilterVariants(data.state) : undefined,
      _holes: data.holes || undefined,
      _min_rating: data.minRating || undefined,
      _difficulty: data.difficulty || undefined,
      _scoring: data.scoring && data.scoring !== "any" ? data.scoring : undefined,
      _force_pins: data.forcePins ?? false,
    });
    if (error) throw new Error("The course map couldn't load. Try again.");
    const v = r as unknown as {
      total: number; in_view: number; bbox: [number, number, number, number] | null;
      clusters: MapCluster[] | null; pins: DirectoryCourse[];
    };
    return {
      total: v.total ?? 0,
      inView: v.in_view ?? 0,
      bbox: v.bbox ?? null,
      clusters: v.clusters ?? null,
      pins: (v.pins ?? []).map((c) => ({ ...c, layout_count: c.layout_count ?? 0 })),
    };
  });
