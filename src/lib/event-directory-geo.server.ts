/**
 * Fills map coordinates on directory events.
 *
 * Scraped listings only carry a city and state, so distance filters had nothing
 * to work with. Each city/state pair is resolved once and remembered in
 * `public.geo_place_cache`, then reused by every later sweep.
 *
 * Server-only: reads and writes the shared cache with the service-role client.
 */

import type { DirectoryEventInput } from "@/lib/event-directory-parse";

/** New places resolved per sweep, so one pass never hammers the geocoder. */
const MAX_NEW_LOOKUPS = 120;
const LOOKUP_CONCURRENCY = 4;

/** Cache key for a place. Falls back to the country when no US state is known. */
export function placeKey(city: string | null, region: string | null): string | null {
  const text = [city, region].filter(Boolean).join(", ").trim();
  return text.length > 1 ? text.toLowerCase() : null;
}

type CachedPlace = { latitude: number; longitude: number };

/**
 * Attach latitude/longitude to every row we can place, resolving unknown cities
 * through the geocoder and caching the result.
 */
export async function attachDirectoryCoords(
  rows: DirectoryEventInput[],
): Promise<DirectoryEventInput[]> {
  const needed = new Set<string>();
  for (const row of rows) {
    if (typeof row.latitude === "number" && typeof row.longitude === "number") continue;
    const key = placeKey(row.city, row.state ?? row.country);
    if (key) needed.add(key);
  }
  if (!needed.size) return rows;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const keys = Array.from(needed);
  const known = new Map<string, CachedPlace>();
  // Places already looked up, including ones the geocoder could not resolve, so
  // unresolvable cities never crowd out the lookup budget on every sweep.
  const attempted = new Set<string>();

  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await supabaseAdmin
      .from("geo_place_cache")
      .select("place, latitude, longitude")
      .in("place", keys.slice(i, i + 200));
    for (const row of (data ?? []) as Array<{
      place: string;
      latitude: number | null;
      longitude: number | null;
    }>) {
      attempted.add(row.place);
      if (typeof row.latitude === "number" && typeof row.longitude === "number") {
        known.set(row.place, { latitude: row.latitude, longitude: row.longitude });
      }
    }
  }

  const missing = keys.filter((key) => !attempted.has(key)).slice(0, MAX_NEW_LOOKUPS);
  if (missing.length) {
    const { geocodePlace } = await import("@/lib/geocode.server");
    const resolved: Array<{
      place: string;
      latitude: number | null;
      longitude: number | null;
      label: string | null;
    }> = [];

    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(LOOKUP_CONCURRENCY, missing.length) }, async () => {
        while (cursor < missing.length) {
          const key = missing[cursor++];
          const hit = await geocodePlace(key);
          if (!hit) {
            resolved.push({ place: key, latitude: null, longitude: null, label: null });
            continue;
          }
          known.set(key, { latitude: hit.latitude, longitude: hit.longitude });
          resolved.push({
            place: key,
            latitude: hit.latitude,
            longitude: hit.longitude,
            label: hit.name,
          });
        }
      }),
    );

    if (resolved.length) {
      await supabaseAdmin
        .from("geo_place_cache")
        .upsert(resolved as never, { onConflict: "place" });
    }
  }

  return rows.map((row) => {
    if (typeof row.latitude === "number" && typeof row.longitude === "number") return row;
    const key = placeKey(row.city, row.state ?? row.country);
    const hit = key ? known.get(key) : null;
    return hit ? { ...row, latitude: hit.latitude, longitude: hit.longitude } : row;
  });
}

/**
 * Place saved directory events that still have no coordinates. Sweeps only
 * touch the events they refetch, so stored rows from earlier scopes would
 * otherwise stay unplaced and drop out of every distance filter.
 *
 * Rows that resolve to the same city share one write, so a full pass is a
 * handful of statements instead of one per event.
 */
export async function backfillMissingDirectoryCoords(limit = 600): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("event_directory")
    .select("id, city, state, country")
    .is("latitude", null)
    .not("city", "is", null)
    .limit(limit);

  const rows = (data ?? []) as Array<{
    id: string;
    city: string | null;
    state: string | null;
    country: string | null;
  }>;
  if (!rows.length) return 0;

  const placed = await attachDirectoryCoords(
    rows.map((r) => ({
      ...emptyGeoRow(),
      city: r.city,
      state: r.state,
      country: r.country,
    })),
  );

  // Group by coordinate pair: one update per city instead of one per event.
  const groups = new Map<string, { latitude: number; longitude: number; ids: string[] }>();
  for (let i = 0; i < rows.length; i += 1) {
    const coords = placed[i];
    if (coords.latitude == null || coords.longitude == null) continue;
    const key = `${coords.latitude},${coords.longitude}`;
    const group = groups.get(key) ?? {
      latitude: coords.latitude,
      longitude: coords.longitude,
      ids: [],
    };
    group.ids.push(rows[i].id);
    groups.set(key, group);
  }

  let updated = 0;
  for (const group of groups.values()) {
    for (let i = 0; i < group.ids.length; i += 200) {
      const ids = group.ids.slice(i, i + 200);
      const { error } = await supabaseAdmin
        .from("event_directory")
        .update({ latitude: group.latitude, longitude: group.longitude } as never)
        .in("id", ids);
      if (!error) updated += ids.length;
    }
  }
  return updated;
}

/** Minimal row shape for coordinate resolution only. */
function emptyGeoRow(): DirectoryEventInput {
  return {
    source: "pdga",
    source_event_id: "",
    url: null,
    name: "",
    kind: "tournament",
    tier: null,
    sanctioning: null,
    start_date: null,
    end_date: null,
    venue_name: null,
    city: null,
    state: null,
    country: null,
    latitude: null,
    longitude: null,
    registration_status: null,
    field_size: null,
    field_capacity: null,
    cover_url: null,
    pdga_event_ref: null,
    discovered_via: "backfill",
  };
}
