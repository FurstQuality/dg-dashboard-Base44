import { distanceFt, pathLengthFt, type LatLng } from "./geometry";

export type RouteMode = "same" | "joins" | "own";

export type RouteTee = {
  id: string;
  name: string;
  point: LatLng | null;
  active?: boolean;
  routeMode?: RouteMode;
  bends?: LatLng[];
};

export type RouteBasket = {
  id: string;
  name: string;
  point: LatLng | null;
  active?: boolean;
  splitPoint?: LatLng | null;
  branchBends?: LatLng[];
};

export type RouteOverride = {
  teeId: string;
  basketId: string;
  path: LatLng[];
  reason?: string;
};

export type HoleRouteNetworkInput = {
  holeId: string;
  holeNumber?: string | number;
  mainTee: RouteTee;
  mainBasket: RouteBasket;
  mainBends?: LatLng[];
  extraTees?: RouteTee[];
  extraBaskets?: RouteBasket[];
  routeOverrides?: RouteOverride[];
};

export type RouteSegmentKind = "tee-entry" | "shared-fairway" | "basket-branch" | "independent-route" | "override-route";

export type RouteSegment = {
  id: string;
  kind: RouteSegmentKind;
  path: LatLng[];
  fromOrder?: number;
  toOrder?: number;
  teeIds: string[];
  basketIds: string[];
  pairingIds: string[];
};

export type PlayableRoutePairing = {
  id: string;
  teeId: string;
  basketId: string;
  complete: boolean;
  status: "complete" | "missing" | "override";
  segmentIds: string[];
  path: LatLng[];
  distanceFt: number | null;
  issueCode?: string;
};

export type RouteNetworkIssue = {
  code: string;
  teeId?: string;
  basketId?: string;
  message: string;
};

export type HoleRouteNetwork = {
  holeId: string;
  holeNumber?: string | number;
  tees: RouteTee[];
  baskets: RouteBasket[];
  segments: RouteSegment[];
  pairings: PlayableRoutePairing[];
  issues: RouteNetworkIssue[];
  summary: {
    expectedPairings: number;
    completePairings: number;
    missingPairings: number;
    sharedSegments: number;
  };
};

type LocatedTee = RouteTee & { point: LatLng; join: TrunkStop; ownPath?: LatLng[] };
type LocatedBasket = RouteBasket & { point: LatLng; split: TrunkStop; main: boolean };
type TrunkStop = { order: number; point: LatLng };

const EPS = 0.000001;
const SAME_POINT_FT = 3;

function active<T extends { active?: boolean }>(asset: T): boolean {
  return asset.active !== false;
}

function pairingId(teeId: string, basketId: string): string {
  return `${teeId}->${basketId}`;
}

function orderKey(order: number): string {
  return order.toFixed(4).replace(/\.?0+$/, "");
}

function samePoint(a: LatLng, b: LatLng): boolean {
  return distanceFt(a, b) <= SAME_POINT_FT;
}

function pushPoint(out: LatLng[], point: LatLng): void {
  const prev = out[out.length - 1];
  if (!prev || !samePoint(prev, point)) out.push(point);
}

function joinPaths(paths: LatLng[][]): LatLng[] {
  const out: LatLng[] = [];
  for (const path of paths) for (const point of path) pushPoint(out, point);
  return out;
}

function projectToPath(point: LatLng, path: LatLng[]): TrunkStop {
  if (path.length <= 1) return { order: 0, point: path[0] ?? point };
  const lat0 = (point[0] * Math.PI) / 180;
  const kx = 364_000 * Math.cos(lat0);
  const ky = 364_000;
  const p = { x: point[1] * kx, y: point[0] * ky };
  let best = { d: Infinity, order: 0, point: path[0] };

  for (let i = 1; i < path.length; i++) {
    const a = { x: path[i - 1][1] * kx, y: path[i - 1][0] * ky };
    const b = { x: path[i][1] * kx, y: path[i][0] * ky };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    const q: LatLng = [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t];
    const d = distanceFt(point, q);
    if (d < best.d) best = { d, order: i - 1 + t, point: q };
  }

  return { order: best.order, point: best.point };
}

function pathBetween(path: LatLng[], from: TrunkStop, to: TrunkStop): LatLng[] {
  if (from.order > to.order + EPS) return [];
  const out: LatLng[] = [];
  pushPoint(out, from.point);
  for (let i = Math.ceil(from.order - EPS); i <= Math.floor(to.order + EPS); i++) {
    if (i > from.order + EPS && i < to.order - EPS && path[i]) pushPoint(out, path[i]);
  }
  pushPoint(out, to.point);
  return out;
}

function dedupeStops(stops: TrunkStop[]): TrunkStop[] {
  return [...stops]
    .sort((a, b) => a.order - b.order)
    .reduce<TrunkStop[]>((out, stop) => {
      const prev = out[out.length - 1];
      if (prev && Math.abs(prev.order - stop.order) <= EPS) return out;
      out.push(stop);
      return out;
    }, []);
}

function segmentMembership(segment: RouteSegment, pairings: PlayableRoutePairing[]): RouteSegment {
  const used = pairings.filter((pairing) => pairing.segmentIds.includes(segment.id));
  return {
    ...segment,
    teeIds: [...new Set(used.map((p) => p.teeId))],
    basketIds: [...new Set(used.map((p) => p.basketId))],
    pairingIds: used.map((p) => p.id),
  };
}

function missingPairing(teeId: string, basketId: string, issueCode: string): PlayableRoutePairing {
  return {
    id: pairingId(teeId, basketId),
    teeId,
    basketId,
    complete: false,
    status: "missing",
    segmentIds: [],
    path: [],
    distanceFt: null,
    issueCode,
  };
}

export function buildHoleRouteNetwork(input: HoleRouteNetworkInput): HoleRouteNetwork {
  const issues: RouteNetworkIssue[] = [];
  const mainTeePoint = input.mainTee.point;
  const mainBasketPoint = input.mainBasket.point;

  if (!mainTeePoint) issues.push({ code: "main_tee_unplaced", teeId: input.mainTee.id, message: "Main tee is not placed." });
  if (!mainBasketPoint)
    issues.push({ code: "main_basket_unplaced", basketId: input.mainBasket.id, message: "Main basket is not placed." });

  const activeTees = [input.mainTee, ...(input.extraTees ?? [])].filter(active);
  const activeBaskets = [input.mainBasket, ...(input.extraBaskets ?? [])].filter(active);
  const missingLocatedAssets = [
    ...activeTees.filter((tee) => !tee.point).map((tee) => ({ code: "tee_unplaced", teeId: tee.id, message: `${tee.name} tee is not placed.` })),
    ...activeBaskets
      .filter((basket) => !basket.point)
      .map((basket) => ({ code: "basket_unplaced", basketId: basket.id, message: `${basket.name} basket is not placed.` })),
  ];
  issues.push(...missingLocatedAssets);

  if (!mainTeePoint || !mainBasketPoint) {
    const pairings = activeTees.flatMap((tee) =>
      activeBaskets.map((basket) => missingPairing(tee.id, basket.id, "main_route_unplaced")),
    );
    return {
      holeId: input.holeId,
      holeNumber: input.holeNumber,
      tees: activeTees,
      baskets: activeBaskets,
      segments: [],
      pairings,
      issues,
      summary: { expectedPairings: pairings.length, completePairings: 0, missingPairings: pairings.length, sharedSegments: 0 },
    };
  }

  const mainPath = joinPaths([[mainTeePoint], input.mainBends ?? [], [mainBasketPoint]]);
  const start: TrunkStop = { order: 0, point: mainPath[0] };
  const finish: TrunkStop = { order: mainPath.length - 1, point: mainPath[mainPath.length - 1] };
  const locatedTees: LocatedTee[] = activeTees
    .filter((tee): tee is RouteTee & { point: LatLng } => !!tee.point)
    .map((tee) => {
      const isMain = tee.id === input.mainTee.id;
      const mode = isMain ? "same" : tee.routeMode ?? "same";
      if (isMain) return { ...tee, routeMode: "same", join: start };
      if (mode === "own") return { ...tee, routeMode: "own", join: finish, ownPath: joinPaths([[tee.point], tee.bends ?? [], [mainBasketPoint]]) };
      const bends = tee.bends ?? [];
      const probe = mode === "joins" && bends.length ? bends[bends.length - 1] : tee.point;
      return { ...tee, routeMode: mode, join: projectToPath(probe, mainPath) };
    });

  const locatedBaskets: LocatedBasket[] = activeBaskets
    .filter((basket): basket is RouteBasket & { point: LatLng } => !!basket.point)
    .map((basket) => {
      if (basket.id === input.mainBasket.id) return { ...basket, split: finish, main: true };
      return { ...basket, split: projectToPath(basket.splitPoint ?? basket.point, mainPath), main: false };
    });

  const stops = dedupeStops([
    start,
    finish,
    ...locatedTees.filter((tee) => tee.routeMode !== "own").map((tee) => tee.join),
    ...locatedBaskets.map((basket) => basket.split),
  ]);

  const segments: RouteSegment[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i];
    const to = stops[i + 1];
    segments.push({
      id: `shared:${orderKey(from.order)}-${orderKey(to.order)}`,
      kind: "shared-fairway",
      path: pathBetween(mainPath, from, to),
      fromOrder: from.order,
      toOrder: to.order,
      teeIds: [],
      basketIds: [],
      pairingIds: [],
    });
  }

  for (const tee of locatedTees) {
    if (tee.id === input.mainTee.id || tee.routeMode === "own") continue;
    const bends = tee.routeMode === "joins" ? (tee.bends ?? []).slice(0, -1) : tee.bends ?? [];
    const path = joinPaths([[tee.point], bends, [tee.join.point]]);
    if (path.length < 2 || samePoint(path[0], path[path.length - 1])) continue;
    segments.push({
      id: `tee:${tee.id}:to:${orderKey(tee.join.order)}`,
      kind: "tee-entry",
      path,
      fromOrder: tee.join.order,
      toOrder: tee.join.order,
      teeIds: [],
      basketIds: [],
      pairingIds: [],
    });
  }

  for (const tee of locatedTees) {
    if (tee.routeMode !== "own" || !tee.ownPath) continue;
    segments.push({
      id: `own:${tee.id}:${input.mainBasket.id}`,
      kind: "independent-route",
      path: tee.ownPath,
      teeIds: [],
      basketIds: [],
      pairingIds: [],
    });
  }

  for (const basket of locatedBaskets) {
    if (basket.main) continue;
    segments.push({
      id: `basket:${basket.id}:from:${orderKey(basket.split.order)}`,
      kind: "basket-branch",
      path: joinPaths([[basket.split.point], basket.branchBends ?? [], [basket.point]]),
      fromOrder: basket.split.order,
      toOrder: basket.split.order,
      teeIds: [],
      basketIds: [],
      pairingIds: [],
    });
  }

  for (const override of input.routeOverrides ?? []) {
    if (override.path.length < 2) continue;
    segments.push({
      id: `override:${override.teeId}:${override.basketId}`,
      kind: "override-route",
      path: override.path,
      teeIds: [],
      basketIds: [],
      pairingIds: [],
    });
  }

  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const overrides = new Map((input.routeOverrides ?? []).map((override) => [pairingId(override.teeId, override.basketId), override]));
  const pairings: PlayableRoutePairing[] = [];

  for (const tee of locatedTees) {
    for (const basket of locatedBaskets) {
      const id = pairingId(tee.id, basket.id);
      const override = overrides.get(id);
      if (override) {
        if (
          override.path.length < 2 ||
          !override.path.every((point) => point.every(Number.isFinite)) ||
          !samePoint(override.path[0], tee.point) ||
          !samePoint(override.path[override.path.length - 1], basket.point)
        ) {
          pairings.push(missingPairing(tee.id, basket.id, "invalid_route_override"));
          issues.push({ code: "invalid_route_override", teeId: tee.id, basketId: basket.id,
            message: `${tee.name} to ${basket.name} override must connect the selected tee and basket.` });
          continue;
        }
        const segmentId = `override:${tee.id}:${basket.id}`;
        pairings.push({
          id,
          teeId: tee.id,
          basketId: basket.id,
          complete: true,
          status: "override",
          segmentIds: segmentById.has(segmentId) ? [segmentId] : [],
          path: override.path,
          distanceFt: Math.round(pathLengthFt(override.path)),
        });
        continue;
      }

      if (tee.routeMode === "own") {
        if (basket.main) {
          const segmentId = `own:${tee.id}:${input.mainBasket.id}`;
          const path = segmentById.get(segmentId)?.path ?? [];
          pairings.push({
            id,
            teeId: tee.id,
            basketId: basket.id,
            complete: path.length >= 2,
            status: path.length >= 2 ? "complete" : "missing",
            segmentIds: path.length >= 2 ? [segmentId] : [],
            path,
            distanceFt: path.length >= 2 ? Math.round(pathLengthFt(path)) : null,
            issueCode: path.length >= 2 ? undefined : "own_route_missing",
          });
          continue;
        }
        pairings.push(missingPairing(tee.id, basket.id, "own_route_needs_basket_override"));
        issues.push({
          code: "own_route_needs_basket_override",
          teeId: tee.id,
          basketId: basket.id,
          message: `${tee.name} has its own fairway to ${input.mainBasket.name}; ${basket.name} needs an explicit route override.`,
        });
        continue;
      }

      if (basket.split.order + EPS < tee.join.order) {
        pairings.push(missingPairing(tee.id, basket.id, "basket_splits_before_tee_merge"));
        issues.push({
          code: "basket_splits_before_tee_merge",
          teeId: tee.id,
          basketId: basket.id,
          message: `${basket.name} splits before ${tee.name} merges into the shared fairway.`,
        });
        continue;
      }

      const ids: string[] = [];
      const teeSegment = `tee:${tee.id}:to:${orderKey(tee.join.order)}`;
      if (segmentById.has(teeSegment)) ids.push(teeSegment);
      for (const segment of segments) {
        if (segment.kind !== "shared-fairway") continue;
        if ((segment.fromOrder ?? 0) + EPS >= tee.join.order && (segment.toOrder ?? 0) <= basket.split.order + EPS) {
          ids.push(segment.id);
        }
      }
      if (!basket.main) ids.push(`basket:${basket.id}:from:${orderKey(basket.split.order)}`);
      const path = joinPaths(ids.map((segmentId) => segmentById.get(segmentId)?.path ?? []));
      pairings.push({
        id,
        teeId: tee.id,
        basketId: basket.id,
        complete: path.length >= 2,
        status: path.length >= 2 ? "complete" : "missing",
        segmentIds: ids,
        path,
        distanceFt: path.length >= 2 ? Math.round(pathLengthFt(path)) : null,
        issueCode: path.length >= 2 ? undefined : "route_path_empty",
      });
    }
  }

  for (const tee of activeTees) {
    for (const basket of activeBaskets) {
      if (!tee.point || !basket.point) pairings.push(missingPairing(tee.id, basket.id, "route_asset_unplaced"));
    }
  }

  const populatedSegments = segments.map((segment) => segmentMembership(segment, pairings)).filter((segment) => segment.pairingIds.length > 0);
  const completePairings = pairings.filter((pairing) => pairing.complete).length;
  const missingPairings = pairings.length - completePairings;

  return {
    holeId: input.holeId,
    holeNumber: input.holeNumber,
    tees: activeTees,
    baskets: activeBaskets,
    segments: populatedSegments,
    pairings,
    issues,
    summary: {
      expectedPairings: activeTees.length * activeBaskets.length,
      completePairings,
      missingPairings,
      sharedSegments: populatedSegments.filter((segment) => segment.kind === "shared-fairway" && segment.pairingIds.length > 1).length,
    },
  };
}
