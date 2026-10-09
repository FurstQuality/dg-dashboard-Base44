/**
 * Ground detail for tee signs read from OpenStreetMap around a layout:
 * woods, water, creeks, paths, roads, buildings, parking, single trees and park furniture.
 * Display only — nothing is saved, and course-map items are drawn on top of it.
 */
import type { SignFeature } from "@/lib/tee-sign-pro";

type LL = [number, number];
const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
const MAX_SPAN_DEG = 0.06; // ~6 km; bigger areas are skipped to keep the request light

/** [south, west, north, east] around the points, or null when the area is too big to read. */
export function terrainBbox(points: LL[], padM = 180): [number, number, number, number] | null {
  if (!points.length) return null;
  const lats = points.map((p) => p[0]), lngs = points.map((p) => p[1]);
  const dLat = padM / 111132, dLng = padM / (111320 * Math.cos((lats[0] * Math.PI) / 180));
  const s = Math.min(...lats) - dLat, n = Math.max(...lats) + dLat, w = Math.min(...lngs) - dLng, e = Math.max(...lngs) + dLng;
  if (n - s > MAX_SPAN_DEG || e - w > MAX_SPAN_DEG) return null;
  return [s, w, n, e];
}

export async function fetchOsmTerrain([s, w, n, e]: [number, number, number, number]): Promise<SignFeature[]> {
  const bb = `${s},${w},${n},${e}`;
  const q = `[out:json][timeout:25];(
way["natural"~"^(wood|scrub|heath|water|wetland|tree_row)$"](${bb});way["landuse"~"^(forest|reservoir|basin)$"](${bb});
way["landuse"~"^(meadow|grass)$"](${bb});way["natural"="grassland"](${bb});way["barrier"~"^(hedge|fence|wall)$"](${bb});way["natural"~"^(sand|bare_rock|scree)$"](${bb});way["leisure"~"^(pitch|playground)$"](${bb});
way["waterway"](${bb});way["highway"](${bb});way["building"](${bb});way["amenity"="parking"](${bb});
node["natural"="tree"](${bb});node["amenity"~"^(bench|toilets|waste_basket|shelter)$"](${bb});node["leisure"="picnic_table"](${bb});
);out geom 4000;`;
  let res: Response | null = null;
  // The free map servers are often busy; try each mirror once.
  for (const url of ENDPOINTS) {
    try {
      const r = await fetch(url, { method: "POST", signal: AbortSignal.timeout(30000), body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      if (r.ok) { res = r; break; }
    } catch { /* try the next mirror */ }
  }
  if (!res) throw new Error("Map detail unavailable right now");
  const json = (await res.json()) as { elements: Array<{ type: string; lat?: number; lon?: number; geometry?: { lat: number; lon: number }[]; tags?: Record<string, string> }> };
  const out: SignFeature[] = [];
  for (const el of json.elements ?? []) {
    const t = el.tags ?? {};
    if (el.type === "node" && el.lat != null && el.lon != null) {
      const pt: LL = [el.lat, el.lon];
      const type = t.natural === "tree" ? "tree" : t.amenity === "bench" || t.leisure === "picnic_table" ? "bench" : t.amenity === "toilets" ? "restroom" : t.amenity === "shelter" ? "gazebo" : t.amenity === "waste_basket" ? "trash" : null;
      if (type) out.push({ type, geometry: { points: [pt] } });
      continue;
    }
    const pts = (el.geometry ?? []).map((g) => [g.lat, g.lon] as LL);
    if (pts.length < 2) continue;
    const closed = pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
    let type: string | null = null;
    if (t.natural === "wood" || t.landuse === "forest") type = closed ? "woods" : null;
    else if (t.natural === "scrub" || t.natural === "heath" || (t.natural === "wetland" && (t.wetland === "reedbed" || t.wetland === "marsh" || t.wetland === "wet_meadow"))) type = closed ? "tall_grass" : null;
    else if ((t.natural === "grassland" || t.landuse === "meadow") && closed) type = "tall_grass";
    else if (t.natural === "tree_row" || t.barrier === "hedge") type = "tree_line";
    else if (t.barrier === "fence" || t.barrier === "wall") type = "fence";
    else if (t.natural === "sand" || t.natural === "bare_rock" || t.natural === "scree") type = closed ? "bare" : null;
    else if (t.leisure === "pitch" || t.leisure === "playground") type = closed ? "pitch" : null;
    else if (t.natural === "water" || t.natural === "wetland" || t.landuse === "reservoir" || t.landuse === "basin") type = closed ? "water" : null;
    else if (t.waterway) type = "water";
    else if (t.building) type = closed ? "building" : null;
    else if (t.amenity === "parking") type = closed ? "parking" : null;
    else if (t.highway) type = /^(footway|path|track|cycleway|bridleway|steps|pedestrian)$/.test(t.highway) ? "path" : "road";
    if (!type) continue;
    out.push({ type, geometry: { points: pts }, closed: type === "water" ? closed && !t.waterway : undefined });
  }
  return out;
}
