/** Map checker + completeness. Warnings only — nothing here blocks publishing a basic course. */
import { insideAny, type LatLng } from "./geometry";

export type HoleInput = {
  number: number;
  par: number | null;
  /** false = automatic par nobody has confirmed. */
  parConfirmed?: boolean;
  tee: LatLng | null;
  basket: LatLng | null;
  flightPath?: LatLng[] | null;
  rulesConfirmed?: boolean;
  /** Distance known (measured or entered). */
  hasDistance?: boolean;
  hasCaddyNotes?: boolean;
};
export type FeatureInput = { type: string; hole_number?: number | null; label?: string | null; points: LatLng[]; hasDirection?: boolean };

export type Warning = { hole?: number; code: string; message: string };

export function validateCourse(input: { boundaries: LatLng[][]; holes: HoleInput[]; features: FeatureInput[] }): Warning[] {
  const w: Warning[] = [];
  const hasBoundary = input.boundaries.some((b) => b.length >= 3);
  if (!hasBoundary) w.push({ code: "no_boundary", message: "No course boundary drawn yet." });
  for (const h of input.holes) {
    if (!h.tee) w.push({ hole: h.number, code: "no_tee", message: `Hole ${h.number} has no tee.` });
    if (!h.basket) w.push({ hole: h.number, code: "no_basket", message: `Hole ${h.number} has no basket.` });
    if (h.par == null) w.push({ hole: h.number, code: "no_par", message: `Hole ${h.number} has no par.` });
    if (h.tee && h.basket && !(h.flightPath && h.flightPath.length >= 2))
      w.push({ hole: h.number, code: "no_flight", message: `Hole ${h.number} has no flight path.` });
    if (hasBoundary && h.tee && !insideAny(h.tee, input.boundaries))
      w.push({ hole: h.number, code: "tee_outside", message: `Hole ${h.number} tee is outside the course boundary.` });
    if (hasBoundary && h.basket && !insideAny(h.basket, input.boundaries))
      w.push({ hole: h.number, code: "basket_outside", message: `Hole ${h.number} basket is outside the course boundary.` });
  }
  for (const f of input.features) {
    if (f.type === "mando" && !f.hasDirection)
      w.push({ hole: f.hole_number ?? undefined, code: "mando_dir", message: "A mando has no direction set." });
    if (f.type === "dropzone" && !f.label)
      w.push({ hole: f.hole_number ?? undefined, code: "dz_rule", message: "A drop zone has no rule written." });
  }
  return w;
}

export function canPublishBasic(holes: HoleInput[]): boolean {
  return holes.length > 0 && holes.every((h) => h.tee && h.basket && h.par != null);
}

export function completeness(input: { hasBoundary: boolean; infrastructureCount: number; holes: HoleInput[] }) {
  const n = input.holes.length || 1;
  const tees = input.holes.filter((h) => h.tee).length;
  const baskets = input.holes.filter((h) => h.basket).length;
  const flights = input.holes.filter((h) => (h.flightPath?.length ?? 0) >= 2).length;
  const rules = input.holes.filter((h) => h.rulesConfirmed).length;
  const pars = input.holes.filter((h) => h.par != null).length;
  const parts = [
    { w: 10, v: input.hasBoundary ? 1 : 0 },
    { w: 10, v: input.infrastructureCount > 0 ? 1 : 0 },
    { w: 20, v: tees / n },
    { w: 20, v: baskets / n },
    { w: 10, v: pars / n },
    { w: 20, v: flights / n },
    { w: 10, v: rules / n },
  ];
  const pct = input.holes.length ? Math.round(parts.reduce((s, p) => s + p.w * p.v, 0)) : input.hasBoundary ? 10 : 0;
  return { pct, tees, baskets, flights, rules, pars, holes: input.holes.length };
}

export type ReadinessKey = "scoring" | "map" | "caddy";
export type Readiness = { key: ReadinessKey; label: string; ready: boolean; missing: Warning[] };

/**
 * Three separate states — none blocks editing.
 * Scoring: every hole has a par. Map: every hole has tee + basket.
 * Caddy: map ready plus a flight path, distance and caddy notes on every hole.
 */
export function readiness(holes: HoleInput[]): Readiness[] {
  const scoring: Warning[] = [];
  const map: Warning[] = [];
  const caddy: Warning[] = [];
  for (const h of holes) {
    // Unknown or unconfirmed par is not scoring-ready — never treat it as a par 3.
    if (h.par == null || h.parConfirmed === false) scoring.push({ hole: h.number, code: "no_par", message: `Hole ${h.number} needs its par confirmed.` });
    if (!h.tee) map.push({ hole: h.number, code: "no_tee", message: `Hole ${h.number} needs a tee.` });
    if (!h.basket) map.push({ hole: h.number, code: "no_basket", message: `Hole ${h.number} needs a basket.` });
    if (!(h.flightPath && h.flightPath.length >= 2))
      caddy.push({ hole: h.number, code: "no_flight", message: `Hole ${h.number} needs a flight path.` });
    if (!h.hasDistance) caddy.push({ hole: h.number, code: "no_distance", message: `Hole ${h.number} needs a distance.` });
    if (!h.hasCaddyNotes)
      caddy.push({ hole: h.number, code: "no_notes", message: `Hole ${h.number} needs caddy notes.` });
  }
  const none = holes.length === 0;
  return [
    { key: "scoring", label: "Scoring ready", ready: !none && scoring.length === 0, missing: scoring },
    { key: "map", label: "Map ready", ready: !none && map.length === 0, missing: map },
    { key: "caddy", label: "Caddy ready", ready: !none && map.length === 0 && caddy.length === 0, missing: caddy },
  ];
}

export type MappingRow = { key: "property" | "holes" | "tees" | "baskets" | "pars"; label: string; done: number; total: number };
export type NextAction = { hole?: number; code: string; label: string } | null;

/**
 * Compact Course Map summary plus ONE recommended next action, in the
 * build priority order: property → holes → tees → baskets → pars → distances → caddy.
 * An unconfirmed (automatic) par counts as not done.
 */
export function mappingSummary(input: { hasBoundary: boolean; holes: HoleInput[] }): { rows: MappingRow[]; next: NextAction } {
  const hs = [...input.holes].sort((a, b) => a.number - b.number);
  const n = hs.length;
  const parOk = (h: HoleInput) => h.par != null && h.parConfirmed !== false;
  const rows: MappingRow[] = [
    { key: "property", label: "Property", done: input.hasBoundary ? 1 : 0, total: 1 },
    { key: "holes", label: "Holes", done: n, total: n },
    { key: "tees", label: "Tees", done: hs.filter((h) => h.tee).length, total: n },
    { key: "baskets", label: "Basket positions", done: hs.filter((h) => h.basket).length, total: n },
    { key: "pars", label: "Pars confirmed", done: hs.filter(parOk).length, total: n },
  ];
  let next: NextAction = null;
  if (n === 0) next = { code: "add_hole", label: "Add Hole 1" };
  else {
    const tee = hs.find((h) => !h.tee);
    const basket = hs.find((h) => !h.basket);
    const par = hs.find((h) => !parOk(h));
    const flight = hs.find((h) => h.tee && h.basket && !((h.flightPath?.length ?? 0) >= 2));
    const notes = hs.find((h) => !h.hasCaddyNotes);
    if (tee) next = { hole: tee.number, code: "no_tee", label: `Map Hole ${tee.number} tee` };
    else if (basket) next = { hole: basket.number, code: "no_basket", label: `Map Hole ${basket.number} basket` };
    else if (par) next = { hole: par.number, code: "no_par", label: `Confirm Hole ${par.number} par` };
    else if (!input.hasBoundary) next = { code: "no_boundary", label: "Draw the course property" };
    else if (flight) next = { hole: flight.number, code: "no_flight", label: `Draw Hole ${flight.number} flight path` };
    else if (notes) next = { hole: notes.number, code: "no_notes", label: `Add Hole ${notes.number} caddy notes` };
  }
  return { rows, next };
}
