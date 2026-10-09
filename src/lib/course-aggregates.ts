/**
 * Course design aggregates.
 *
 * Pure math shared by the course builder (live preview) and the save path so
 * the numbers stored on `course_layouts.design_summary` always match what the
 * builder showed the designer. Everything here is geometry + counting — no
 * Supabase, no React — so it can be unit tested and reused server-side.
 */

export type AggregateFeatureType = string;

export type AggregateFeature = {
  type: AggregateFeatureType;
  /** [lat, lng] pairs. Point features carry a single pair. */
  points: [number, number][];
  /** null = applies to the whole course. */
  hole_numbers: number[] | null;
};

export type AggregateHole = {
  number: number;
  par: number;
  /** Measured or overridden distance in feet. */
  distance_ft: number | null;
  tee: [number, number] | null;
  basket: [number, number] | null;
  elevation_ft?: number | null;
  shot_shape?: string | null;
  hazards?: string[];
};

export type HoleDesignSummary = {
  number: number;
  par: number;
  distance_ft: number | null;
  elevation_ft: number | null;
  shot_shape: string | null;
  mapped: boolean;
  mando_count: number;
  dropzone_count: number;
  ob_line_feet: number;
  ob_area_count: number;
  water: boolean;
  island_green: boolean;
  hazards: string[];
};

export type LayoutDesignSummary = {
  hole_count: number;
  mapped_hole_count: number;
  par_total: number;
  distance_total: number;
  longest_hole_ft: number | null;
  shortest_hole_ft: number | null;
  longest_hole_number: number | null;
  average_hole_ft: number | null;
  mando_count: number;
  dropzone_count: number;
  ob_line_feet: number;
  ob_area_count: number;
  water_hole_count: number;
  island_green_count: number;
  elevation_gain_ft: number;
  par_breakdown: Record<string, number>;
  shot_shape_breakdown: Record<string, number>;
  amenities: Record<string, number>;
  hazard_holes: number;
  holes: HoleDesignSummary[];
  /** ISO timestamp of when these numbers were computed. */
  computed_at: string;
};

const FT_PER_METER = 3.280839895;
const EARTH_RADIUS_M = 6371000;

/** Great-circle distance between two [lat, lng] points, in feet. */
export function feetBetween(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
  return meters * FT_PER_METER;
}

/** Total length of a polyline in feet. Returns 0 for fewer than two points. */
export function polylineFeet(points: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += feetBetween(points[i - 1], points[i]);
  return total;
}

const AMENITY_TYPES = new Set([
  "parking",
  "restroom",
  "trash",
  "bench",
  "gazebo",
  "tee_sign",
  "path",
]);

function appliesToHole(feature: AggregateFeature, holeNumber: number): boolean {
  if (!feature.hole_numbers || feature.hole_numbers.length === 0) return false;
  return feature.hole_numbers.includes(holeNumber);
}

function bump(map: Record<string, number>, key: string, by = 1) {
  map[key] = (map[key] ?? 0) + by;
}

export function summarizeHole(
  hole: AggregateHole,
  features: AggregateFeature[],
): HoleDesignSummary {
  const mine = features.filter((f) => appliesToHole(f, hole.number));
  const obLineFeet = mine
    .filter((f) => f.type === "ob_line")
    .reduce((sum, f) => sum + polylineFeet(f.points), 0);
  return {
    number: hole.number,
    par: hole.par,
    // Prefer the stored/overridden distance; otherwise measure the tee→basket
    // line so a mapped hole always reports a real length.
    distance_ft:
      hole.distance_ft ??
      (hole.tee && hole.basket ? Math.round(feetBetween(hole.tee, hole.basket)) : null),
    elevation_ft: hole.elevation_ft ?? null,
    shot_shape: hole.shot_shape || null,
    mapped: Boolean(hole.tee && hole.basket),
    mando_count: mine.filter((f) => f.type === "mando").length,
    dropzone_count: mine.filter((f) => f.type === "dropzone").length,
    ob_line_feet: Math.round(obLineFeet),
    ob_area_count: mine.filter((f) => f.type === "ob_area").length,
    water: mine.some((f) => f.type === "water"),
    island_green: mine.some((f) => f.type === "island_green"),
    hazards: hole.hazards ?? [],
  };
}

export function summarizeLayout(
  holes: AggregateHole[],
  features: AggregateFeature[],
  opts: { computedAt?: Date } = {},
): LayoutDesignSummary {
  const holeSummaries = holes.map((h) => summarizeHole(h, features));
  const distances = holeSummaries
    .map((h) => h.distance_ft)
    .filter((d): d is number => typeof d === "number" && d > 0);

  const parBreakdown: Record<string, number> = {};
  const shapeBreakdown: Record<string, number> = {};
  const amenities: Record<string, number> = {};

  holeSummaries.forEach((h) => {
    bump(parBreakdown, `par${h.par}`);
    if (h.shot_shape) bump(shapeBreakdown, h.shot_shape);
  });

  features.forEach((f) => {
    if (AMENITY_TYPES.has(f.type)) bump(amenities, f.type);
  });

  const longest = distances.length ? Math.max(...distances) : null;
  const shortest = distances.length ? Math.min(...distances) : null;
  const longestHole =
    longest == null ? null : (holeSummaries.find((h) => h.distance_ft === longest)?.number ?? null);

  // Course-wide features (hole_numbers === null) count once at layout level.
  const courseWide = features.filter((f) => !f.hole_numbers || f.hole_numbers.length === 0);
  const countAll = (type: string) =>
    holeSummaries.reduce(
      (sum, h) =>
        sum +
        (type === "mando"
          ? h.mando_count
          : type === "dropzone"
            ? h.dropzone_count
            : type === "ob_area"
              ? h.ob_area_count
              : 0),
      0,
    ) + courseWide.filter((f) => f.type === type).length;

  const obLineFeet =
    holeSummaries.reduce((sum, h) => sum + h.ob_line_feet, 0) +
    Math.round(
      courseWide
        .filter((f) => f.type === "ob_line")
        .reduce((sum, f) => sum + polylineFeet(f.points), 0),
    );

  return {
    hole_count: holes.length,
    mapped_hole_count: holeSummaries.filter((h) => h.mapped).length,
    par_total: holeSummaries.reduce((sum, h) => sum + (h.par || 0), 0),
    distance_total: Math.round(distances.reduce((sum, d) => sum + d, 0)),
    longest_hole_ft: longest == null ? null : Math.round(longest),
    shortest_hole_ft: shortest == null ? null : Math.round(shortest),
    longest_hole_number: longestHole,
    average_hole_ft: distances.length
      ? Math.round(distances.reduce((sum, d) => sum + d, 0) / distances.length)
      : null,
    mando_count: countAll("mando"),
    dropzone_count: countAll("dropzone"),
    ob_line_feet: obLineFeet,
    ob_area_count: countAll("ob_area"),
    water_hole_count: holeSummaries.filter((h) => h.water).length,
    island_green_count: holeSummaries.filter((h) => h.island_green).length,
    elevation_gain_ft: holeSummaries.reduce(
      (sum, h) => sum + Math.abs(Number(h.elevation_ft ?? 0)),
      0,
    ),
    par_breakdown: parBreakdown,
    shot_shape_breakdown: shapeBreakdown,
    amenities,
    hazard_holes: holeSummaries.filter(
      (h) =>
        h.hazards.length > 0 ||
        h.water ||
        h.ob_area_count > 0 ||
        h.ob_line_feet > 0 ||
        h.mando_count > 0,
    ).length,
    holes: holeSummaries,
    computed_at: (opts.computedAt ?? new Date()).toISOString(),
  };
}

/** Human-readable one-liners used by review checklists and course pages. */
export function designHighlights(s: LayoutDesignSummary): string[] {
  const out: string[] = [];
  out.push(`${s.hole_count} holes · par ${s.par_total}`);
  const measured = s.holes.filter(
    (h) => typeof h.distance_ft === "number" && h.distance_ft > 0,
  ).length;
  if (s.distance_total > 0)
    out.push(
      measured === s.hole_count
        ? `${s.distance_total.toLocaleString()} ft total`
        : `${s.distance_total.toLocaleString()} ft across ${measured} of ${s.hole_count} measured holes`,
    );
  if (s.longest_hole_ft && s.longest_hole_number)
    out.push(`Longest: hole ${s.longest_hole_number} at ${s.longest_hole_ft.toLocaleString()} ft`);
  if (s.mando_count) out.push(`${s.mando_count} mandatory${s.mando_count === 1 ? "" : "s"}`);
  if (s.ob_line_feet) out.push(`${s.ob_line_feet.toLocaleString()} ft of OB line`);
  if (s.ob_area_count) out.push(`${s.ob_area_count} OB area${s.ob_area_count === 1 ? "" : "s"}`);
  if (s.water_hole_count) out.push(`Water in play on ${s.water_hole_count} holes`);
  if (s.island_green_count) out.push(`${s.island_green_count} island green(s)`);
  if (s.dropzone_count) out.push(`${s.dropzone_count} drop zone(s)`);
  return out;
}

/** Gaps a designer should close before the course is trusted by the app. */
export function designGaps(s: LayoutDesignSummary): string[] {
  const gaps: string[] = [];
  const unmapped = s.hole_count - s.mapped_hole_count;
  if (unmapped > 0) gaps.push(`${unmapped} hole(s) still need a tee and basket`);
  const missingDistance = s.holes.filter((h) => h.mapped && !h.distance_ft).length;
  if (missingDistance > 0) gaps.push(`${missingDistance} hole(s) have no measured distance`);
  const missingShape = s.holes.filter((h) => !h.shot_shape).length;
  if (missingShape > 0) gaps.push(`${missingShape} hole(s) have no shot shape set`);
  if (!s.amenities.parking) gaps.push("No parking marked — players can't find the first tee");
  return gaps;
}

/**
 * Ray-casting point-in-polygon test. `polygon` is a closed or open ring of
 * [lat, lng] pairs. Used as a builder guard rail: warn when a tee or basket
 * lands outside the drawn property boundary.
 */
export function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  if (polygon.length < 3) return false;
  const [y, x] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Plausible hole length window in feet — outside this we warn, never block. */
export const HOLE_LENGTH_MIN_FT = 90;
export const HOLE_LENGTH_MAX_FT = 1400;

/** Returns a warning string when a tee→basket length looks like a misplaced pin. */
export function holeLengthWarning(distanceFt: number): string | null {
  if (!Number.isFinite(distanceFt) || distanceFt <= 0) return null;
  if (distanceFt < HOLE_LENGTH_MIN_FT) {
    return `That hole measures only ${Math.round(distanceFt)} ft — check the tee and basket positions.`;
  }
  if (distanceFt > HOLE_LENGTH_MAX_FT) {
    return `That hole measures ${Math.round(distanceFt).toLocaleString()} ft — unusually long, double-check the basket.`;
  }
  return null;
}

/** Default snap radius, in feet, for pulling a new point onto an existing vertex. */
export const SNAP_RADIUS_FT = 20;

/**
 * Returns the nearest candidate vertex within `radiusFt` of `point`, or `point`
 * itself when nothing is close enough. Used so boundaries, OB lines, and hazard
 * areas share exact corners instead of leaving hairline gaps.
 */
export function snapToNearbyVertex(
  point: [number, number],
  candidates: Array<[number, number]>,
  radiusFt: number = SNAP_RADIUS_FT,
): [number, number] {
  let best: [number, number] | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const d = feetBetween(point, c);
    if (d <= radiusFt && d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best ?? point;
}
