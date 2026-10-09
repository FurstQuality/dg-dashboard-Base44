/**
 * Admin-only bulk course ingest. Pulls open OpenStreetMap course data into the
 * course library so the directory covers the whole country, then lets the
 * existing DGCR / PDGA enrichment fill in ratings, reviews and layouts.
 */
import { normalizeStateCode } from "@/lib/us-states";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { courseMatchKey, sameVenueCoords } from "@/lib/course-match";

export type ImportResult = {
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
  state: string;
};

const ImportInput = z.object({
  state: z.string().trim().length(2),
});

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "super_admin",
  });
  if (!data) throw new Error("Only admins can run a bulk course import.");
}

/** Import (or refresh) every mapped course in a US state. */
export const importOsmCoursesForState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ImportInput.parse(raw))
  .handler(async ({ data, context }): Promise<ImportResult> => {
    await assertAdmin(context);
    const { fetchOsmCoursesForState, slugify } = await import("@/lib/course-import.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const state = data.state.toUpperCase();
    const found = await fetchOsmCoursesForState(state);
    if (found.length === 0) return { scanned: 0, created: 0, updated: 0, skipped: 0, state };

    const refs = found.map((c) => `${c.osm_type}:${c.osm_id}`);
    const { data: bySource } = await supabaseAdmin
      .from("courses")
      .select("id, source_ref")
      .eq("source", "osm")
      .in("source_ref", refs);
    const knownRefs = new Set((bySource ?? []).map((r) => r.source_ref as string));

    const { data: byName } = await supabaseAdmin
      .from("courses")
      .select("id, name, city, state, latitude, longitude, source, source_ref")
      .eq("state", state);
    type KnownCourse = {
      id: string;
      source: string | null;
      latitude: number | null;
      longitude: number | null;
      key: string;
      city: string | null;
    };
    const known: KnownCourse[] = (byName ?? []).map((row) => ({
      id: row.id as string,
      source: (row.source as string) ?? null,
      latitude: (row.latitude as number) ?? null,
      longitude: (row.longitude as number) ?? null,
      key: courseMatchKey(row.name as string),
      city: (row.city as string) ?? null,
    }));
    const findExisting = (
      name: string,
      city: string | null,
      lat: number | null,
      lng: number | null,
    ) => {
      const key = courseMatchKey(name);
      if (key.length <= 3) return undefined;
      const sameKey = known.filter((k) => k.key === key);
      if (!sameKey.length) return undefined;
      return (
        sameKey.find(
          (k) => (k.city ?? "").trim().toLowerCase() === (city ?? "").trim().toLowerCase(),
        ) ?? sameKey.find((k) => sameVenueCoords(k.latitude, k.longitude, lat, lng))
      );
    };

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const course of found) {
      const ref = `${course.osm_type}:${course.osm_id}`;
      if (knownRefs.has(ref)) {
        skipped += 1;
        continue;
      }
      const existing = findExisting(course.name, course.city, course.latitude, course.longitude);
      if (existing) {
        // Same course already in the library from another source — enrich it
        // rather than creating a duplicate entry.
        const needsCoords = existing.latitude == null;
        const { error } = await supabaseAdmin
          .from("courses")
          .update({
            enriched_at: new Date().toISOString(),
            enrichment_source: "osm",
            ...(needsCoords ? { latitude: course.latitude, longitude: course.longitude } : {}),
          })
          .eq("id", existing.id);
        if (!error) updated += 1;
        else skipped += 1;
        continue;
      }

      const base = slugify(course.name);
      const slug = `${base}-${course.osm_id.toString(36)}`;
      const { error } = await supabaseAdmin.from("courses").insert({
        name: course.name,
        slug,
        description: course.description,
        city: course.city,
        state: normalizeStateCode(course.state ?? state) ?? course.state ?? state,
        country: course.country,
        postal_code: course.postal_code,
        latitude: course.latitude,
        longitude: course.longitude,
        hole_count: course.hole_count ?? 18,
        hole_count_verified: course.hole_count != null,
        created_by: context.userId,
        moderation_status: "approved",
        source: "osm",
        source_ref: ref,
        enriched_at: new Date().toISOString(),
        enrichment_source: "osm",
      });
      if (error) skipped += 1;
      else created += 1;
    }

    await supabaseAdmin.from("data_ingest_jobs").insert({
      user_id: context.userId,
      kind: "osm_courses_state_import",
      status: "completed",
      result: { state, scanned: found.length, created, updated, skipped },
    });

    return { scanned: found.length, created, updated, skipped, state };
  });

export const US_STATES: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];
