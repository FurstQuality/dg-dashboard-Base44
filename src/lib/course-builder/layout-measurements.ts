import { courseRoutePreview, type CourseRouteHole, type CourseRoutePin } from "./course-route";
import { slotDistanceFt, type Asset, type Slot } from "./layouts";

export type LayoutMeasurement = {
  distance: number | null;
  source: "mapped" | "measured" | "direct" | "unknown";
  issue?: string;
};
export type LayoutMeasurements = Map<string, LayoutMeasurement>;
export type RouteHoleRow = CourseRouteHole & { id: string };
export type RoutePinRow = CourseRoutePin & { hole_id: string };
export const slotMeasurementKey = (slot: Slot) =>
  JSON.stringify([slot.id ?? slot.legacy_hole_id, slot.tee_id, slot.basket_id]);

/** Resolve ONLY the slot's explicit legacy-hole link. Coordinate proximity is
 * never used to borrow another pairing's par, route, or published distance. */
export function buildLayoutMeasurements(
  slots: Slot[],
  tees: Map<string, Asset>,
  baskets: Map<string, Asset>,
  rows: RouteHoleRow[],
  teeRows: RoutePinRow[],
  basketRows: RoutePinRow[],
): LayoutMeasurements {
  const result: LayoutMeasurements = new Map();
  const holes = new Map(rows.map((row) => [row.id, row]));
  const group = (pins: RoutePinRow[]) => {
    const byHole = new Map<string, RoutePinRow[]>();
    for (const pin of pins) {
      const values = byHole.get(pin.hole_id) ?? [];
      values.push(pin);
      byHole.set(pin.hole_id, values);
    }
    return byHole;
  };
  const extraTees = group(teeRows),
    extraBaskets = group(basketRows);
  for (const slot of slots) {
    const row = slot.legacy_hole_id ? holes.get(slot.legacy_hole_id) : undefined;
    if (!row || !slot.tee_id || !slot.basket_id) continue;
    const tee = tees.get(slot.tee_id),
      basket = baskets.get(slot.basket_id);
    // Legacy geometry belongs to the recorded pairing, never a newly switched endpoint.
    if (
      !tee ||
      !basket ||
      tee.latitude !== row.tee_lat ||
      tee.longitude !== row.tee_lng ||
      basket.latitude !== row.basket_lat ||
      basket.longitude !== row.basket_lng
    )
      continue;
    const preview = courseRoutePreview(row, extraTees.get(row.id), extraBaskets.get(row.id));
    result.set(slotMeasurementKey(slot), {
      distance: preview.distance,
      source: preview.source,
      ...(preview.issue ? { issue: preview.issue } : {}),
    });
  }
  return result;
}

/** Direct distances remain useful for draft pairings, but are explicitly named. */
export function layoutSlotMeasurement(
  slot: Slot,
  tees: Map<string, Asset>,
  baskets: Map<string, Asset>,
  measurements?: LayoutMeasurements,
): LayoutMeasurement {
  const mapped = measurements?.get(slotMeasurementKey(slot));
  if (mapped) return mapped;
  const distance = slotDistanceFt(slot, tees, baskets);
  return { distance, source: distance == null ? "unknown" : "direct" };
}

export function layoutMeasuredTotals(
  slots: Slot[],
  tees: Map<string, Asset>,
  baskets: Map<string, Asset>,
  measurements: LayoutMeasurements,
) {
  const included = slots.filter((slot) => slot.included);
  let distance = 0,
    known = 0,
    direct = 0;
  for (const slot of included) {
    const value = layoutSlotMeasurement(slot, tees, baskets, measurements);
    if (value.distance != null) {
      distance += value.distance;
      known++;
    }
    if (value.source === "direct") direct++;
  }
  return {
    distanceFt: included.length > 0 && known === included.length ? distance : null,
    measuredHoles: known,
    directHoles: direct,
  };
}
