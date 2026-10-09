/**
 * Fills the city, state, and country of directory events that arrived with map
 * coordinates but no readable place.
 *
 * The PDGA "upcoming events" feed is a map: every listing carries real
 * coordinates and nothing else about where it is. Rather than leave those
 * listings with a blank location — or guess one from the event name — each
 * point is resolved once against OpenStreetMap and remembered in
 * `public.geo_place_cache` under a rounded-coordinate key, so a venue is only
 * ever looked up a single time.
 *
 * Server-only: reads and writes the shared cache with the service-role client.
 */

/** Points resolved per pass, so one run never hammers the public geocoder. */
const MAX_NEW_LOOKUPS = 60;
/** OpenStreetMap asks for no more than one lookup per second. */
const LOOKUP_DELAY_MS = 1100;

export type ReversePlace = {
  city: string | null;
  state: string | null;
  country: string | null;
};

/** Cache key for a point. ~110 m of precision, which keeps venues distinct. */
export function pointKey(latitude: number, longitude: number): string {
  return `rev:${latitude.toFixed(3)},${longitude.toFixed(3)}`;
}

/** Encode a resolved place for the cache's single `label` column. */
export function encodePlace(place: ReversePlace): string {
  return [place.city ?? "", place.state ?? "", place.country ?? ""].join("|");
}

/** Read a place back out of the cache label. Returns null when nothing is known. */
export function decodePlace(label: string | null): ReversePlace | null {
  if (!label) return null;
  const [city, state, country] = label.split("|");
  const place = { city: city || null, state: state || null, country: country || null };
  return place.city || place.state || place.country ? place : null;
}

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country?: string;
  country_code?: string;
};

/** Turn an OpenStreetMap address into the fields the directory stores. */
export function placeFromAddress(address: NominatimAddress): ReversePlace {
  const city =
    address.city ??
    address.town ??
    address.village ??
    address.hamlet ??
    address.municipality ??
    address.county ??
    null;
  return {
    city: city ? city.replace(/\s+(County|Parish|Borough)$/i, "").trim() || null : null,
    state: address.state ?? null,
    country: address.country ?? null,
  };
}

/** Look up one point against OpenStreetMap. Returns null when it can't be read. */
async function reverseGeocode(latitude: number, longitude: number): Promise<ReversePlace | null> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1` +
    `&lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "DGDashboard/1.0 (disc golf event directory; contact@dgdashboard.app)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { address?: NominatimAddress };
    if (!json.address) return null;
    const place = placeFromAddress(json.address);
    return place.city || place.state || place.country ? place : null;
  } catch {
    return null;
  }
}

type Point = { latitude: number; longitude: number };

/**
 * Resolve a batch of points into places, reading the shared cache first and
 * looking up only what has never been attempted.
 */
async function resolvePlaces(
  points: Point[],
): Promise<{ known: Map<string, ReversePlace | null>; lookedUp: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const keys = Array.from(new Set(points.map((p) => pointKey(p.latitude, p.longitude))));
  const known = new Map<string, ReversePlace | null>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data: cached } = await supabaseAdmin
      .from("geo_place_cache")
      .select("place, label")
      .in("place", keys.slice(i, i + 200));
    for (const row of (cached ?? []) as Array<{ place: string; label: string | null }>) {
      known.set(row.place, decodePlace(row.label));
    }
  }

  const missing = keys.filter((key) => !known.has(key)).slice(0, MAX_NEW_LOOKUPS);
  let lookedUp = 0;
  for (const key of missing) {
    const point = points.find((p) => pointKey(p.latitude, p.longitude) === key);
    if (!point) continue;
    const place = await reverseGeocode(point.latitude, point.longitude);
    known.set(key, place);
    lookedUp += 1;
    await supabaseAdmin.from("geo_place_cache").upsert(
      {
        place: key,
        latitude: point.latitude,
        longitude: point.longitude,
        label: place ? encodePlace(place) : "",
      } as never,
      { onConflict: "place" },
    );
    if (key !== missing[missing.length - 1]) {
      await new Promise((resolve) => setTimeout(resolve, LOOKUP_DELAY_MS));
    }
  }
  return { known, lookedUp };
}

/**
 * Give a readable location to stored events that only have coordinates.
 * Idempotent: rows already carrying a city are skipped, and points already
 * attempted are read from the cache instead of looked up again.
 */
export async function backfillDirectoryPlaces(limit = 400): Promise<{
  examined: number;
  named: number;
  lookedUp: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { normalizeStateCode } = await import("@/lib/us-states");

  const { data } = await supabaseAdmin
    .from("event_directory")
    .select("id, latitude, longitude, city, state, country")
    // A blank string is as unreadable as a missing town, so both qualify.
    .or("city.is.null,city.eq.")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .order("start_date", { ascending: true })
    .limit(limit);

  const rows = (data ?? []) as Array<{
    id: string;
    latitude: number;
    longitude: number;
    city: string | null;
    state: string | null;
    country: string | null;
  }>;
  if (!rows.length) return { examined: 0, named: 0, lookedUp: 0 };

  const { known, lookedUp } = await resolvePlaces(rows);

  let named = 0;
  for (const row of rows) {
    const place = known.get(pointKey(row.latitude, row.longitude));
    // Without a town there is nothing to name: leave the row honest and skip the
    // write so the same coordinates are not patched again on every pass.
    if (!place?.city) continue;
    const stateCode = place.state ? normalizeStateCode(place.state) : null;
    const patch: Record<string, string> = { city: place.city };
    // US venues store the two-letter code so they match the state filters used
    // across the app; elsewhere the region name is kept as published.
    if (place.state) patch.state = stateCode ?? place.state;
    if (place.country) patch.country = place.country;
    const { error } = await supabaseAdmin
      .from("event_directory")
      .update(patch as never)
      .eq("id", row.id);
    if (!error) named += 1;
  }

  return { examined: rows.length, named, lookedUp };
}

/**
 * Same pass for the course library: a course that carries a map pin but no town
 * is hard to search for and impossible to tell apart from a same-named course
 * in another state.
 */
export async function backfillCoursePlaces(limit = 300): Promise<{
  examined: number;
  named: number;
  lookedUp: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { normalizeStateCode } = await import("@/lib/us-states");

  const { data } = await supabaseAdmin
    .from("courses")
    .select("id, latitude, longitude, city, state")
    .or("city.is.null,city.eq.")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .limit(limit);

  const rows = (data ?? []) as Array<{
    id: string;
    latitude: number;
    longitude: number;
    city: string | null;
    state: string | null;
  }>;
  if (!rows.length) return { examined: 0, named: 0, lookedUp: 0 };

  const { known, lookedUp } = await resolvePlaces(rows);
  let named = 0;
  for (const row of rows) {
    const place = known.get(pointKey(row.latitude, row.longitude));
    if (!place?.city) continue;
    const patch: Record<string, string> = { city: place.city };
    if (place.state && !row.state) patch.state = normalizeStateCode(place.state) ?? place.state;
    const { error } = await supabaseAdmin
      .from("courses")
      .update(patch as never)
      .eq("id", row.id);
    if (!error) named += 1;
  }

  return { examined: rows.length, named, lookedUp };
}

/**
 * Boxes that cover the United States and its territories. A point outside all of
 * them cannot be a US event, whatever the feed claimed.
 */
const US_BOXES: Array<{ minLat: number; maxLat: number; minLon: number; maxLon: number }> = [
  { minLat: 24.3, maxLat: 49.6, minLon: -125.1, maxLon: -66.8 }, // contiguous
  { minLat: 51.0, maxLat: 71.5, minLon: -180, maxLon: -129.0 }, // Alaska
  { minLat: 18.8, maxLat: 22.3, minLon: -160.3, maxLon: -154.7 }, // Hawaii
  { minLat: 17.6, maxLat: 18.6, minLon: -67.4, maxLon: -64.5 }, // Puerto Rico / USVI
  { minLat: 13.2, maxLat: 15.4, minLon: 144.5, maxLon: 146.1 }, // Guam / N. Marianas
];

/**
 * True when a point sits inside the United States or one of its territories.
 * Boxes cannot separate the US from its land neighbours, so a point in southern
 * Canada or northern Mexico reads as inside; those rows are caught instead by
 * the missing-region check in `correctMislabeledCountries`.
 */
export function isInUnitedStates(latitude: number, longitude: number): boolean {
  return US_BOXES.some(
    (box) =>
      latitude >= box.minLat &&
      latitude <= box.maxLat &&
      longitude >= box.minLon &&
      longitude <= box.maxLon,
  );
}

/**
 * Correct events the feeds labelled "United States" whose map pin is plainly
 * somewhere else. The PDGA upcoming feed carries no country of its own, so the
 * ingest default lands on every overseas listing — which then sorts and filters
 * as if it were a domestic event. The coordinates are the trustworthy part, so
 * those rows are resolved against OpenStreetMap and the real country, region and
 * town are written back.
 */
export async function correctMislabeledCountries(limit = 300): Promise<{
  examined: number;
  corrected: number;
  lookedUp: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data } = await supabaseAdmin
    .from("event_directory")
    .select("id, latitude, longitude, city, state, country")
    .eq("country", "United States")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .order("start_date", { ascending: true })
    .limit(limit * 4);

  const candidates = (
    (data ?? []) as Array<{
      id: string;
      latitude: number;
      longitude: number;
      city: string | null;
      state: string | null;
      country: string | null;
    }>
  )
    // Either the pin is plainly overseas, or the row carries no state at all —
    // every genuine US listing has one, so a blank region means the country was
    // never confirmed either (this is what catches near-border listings).
    .filter((row) => !isInUnitedStates(row.latitude, row.longitude) || !(row.state ?? "").trim())
    .slice(0, limit);
  if (!candidates.length) return { examined: 0, corrected: 0, lookedUp: 0 };

  const { known, lookedUp } = await resolvePlaces(candidates);

  let corrected = 0;
  for (const row of candidates) {
    const place = known.get(pointKey(row.latitude, row.longitude));
    // No confirmed country means no correction: an unresolved point stays as it
    // is rather than being relabelled on a guess.
    if (!place?.country) continue;
    const patch: Record<string, string> = { country: place.country };
    if (place.state) patch.state = place.state;
    if (place.city) patch.city = place.city;
    const { error } = await supabaseAdmin
      .from("event_directory")
      .update(patch as never)
      .eq("id", row.id);
    if (!error) corrected += 1;
  }

  return { examined: candidates.length, corrected, lookedUp };
}
