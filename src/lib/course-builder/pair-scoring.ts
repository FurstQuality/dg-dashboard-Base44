import {
  applyStudioFairways,
  storedStudioRoute,
  studioFairways,
  validatePairScoring,
  MAIN_TEE,
  MAIN_BASKET,
  type PairScoring,
  type StudioHole,
} from "./studio-fairways";
import { pairKey, routeDistance, type FairwayDraft } from "./pairing-fairways";
import type { FairwayGeometry } from "./fairway-curves";
import { distanceFt, pathLengthFt } from "./geometry";

/** Versioned metadata is authoritative. Recognize legacy computed distances
 * without silently discarding a distinct organizer-entered distance. */
export function primaryDistanceOverride(
  hole: StudioHole,
  savedDistance: number | null,
  mappedDistance?: number,
): number | null {
  const explicit = [...hole.extra_tees, ...hole.extra_baskets].find(
    (pin) => pin.trunk_path?.scoring,
  )?.trunk_path?.scoring;
  if (explicit) {
    validatePairScoring(explicit);
    return explicit.distanceOverride;
  }
  if (savedDistance == null) return null;
  if (!Number.isFinite(savedDistance) || savedDistance <= 0)
    throw new Error("The saved hole distance needs review.");
  if (!hole.tee || !hole.basket) return savedDistance;
  const linear = Math.round(pathLengthFt([hole.tee, ...hole.flight_path, hole.basket]));
  if (savedDistance === linear || Math.abs(savedDistance - distanceFt(hole.tee, hole.basket)) <= 1)
    return null;
  if (mappedDistance !== undefined) return savedDistance === mappedDistance ? null : savedDistance;
  const draft = studioFairways(hole),
    key = pairKey(MAIN_TEE, MAIN_BASKET);
  return draft.network.routes[key] && savedDistance === routeDistance(draft, key)
    ? null
    : savedDistance;
}

export function pairScoring(hole: StudioHole, teeId: string, basketId: string): PairScoring {
  if (teeId === MAIN_TEE && basketId === MAIN_BASKET)
    return { par: hole.par ?? null, distanceOverride: hole.distance_override ?? null };
  const stored = storedStudioRoute(hole, teeId, basketId)?.scoring;
  if (stored) {
    validatePairScoring(stored);
    return stored;
  }
  const legacy =
    teeId === MAIN_TEE
      ? hole.extra_baskets.find((b) => b.tempId === basketId)?.distance_override
      : basketId === MAIN_BASKET
        ? hole.extra_tees.find((t) => t.tempId === teeId)?.distance_override
        : null;
  return { par: null, distanceOverride: legacy ?? null };
}
export function pairSummary(
  hole: StudioHole,
  draft: FairwayDraft,
  key: string,
  geometry?: FairwayGeometry,
) {
  const route = draft.network.routes[key];
  const scoring = pairScoring(hole, route.teeId, route.basketId);
  const mappedDistance = geometry ? geometry.distance(key) : routeDistance(draft, key);
  return { ...scoring, mappedDistance, distance: scoring.distanceOverride ?? mappedDistance };
}
export function formatPairScore(
  score: ReturnType<typeof pairSummary>,
  basketConnection = false,
): string {
  if (basketConnection) return `${score.mappedDistance} ft · basket connection`;
  return `${score.distance} ft${score.distanceOverride != null ? " measured" : " mapped"} · ${score.par == null ? "Par not set" : `Par ${score.par}`}`;
}
export function pairScoreLabel(
  hole: StudioHole,
  draft: FairwayDraft,
  key: string,
  geometry?: FairwayGeometry,
): string {
  return formatPairScore(
    pairSummary(hole, draft, key, geometry),
    !!draft.network.routes[key].startBasketId,
  );
}
export function setPairScoring<T extends StudioHole>(
  hole: T,
  teeId: string,
  basketId: string,
  patch: Partial<PairScoring>,
): T {
  const score = { ...pairScoring(hole, teeId, basketId), ...patch };
  validatePairScoring(score);
  const draft = studioFairways(hole),
    key = pairKey(teeId, basketId);
  if (!draft.network.routes[key] || draft.network.routes[key].startBasketId)
    throw new Error("Place and map this tee and basket before setting its par and distance.");
  if (teeId === MAIN_TEE && basketId === MAIN_BASKET) {
    if (score.par === null) throw new Error("The layout's main pairing needs a par.");
    return {
      ...hole,
      par: score.par,
      par_confirmed: true,
      distance_override: score.distanceOverride,
    };
  }
  // Materialize the existing bends before attaching metadata; no geometry is reset.
  const next = applyStudioFairways(hole, draft);
  if (teeId === MAIN_TEE)
    return {
      ...next,
      extra_baskets: next.extra_baskets.map((b) =>
        b.tempId === basketId
          ? {
              ...b,
              distance_override: score.distanceOverride,
              main_path: { ...b.main_path!, scoring: score },
            }
          : b,
      ),
    };
  return {
    ...next,
    extra_tees: next.extra_tees.map((t) =>
      t.tempId === teeId
        ? {
            ...t,
            ...(basketId === MAIN_BASKET ? { distance_override: score.distanceOverride } : {}),
            pair_paths: {
              ...t.pair_paths,
              [basketId]: { ...t.pair_paths![basketId], scoring: score },
            },
          }
        : t,
    ),
  };
}
