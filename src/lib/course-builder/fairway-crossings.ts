import { pointFor, prune, type FairwayDraft } from "./pairing-fairways";
import type { LatLng } from "./geometry";

const eps = 1e-9;
const near = (a: LatLng, b: LatLng) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;
const cross = (a: LatLng, b: LatLng) => a[0] * b[1] - a[1] * b[0];
const sub = (a: LatLng, b: LatLng): LatLng => [a[0] - b[0], a[1] - b[1]];
const at = (a: LatLng, b: LatLng, t: number): LatLng => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
const fraction = (a: LatLng, b: LatLng, p: LatLng) => Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) ? (p[0] - a[0]) / (b[0] - a[0]) : (p[1] - a[1]) / (b[1] - a[1]);

/** Join exact line crossings and overlapping stretches without moving endpoints or bends. */
export function combineFairwayCrossings(draft: FairwayDraft): FairwayDraft {
  const network = structuredClone(draft.network);
  const segments = Object.entries(draft.network.routes).flatMap(([route, r]) => r.nodes.slice(0, -1).map((a, i) => ({
    route, index: i, a, b: r.nodes[i + 1], p: pointFor(draft, a), q: pointFor(draft, r.nodes[i + 1]), cuts: [] as { t: number; id: string }[],
  })));
  const junctions: { point: LatLng; id: string }[] = [];
  function junction(point: LatLng) {
    const known = junctions.find(j => near(j.point, point));
    if (known) return known.id;
    const existing = Object.entries(network.points).find(([, p]) => near(p, point));
    let id = existing?.[0] ?? `point:cross:${point[0].toFixed(10)}:${point[1].toFixed(10)}`;
    // Avoid replacing an unrelated point whose rounded ID collides.
    while (network.points[id] && !near(network.points[id], point)) id += ":junction";
    network.points[id] = existing?.[1] ?? point;
    junctions.push({ point, id });
    return id;
  }
  function cut(s: typeof segments[number], t: number, id: string) {
    // Tee pads and baskets retain their own canonical identities.
    if (t <= eps && !s.a.startsWith("point:")) return;
    if (t >= 1 - eps && !s.b.startsWith("point:")) return;
    if (!s.cuts.some(c => Math.abs(c.t - t) < eps)) s.cuts.push({ t: Math.max(0, Math.min(1, t)), id });
  }
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const a = segments[i], b = segments[j];
    if (a.route === b.route || near(a.p, a.q) || near(b.p, b.q)) continue;
    const r = sub(a.q, a.p), s = sub(b.q, b.p), v = sub(b.p, a.p), denominator = cross(r, s);
    const hits: LatLng[] = [];
    if (Math.abs(denominator) > 1e-16) {
      const t = cross(v, s) / denominator, u = cross(v, r) / denominator;
      if (t >= -eps && t <= 1 + eps && u >= -eps && u <= 1 + eps) hits.push(at(a.p, a.q, Math.max(0, Math.min(1, t))));
    } else if (Math.abs(cross(v, r)) < 1e-16) {
      for (const p of [a.p, a.q, b.p, b.q]) {
        const t = fraction(a.p, a.q, p), u = fraction(b.p, b.q, p);
        if (t >= -eps && t <= 1 + eps && u >= -eps && u <= 1 + eps && !hits.some(h => near(h, p))) hits.push(p);
      }
    }
    for (const p of hits) {
      const t = fraction(a.p, a.q, p), u = fraction(b.p, b.q, p);
      const nodeA = t <= eps ? a.a : t >= 1 - eps ? a.b : null;
      const nodeB = u <= eps ? b.a : u >= 1 - eps ? b.b : null;
      if (nodeA && nodeA === nodeB) continue; // Already connected.
      if (nodeA && !nodeA.startsWith("point:") && nodeB && !nodeB.startsWith("point:")) continue;
      const id = junction(p); cut(a, t, id); cut(b, u, id);
    }
  }
  for (const [key, route] of Object.entries(network.routes)) {
    const nodes: string[] = [];
    for (const s of segments.filter(s => s.route === key)) {
      const cuts = s.cuts.sort((a, b) => a.t - b.t);
      const start = cuts.find(c => c.t <= eps)?.id ?? s.a;
      const end = cuts.find(c => c.t >= 1 - eps)?.id ?? s.b;
      for (const id of [start, ...cuts.filter(c => c.t > eps && c.t < 1 - eps).map(c => c.id), end]) if (nodes.at(-1) !== id) nodes.push(id);
    }
    // Ambiguous self-returning routes remain intact rather than losing geometry.
    if (new Set(nodes).size === nodes.length) route.nodes = nodes;
  }
  return { ...draft, network: prune(network) };
}
