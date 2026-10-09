/**
 * Server-only helpers for bulk course discovery from OpenStreetMap.
 *
 * OSM is an open, license-clean base layer for course coverage: it supplies a
 * name, coordinates and (often) hole count, city and website. Deeper detail —
 * ratings, reviews, layouts, SSE — is layered on afterwards by the DGCR and
 * PDGA enrichment paths.
 */

export type OsmCourse = {
  osm_type: string;
  osm_id: number;
  name: string;
  latitude: number;
  longitude: number;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string;
  hole_count: number | null;
  website: string | null;
  description: string | null;
  tags: Record<string, string>;
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

async function runOverpass(query: string): Promise<OverpassElement[]> {
  let lastErr: unknown = null;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": "DGDashboard-Ace/1.0",
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) {
        lastErr = new Error(`Overpass ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { elements?: OverpassElement[] };
      return json.elements ?? [];
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Overpass request failed");
}

function toInt(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 && n <= 36 ? n : null;
}

function normalize(elements: OverpassElement[], fallbackState: string | null): OsmCourse[] {
  const seen = new Set<string>();
  const out: OsmCourse[] = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    const tags = el.tags ?? {};
    const name = (tags.name ?? "").trim();
    if (lat == null || lon == null || !name) continue;
    const key = `${el.type}:${el.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      osm_type: el.type,
      osm_id: el.id,
      name,
      latitude: lat,
      longitude: lon,
      city: tags["addr:city"] ?? null,
      state: tags["addr:state"] ?? fallbackState,
      postal_code: tags["addr:postcode"] ?? null,
      country: tags["addr:country"] ?? "USA",
      hole_count: toInt(tags["disc_golf:holes"] ?? tags.holes ?? tags["golf:holes"]),
      website: tags.website ?? tags["contact:website"] ?? null,
      description: tags.description ?? null,
      tags,
    });
  }
  return out;
}

/** Fetch every mapped disc golf course inside a US state (two-letter code). */
export async function fetchOsmCoursesForState(stateCode: string): Promise<OsmCourse[]> {
  const code = stateCode.toUpperCase();
  const query = `
    [out:json][timeout:180];
    area["ISO3166-2"="US-${code}"]->.a;
    (
      nwr["sport"="disc_golf"](area.a);
      nwr["leisure"="disc_golf_course"](area.a);
    );
    out center tags;`;
  return normalize(await runOverpass(query), code);
}

/** Fetch every mapped disc golf course inside a bounding box. */
export async function fetchOsmCoursesInBox(box: {
  south: number;
  west: number;
  north: number;
  east: number;
}): Promise<OsmCourse[]> {
  const bbox = `${box.south},${box.west},${box.north},${box.east}`;
  const query = `
    [out:json][timeout:180];
    (
      nwr["sport"="disc_golf"](${bbox});
      nwr["leisure"="disc_golf_course"](${bbox});
    );
    out center tags;`;
  return normalize(await runOverpass(query), null);
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "course"
  );
}
