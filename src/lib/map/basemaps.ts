/**
 * Shared basemap definitions for every course map.
 *
 * Course geometry is canonical DGD data and never depends on the imagery
 * source. Imagery has a NATIVE max zoom (where real tiles exist) that varies by
 * location, and the map has a higher DISPLAY max zoom. Past the native level
 * Leaflet scales the last real tile (maxNativeZoom) instead of requesting
 * tiles that 404 or return a gray "not available" placeholder.
 */

export type BasemapKind = "satellite" | "hybrid" | "street";

export const MAP_DISPLAY_MAX_ZOOM = 22;

/** Esri World Imagery (Clarity = most recent captures). Same tile grid. */
export const ESRI_CLARITY_URL =
  "https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const ESRI_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const ESRI_LABELS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
export const ESRI_ROADS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}";
export const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

export const IMAGERY_ATTRIBUTION = "Aerial imagery &copy; Esri, Maxar, Earthstar Geographics";
export const OSM_ATTRIBUTION = "&copy; OpenStreetMap contributors";

/** Safe level used before the coverage check answers; exists almost everywhere. */
export const DEFAULT_IMAGERY_NATIVE_ZOOM = 18;
export const STREET_NATIVE_ZOOM = 19;
export const REFERENCE_NATIVE_ZOOM = 19;

const TILEMAP_BASES = {
  clarity: "https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tilemap",
  standard: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tilemap",
} as const;

export function tileXY(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * n);
  return { x, y };
}

const cache = new Map<string, Promise<number>>();

/**
 * Highest zoom with real imagery at this point, read from the provider's
 * published tile map (no guessing). Falls back to the safe default on error.
 */
export function probeImageryNativeZoom(
  lat: number,
  lng: number,
  source: keyof typeof TILEMAP_BASES = "clarity",
): Promise<number> {
  const key = `${source}:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    let best = DEFAULT_IMAGERY_NATIVE_ZOOM;
    for (let z = 17; z <= 21; z++) {
      const { x, y } = tileXY(lat, lng, z);
      try {
        const res = await fetch(`${TILEMAP_BASES[source]}/${z}/${y}/${x}/1/1`);
        if (!res.ok) break;
        const body = (await res.json()) as { data?: number[] };
        if (body.data?.[0] === 1) best = z;
        else break;
      } catch {
        break;
      }
    }
    return best;
  })();
  cache.set(key, p);
  return p;
}

export type TileIssue = {
  provider: string;
  zoom: number;
  category: "not_found" | "forbidden" | "rate_limited" | "network" | "other";
  at: string;
};

/** Safe diagnostics only — never URLs with keys. */
export function recordTileIssue(issue: TileIssue) {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __dgdTileIssues?: TileIssue[] };
  w.__dgdTileIssues = [...(w.__dgdTileIssues ?? []).slice(-49), issue];
  console.warn("[map] imagery tile issue", issue);
}

/** Topographic terrain map (OpenTopoMap) — contours and hillshade. */
export const TERRAIN_URL = "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png";
export const TERRAIN_ATTRIBUTION =
  'Map &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Style &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)';
export const TERRAIN_NATIVE_ZOOM = 17;
