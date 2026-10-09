import { smoothLine } from "./fairway";
import { distanceFt, type LatLng } from "./geometry";
import { type FairwayDraft, pairKey } from "./pairing-fairways";

export type LegacyFairway = {
  teeId: string; basketId: string; bends: LatLng[];
  tees: { id: string; point: LatLng; mode: "own" | "joins" | "same"; bends: LatLng[] }[];
  baskets: { id: string; point: LatLng; split: LatLng | null }[];
};
const nearest = (point: LatLng, line: LatLng[]) => line.reduce((best, p, i) => distanceFt(point, p) < distanceFt(point, line[best]) ? i : best, 0);

/** Import the legacy renderer's sampled curves, including tee-to-tee joins.
 * Existing explicit pair routes win. Undefined combinations retain their new direct route.
 * Coincident points are shared ONLY inside this already-shared legacy network. */
export function seedLegacyFairways(draft: FairwayDraft, legacy: LegacyFairway, namespace: string, imported = new Set<string>()): string[] {
  const tee = draft.tees.find(t => t.id === legacy.teeId)?.point;
  const basket = draft.baskets.find(b => b.id === legacy.basketId)?.point;
  if (!tee || !basket) return [];
  const main = smoothLine([tee, ...legacy.bends, basket]);
  type Branch = { id: string; line: LatLng[]; join: number; via?: Branch; viaIndex?: number };
  const branches: Branch[] = legacy.tees.map(t => {
    if (t.mode === "own") return { id: t.id, line: smoothLine([t.point, ...t.bends, basket]), join: -1 };
    const shape = t.mode === "joins" && t.bends.length ? t.bends.slice(0, -1) : [];
    const probe = t.mode === "joins" && t.bends.length ? t.bends.at(-1)! : t.point;
    const join = nearest(probe, main);
    return { id: t.id, line: smoothLine([t.point, ...shape, main[join]]), join };
  });
  for (const r of branches) {
    const t = legacy.tees.find(t => t.id === r.id)!;
    if (t.mode !== "joins" || !t.bends.length) continue;
    const probe = t.bends.at(-1)!;
    if (distanceFt(probe, main[nearest(probe, main)]) < 2 * 3.28084) continue;
    for (const other of branches) {
      if (other === r || other.line.length < 2 || other.via === r) continue;
      const i = nearest(probe, other.line);
      if (distanceFt(probe, other.line[i]) < 2 * 3.28084) {
        r.line = smoothLine([t.point, ...t.bends.slice(0, -1), other.line[i]]);
        r.via = other; r.viaIndex = i; break;
      }
    }
  }
  const warnings: string[] = [], shared = new Map<string, string>();
  function setPath(t: string, b: string, path: LatLng[]) {
    const key = pairKey(t, b), route = draft.network.routes[key];
    if (!route || imported.has(key)) return;
    const cleaned = path.filter((p, i) => !i || distanceFt(path[i - 1], p) > .01);
    const interior = cleaned.slice(1, -1).map(p => {
      const coordinate = `${p[0]},${p[1]}`;
      let id = shared.get(coordinate);
      if (!id) { id = `point:legacy-${namespace}-${shared.size}`; shared.set(coordinate, id); draft.network.points[id] = p; }
      return id;
    });
    if (new Set(interior).size !== interior.length) { warnings.push("A legacy route loops over itself; its original remains unchanged. Adjust its new direct fairway before saving."); return; }
    route.nodes = [route.nodes[0], ...interior, route.nodes.at(-1)!]; imported.add(key);
  }
  function fullBranch(r: Branch, seen = new Set<string>()): { path: LatLng[]; join: number } | null {
    if (seen.has(r.id)) return null;
    seen.add(r.id);
    if (!r.via) return { path: r.line, join: r.join };
    const tail = fullBranch(r.via, seen);
    if (!tail) return null;
    return { path: [...r.line, ...tail.path.slice((r.viaIndex ?? 0) + 1)], join: tail.join };
  }
  const basketBranches = legacy.baskets.map(b => ({ ...b, at: b.split ? nearest(b.split, main) : Math.max(0, nearest(b.point, main) - 3) }));
  setPath(legacy.teeId, legacy.basketId, main);
  for (const b of basketBranches) setPath(legacy.teeId, b.id, [...main.slice(0, b.at + 1), b.point]);
  for (const r of branches) {
    const full = fullBranch(r);
    if (!full) { warnings.push("A legacy tee-join cycle needs review; its original data remains unchanged."); continue; }
    setPath(r.id, legacy.basketId, [...full.path, ...(full.join >= 0 ? main.slice(full.join + 1) : [])]);
    for (const b of basketBranches) {
      if (full.join < 0 || b.at < full.join) continue; // This combination had no defined legacy path.
      setPath(r.id, b.id, [...full.path, ...main.slice(full.join + 1, b.at + 1), b.point]);
    }
  }
  return warnings;
}
