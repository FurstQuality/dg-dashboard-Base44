import { nearestFairwaySegment, pairKey, type FairwayDraft } from "./pairing-fairways";
import type { LatLng } from "./geometry";
import type { StudioHole } from "./studio-fairways";

/** Read recorded control points, never sampled spline points or guessed tee joins.
 * Explicit pair paths are restored over these defaults by studioFairways. */
export function seedStudioControlPoints(draft: FairwayDraft, hole: StudioHole) {
  const set = (tee: string, basket: string, bends: LatLng[]) => {
    const key = pairKey(tee, basket),
      route = draft.network.routes[key];
    if (!route) return;
    const nodes = bends.map((point, i) => {
      const id = `point:recorded:${key}:${i}`;
      draft.network.points[id] = [...point];
      return id;
    });
    route.nodes = [route.nodes[0], ...nodes, route.nodes.at(-1)!];
  };
  set("main-tee", "main-basket", hole.flight_path);
  for (const tee of hole.extra_tees) set(tee.tempId, "main-basket", tee.bends ?? []);
  // A recorded basket split is a real location. Keep the main route prefix to
  // that location; a basket without a recorded split starts with a direct route.
  for (const basket of hole.extra_baskets) {
    const split = basket.bends?.[0];
    if (!split) continue;
    const main = hole.tee && hole.basket ? [hole.tee, ...hole.flight_path, hole.basket] : [];
    const edge = main.length ? nearestFairwaySegment(main, split).edge : 0;
    set("main-tee", basket.tempId, [...hole.flight_path.slice(0, edge), split]);
  }
}
