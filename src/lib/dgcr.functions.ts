/**
 * Server functions for the Disc Golf Course Review (DGCR) course library.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DgcrSearchHit } from "@/lib/dgcr.server";

export type DgcrCourseRow = {
  id: string;
  dgcr_id: string;
  name: string;
  park_name: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  review_count: number | null;
  hole_count: number | null;
  basket_count: number | null;
  water_holes: number | null;
  length_min_ft: number | null;
  length_max_ft: number | null;
  terrain: string | null;
  foliage: string | null;
  designer: string | null;
  year_established: number | null;
  tee_type: string | null;
  basket_type: string | null;
  conditions: string | null;
  course_type: string | null;
  pars: number[];
  sse: number[];
  rounds_recorded: number | null;
  avg_score: number | null;
  description: string | null;
  directions: string | null;
  url: string;
  course_id: string | null;
  fetched_at: string;
};

const DGCR_COLUMNS =
  "id,dgcr_id,name,park_name,city,state,postal_code,latitude,longitude,rating,review_count,hole_count,basket_count,water_holes,length_min_ft,length_max_ft,terrain,foliage,designer,year_established,tee_type,basket_type,conditions,course_type,pars,sse,rounds_recorded,avg_score,description,directions,url,course_id,fetched_at";

/** Free-text search of DGCR's public course library. */
export const searchDgcr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        query: z.string().trim().min(2).max(120),
        limit: z.number().int().min(1).max(15).optional(),
      })
      .parse(raw),
  )
  .handler(
    async ({ data, context }): Promise<{ hits: (DgcrSearchHit & { imported: boolean })[] }> => {
      const { searchDgcrCourses, mergeDuplicateDgcrHits } = await import("@/lib/dgcr.server");
      const hits = await searchDgcrCourses(data.query, data.limit ?? 8);
      if (hits.length === 0) return { hits: [] };

      const { data: existing } = await context.supabase
        .from("dgcr_courses")
        .select("dgcr_id")
        .in(
          "dgcr_id",
          hits.map((h) => h.dgcr_id),
        );
      const known = new Set((existing ?? []).map((r) => r.dgcr_id));
      const flagged = hits.map((h) => ({ ...h, imported: known.has(h.dgcr_id) }));
      return { hits: mergeDuplicateDgcrHits(flagged) };
    },
  );

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

/**
 * Scrapes a DGCR course page, caches it, and optionally links or creates the
 * matching DG Dashboard course.
 */
export const importDgcrCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        url: z
          .string()
          .url()
          .max(300)
          // Only Disc Golf Course Review course pages may be fetched — the check
          // must happen before any outbound request (SSRF / scraper abuse).
          .refine(
            (u) => /^https?:\/\/(www\.)?dgcoursereview\.com\/courses\/[a-z0-9-]+\.\d+/i.test(u),
            {
              message: "Enter a Disc Golf Course Review course URL",
            },
          ),
        courseId: z.string().uuid().nullish(),
        createCourse: z.boolean().optional(),
      })
      .parse(raw),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ profile: DgcrCourseRow; courseId: string | null; createdCourse: boolean }> => {
      const { fetchDgcrCourse } = await import("@/lib/dgcr.server");
      const record = await fetchDgcrCourse(data.url);

      let courseId = data.courseId ?? null;
      let createdCourse = false;

      // Reuse an already linked course when this page was imported before.
      if (!courseId) {
        const { data: prior } = await context.supabase
          .from("dgcr_courses")
          .select("course_id")
          .eq("dgcr_id", record.dgcr_id)
          .maybeSingle();
        courseId = prior?.course_id ?? null;
      }

      // Try to match an existing course before creating one. Uses the shared
      // duplicate lookup so DGCR imports never fork a second copy of a venue.
      if (!courseId) {
        const { data: dupes } = await context.supabase.rpc("find_duplicate_courses", {
          _name: record.name,
          _city: record.city ?? undefined,
          _state: record.state ?? undefined,
          _lat: record.latitude ?? undefined,
          _lng: record.longitude ?? undefined,
        });
        courseId = (dupes as { id: string }[] | null)?.[0]?.id ?? null;
      }

      if (!courseId && data.createCourse) {
        const { data: created, error } = await context.supabase
          .from("courses")
          .insert({
            name: record.name,
            slug: `${slugify(record.name)}-${record.dgcr_id}`,
            city: record.city,
            state: record.state,
            country: record.country,
            postal_code: record.postal_code,
            latitude: record.latitude,
            longitude: record.longitude,
            description: record.description,
            hole_count: record.hole_count ?? 18,
            hole_count_verified: Boolean(record.hole_count),
            created_by: context.userId,
            source: "dgcr",
            source_ref: record.dgcr_id,
            enrichment_source: "dgcr",
            enriched_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (error) throw new Error(`Could not add that course: ${error.message}`);
        courseId = created.id;
        createdCourse = true;
      }

      // Scraped course-review rows are shared platform data: members may no
      // longer write them directly (RLS limits writes to admins). The write
      // happens server-side with trusted credentials, and only with the
      // record the scraper just produced — never a client-supplied payload.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: saved, error: saveError } = await supabaseAdmin
        .from("dgcr_courses")
        .upsert(
          { ...record, course_id: courseId, fetched_at: new Date().toISOString() },
          { onConflict: "dgcr_id" },
        )
        .select(DGCR_COLUMNS)
        .single();
      if (saveError)
        throw new Error(`Could not save that course review data: ${saveError.message}`);

      if (courseId) {
        await context.supabase.from("course_sources").upsert(
          {
            course_id: courseId,
            source: "dgcr",
            matched_name: record.name,
            canonical_url: record.url,
            confidence: 1,
            last_fetched_at: new Date().toISOString(),
            last_error: null,
          },
          { onConflict: "course_id,source" },
        );

        // Fill only gaps on the DG Dashboard course; never overwrite curated data.
        const { data: course } = await context.supabase
          .from("courses")
          .select(
            "id,city,state,country,postal_code,latitude,longitude,description,hole_count,hole_count_verified",
          )
          .eq("id", courseId)
          .maybeSingle();
        if (course) {
          const patch: {
            city?: string;
            state?: string;
            country?: string;
            postal_code?: string;
            latitude?: number;
            longitude?: number;
            description?: string;
            hole_count?: number;
            hole_count_verified?: boolean;
            enrichment_source?: string;
            enriched_at?: string;
          } = {};
          if (!course.city && record.city) patch.city = record.city;
          if (!course.state && record.state) patch.state = record.state;
          if (!course.country && record.country) patch.country = record.country;
          if (!course.postal_code && record.postal_code) patch.postal_code = record.postal_code;
          if (course.latitude == null && record.latitude != null) patch.latitude = record.latitude;
          if (course.longitude == null && record.longitude != null)
            patch.longitude = record.longitude;
          if (!course.description && record.description) patch.description = record.description;
          if (!course.hole_count_verified && record.hole_count) {
            patch.hole_count = record.hole_count;
            patch.hole_count_verified = true;
          }
          if (Object.keys(patch).length > 0) {
            patch.enrichment_source = "dgcr";
            patch.enriched_at = new Date().toISOString();
            await context.supabase.from("courses").update(patch).eq("id", courseId);
          }
        }
      }

      return { profile: saved as unknown as DgcrCourseRow, courseId, createdCourse };
    },
  );

/** Returns the cached DGCR profile for a DG Dashboard course, if one is linked. */
export const getDgcrProfileForCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ courseId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }): Promise<{ profile: DgcrCourseRow | null }> => {
    const { data: row } = await context.supabase
      .from("dgcr_courses")
      .select(DGCR_COLUMNS)
      .eq("course_id", data.courseId)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { profile: (row as unknown as DgcrCourseRow) ?? null };
  });

/** Finds and links the best DGCR match for an existing course automatically. */
export const autoMatchDgcrCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ courseId: z.string().uuid() }).parse(raw))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ profile: DgcrCourseRow | null; matchedUrl: string | null }> => {
      const { data: course } = await context.supabase
        .from("courses")
        .select("id,name,city,state")
        .eq("id", data.courseId)
        .maybeSingle();
      if (!course) throw new Error("That course could not be found.");

      const { searchDgcrCourses, fetchDgcrCourse } = await import("@/lib/dgcr.server");
      const query = [course.name, course.city, course.state].filter(Boolean).join(" ");
      const hits = await searchDgcrCourses(query, 3);
      if (hits.length === 0) return { profile: null, matchedUrl: null };

      const record = await fetchDgcrCourse(hits[0].url);
      const { data: saved, error } = await context.supabase
        .from("dgcr_courses")
        .upsert(
          { ...record, course_id: data.courseId, fetched_at: new Date().toISOString() },
          { onConflict: "dgcr_id" },
        )
        .select(DGCR_COLUMNS)
        .single();
      if (error) throw new Error(`Could not save that course review data: ${error.message}`);

      await context.supabase.from("course_sources").upsert(
        {
          course_id: data.courseId,
          source: "dgcr",
          matched_name: record.name,
          canonical_url: record.url,
          confidence: 0.8,
          last_fetched_at: new Date().toISOString(),
          last_error: null,
        },
        { onConflict: "course_id,source" },
      );

      return { profile: saved as unknown as DgcrCourseRow, matchedUrl: record.url };
    },
  );

/**
 * Links course-review profiles for courses in the library that don't have one yet.
 * Runs in small batches so a single click stays fast and predictable.
 */
export const bulkMatchDgcrCourses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ limit: z.number().int().min(1).max(10).optional() }).parse(raw),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ matched: number; skipped: number; remaining: number; names: string[] }> => {
      const limit = data.limit ?? 5;

      const { data: linked } = await context.supabase.from("dgcr_courses").select("course_id");
      const linkedIds = new Set((linked ?? []).map((r) => r.course_id).filter(Boolean) as string[]);

      const { data: courses } = await context.supabase
        .from("courses")
        .select("id,name,city,state")
        .eq("is_ghost", false)
        .order("created_at", { ascending: false })
        .limit(200);

      const pending = (courses ?? []).filter((c) => !linkedIds.has(c.id));
      const batch = pending.slice(0, limit);

      const { searchDgcrCourses, fetchDgcrCourse } = await import("@/lib/dgcr.server");
      // Shared scraped rows are written with trusted server credentials.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const names: string[] = [];
      let skipped = 0;

      for (const course of batch) {
        try {
          const query = [course.name, course.city, course.state].filter(Boolean).join(" ");
          const hits = await searchDgcrCourses(query, 2);
          if (hits.length === 0) {
            skipped += 1;
            continue;
          }
          const record = await fetchDgcrCourse(hits[0].url);
          const { error } = await supabaseAdmin
            .from("dgcr_courses")
            .upsert(
              { ...record, course_id: course.id, fetched_at: new Date().toISOString() },
              { onConflict: "dgcr_id" },
            );
          if (error) {
            skipped += 1;
            continue;
          }
          await context.supabase.from("course_sources").upsert(
            {
              course_id: course.id,
              source: "dgcr",
              matched_name: record.name,
              canonical_url: record.url,
              confidence: 0.7,
              last_fetched_at: new Date().toISOString(),
              last_error: null,
            },
            { onConflict: "course_id,source" },
          );
          names.push(course.name);
        } catch (err) {
          console.error("DGCR bulk match failed", course.id, err);
          skipped += 1;
        }
      }

      return {
        matched: names.length,
        skipped,
        remaining: Math.max(0, pending.length - batch.length),
        names,
      };
    },
  );

/** Returns every cached course-review profile for the explorer dashboard. */
export const listDgcrCourses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: DgcrCourseRow[] }> => {
    const { data } = await context.supabase
      .from("dgcr_courses")
      .select(DGCR_COLUMNS)
      .order("rating", { ascending: false, nullsFirst: false })
      .limit(1000);
    return { rows: (data as unknown as DgcrCourseRow[]) ?? [] };
  });
