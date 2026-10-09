import type { FairwayDraft } from "./pairing-fairways";
import { pathLengthFt, type LatLng } from "./geometry";

export type FairwayGeometry = {
  edge: (a: string, b: string) => LatLng[];
  route: (key: string) => LatLng[];
  distance: (key: string) => number;
};

/** Index a draft once and sample shared edges once. Rebuild after edits;
 * a global cache would retain stale geometry from mutable legacy callers. */
export function createFairwayGeometry(draft: FairwayDraft, steps = 16): FairwayGeometry {
  if (!Number.isInteger(steps) || steps < 1)
    throw new Error("Curve sampling needs a positive whole-number step count.");
  const points = new Map<string, LatLng | null>(Object.entries(draft.network.points));
  for (const tee of draft.tees) points.set(`tee:${tee.id}`, tee.point);
  for (const basket of draft.baskets) points.set(`basket:${basket.id}`, basket.point);
  const point = (id: string): LatLng => {
    const p = points.get(id);
    if (
      !p ||
      p.length !== 2 ||
      !p.every(Number.isFinite) ||
      Math.abs(p[0]) > 90 ||
      Math.abs(p[1]) > 180
    )
      throw new Error("Missing or invalid fairway point.");
    return p;
  };
  const neighbors = new Map<string, [string, string][]>();
  for (const key of Object.keys(draft.network.routes).sort()) {
    const nodes = draft.network.routes[key].nodes;
    for (let i = 1; i < nodes.length - 1; i++) {
      const id = nodes[i];
      if (!draft.network.points[id]) continue;
      const candidates = neighbors.get(id) ?? [];
      candidates.push([nodes[i - 1], nodes[i + 1]]);
      neighbors.set(id, candidates);
    }
  }
  const samples = new Map<string, LatLng[]>();
  const lengths = new Map<string, number>();
  const edge = (a: string, b: string): LatLng[] => {
    const key = JSON.stringify([a, b]);
    const previous = samples.get(key);
    if (previous) return previous;
    if (a > b) {
      const reversed = [...edge(b, a)].reverse();
      samples.set(key, reversed);
      return reversed;
    }
    const start = point(a),
      end = point(b);
    const k = Math.cos(((start[0] + end[0]) * Math.PI) / 360);
    const chord: [number, number] = [(end[1] - start[1]) * k, end[0] - start[0]];
    const length = Math.hypot(...chord);
    if (!length) {
      const result = [start, end];
      samples.set(key, result);
      return result;
    }
    const tangent = (id: string): [number, number] => {
      for (const [before, after] of neighbors.get(id) ?? []) {
        const p = point(before),
          q = point(after);
        const vector: [number, number] = [(q[1] - p[1]) * k, q[0] - p[0]];
        if (Math.hypot(...vector) > 1e-12) return vector;
      }
      return chord;
    };
    const control = (p: LatLng, id: string, sign: number): LatLng => {
      const t = tangent(id),
        scale = length / (3 * (Math.hypot(...t) || length));
      const orientation = t[0] * chord[0] + t[1] * chord[1] < 0 ? -1 : 1;
      return [
        p[0] + sign * orientation * t[1] * scale,
        p[1] + (Math.abs(k) > 1e-12 ? (sign * orientation * t[0] * scale) / k : 0),
      ];
    };
    const c = control(start, a, 1),
      e = control(end, b, -1);
    const result = Array.from({ length: steps + 1 }, (_, i): LatLng => {
      if (i === 0) return start;
      if (i === steps) return end;
      const t = i / steps,
        u = 1 - t;
      return [
        u * u * u * start[0] + 3 * u * u * t * c[0] + 3 * u * t * t * e[0] + t * t * t * end[0],
        u * u * u * start[1] + 3 * u * u * t * c[1] + 3 * u * t * t * e[1] + t * t * t * end[1],
      ];
    });
    samples.set(key, result);
    return result;
  };
  const nodesFor = (key: string) => {
    const route = draft.network.routes[key];
    if (!route) throw new Error("This fairway route is unavailable.");
    return route.nodes;
  };
  return {
    edge,
    route(key) {
      const nodes = nodesFor(key);
      return nodes.slice(1).flatMap((b, i) => edge(nodes[i], b).slice(i ? 1 : 0));
    },
    distance(key) {
      const nodes = nodesFor(key);
      let distance = 0;
      for (let i = 1; i < nodes.length; i++) {
        const a = nodes[i - 1],
          b = nodes[i];
        const edgeKey = JSON.stringify(a < b ? [a, b] : [b, a]);
        let length = lengths.get(edgeKey);
        if (length === undefined) {
          length = pathLengthFt(edge(a, b));
          lengths.set(edgeKey, length);
        }
        distance += length;
      }
      return Math.round(distance);
    },
  };
}

/** Control points remain the only editable and persisted geometry. */
export function curvedFairwayEdge(draft: FairwayDraft, a: string, b: string, steps = 16): LatLng[] {
  return createFairwayGeometry(draft, steps).edge(a, b);
}

export function curvedRoutePoints(draft: FairwayDraft, key: string): LatLng[] {
  return createFairwayGeometry(draft).route(key);
}
