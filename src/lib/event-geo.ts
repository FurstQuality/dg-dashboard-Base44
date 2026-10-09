/**
 * Placing events on the map for distance filtering.
 *
 * Event listings from PDGA, UDisc and Disc Golf Scene only carry a free-text
 * location ("Emporia, KS", "Iron Horse Park — Bloomington, IN"). To answer
 * "within N miles of me" we resolve that text to coordinates using, in order:
 *   1. an exact "city, state" match against course coordinates already in the
 *      database (accurate, since courses are where events are played), then
 *   2. the state centroid, which is coarse but keeps a real listing from
 *      disappearing just because its city is unknown to us.
 */
import { normalizeStateCode, stateCodeFromName } from "@/lib/us-states";
import { haversineMiles } from "@/lib/play-geo";

export type LatLng = { lat: number; lng: number };

/** Approximate geographic centre of each US state / DC. */
export const US_STATE_CENTROIDS: Record<string, LatLng> = {
  AL: { lat: 32.79, lng: -86.83 },
  AK: { lat: 64.0, lng: -152.0 },
  AZ: { lat: 34.17, lng: -111.93 },
  AR: { lat: 34.9, lng: -92.44 },
  CA: { lat: 37.18, lng: -119.47 },
  CO: { lat: 38.998, lng: -105.55 },
  CT: { lat: 41.62, lng: -72.73 },
  DE: { lat: 38.99, lng: -75.5 },
  DC: { lat: 38.9, lng: -77.02 },
  FL: { lat: 28.63, lng: -82.45 },
  GA: { lat: 32.65, lng: -83.44 },
  HI: { lat: 20.29, lng: -156.37 },
  ID: { lat: 44.39, lng: -114.66 },
  IL: { lat: 40.04, lng: -89.2 },
  IN: { lat: 39.91, lng: -86.28 },
  IA: { lat: 42.07, lng: -93.5 },
  KS: { lat: 38.49, lng: -98.38 },
  KY: { lat: 37.53, lng: -85.29 },
  LA: { lat: 31.07, lng: -91.96 },
  ME: { lat: 45.37, lng: -69.24 },
  MD: { lat: 39.04, lng: -76.78 },
  MA: { lat: 42.26, lng: -71.81 },
  MI: { lat: 44.35, lng: -85.41 },
  MN: { lat: 46.32, lng: -94.31 },
  MS: { lat: 32.74, lng: -89.68 },
  MO: { lat: 38.36, lng: -92.48 },
  MT: { lat: 47.05, lng: -109.63 },
  NE: { lat: 41.53, lng: -99.81 },
  NV: { lat: 39.35, lng: -116.63 },
  NH: { lat: 43.68, lng: -71.58 },
  NJ: { lat: 40.19, lng: -74.67 },
  NM: { lat: 34.41, lng: -106.11 },
  NY: { lat: 42.95, lng: -75.53 },
  NC: { lat: 35.56, lng: -79.39 },
  ND: { lat: 47.45, lng: -100.47 },
  OH: { lat: 40.29, lng: -82.79 },
  OK: { lat: 35.59, lng: -97.49 },
  OR: { lat: 43.94, lng: -120.56 },
  PA: { lat: 40.87, lng: -77.8 },
  RI: { lat: 41.68, lng: -71.56 },
  SC: { lat: 33.92, lng: -80.9 },
  SD: { lat: 44.44, lng: -100.23 },
  TN: { lat: 35.86, lng: -86.35 },
  TX: { lat: 31.4, lng: -99.3 },
  UT: { lat: 39.3, lng: -111.68 },
  VT: { lat: 44.07, lng: -72.67 },
  VA: { lat: 37.52, lng: -78.85 },
  WA: { lat: 47.38, lng: -120.45 },
  WV: { lat: 38.64, lng: -80.62 },
  WI: { lat: 44.62, lng: -89.99 },
  WY: { lat: 42.99, lng: -107.55 },
};

export type PlaceIndex = Map<string, LatLng>;

const cityKey = (city: string, state: string) =>
  `${city.trim().toLowerCase().replace(/\s+/g, " ")}|${state.toUpperCase()}`;

/** Build a "city|ST" → coordinate index from course rows. */
export function buildPlaceIndex(
  rows: Array<{
    city: string | null;
    state: string | null;
    latitude: number | null;
    longitude: number | null;
  }>,
): PlaceIndex {
  const index: PlaceIndex = new Map();
  for (const row of rows) {
    if (!row.city || typeof row.latitude !== "number" || typeof row.longitude !== "number") continue;
    const code = normalizeStateCode(row.state);
    if (!code) continue;
    const key = cityKey(row.city, code);
    if (!index.has(key)) index.set(key, { lat: row.latitude, lng: row.longitude });
  }
  return index;
}

/** Pull "City, ST" out of a free-text event location. */
export function parseCityState(location: string | null): { city: string; state: string } | null {
  if (!location) return null;
  // Venue prefixes are separated by an em/en dash or a bullet.
  const tail = location.split(/[—–|·]/).pop() ?? location;
  const parts = tail
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  // Trailing-word forms first ("… , Peoria IL" / "Peoria Illinois"), so the city
  // sitting next to the state code wins over an upstream venue name.
  for (let i = parts.length - 1; i >= 0; i--) {
    const words = parts[i].split(/\s+/).filter(Boolean);
    for (const take of [1, 2]) {
      if (words.length <= take) continue;
      const candidate = words.slice(words.length - take).join(" ");
      const code = normalizeStateCode(candidate) ?? stateCodeFromName(candidate) ?? null;
      if (!code) continue;
      const city = words
        .slice(0, words.length - take)
        .join(" ")
        .replace(/[-–—]$/, "")
        .trim();
      return { city, state: code };
    }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const code = normalizeStateCode(parts[i]) ?? stateCodeFromName(parts[i]) ?? null;
    if (code) return { city: i > 0 ? parts[i - 1] : "", state: code };
  }

  return null;

}

/**
 * Countries and Canadian/European regions that show up in synced listings.
 * A listing whose location names one of these is definitely not near a US
 * player, so the distance filter can drop it instead of showing it "unplaced".
 */
const NON_US_HINTS = [
  "canada",
  "ontario",
  "quebec",
  "québec",
  "british columbia",
  "alberta",
  "manitoba",
  "saskatchewan",
  "nova scotia",
  "new brunswick",
  "newfoundland",
  "latvia",
  "latvija",
  "sweden",
  "sverige",
  "finland",
  "suomi",
  "norway",
  "norge",
  "denmark",
  "danmark",
  "estonia",
  "eesti",
  "lithuania",
  "germany",
  "deutschland",
  "netherlands",
  "belgium",
  "france",
  "spain",
  "portugal",
  "italy",
  "poland",
  "czech",
  "austria",
  "switzerland",
  "united kingdom",
  "england",
  "scotland",
  "wales",
  "ireland",
  "iceland",
  "australia",
  "new zealand",
  "japan",
  "mexico",
  "brazil",
  "colombia",
  "south africa",
];

/** True when an event's free-text location clearly sits outside the US. */
export function isOutsideUnitedStates(location: string | null): boolean {
  if (!location) return false;
  const text = location.toLowerCase();
  return NON_US_HINTS.some((hint) => text.includes(hint));
}


/** Resolve an event location to coordinates, city-accurate when possible. */
export function resolveEventLocation(
  location: string | null,
  index: PlaceIndex,
): { coords: LatLng; precision: "city" | "state" } | null {
  const parsed = parseCityState(location);
  if (!parsed) return null;
  if (parsed.city) {
    const hit = index.get(cityKey(parsed.city, parsed.state));
    if (hit) return { coords: hit, precision: "city" };
  }
  const centroid = US_STATE_CENTROIDS[parsed.state];
  if (centroid) return { coords: centroid, precision: "state" };
  return null;
}

/** Distance plus how precisely we could place the event. */
export function eventPlacement(
  location: string | null,
  origin: LatLng,
  index: PlaceIndex,
): { miles: number; precision: "city" | "state"; state: string } | null {
  const parsed = parseCityState(location);
  if (!parsed) return null;
  const resolved = resolveEventLocation(location, index);
  if (!resolved) return null;
  return {
    miles: Math.round(haversineMiles(origin, resolved.coords) * 10) / 10,
    precision: resolved.precision,
    state: parsed.state,
  };
}

/**
 * Distance from explicit event coordinates. App-created events store their own
 * latitude/longitude, so they never depend on parsing a free-text location.
 */
export function coordPlacement(
  lat: number | null | undefined,
  lng: number | null | undefined,
  origin: LatLng,
): { miles: number; precision: "city"; state: string } | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return {
    miles: Math.round(haversineMiles(origin, { lat, lng }) * 10) / 10,
    precision: "city",
    state: "",
  };
}
