/**
 * Layout Studio rules (pure). A layout is an ordered list of slots that
 * reference canonical course tees/baskets/holes — never copies of geometry.
 */
import { distanceFt, type LatLng } from "./geometry";

export type Asset = { id: string; course_hole_id: string; name: string; latitude: number | null; longitude: number | null };
export type Slot = {
  id?: string;
  position: number;
  display_label: string;
  course_hole_id: string;
  tee_id: string | null;
  basket_id: string | null;
  par: number | null;
  included: boolean;
  flight_path?: LatLng[] | null;
  rules?: unknown;
  legacy_hole_id?: string | null;
};

const pt = (a?: Asset | null): LatLng | null =>
  a && a.latitude != null && a.longitude != null && Number.isFinite(a.latitude) && Number.isFinite(a.longitude)
    && Math.abs(a.latitude) <= 90 && Math.abs(a.longitude) <= 180 ? [a.latitude, a.longitude] : null;

export function slotDistanceFt(s: Slot, tees: Map<string, Asset>, baskets: Map<string, Asset>): number | null {
  const t = pt(s.tee_id ? tees.get(s.tee_id) : null);
  const b = pt(s.basket_id ? baskets.get(s.basket_id) : null);
  return t && b ? Math.round(distanceFt(t, b)) : null;
}

/** Hole count, par and distance are always derived — never typed. */
export function layoutTotals(slots: Slot[], tees: Map<string, Asset>, baskets: Map<string, Asset>) {
  const inc = slots.filter((s) => s.included);
  let distance = 0;
  let measured = 0;
  for (const s of inc) {
    const d = slotDistanceFt(s, tees, baskets);
    if (d != null) {
      distance += d;
      measured++;
    }
  }
  const parKnown = inc.every((s) => s.par != null);
  return {
    holes: inc.length,
    par: inc.length && parKnown ? inc.reduce((a, s) => a + (s.par ?? 0), 0) : null,
    distanceFt: measured ? distance : null,
    measuredHoles: measured,
  };
}

const norm = (s: string) => s.trim().toLowerCase();

/** Swap every slot to the asset named `target` on its hole; holes without it keep theirs and are flagged. */
export function bulkSwap(
  slots: Slot[],
  kind: "tee" | "basket",
  target: string,
  assets: Asset[],
): { slots: Slot[]; changed: number; exceptions: string[] } {
  const byHole = new Map<string, Asset>();
  for (const a of assets) if (norm(a.name) === norm(target)) byHole.set(a.course_hole_id, a);
  let changed = 0;
  const exceptions: string[] = [];
  const next = slots.map((s) => {
    if (!s.included) return s;
    const hit = byHole.get(s.course_hole_id);
    if (!hit) {
      exceptions.push(s.display_label);
      return s;
    }
    const key = kind === "tee" ? "tee_id" : "basket_id";
    if (s[key] === hit.id) return s;
    changed++;
    return { ...s, [key]: hit.id, par: null, flight_path: null };
  });
  return { slots: next, changed, exceptions };
}

/** Renumber positions 1..N in current order; labels follow when numbering mode is "route". */
export function renumber(slots: Slot[], mode: "route" | "course"): Slot[] {
  let n = 0;
  return slots.map((s) => {
    const position = ++n;
    const numeric = /^\d+$/.test(s.display_label);
    return { ...s, position, display_label: mode === "route" && numeric ? String(position) : s.display_label };
  });
}

export function moveSlot(slots: Slot[], from: number, to: number): Slot[] {
  if (to < 0 || to >= slots.length || from === to) return slots;
  const next = [...slots];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/** Keep only slots whose label/position is in range (Front 9 = 1..9, Back 9 = 10..18). */
export function keepRange(slots: Slot[], from: number, to: number): Slot[] {
  return slots.map((s) => ({ ...s, included: s.position >= from && s.position <= to }));
}

export type LayoutIssue = { level: "error" | "warning"; message: string };

export function validateLayout(slots: Slot[], tees?: Map<string, Asset>, baskets?: Map<string, Asset>): LayoutIssue[] {
  const inc = slots.filter((s) => s.included);
  const out: LayoutIssue[] = [];
  if (!inc.length) out.push({ level: "error", message: "Add at least one hole." });
  for (const s of inc) {
    if (!s.tee_id) out.push({ level: "error", message: `Hole ${s.display_label} has no tee.` });
    if (!s.basket_id) out.push({ level: "error", message: `Hole ${s.display_label} has no basket.` });
    if (s.par == null) out.push({ level: "error", message: `Hole ${s.display_label} has no par.` });
    else if (!Number.isInteger(s.par) || s.par < 2 || s.par > 7) out.push({ level: "error", message: `Hole ${s.display_label} needs a whole-number par from 2 to 7.` });
    if (!s.display_label.trim()) out.push({ level: "error", message: `Position ${s.position} needs a hole label.` });
    if (!Number.isInteger(s.position) || s.position < 1) out.push({ level: "error", message: `Position ${s.position} must be a positive whole number.` });
    if (s.tee_id && tees && !tees.has(s.tee_id)) out.push({ level: "error", message: `Hole ${s.display_label} references an unavailable tee.` });
    if (s.basket_id && baskets && !baskets.has(s.basket_id)) out.push({ level: "error", message: `Hole ${s.display_label} references an unavailable basket.` });
  }
  const pos = new Set<number>();
  for (const s of inc) {
    if (pos.has(s.position)) out.push({ level: "error", message: `Position ${s.position} is used twice.` });
    pos.add(s.position);
  }
  const seen = new Map<string, number>();
  for (const s of inc) seen.set(s.course_hole_id, (seen.get(s.course_hole_id) ?? 0) + 1);
  for (const [hole, n] of seen)
    if (n > 1) {
      const label = inc.find((s) => s.course_hole_id === hole)?.display_label ?? "?";
      out.push({ level: "warning", message: `Hole ${label} appears ${n} times in this layout.` });
    }
  return out;
}

export type LayoutReadiness = {
  scoring: { ready: boolean; missing: number };
  map: { ready: boolean; missing: number };
};

/**
 * Per-layout readiness: scoring needs every included hole to have a tee,
 * basket and par; map needs every included tee and basket placed on the map.
 */
export function layoutReadiness(slots: Slot[], tees: Map<string, Asset>, baskets: Map<string, Asset>): LayoutReadiness {
  const inc = slots.filter((s) => s.included);
  const scoringMissing = inc.filter((s) => !s.tee_id || !tees.has(s.tee_id) || !s.basket_id || !baskets.has(s.basket_id)
    || s.par == null || !Number.isInteger(s.par) || s.par < 2 || s.par > 7).length;
  const mapMissing = inc.filter((s) => slotDistanceFt(s, tees, baskets) == null).length;
  return {
    scoring: { ready: inc.length > 0 && scoringMissing === 0, missing: inc.length ? scoringMissing : 1 },
    map: { ready: inc.length > 0 && mapMissing === 0, missing: inc.length ? mapMissing : 1 },
  };
}


export type SlotDiff = { label: string; changes: string[] };

/** Differences between two layouts, matched by route position. */
export function compareLayouts(
  a: Slot[],
  b: Slot[],
  names: { tee: (id: string | null) => string; basket: (id: string | null) => string },
): { diffs: SlotDiff[]; same: number } {
  const ai = a.filter((s) => s.included);
  const bi = b.filter((s) => s.included);
  const max = Math.max(ai.length, bi.length);
  const diffs: SlotDiff[] = [];
  let same = 0;
  for (let i = 0; i < max; i++) {
    const x = ai[i];
    const y = bi[i];
    const label = (y ?? x)!.display_label;
    if (!x) {
      diffs.push({ label, changes: ["Added"] });
      continue;
    }
    if (!y) {
      diffs.push({ label, changes: ["Removed"] });
      continue;
    }
    const c: string[] = [];
    if (x.course_hole_id !== y.course_hole_id) c.push("Different hole");
    if (x.tee_id !== y.tee_id) c.push(`${names.tee(x.tee_id)} → ${names.tee(y.tee_id)}`);
    if (x.basket_id !== y.basket_id) c.push(`${names.basket(x.basket_id)} → ${names.basket(y.basket_id)}`);
    if (x.par !== y.par) c.push(`Par ${x.par ?? "—"} → ${y.par ?? "—"}`);
    if (c.length) diffs.push({ label, changes: c });
    else same++;
  }
  return { diffs, same };
}

/** "White 18" + Blue tees → "Blue 18"; front nine → "White Front 9". */
export function suggestName(source: string, opts: { tee?: string; holes?: "front" | "back" | null; count?: number }): string {
  let name = source.trim();
  if (opts.tee) {
    const colors = /\b(white|blue|red|gold|black|green|yellow|orange|long|short|pro|am)\b/i;
    name = colors.test(name) ? name.replace(colors, opts.tee) : `${opts.tee} ${name}`;
  }
  if (opts.holes) {
    const base = name.replace(/\s*\d+$/, "");
    name = `${base} ${opts.holes === "front" ? "Front" : "Back"} 9`;
  } else if (opts.count && /\d+$/.test(name)) {
    name = name.replace(/\d+$/, String(opts.count));
  }
  return name;
}

/** Shared-asset check before moving/removing a tee or basket. */
export function layoutsUsingAsset(
  assetId: string,
  slotsByLayout: Map<string, { name: string; slots: Slot[] }>,
): string[] {
  const out: string[] = [];
  for (const [, l] of slotsByLayout)
    if (l.slots.some((s) => s.tee_id === assetId || s.basket_id === assetId)) out.push(l.name);
  return out;
}

/** A physical hole may appear several times in a layout. Match each restored
 * occurrence once, so restoring a version never duplicates a slot UUID. */
export function restoreLayoutVersion(current: Slot[], snapshot: unknown): Slot[] {
  if (!Array.isArray(snapshot) || !snapshot.length) throw new Error("This version has no holes to restore.");
  const used = new Set<Slot>();
  const positions = new Set<number>();
  const restored = snapshot.map((value): Slot => {
    const row = value as {position:number;label:string;course_hole_id:string;tee_id:string|null;basket_id:string|null;par:number|null;rules?:unknown;flight_path?:LatLng[]|null};
    if (!row || !Number.isInteger(row.position) || row.position < 1 || positions.has(row.position)
      || typeof row.label !== "string" || !row.label.trim() || typeof row.course_hole_id !== "string"
      || (row.tee_id !== null && typeof row.tee_id !== "string") || (row.basket_id !== null && typeof row.basket_id !== "string")
      || (row.flight_path!=null && (!Array.isArray(row.flight_path) || row.flight_path.some(point=>!Array.isArray(point) || point.length!==2
        || !point.every(Number.isFinite) || Math.abs(point[0])>90 || Math.abs(point[1])>180)))
      || (row.par !== null && (!Number.isInteger(row.par) || row.par < 2 || row.par > 7))) {
      throw new Error("This version contains an invalid hole configuration. The current draft is unchanged.");
    }
    positions.add(row.position);
    const candidates = current.filter(slot => !used.has(slot) && slot.course_hole_id === row.course_hole_id);
    const match = candidates.find(slot => slot.position === row.position)
      ?? candidates.find(slot => slot.tee_id === row.tee_id && slot.basket_id === row.basket_id) ?? candidates[0];
    if(match) used.add(match);
    const samePair = match?.tee_id === row.tee_id && match?.basket_id === row.basket_id;
    return {
      ...(match ?? {}), position:row.position,display_label:row.label,course_hole_id:row.course_hole_id,
      tee_id:row.tee_id,basket_id:row.basket_id,par:row.par,included:true,
      rules:row.rules ?? match?.rules ?? [],
      flight_path:row.flight_path ?? (samePair ? match?.flight_path : null),
      legacy_hole_id:samePair ? match?.legacy_hole_id : null,
    };
  });
  let nextPosition = Math.max(...positions);
  return [...restored.sort((a,b) => a.position-b.position),
    ...current.filter(slot => !used.has(slot)).map(slot => ({...slot,included:false,position:++nextPosition}))];
}
