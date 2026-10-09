/**
 * Pure Play helpers. These live outside `play.functions.ts` because server
 * function modules must stay thin wrappers — runtime siblings there are
 * dropped when the server-fn bundle is split.
 */

/** Great-circle distance in miles. */
export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rank an already-fetched course set by distance from an origin. */
export function rankByDistance<T extends { latitude: number | null; longitude: number | null }>(
  rows: T[],
  origin: { lat: number; lng: number },
  limit: number,
): Array<T & { distanceMi: number }> {
  return rows
    .filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number")
    .map((r) => ({
      ...r,
      distanceMi:
        Math.round(
          haversineMiles(origin, { lat: r.latitude as number, lng: r.longitude as number }) * 10,
        ) / 10,
    }))
    .sort((a, b) => a.distanceMi - b.distanceMi)
    .slice(0, limit);
}

/** Normalize a course name for de-duplicated grouping. */
export function normalizeCourseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
