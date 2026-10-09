/** Parses GeoJSON / KML course map files into plain shapes for an import preview. Pure; no app types. */

export type ImportedShape = {
  kind: "point" | "line" | "area";
  name: string;
  points: [number, number][]; // [lat, lng]
};

export type ImportResult = { shapes: ImportedShape[]; skipped: number };

const MAX_SHAPES = 2000;

function validLatLng(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** GeoJSON uses [lng, lat]. Returns null if any coordinate is invalid. */
function fromLngLat(coords: unknown): [number, number][] | null {
  if (!Array.isArray(coords)) return null;
  const out: [number, number][] = [];
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) return null;
    const lng = Number(c[0]), lat = Number(c[1]);
    if (!validLatLng(lat, lng)) return null;
    out.push([lat, lng]);
  }
  return out;
}

export function parseGeoJson(text: string): ImportResult {
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error("This file isn't valid GeoJSON."); }
  const feats: any[] =
    data?.type === "FeatureCollection" ? data.features ?? []
      : data?.type === "Feature" ? [data]
        : data?.type ? [{ type: "Feature", geometry: data, properties: {} }] : [];
  const shapes: ImportedShape[] = [];
  let skipped = 0;
  const push = (geom: any, name: string) => {
    if (!geom) return skipped++;
    const t = geom.type;
    if (t === "Point") {
      const p = fromLngLat([geom.coordinates]);
      return p ? shapes.push({ kind: "point", name, points: p }) : skipped++;
    }
    if (t === "LineString") {
      const p = fromLngLat(geom.coordinates);
      return p && p.length >= 2 ? shapes.push({ kind: "line", name, points: p }) : skipped++;
    }
    if (t === "Polygon") {
      const p = fromLngLat(geom.coordinates?.[0]);
      if (!p || p.length < 4) return skipped++;
      return shapes.push({ kind: "area", name, points: p.slice(0, -1) });
    }
    if (t === "MultiPoint" || t === "MultiLineString" || t === "MultiPolygon") {
      const base = t.replace("Multi", "");
      for (const c of geom.coordinates ?? []) push({ type: base, coordinates: c }, name);
      return;
    }
    if (t === "GeometryCollection") {
      for (const g of geom.geometries ?? []) push(g, name);
      return;
    }
    skipped++;
  };
  for (const f of feats) {
    const name = String(f?.properties?.name ?? f?.properties?.Name ?? f?.properties?.title ?? "").slice(0, 120);
    push(f?.geometry, name);
  }
  return cap({ shapes, skipped });
}

function kmlCoords(text: string | null | undefined): [number, number][] | null {
  if (!text) return null;
  const out: [number, number][] = [];
  for (const tok of text.trim().split(/\s+/)) {
    const [lng, lat] = tok.split(",").map(Number);
    if (!validLatLng(lat, lng)) return null;
    out.push([lat, lng]);
  }
  return out;
}

/** Needs a DOMParser (browser). */
export function parseKml(text: string): ImportResult {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("This file isn't valid KML.");
  const shapes: ImportedShape[] = [];
  let skipped = 0;
  for (const pm of Array.from(doc.getElementsByTagName("Placemark"))) {
    const name = (pm.getElementsByTagName("name")[0]?.textContent ?? "").trim().slice(0, 120);
    let found = false;
    for (const el of Array.from(pm.getElementsByTagName("Point"))) {
      const p = kmlCoords(el.getElementsByTagName("coordinates")[0]?.textContent);
      if (p?.length) { shapes.push({ kind: "point", name, points: [p[0]] }); found = true; } else skipped++;
    }
    for (const el of Array.from(pm.getElementsByTagName("LineString"))) {
      const p = kmlCoords(el.getElementsByTagName("coordinates")[0]?.textContent);
      if (p && p.length >= 2) { shapes.push({ kind: "line", name, points: p }); found = true; } else skipped++;
    }
    for (const el of Array.from(pm.getElementsByTagName("Polygon"))) {
      const outer = el.getElementsByTagName("outerBoundaryIs")[0] ?? el;
      const p = kmlCoords(outer.getElementsByTagName("coordinates")[0]?.textContent);
      if (p && p.length >= 4) { shapes.push({ kind: "area", name, points: p.slice(0, -1) }); found = true; } else skipped++;
    }
    if (!found) skipped++;
  }
  return cap({ shapes, skipped });
}

function cap(r: ImportResult): ImportResult {
  if (r.shapes.length <= MAX_SHAPES) return r;
  return { shapes: r.shapes.slice(0, MAX_SHAPES), skipped: r.skipped + r.shapes.length - MAX_SHAPES };
}

export function parseMapFile(fileName: string, text: string): ImportResult {
  const n = fileName.toLowerCase();
  if (n.endsWith(".kml")) return parseKml(text);
  if (n.endsWith(".geojson") || n.endsWith(".json")) return parseGeoJson(text);
  throw new Error("Use a .geojson, .json or .kml file. KMZ files need unzipping first.");
}
