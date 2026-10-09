/**
 * Server-only helpers for building playable hole layouts.
 *
 * Two jobs live here:
 *   1. Reading publicly mapped tee pads and baskets out of OpenStreetMap and
 *      pairing them into numbered holes.
 *   2. The geometry used to turn a tee/basket pair into a measured distance.
 *
 * Nothing here invents a coordinate or a hole number. A basket with no hole
 * number stays unassigned and is reported as "mapped but not numbered" so a
 * person can finish it in the course builder.
 */

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

export type Box = { south: number; west: number; north: number; east: number };

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: Array<{ lat: number; lon: number }>;
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

/** Distance between two coordinates in feet. */
export function distanceFeet(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 20902231; // earth radius in feet
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** Metres between two coordinates, used for grouping pins to a course. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  return Math.round(distanceFeet(a, b) * 0.3048);
}

export type Pin = {
  kind: "tee" | "basket";
  lat: number;
  lng: number;
  hole: number | null;
  /** OSM element this pin came from (e.g. "node:123" or "way:9:tee"). */
  osmKey?: string;
};

export type MappedSite = {
  osmKey: string;
  name: string | null;
  lat: number;
  lng: number;
  pins: Pin[];
};

/** Pull a hole number out of OSM `ref`/`name`/`hole` style tags. */
export function holeNumberFromTags(tags: Record<string, string>): number | null {
  const candidates = [tags.ref, tags["golf:hole"], tags.hole, tags.name, tags.description];
  for (const raw of candidates) {
    if (!raw) continue;
    const m = /(\d{1,2})/.exec(raw);
    if (!m) continue;
    const n = Number.parseInt(m[1], 10);
    if (n >= 1 && n <= 36) return n;
  }
  return null;
}

function pinKind(tags: Record<string, string>): "tee" | "basket" | null {
  const dg = tags["disc_golf"];
  if (dg === "basket" || dg === "hole" || dg === "pin") return "basket";
  if (dg === "tee" || dg === "teepad" || dg === "tee_pad") return "tee";
  const golf = tags.golf;
  if (golf === "pin" || golf === "hole") return "basket";
  if (golf === "tee") return "tee";
  return null;
}

/**
 * True when the tagging itself says disc golf. Generic `golf=*` pins are far
 * more often ball golf, so those are only trusted when they sit inside a mapped
 * disc golf site.
 */
function isDiscGolfTagged(tags: Record<string, string>): boolean {
  return (
    tags["disc_golf"] != null ||
    tags.sport === "disc_golf" ||
    tags.leisure === "disc_golf_course" ||
    tags.sport?.includes("disc_golf") === true
  );
}

/**
 * A mapped hole drawn as a line runs tee pad -> basket, so the ends of the line
 * are two real coordinates rather than one averaged midpoint.
 */
function holeLinePins(el: OverpassElement, hole: number | null): Pin[] {
  const geom = el.geometry;
  if (!geom || geom.length < 2) return [];
  const start = geom[0];
  const end = geom[geom.length - 1];
  return [
    { kind: "tee", lat: start.lat, lng: start.lon, hole },
    { kind: "basket", lat: end.lat, lng: end.lon, hole },
  ];
}

export type SourceFeatureClass = "course" | "hole" | "tee" | "basket" | "practice" | "other";

const HOLE_NAME = /^\s*(hole|fairway)\s*#?\s*\d{1,2}\b/i;

/**
 * Classify a source element before any course matching. Only real course /
 * site / property features become courses; holes, tees, baskets and practice
 * targets never do, whatever their name says.
 */
export function classifyFeature(el: { type: string }, tags: Record<string, string>): SourceFeatureClass {
  const dg = tags["disc_golf"];
  const name = tags.name ?? "";
  if (dg === "practice" || tags.practice === "yes" || /practice/i.test(name) && (dg === "basket" || tags.golf === "pin")) return "practice";
  if (dg === "hole" || tags.golf === "hole" || HOLE_NAME.test(name)) return el.type === "node" && dg !== "hole" && tags.golf !== "hole" ? "basket" : "hole";
  const kind = pinKind(tags);
  if (kind) return kind;
  if (tags.leisure === "disc_golf_course") return "course";
  if (tags.sport === "disc_golf" || tags.sport?.split(";").includes("disc_golf")) {
    // A bare unnamed point with ref but no area is a hole marker, not a course.
    if ((tags.ref || /^\s*\d{1,2}\s*$/.test(name)) && el.type !== "relation" && !tags.leisure) return "hole";
    return "course";
  }
  return "other";
}

function pointInPolygon(p: { lat: number; lng: number }, poly: Array<{ lat: number; lng: number }>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside;
  }
  return inside;
}

function toPin(p: Pin & { key: string }): Pin {
  return { kind: p.kind, lat: p.lat, lng: p.lng, hole: p.hole, osmKey: p.key };
}

/**
 * Read every publicly mapped disc golf site in a box along with its tee and
 * basket pins. Pins are grouped to the nearest site within 700 m, which keeps
 * ball-golf pins from a neighbouring course out of the results.
 */
export async function fetchMappedSites(box: Box): Promise<MappedSite[]> {
  const bbox = `${box.south},${box.west},${box.north},${box.east}`;
  const query = `
    [out:json][timeout:180];
    (
      nwr["leisure"="disc_golf_course"](${bbox});
      nwr["sport"="disc_golf"](${bbox});
      node["disc_golf"](${bbox});
      way["disc_golf"](${bbox});
      node["golf"~"^(pin|tee|hole)$"](${bbox});
      way["golf"~"^(pin|tee|hole)$"](${bbox});
    );
    out geom center tags;`;
  const elements = await runOverpass(query);

  const sites: MappedSite[] = [];
  const siteShape = new Map<string, { poly: Array<{ lat: number; lng: number }> | null; reach: number }>();
  const loose: Array<Pin & { key: string; discGolf: boolean }> = [];

  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const tags = el.tags ?? {};
    if (lat == null || lng == null) continue;

    const cls = classifyFeature(el, tags);
    if (cls === "practice") continue; // course-wide practice target, never a hole basket
    if (cls === "course") {
      const key = `${el.type}:${el.id}`;
      const geom = el.geometry ?? [];
      const closed = geom.length >= 4 && geom[0].lat === geom[geom.length - 1].lat && geom[0].lon === geom[geom.length - 1].lon;
      const poly = closed ? geom.map((g) => ({ lat: g.lat, lng: g.lon })) : null;
      const reach = poly ? Math.max(...poly.map((p) => distanceMeters(p, { lat, lng }))) : 0;
      siteShape.set(key, { poly, reach });
      sites.push({ osmKey: key, name: tags.name?.trim() || null, lat, lng, pins: [] });
      continue;
    }

    const hole = holeNumberFromTags(tags);
    const discGolf = isDiscGolfTagged(tags);
    // Hole features (including "Hole 1 of …" lines) give a real tee and basket.
    if (cls === "hole") {
      const linePins = holeLinePins(el, hole);
      if (linePins.length === 2) {
        for (const pin of linePins) loose.push({ key: `${el.type}:${el.id}:${pin.kind}`, discGolf, ...pin });
      } else {
        loose.push({ key: `${el.type}:${el.id}`, kind: "basket", lat, lng, hole, discGolf });
      }
      continue;
    }
    if (cls !== "tee" && cls !== "basket") continue;
    loose.push({ key: `${el.type}:${el.id}`, kind: cls, lat, lng, hole, discGolf });
  }

  // Matching priority: inside a mapped course boundary, then a size-aware
  // envelope around the course point (large parks reach farther), then growth
  // from pins already placed. A near tie between two courses never guesses.
  const orphans: typeof loose = [];
  for (const pin of loose) {
    const inside = sites.filter((s) => { const sh = siteShape.get(s.osmKey); return sh?.poly ? pointInPolygon(pin, sh.poly) : false; });
    if (inside.length === 1) { inside[0].pins.push(toPin(pin)); continue; }
    const ranked = sites
      .map((s) => ({ s, d: distanceMeters(pin, s), limit: Math.min(2000, Math.max(700, (siteShape.get(s.osmKey)?.reach ?? 0) + 300)) }))
      .filter((x) => x.d <= x.limit)
      .sort((a, b) => a.d - b.d);
    if (ranked.length && (ranked.length === 1 || ranked[1].d - ranked[0].d >= 150)) { ranked[0].s.pins.push(toPin(pin)); continue; }
    orphans.push(pin);
  }
  // Cluster growth: an orphan within 200 m of exactly one course's placed pins joins it.
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = orphans.length - 1; i >= 0; i--) {
      const pin = orphans[i];
      const near = sites.filter((s) => s.pins.some((p) => distanceMeters(pin, p) <= 200));
      if (near.length === 1) { near[0].pins.push(toPin(pin)); orphans.splice(i, 1); moved = true; }
    }
    if (!moved) break;
  }

  for (const pin of orphans) {
    // A bare `golf=pin`/`golf=tee` node with no disc golf tagging and no disc
    // golf site nearby is almost always ball golf — a NW Indiana sweep turns up
    // thousands of them, none of them disc golf. Dropping them here is what
    // keeps a fairway pin from ever landing on a disc golf hole.
    if (!pin.discGolf) continue;

    // Disc-golf-tagged pins with no mapped site nearby still describe a real
    // course; keep them as their own cluster so coordinate matching finds them.
    const cluster = sites.find(
      (s) => s.osmKey.startsWith("cluster:") && distanceMeters(pin, s) <= 400,
    );
    if (cluster) {
      cluster.pins.push({ kind: pin.kind, lat: pin.lat, lng: pin.lng, hole: pin.hole, osmKey: pin.key });
    } else {
      sites.push({
        osmKey: `cluster:${pin.key}`,
        name: null,
        lat: pin.lat,
        lng: pin.lng,
        pins: [{ kind: pin.kind, lat: pin.lat, lng: pin.lng, hole: pin.hole, osmKey: pin.key }],
      });
    }
  }

  return sites.filter((s) => s.pins.length > 0 || s.name != null);
}

export type PairedHole = {
  number: number;
  tee: { lat: number; lng: number } | null;
  basket: { lat: number; lng: number } | null;
  distance_ft: number | null;
};

export type PairResult = {
  holes: PairedHole[];
  /** Pins that carry no hole number and could not be placed at all. */
  unnumbered: number;
  /** Holes whose coordinates are real but whose hole number was inferred. */
  inferred: number;
  /** Extra tee pads that belong to a hole that already has one (pro/am tees). */
  alternateTees: number;
};

/**
 * Turn a site's pins into numbered holes. A tee is matched to the basket with
 * the same hole number; when only one side carries a number the other side is
 * matched by nearest neighbour within 350 m.
 *
 * Most mapped courses carry no hole numbers at all in OpenStreetMap. Those pins
 * are still real coordinates, so unnumbered tee/basket pairs are placed into the
 * remaining hole slots in walking order and reported through `inferred` — the
 * coordinates are trustworthy, the hole order needs a person to confirm it.
 */
export function pairPinsIntoHoles(pins: Pin[], expectedHoles?: number | null): PairResult {
  const baskets = pins.filter((p) => p.kind === "basket");
  const tees = pins.filter((p) => p.kind === "tee");
  const numberedBaskets = baskets.filter((b) => b.hole != null);
  const numberedTees = tees.filter((t) => t.hole != null);
  const unnumbered = baskets.length - numberedBaskets.length + (tees.length - numberedTees.length);

  const byHole = new Map<number, PairedHole>();
  const claim = (n: number): PairedHole => {
    const existing = byHole.get(n);
    if (existing) return existing;
    const fresh: PairedHole = { number: n, tee: null, basket: null, distance_ft: null };
    byHole.set(n, fresh);
    return fresh;
  };

  for (const b of numberedBaskets) {
    claim(b.hole as number).basket = { lat: b.lat, lng: b.lng };
  }
  for (const t of numberedTees) {
    claim(t.hole as number).tee = { lat: t.lat, lng: t.lng };
  }

  // Fill the missing side of a numbered hole from the unnumbered pins. Pairing
  // is done globally shortest-first so a hole cannot steal a pin that clearly
  // belongs to a closer hole.
  const spareTees = tees.filter((t) => t.hole == null);
  const spareBaskets = baskets.filter((b) => b.hole == null);
  const halfHoles = [...byHole.values()].filter((h) => !h.tee !== !h.basket);
  for (const [hole, pin] of pairShortestFirst(
    halfHoles,
    (h) => (h.tee ?? h.basket) as { lat: number; lng: number },
    halfHoles.map((h) => (h.tee ? spareBaskets : spareTees)),
    MAX_HOLE_METERS,
  )) {
    if (hole.tee) {
      hole.basket = { lat: pin.lat, lng: pin.lng };
      spareBaskets.splice(spareBaskets.indexOf(pin), 1);
    } else {
      hole.tee = { lat: pin.lat, lng: pin.lng };
      spareTees.splice(spareTees.indexOf(pin), 1);
    }
  }

  // Multi-tee courses map a pro pad and an am pad a few strides apart. A spare
  // tee sitting right beside a tee already on a hole is that hole's other pad,
  // not a new hole — keeping it out of the leftovers stops phantom holes and
  // wrong numbering downstream.
  let alternateTees = 0;
  const placedTees = [...byHole.values()]
    .map((h) => h.tee)
    .filter((t): t is { lat: number; lng: number } => t != null);
  for (let i = spareTees.length - 1; i >= 0; i -= 1) {
    const spare = spareTees[i];
    const beside = placedTees.some((t) => distanceMeters(spare, t) <= ALT_TEE_METERS);
    if (!beside) continue;
    spareTees.splice(i, 1);
    alternateTees += 1;
  }

  // Everything left over is a real coordinate with no hole number on it. Pair
  // the leftovers geometrically, walk them in route order, and drop them into
  // the hole slots nobody has claimed yet.
  const leftovers: PairedHole[] = [];
  const teeForBasket = new Map<Pin, Pin>();
  for (const [basket, tee] of pairShortestFirst(
    spareBaskets,
    (b) => b,
    spareBaskets.map(() => spareTees),
    MAX_HOLE_METERS,
  )) {
    teeForBasket.set(basket, tee);
  }
  const takenTees = new Set<Pin>(teeForBasket.values());
  for (const basket of spareBaskets) {
    const tee = teeForBasket.get(basket) ?? null;
    leftovers.push({
      number: 0,
      tee: tee ? { lat: tee.lat, lng: tee.lng } : null,
      basket: { lat: basket.lat, lng: basket.lng },
      distance_ft: null,
    });
  }
  for (const tee of spareTees) {
    if (takenTees.has(tee)) continue;
    leftovers.push({
      number: 0,
      tee: { lat: tee.lat, lng: tee.lng },
      basket: null,
      distance_ft: null,
    });
  }

  const ordered = walkOrder(leftovers);
  const cap = Math.max(expectedHoles ?? 0, byHole.size + ordered.length, 1);
  let inferred = 0;
  let slot = 1;
  for (const hole of ordered) {
    while (slot <= 36 && byHole.has(slot)) slot += 1;
    if (slot > 36 || slot > cap) break;
    hole.number = slot;
    byHole.set(slot, hole);
    inferred += 1;
    slot += 1;
  }

  const holes = [...byHole.values()].sort((a, b) => a.number - b.number);
  for (const hole of holes) {
    if (hole.tee && hole.basket) hole.distance_ft = distanceFeet(hole.tee, hole.basket);
  }
  const placedUnnumbered = leftovers.reduce(
    (n, h) => n + (h.number > 0 ? (h.tee ? 1 : 0) + (h.basket ? 1 : 0) : 0),
    0,
  );
  return {
    holes,
    unnumbered: Math.max(0, unnumbered - placedUnnumbered - alternateTees),
    inferred,
    alternateTees,
  };
}

/** Order holes as a walking route: nearest-neighbour chain from an edge hole. */
function walkOrder(holes: PairedHole[]): PairedHole[] {
  const points = holes.map((h) => h.tee ?? h.basket ?? null);
  if (holes.length < 2) return holes;
  const known = holes.filter((_, i) => points[i]);
  if (known.length < 2) return holes;

  const at = (h: PairedHole) => h.tee ?? h.basket!;
  const centroid = {
    lat: known.reduce((s, h) => s + at(h).lat, 0) / known.length,
    lng: known.reduce((s, h) => s + at(h).lng, 0) / known.length,
  };
  const remaining = [...known];
  let current = remaining.reduce((far, h) =>
    distanceMeters(centroid, at(h)) > distanceMeters(centroid, at(far)) ? h : far,
  );
  const route: PairedHole[] = [];
  remaining.splice(remaining.indexOf(current), 1);
  route.push(current);
  while (remaining.length) {
    const next = remaining.reduce((best, h) =>
      distanceMeters(at(current), at(h)) < distanceMeters(at(current), at(best)) ? h : best,
    );
    remaining.splice(remaining.indexOf(next), 1);
    route.push(next);
    current = next;
  }
  return [...route, ...holes.filter((h) => !h.tee && !h.basket)];
}

/**
 * Longest realistic disc golf hole. Anything beyond this is two different holes
 * sharing a corner of the map, not one very long hole.
 */
const MAX_HOLE_METERS = 350;
/** Two tee pads on the same hole sit within a few strides of each other. */
const ALT_TEE_METERS = 60;

/**
 * Match each item to one candidate pin, shortest distance first. A greedy
 * nearest-neighbour walk lets the first item claim a pin that sits much closer
 * to a later one; sorting every possible pair by distance and taking them in
 * order avoids that.
 */
function pairShortestFirst<T>(
  items: T[],
  positionOf: (item: T) => { lat: number; lng: number },
  candidatesFor: Array<Pin[]>,
  maxMeters: number,
): Array<[T, Pin]> {
  const options: Array<{ item: T; pin: Pin; d: number }> = [];
  items.forEach((item, i) => {
    const from = positionOf(item);
    for (const pin of candidatesFor[i] ?? []) {
      const d = distanceMeters(from, pin);
      if (d <= maxMeters) options.push({ item, pin, d });
    }
  });
  options.sort((a, b) => a.d - b.d);

  const usedItems = new Set<T>();
  const usedPins = new Set<Pin>();
  const pairs: Array<[T, Pin]> = [];
  for (const option of options) {
    if (usedItems.has(option.item) || usedPins.has(option.pin)) continue;
    usedItems.add(option.item);
    usedPins.add(option.pin);
    pairs.push([option.item, option.pin]);
  }
  return pairs;
}

/** Loose name comparison used to tie a mapped site to a course in the library. */
export function nameLooksLikeSame(a: string, b: string): boolean {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/disc golf|frisbee golf|course|dgc|park|the /g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  const wa = clean(a);
  const wb = clean(b);
  if (!wa.length || !wb.length) return false;
  const setB = new Set(wb);
  const hits = wa.filter((w) => setB.has(w)).length;
  return hits / Math.max(wa.length, wb.length) >= 0.5;
}
