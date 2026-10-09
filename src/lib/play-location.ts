/**
 * Shared last-known coordinates for Play surfaces (course picker, courses
 * widget). One key, one reader, one writer so distance results agree wherever
 * they appear.
 */
export const PLAY_COORD_KEY = "dgd.play.lastCoords";

export type PlayCoords = { lat: number; lng: number };

export function loadPlayCoords(): PlayCoords | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PLAY_COORD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlayCoords>;
    if (typeof parsed.lat === "number" && typeof parsed.lng === "number") {
      return { lat: parsed.lat, lng: parsed.lng };
    }
  } catch {
    /* stored value unusable — treat as no location */
  }
  return null;
}

export function savePlayCoords(coords: PlayCoords): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLAY_COORD_KEY, JSON.stringify(coords));
  } catch {
    /* storage unavailable — location just isn't remembered */
  }
}
