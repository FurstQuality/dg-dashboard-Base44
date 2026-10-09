import { distanceFt, pathLengthFt, type LatLng } from "./geometry";
import {curvedRoutePoints} from "./fairway-curves";

export type FairwayPin = { id: string; name: string; point: LatLng | null; color?: string; basketIds?: string[] };
export type FairwayRoute = { teeId: string; basketId: string; startBasketId?: string; nodes: string[] };
/** Only interior points are stored here. Endpoints always resolve from canonical pins. */
export type FairwayNetwork = { version: 1; points: Record<string, LatLng>; routes: Record<string, FairwayRoute> };
export type FairwayDraft = { tees: FairwayPin[]; baskets: FairwayPin[]; network: FairwayNetwork };
export const pairKey = (teeId: string, basketId: string) => `${teeId}/${basketId}`;
export const teeNode = (id: string) => `tee:${id}`;
export const basketNode = (id: string) => `basket:${id}`;
export const basketRouteKey = (from: string, to: string) => pairKey(`basket:${from}`, to);
export const emptyFairways = (): FairwayNetwork => ({ version: 1, points: {}, routes: {} });
const clone = (network: FairwayNetwork): FairwayNetwork => structuredClone(network);
export const validPoint = (point: unknown): point is LatLng => Array.isArray(point) && point.length === 2 &&
  point.every(v => typeof v === "number" && Number.isFinite(v)) && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180;

/** Add each newly placed pairing without changing any existing route. */
export function syncPairings(network: FairwayNetwork, tees: FairwayPin[], baskets: FairwayPin[]): FairwayNetwork {
  const routes: FairwayNetwork["routes"] = {};
  for (const tee of tees.filter(t => validPoint(t.point))) for (const basket of baskets.filter(b => validPoint(b.point))) {
    if (tee.basketIds && !tee.basketIds.includes(basket.id)) continue;
    const key = pairKey(tee.id, basket.id);
    routes[key] = network.routes[key] ?? { teeId: tee.id, basketId: basket.id, nodes: [teeNode(tee.id), basketNode(basket.id)] };
  }
  return prune({ ...network, routes });
}

export function pointFor(draft: FairwayDraft, id: string): LatLng {
  const point = id.startsWith("tee:") ? draft.tees.find(t => teeNode(t.id) === id)?.point
    : id.startsWith("basket:") ? draft.baskets.find(b => basketNode(b.id) === id)?.point : draft.network.points[id];
  if (!validPoint(point)) throw new Error("A fairway point is missing or invalid.");
  return point;
}

export function routePoints(draft: FairwayDraft, routeId: string): LatLng[] {
  return draft.network.routes[routeId].nodes.map(id => pointFor(draft, id));
}

export function routeDistance(draft: FairwayDraft, routeId: string): number {
  return Math.round(pathLengthFt(curvedRoutePoints(draft, routeId)));
}

export function prune(network: FairwayNetwork): FairwayNetwork {
  const used = new Set(Object.values(network.routes).flatMap(r => r.nodes));
  return { ...network, points: Object.fromEntries(Object.entries(network.points).filter(([id]) => used.has(id))) };
}

/** Splitting a shared edge inserts ONE point into every route using that edge. */
export function insertFairwayPoint(network: FairwayNetwork, routeId: string, edge: number, point: LatLng, id: string): FairwayNetwork {
  if (!validPoint(point) || !id.startsWith("point:") || network.points[id]) throw new Error("Invalid new fairway point.");
  const nodes = network.routes[routeId]?.nodes;
  if (!nodes || edge < 0 || edge >= nodes.length - 1) throw new Error("Choose a fairway segment.");
  const [a, b] = [nodes[edge], nodes[edge + 1]];
  const next = clone(network);
  next.points[id] = point;
  for (const route of Object.values(next.routes)) {
    for (let i = route.nodes.length - 2; i >= 0; i--) {
      if ((route.nodes[i] === a && route.nodes[i + 1] === b) || (route.nodes[i] === b && route.nodes[i + 1] === a)) route.nodes.splice(i + 1, 0, id);
    }
  }
  return next;
}

export function moveFairwayPoint(network: FairwayNetwork, id: string, point: LatLng): FairwayNetwork {
  if (!network.points[id] || !validPoint(point)) throw new Error("Choose an interior fairway point.");
  return { ...network, points: { ...network.points, [id]: point } };
}

/** The selected route gets its own point; every other route keeps its old shape. */
export function detachFairwayPoint(network: FairwayNetwork, routeId: string, id: string, newId: string): FairwayNetwork {
  if (!network.points[id] || !network.routes[routeId]?.nodes.includes(id) || network.points[newId] || !newId.startsWith("point:")) throw new Error("Choose an interior fairway point.");
  const next = clone(network);
  next.points[newId] = [...next.points[id]];
  next.routes[routeId].nodes = next.routes[routeId].nodes.map(n => n === id ? newId : n);
  return prune(next);
}

/** Remove a bend from this route only; shared routes retain their copy. */
export function removeFairwayPoint(network: FairwayNetwork, routeId: string, id: string): FairwayNetwork {
  if (!network.points[id]) throw new Error("Tee and basket endpoints cannot be removed from a fairway.");
  const next = clone(network);
  next.routes[routeId].nodes = next.routes[routeId].nodes.filter(n => n !== id);
  return prune(next);
}

/** Deliberate point-to-point join. Only the selected route changes. */
export function joinFairwayPoint(network: FairwayNetwork, routeId: string, from: string, target: string): FairwayNetwork {
  const route = network.routes[routeId];
  if (!network.points[from] || !network.points[target] || !route?.nodes.includes(from)) throw new Error("Choose two bend points to join.");
  if (from === target) return network;
  if (route.nodes.includes(target)) throw new Error("That join would loop back through this fairway.");
  const next = clone(network);
  next.routes[routeId].nodes = route.nodes.map(id => id === from ? target : id);
  return prune(next);
}

/** Keep the exact shape while giving this route independent control points. */
export function separateFairway(network: FairwayNetwork, routeId: string, uid: () => string): FairwayNetwork {
  const next = clone(network), route = next.routes[routeId];
  if (!route) throw new Error("Select a fairway.");
  route.nodes = route.nodes.map(id => {
    if (!next.points[id]) return id;
    const copy = uid();
    if (!copy.startsWith("point:") || next.points[copy]) throw new Error("Invalid new fairway point.");
    next.points[copy] = [...next.points[id]];
    return copy;
  });
  return prune(next);
}

export function straightenFairway(network: FairwayNetwork, routeId: string): FairwayNetwork {
  const route = network.routes[routeId];
  if (!route) throw new Error("Select a fairway.");
  return prune({ ...network, routes: { ...network.routes, [routeId]: { ...route, nodes: [route.nodes[0], route.nodes.at(-1)!] } } });
}

/** Replace just the selected interval by references to another route's interval.
 * Join/split boundaries are interior points, so pin identity never changes. */
export function shareFairwaySection(network: FairwayNetwork, source: string, from: string, to: string,
  target: string, targetFrom: string, targetTo: string): FairwayNetwork {
  if (source === target) throw new Error("Choose another fairway to share.");
  const s = network.routes[source]?.nodes, t = network.routes[target]?.nodes;
  if (!s || !t) throw new Error("Choose two fairways.");
  const a = s.indexOf(from), b = s.indexOf(to), c = t.indexOf(targetFrom), d = t.indexOf(targetTo);
  if (a < 1 || b <= a || b >= s.length - 1 || c < 1 || d <= c || d >= t.length - 1) throw new Error("Choose join and split points in tee-to-basket order.");
  const nodes = [...s.slice(0, a), ...t.slice(c, d + 1), ...s.slice(b + 1)];
  if (new Set(nodes).size !== nodes.length) throw new Error("That link would loop back through the same point. Choose a shorter section.");
  const next = clone(network);
  next.routes[source].nodes = nodes;
  return prune(next);
}

/** Split off any section while preserving its shared join and split locations. */
export function detachFairwaySection(draft: FairwayDraft, routeId: string, from: string, to: string, uid: () => string): FairwayNetwork {
  const next = clone(draft.network), route = next.routes[routeId];
  const newPoint = () => {
    const id = uid();
    if (!id.startsWith("point:") || next.points[id]) throw new Error("Invalid new fairway point.");
    return id;
  };
  const a = route?.nodes.indexOf(from), b = route?.nodes.indexOf(to);
  if (a == null || b == null || a < 0 || b <= a) throw new Error("Choose a section in tee-to-basket order.");
  if (b === a + 1) {
    const p = pointFor(draft, from), q = pointFor(draft, to), id = newPoint();
    next.points[id] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    route.nodes.splice(b, 0, id);
  } else {
    for (let i = a + 1; i < b; i++) {
      const id = newPoint(); next.points[id] = [...pointFor(draft, route.nodes[i])]; route.nodes[i] = id;
    }
  }
  return prune(next);
}

export function fairwayEdges(network: FairwayNetwork) {
  const edges = new Map<string, { a: string; b: string; routes: string[] }>();
  for (const [key, route] of Object.entries(network.routes)) for (let i = 1; i < route.nodes.length; i++) {
    const [a, b] = [route.nodes[i - 1], route.nodes[i]];
    const id = [a, b].sort().join("|");
    const edge = edges.get(id) ?? { a, b, routes: [] }; edge.routes.push(key); edges.set(id, edge);
  }
  return [...edges.values()];
}

export function validateFairwayDraft(draft: FairwayDraft): string[] {
  const errors: string[] = [];
  if (draft.network.version !== 1) errors.push("Unsupported fairway version.");
  if (new Set(draft.tees.map(t => t.id)).size !== draft.tees.length || new Set(draft.baskets.map(b => b.id)).size !== draft.baskets.length) errors.push("Duplicate pin identity.");
  for (const pin of [...draft.tees, ...draft.baskets]) if (pin.point !== null && !validPoint(pin.point)) errors.push("Invalid pin coordinates.");
  for (const [id, point] of Object.entries(draft.network.points)) if (!id.startsWith("point:") || !validPoint(point)) errors.push("Invalid fairway point.");
  const expected = syncPairings(emptyFairways(), draft.tees, draft.baskets).routes;
  if (Object.keys(expected).some(key => !draft.network.routes[key])) errors.push("Every assigned tee pad and basket needs a fairway.");
  for (const [key, route] of Object.entries(draft.network.routes)) {
    const basketStart = route.startBasketId;
    const validStart = basketStart ? basketStart !== route.basketId && route.teeId === `basket:${basketStart}` && draft.baskets.some(b=>b.id===basketStart && validPoint(b.point)) : !!expected[key];
    if (!validStart || key !== pairKey(route.teeId, route.basketId) || route.nodes.length < 2 || route.nodes[0] !== (basketStart ? basketNode(basketStart) : teeNode(route.teeId)) || route.nodes.at(-1) !== basketNode(route.basketId)) errors.push("A fairway has invalid endpoints.");
    if (new Set(route.nodes).size !== route.nodes.length || route.nodes.slice(1, -1).some(n => !draft.network.points[n])) errors.push("A fairway contains a loop or missing point.");
    try { routePoints(draft, key); } catch { errors.push("A fairway references an unplaced pin."); }
  }
  return [...new Set(errors)];
}

/** One deliberate click chooses the junction; the selected route follows the
 * target's remaining bends. No nearest-route guesses or automatic crossings. */
export function joinFairwayApproach(draft: FairwayDraft, source: string, target: string, edge: number, point: LatLng, id: string): FairwayNetwork {
  const a = draft.network.routes[source], b = draft.network.routes[target];
  if (!a || !b || source === target || a.basketId !== b.basketId) throw new Error("Choose another fairway to the same basket.");
  const next = insertFairwayPoint(draft.network, target, edge, point, id);
  const tail = next.routes[target].nodes.slice(next.routes[target].nodes.indexOf(id));
  next.routes[source].nodes = [a.nodes[0], ...tail];
  const errors = validateFairwayDraft({...draft, network:next});
  if(errors.length) throw new Error(errors.join(" "));
  return prune(next);
}

/** Give a straight route two handles without guessing the terrain or moving pins. */
export function addFairwayShapeHandles(draft:FairwayDraft,key:string,uid:()=>string):FairwayNetwork {
  const route=draft.network.routes[key];
  if(!route || route.nodes.length!==2) throw new Error("This route already has bend handles.");
  const a=pointFor(draft,route.nodes[0]),b=pointFor(draft,route.nodes[1]);
  const at=(t:number):LatLng=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  let network=insertFairwayPoint(draft.network,key,0,at(1/3),uid());
  network=insertFairwayPoint(network,key,1,at(2/3),uid());
  return network;
}

/** Project a map click to the nearest part of a polyline (not just its vertices). */
export function nearestFairwaySegment(points: LatLng[], probe: LatLng): { edge: number; point: LatLng; distance: number } {
  let best = { edge: 0, point: points[0], distance: Infinity };
  const k = Math.cos(probe[0] * Math.PI / 180);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = (b[1] - a[1]) * k, dy = b[0] - a[0];
    const t = Math.max(0, Math.min(1, (((probe[1] - a[1]) * k * dx + (probe[0] - a[0]) * dy) / (dx * dx + dy * dy)) || 0));
    const point: LatLng = [a[0] + t * dy, a[1] + t * (b[1] - a[1])], distance = distanceFt(point, probe);
    if (distance < best.distance) best = { edge: i - 1, point, distance };
  }
  return best;
}
