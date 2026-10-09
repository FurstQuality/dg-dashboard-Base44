/**
 * Single source of truth for how a throw's distance maps to a scoring zone.
 *
 * Disc golf convention:
 *  - Circle 1 (C1): inside 33 ft of the basket — a putt.
 *  - Circle 2 (C2): 33–66 ft — still a putt for stats purposes.
 *  - Outside C2: anything over 66 ft — an upshot (or a drive off the tee).
 */

export const C1_FT = 33;
export const C2_FT = 66;

export type ThrowZone = "c1" | "c2" | "outside";

/** Classify a distance-to-basket (in feet) into its scoring zone. */
export function zoneForDistanceFt(ft: number | null | undefined): ThrowZone | null {
  if (ft == null || !Number.isFinite(ft) || ft <= 0) return null;
  if (ft <= C1_FT) return "c1";
  if (ft <= C2_FT) return "c2";
  return "outside";
}

/** Short label for a zone, e.g. "C1 (inside 33 ft)". */
export function zoneLabel(zone: ThrowZone | null): string {
  switch (zone) {
    case "c1":
      return `C1 · inside ${C1_FT} ft`;
    case "c2":
      return `C2 · ${C1_FT}–${C2_FT} ft`;
    case "outside":
      return `Upshot · outside ${C2_FT} ft`;
    default:
      return "";
  }
}

/** True when a throw from this distance counts as a putt (C1 or C2). */
export function isPuttDistance(ft: number | null | undefined): boolean {
  const zone = zoneForDistanceFt(ft);
  return zone === "c1" || zone === "c2";
}

/**
 * Name the throw type for a shot, given where it started and whether it was
 * thrown from the tee. Drives are off the tee; everything over C2 is an upshot.
 */
export function throwKindForDistanceFt(
  ft: number | null | undefined,
  fromTee: boolean,
): "Drive" | "Upshot" | "C2 putt" | "C1 putt" | "Throw" {
  if (fromTee) return "Drive";
  switch (zoneForDistanceFt(ft)) {
    case "c1":
      return "C1 putt";
    case "c2":
      return "C2 putt";
    case "outside":
      return "Upshot";
    default:
      return "Throw";
  }
}
