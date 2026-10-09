import { createFairwayGeometry } from "./fairway-curves";
import {
  studioFairways,
  readPrimaryPath,
  readTeePaths,
  readBasketPath,
  MAIN_TEE,
  MAIN_BASKET,
  type StudioHole,
} from "./studio-fairways";
import { primaryDistanceOverride, pairSummary } from "./pair-scoring";
import { validPoint } from "./pairing-fairways";
import type { LatLng } from "./geometry";

export type CourseRouteHole = {
  par?: number | null;
  par_confirmed?: boolean | null;
  tee_lat: number | null;
  tee_lng: number | null;
  basket_lat: number | null;
  basket_lng: number | null;
  tee_name?: string | null;
  basket_name?: string | null;
  tee_color?: string | null;
  flight_path?: unknown;
  distance_ft?: number | null;
};
export type CourseRoutePin = {
  id: string;
  name: string;
  color?: string | null;
  latitude: number | null;
  longitude: number | null;
  flight_path?: unknown;
  split_point?: unknown;
};
export type CourseRoutePair = {
  distance: number;
  mappedDistance: number;
  par: number | null;
  distanceOverride: number | null;
};
export type CourseRoutePreview = {
  curve: LatLng[] | null;
  distance: number | null;
  source: "mapped" | "measured" | "unknown";
  issue?: string;
  pairs?: Record<string, CourseRoutePair>;
};
const position = (lat: number | null, lng: number | null): LatLng | null =>
  validPoint([lat, lng]) ? [lat!, lng!] : null;

/** Maps, signs and layout summaries use the same graph and samples as Studio.
 * Consumers receive display geometry; editable controls remain unchanged. */
export function courseRoutePreview(
  row: CourseRouteHole,
  tees: CourseRoutePin[] = [],
  baskets: CourseRoutePin[] = [],
): CourseRoutePreview {
  try {
    const hole: StudioHole = {
      par: row.par_confirmed === false ? undefined : (row.par ?? undefined),
      tee: position(row.tee_lat, row.tee_lng),
      basket: position(row.basket_lat, row.basket_lng),
      tee_name: row.tee_name ?? "Main",
      basket_name: row.basket_name ?? "A",
      tee_color: row.tee_color ?? "#ffffff",
      flight_path: readPrimaryPath(row.flight_path),
      extra_tees: tees.map((pin) => ({
        tempId: pin.id,
        name: pin.name,
        color: pin.color ?? "#ffffff",
        lat: pin.latitude,
        lng: pin.longitude,
        ...readTeePaths(pin.flight_path),
      })),
      extra_baskets: baskets.map((pin) => ({
        tempId: pin.id,
        name: pin.name,
        color: pin.color ?? "#a3e635",
        lat: pin.latitude,
        lng: pin.longitude,
        ...readBasketPath(pin.split_point),
      })),
    };
    if (!hole.tee || !hole.basket) return { curve: null, distance: null, source: "unknown" };
    const draft = studioFairways(hole),
      key = `${MAIN_TEE}/${MAIN_BASKET}`;
    if (!draft.network.routes[key])
      throw new Error("This tee is not assigned to the selected basket.");
    const geometry = createFairwayGeometry(draft);
    hole.distance_override = primaryDistanceOverride(
      hole,
      row.distance_ft ?? null,
      geometry.distance(key),
    );
    const score = pairSummary(hole, draft, key, geometry);
    const pairs = Object.fromEntries(
      Object.keys(draft.network.routes)
        .filter((key) => !draft.network.routes[key].startBasketId)
        .map((key) => [key, pairSummary(hole, draft, key, geometry)]),
    );
    return {
      curve: geometry.route(key),
      distance: score.distance,
      source: score.distanceOverride == null ? "mapped" : "measured",
      pairs,
    };
  } catch (error) {
    return {
      curve: null,
      distance: null,
      source: "unknown",
      issue: error instanceof Error ? error.message : "The saved route needs review.",
    };
  }
}
