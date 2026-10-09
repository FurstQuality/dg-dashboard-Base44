/**
 * Geometry for the "Pro" tee sign: projects a hole into sign space so the
 * throw always runs bottom → top, and builds the fairway, OB and marker shapes.
 * Pure and browser-safe.
 */
import { fairwayPolygon } from "@/lib/course-builder/fairway";
import { courseRoutePreview } from "@/lib/course-builder/course-route";
import type { DbFeature } from "@/lib/course-features";

type LL = [number, number]; // [lat, lng]
export type XY = [number, number];

/** Anything drawable: course map items, or ground detail read from OpenStreetMap. */
export type SignFeature = { type: string; geometry: { points: [number, number][]; canopy_m?: number }; closed?: boolean };

export type ProHoleInput = {
  tee: LL;
  basket: LL;
  flightPath?: LL[] | null;
  /** Already sampled by the canonical route resolver; never smooth it again. */
  routeCurve?: LL[] | null;
  features: SignFeature[];
  /** Other tee pads / basket positions of the same hole; kept inside the frame. */
  extraPoints?: LL[];
};

export type ProHoleShapes = {
  fairway: XY[];
  line: XY[];
  tee: XY;
  teeAngle: number; // degrees, for drawing the pad along the throw
  basket: XY;
  circleR: number; // 10 m putting circle, in sign units
  obLines: XY[][];
  obAreas: XY[][];
  water: XY[][];
  paths: XY[][];
  trees: XY[];
  /** Canopy radius in sign units per tree, parallel to trees; 0 = typical. */
  treeR: number[];
  mandos: XY[];
  dropzones: XY[];
  woods: XY[][];
  streams: XY[][];
  fences: XY[][];
  boundary: XY[][];
  benches: XY[];
  shelters: XY[];
  restrooms: XY[];
  bins: XY[];
  parking: XY[][];
  signs: XY[];
  buildings: XY[][];
  roads: XY[][];
  treeLines: XY[][];
  /** OB side per OB line (same order as obLines), as the player sees it from the tee. */
  obSides: string[];
  notes: { at: XY; text: string }[];
  entrances: XY[];
  grass: XY[][];
  hazards: XY[][];
  islands: XY[][];
  bare: XY[][];
  pitches: XY[][];
  /** Project any lat/lng into sign space (other tees, alternate baskets). */
  project: (p: LL) => XY;
  /** Sign units per metre. */
  scale: number;
  /** Rotation (deg) for an arrow drawn pointing up so it points true north. */
  northDeg: number;
};

/** Print palette for sign artwork (printed output, not app UI theming). */
export const SIGN_PANEL_COLOURS = ["#163528", "#1f2a37", "#3b2a1a", "#12324a", "#4a1a24", "#f3efe4"];

export function isLightColour(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

export function projectHole(input: ProHoleInput, w: number, h: number, pad = 0.12): ProHoleShapes {
  const lat0 = input.tee[0];
  const lng0 = input.tee[1];
  const mLat = 111132;
  const mLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const toM = (p: LL): XY => [(p[1] - lng0) * mLng, (p[0] - lat0) * mLat];
  const b = toM(input.basket);
  const theta = Math.atan2(b[1], b[0]);
  const phi = Math.PI / 2 - theta;
  const c = Math.cos(phi), s = Math.sin(phi);
  const rot = (p: XY): XY => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
  const rm = (p: LL) => rot(toM(p));

  const lineLL = input.routeCurve === undefined ? courseRoutePreview({tee_lat:input.tee[0],tee_lng:input.tee[1],
    basket_lat:input.basket[0],basket_lng:input.basket[1],flight_path:input.flightPath}).curve ?? [] : input.routeCurve ?? [];
  const holeLen = Math.max(20, Math.hypot(b[0], b[1]));
  const fairwayLL = fairwayPolygon(lineLL, Math.min(24, Math.max(12, holeLen * 0.14)), 5);

  // Frame: the hole plus padding, fitted to the map area keeping aspect.
  const core = [rm(input.tee),rm(input.basket),...lineLL.map(rm), ...fairwayLL.map(rm), ...(input.extraPoints ?? []).map(rm)];
  // Keep nearby rule objects (OB, mandos, drop zones) inside the frame.
  const RULES = new Set(["ob_line", "ob_area", "island_green", "mando", "dropzone", "hazard"]);
  const near = Math.max(40, holeLen * 0.6);
  for (const f of input.features) {
    if (!RULES.has(f.type)) continue;
    for (const p of f.geometry?.points ?? []) {
      const q = rm(p as LL);
      if (q[1] > -near && q[1] < holeLen + near && Math.abs(q[0]) < near) core.push(q);
    }
  }
  const xs = core.map((p) => p[0]);
  const ys = core.map((p) => p[1]);
  let minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  // Short holes still show their surroundings: at least ~80 m tall and 45 m wide.
  const spanY = Math.max(80, (maxY - minY) * (1 + pad * 2) + 20);
  let spanX = Math.max(45, (maxX - minX) * (1 + pad * 2) + 20);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const scale = Math.min(w / spanX, h / spanY);
  spanX = w / scale;
  minX = cx - spanX / 2; maxX = cx + spanX / 2;
  minY = cy - h / scale / 2; maxY = cy + h / scale / 2;
  const toS = (p: XY): XY => [(p[0] - minX) * scale, (maxY - p[1]) * scale];
  const S = (p: LL) => toS(rm(p));
  void minY;

  const shapes: ProHoleShapes = {
    fairway: fairwayLL.map(S),
    line: lineLL.map(S),
    tee: S(input.tee),
    teeAngle: 0,
    basket: S(input.basket),
    circleR: 10 * scale,
    obLines: [], obAreas: [], water: [], paths: [], trees: [], treeR: [], mandos: [], dropzones: [],
    project: S, scale, northDeg: (-phi * 180) / Math.PI,
    woods: [], streams: [], fences: [], boundary: [], benches: [], shelters: [], restrooms: [], bins: [], parking: [], signs: [], buildings: [], roads: [], treeLines: [], obSides: [], notes: [], entrances: [], grass: [], hazards: [], islands: [], bare: [], pitches: [],
  };
  for (const f of input.features) {
    const pts = (f.geometry?.points ?? []).filter((p) => Array.isArray(p) && p.length === 2) as LL[];
    if (!pts.length) continue;
    const sp = pts.map(S);
    const poly = sp.length > 2;
    switch (f.type) {
      case "ob_line": case "ob_reference":
        if (sp.length > 1) { shapes.obLines.push(sp); shapes.obSides.push((f as { ob_side?: string }).ob_side ?? "none"); }
        break;
      case "note": { const t = (f as { label?: string | null }).label?.trim(); if (t) shapes.notes.push({ at: sp[0], text: t }); break; }
      case "entrance": shapes.entrances.push(sp[0]); break;
      case "fence": shapes.fences.push(sp); break;
      case "ob_area": shapes.obAreas.push(sp); break;
      case "island_green": if (poly) shapes.islands.push(sp); break;
      case "woods": if (poly) shapes.woods.push(sp); break;
      case "tree_line": case "tree_row": if (sp.length > 1) shapes.treeLines.push(sp); else { shapes.trees.push(sp[0]); shapes.treeR.push(0); } break;
      case "tall_grass": if (poly) shapes.grass.push(sp); break;
      case "hazard": if (poly) shapes.hazards.push(sp); break;
      case "water": (poly && (f.closed ?? !isOpenLine(pts)) ? shapes.water : shapes.streams).push(sp); break;
      case "path": shapes.paths.push(sp); break;
      // A tree drawn as a shape is woods; as an open line it's a tree line; a point is one tree.
      case "tree":
        if (poly && (f.closed ?? !isOpenLine(pts))) shapes.woods.push(sp);
        else if (sp.length > 1) shapes.treeLines.push(sp);
        else { shapes.trees.push(sp[0]); shapes.treeR.push(f.geometry.canopy_m ? (f.geometry.canopy_m / 2) * scale : 0); }
        break;
      case "mando": shapes.mandos.push(sp[0]); break;
      case "dropzone": shapes.dropzones.push(sp[0]); break;
      case "course_boundary": shapes.boundary.push(sp); break;
      case "bench": shapes.benches.push(sp[0]); break;
      case "gazebo": shapes.shelters.push(sp[0]); break;
      case "restroom": shapes.restrooms.push(sp[0]); break;
      case "trash": shapes.bins.push(sp[0]); break;
      case "parking": if (poly) shapes.parking.push(sp); break;
      case "tee_sign": shapes.signs.push(sp[0]); break;
      case "building": if (poly) shapes.buildings.push(sp); break;
      case "road": shapes.roads.push(sp); break;
      case "bare": if (poly) shapes.bare.push(sp); break;
      case "pitch": if (poly) shapes.pitches.push(sp); break;
    }
  }
  const l = shapes.line;
  if (l.length > 1) {
    const [a, n] = [l[0], l[1]];
    shapes.teeAngle = (Math.atan2(n[1] - a[1], n[0] - a[0]) * 180) / Math.PI + 90;
  }
  return shapes;
}

export function dist(a: LL, b: LL): number {
  const mLng = 111320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * 111132, (a[1] - b[1]) * mLng);
}

export const pathD = (pts: XY[], close = false) =>
  pts.length ? "M" + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L") + (close ? " Z" : "") : "";

/** Short sign lines written from the hole's structured rules; a feature's own label wins. */
export function signRuleLines(features: DbFeature[]): string[] {
  const side = (s: DbFeature["ob_side"]) =>
    s === "left" ? " left" : s === "right" ? " right" : s === "past" ? " past the basket" : s === "behind" ? " behind the tee" : "";
  const out: string[] = [];
  for (const f of features) {
    const l = f.label?.trim();
    if (f.type === "ob_line") out.push(`OB: ${l || "line and beyond"}${l ? "" : side(f.ob_side)}.`);
    else if (f.type === "ob_area") out.push(`OB: ${l || "marked area"}${l ? "" : side(f.ob_side)}.`);
    else if (f.type === "island_green") out.push(`Island: ${l || "land on the island or it's OB"}.`);
    else if (f.type === "hazard") out.push(`Hazard: ${l || "penalty area as marked"}.`);
    else if (f.type === "mando") out.push(`Mando: ${l || "pass the marked mandatory as arrowed"}.`);
    else if (f.type === "dropzone") out.push(`DZ: ${l || "play from the drop zone after a missed mando or OB"}.`);
  }
  return [...new Set(out)].slice(0, 4);
}

export type SignReadiness = "ready" | "needs_map" | "needs_par" | "needs_route";
export function signReadiness(h: { tee: unknown; basket: unknown; parConfirmed: boolean; routeReady?:boolean }): SignReadiness {
  if (!h.tee || !h.basket) return "needs_map";
  if (h.routeReady === false) return "needs_route";
  if (!h.parConfirmed) return "needs_par";
  return "ready";
}

/** A drawn polygon whose ends sit far apart is really a line (a creek), not an area. */
function isOpenLine(pts: LL[]): boolean {
  if (pts.length < 3) return true;
  const a = pts[0], b = pts[pts.length - 1];
  const span = Math.max(...pts.map((p) => dist(p, a)));
  return dist(a, b) > span * 0.5;
}

/** Which map items describe the ground (shown on every nearby sign) vs. a hole's own rules. */
export const TERRAIN_TYPES = new Set(["entrance", "tree", "woods", "tree_line", "tall_grass", "water", "path", "fence", "bench", "gazebo", "restroom", "trash", "parking", "course_boundary", "tee_sign"]);
