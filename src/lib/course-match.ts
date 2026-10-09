/**
 * Canonical course match key. Mirrors the Postgres function
 * public.course_match_key so client, server, and database duplicate checks
 * agree on what counts as "the same course".
 */
export function courseMatchKey(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/disc golf park|disc golf course|disc golf complex|disc golf|dgc|^the /g, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/park$/, "");
}

/** True when two courses are close enough (~0.004° ≈ 1/4 mile) to be the same venue. */
export function sameVenueCoords(
  aLat: number | null | undefined,
  aLng: number | null | undefined,
  bLat: number | null | undefined,
  bLng: number | null | undefined,
): boolean {
  if (aLat == null || aLng == null || bLat == null || bLng == null) return false;
  return Math.abs(aLat - bLat) < 0.004 && Math.abs(aLng - bLng) < 0.004;
}
