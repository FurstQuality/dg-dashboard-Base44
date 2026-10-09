/** Round type chosen on /play/new before a course is picked. The start-round
 *  dialog reads it once so the selector and the card setup stay in sync. */
export const PENDING_ROUND_TYPE_KEY = "dgd:pending-round-type";

export type RoundRatingMode = "dgd_rated" | "casual";

export function takePendingRoundType(): RoundRatingMode | null {
  try {
    const value = sessionStorage.getItem(PENDING_ROUND_TYPE_KEY);
    if (value === "dgd_rated" || value === "casual") {
      sessionStorage.removeItem(PENDING_ROUND_TYPE_KEY);
      return value;
    }
  } catch {
    return null;
  }
  return null;
}
