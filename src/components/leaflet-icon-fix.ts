import L from "leaflet";
import { markerBearing, markerColor } from "@/lib/map/marker-safety";
import {
  FEATURE_CONFIG,
  featureGlyphSvg,
  type CourseFeatureType,
} from "@/components/map/emblems";

// Fix Leaflet default icon path (broken with bundlers)
const iconRetinaUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png";
const iconUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
const shadowUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";

// @ts-expect-error - private field
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

// --- helpers ------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function isLightColor(color: string): boolean {
  const rgb = hexToRgb(color);
  if (!rgb) return true; // assume light for non-hex tokens
  // Relative luminance
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.55;
}

function esc(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] as string,
  );
}

// --- Tee marker ---------------------------------------------------------
// Shield-style tee pad marker: colored badge stamped with the hole number,
// tee-name tag below (e.g. Main / White / Blue / Pro). Anchored at the tip.

export type TeeIconOpts = {
  hole?: number | string;
  name?: string;
  color?: string;
  active?: boolean;
  /** Direction the pad faces, degrees (0 = north). Draws a rotated rectangle pad. */
  bearing?: number | null;
  /** Show this pad as a drop zone: "DZ" in the tee's colour. */
  dropZone?: boolean;
};

/** Compass bearing in degrees from a to b ([lat, lng]). */
export function bearingDeg(a: [number, number], b: [number, number]): number {
  const k = Math.cos((a[0] * Math.PI) / 180);
  const d = (Math.atan2((b[1] - a[1]) * k, b[0] - a[0]) * 180) / Math.PI;
  return (d + 360) % 360;
}

export function teeIcon(opts: TeeIconOpts = {}) {
  if (opts.bearing != null) return teePadIcon(opts, opts.bearing);
  const color = markerColor(opts.color, "#ffffff");
  const hole = opts.hole ?? "T";
  const name = (opts.name || "").trim();
  const fg = isLightColor(color) ? "#0b1a10" : "#ffffff";
  const outline = opts.active ? "#a3e635" : "#0b1a10";
  const ringW = opts.active ? 3 : 2;
  const dim = opts.active === false ? 0.55 : 1;
  return L.divIcon({
    className: "dg-marker dg-tee",
    html: `
<div style="pointer-events:none;display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6));font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;opacity:${dim};">
  <div style="background:${color};color:${fg};border:${ringW}px solid ${outline};border-radius:8px 8px 3px 3px;padding:2px 7px;min-width:24px;height:22px;display:grid;place-items:center;font-weight:800;font-size:13px;line-height:1;box-shadow:inset 0 -3px 0 rgba(0,0,0,.18),inset 0 2px 0 rgba(255,255,255,.35);">${esc(String(hole))}</div>
  <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid ${outline};margin-top:-1px;"></div>
  ${name ? `<div style="margin-top:1px;background:${outline};color:${color};font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap;">${esc(name)}</div>` : ""}
</div>`,

    iconSize: [56, name ? 44 : 32],
    iconAnchor: [28, name ? 38 : 30],
    popupAnchor: [0, -30],
  });
}

/** Tee pad drawn as a rectangle turned toward the hole, with the hole number kept upright. */
function teePadIcon(opts: TeeIconOpts, deg: number) {
  deg = markerBearing(deg);
  const color = markerColor(opts.color, "#ffffff");
  const fg = isLightColor(color) ? "#0b1a10" : "#ffffff";
  const outline = opts.active ? "#a3e635" : "#0b1a10";
  const name = (opts.name || "").trim();
  const dim = opts.active === false ? 0.55 : 1;
  return L.divIcon({
    className: "dg-marker dg-tee",
    html: `<div style="width:60px;height:60px;position:relative;opacity:${dim};filter:drop-shadow(0 2px 3px rgba(0,0,0,.6));font-family:ui-sans-serif,system-ui,sans-serif;">
<svg width="60" height="60" viewBox="0 0 60 60" data-course-tee-footprint style="position:absolute;inset:0;overflow:visible;transform:rotate(var(--course-map-bearing,0deg));transform-origin:30px 30px" aria-hidden="true"><g transform="rotate(${deg} 30 30)">
  <rect x="21" y="8" width="18" height="44" rx="3" fill="${color}" stroke="${outline}" stroke-width="${opts.active ? 3 : 2}"/>
  <path d="M24 15 L30 9.5 L36 15" fill="none" stroke="${fg}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
</g></svg>
<div style="position:absolute;inset:0;display:grid;place-items:center;font-weight:900;font-size:${opts.dropZone ? 14 : 13}px;color:${fg};text-shadow:0 0 2px ${color};">${opts.dropZone ? "DZ" : esc(String(opts.hole ?? "T"))}</div>
${name ? `<div style="position:absolute;left:50%;top:58px;transform:translateX(-50%);background:${outline};color:${color};font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;text-transform:uppercase;white-space:nowrap;">${esc(name)}</div>` : ""}
</div>`,
    iconSize: [60, 60],
    iconAnchor: [30, 30],
    popupAnchor: [0, -26],
  });
}

// --- Basket marker ------------------------------------------------------
// Concentric target rings emulating a disc-golf basket. Pin letter/name
// sits in the middle, hole tag below.

export type BasketIconOpts = {
  hole?: number | string;
  pin?: string;
  color?: string;
  active?: boolean;
};

export function basketIcon(opts: BasketIconOpts = {}) {
  const pin = (opts.pin || "A").trim() || "A";
  const hole = opts.hole;
  const stroke = /^#[0-9a-f]{6}$/i.test(opts.color ?? "") ? opts.color! : "#a3e635";
  const dim = opts.active === false ? 0.6 : 1;
  return L.divIcon({
    className: "dg-marker dg-basket",
    html: `
<div style="pointer-events:none;display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55));font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;opacity:${dim};">
  <svg width="34" height="42" viewBox="0 0 34 42" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="17" cy="6" rx="11" ry="1.8"/>
    <path d="M7 6 L11 22 M12 6 L14 22 M17 6 L17 22 M22 6 L20 22 M27 6 L23 22"/>
    <path d="M6 22 L28 22 L25 29 L9 29 Z"/>
    <path d="M10 23 L11 28 M14 23 L14.5 28 M17 23 L17 28 M20 23 L19.5 28 M24 23 L23 28"/>
    <line x1="17" y1="29" x2="17" y2="40"/>
    <line x1="13" y1="40" x2="21" y2="40"/>
  </svg>
  ${hole != null ? `<div style="margin-top:1px;background:${stroke};color:#f8fafc;font-size:9px;font-weight:800;padding:1px 5px;border-radius:3px;letter-spacing:.03em;white-space:nowrap;">H${esc(String(hole))}${pin && pin !== "A" ? ` · ${esc(pin)}` : ""}</div>` : ""}
</div>`,
    iconSize: [40, hole != null ? 56 : 44],
    iconAnchor: [20, 40],
    popupAnchor: [0, -36],
  });
}

// Simple hole-number badge (used on course overview map where only a
// single tee is drawn per hole).
export const numberIcon = (n: number | string, color = "#a3e635") =>
  L.divIcon({
    className: "dg-marker dg-num",
    html: `<div style="background:${markerColor(color)};color:#0b1a10;border:2px solid #0b1a10;border-radius:9999px;width:26px;height:26px;display:grid;place-items:center;font-weight:800;font-size:12px;box-shadow:0 2px 4px rgba(0,0,0,.55);font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;">${esc(String(n))}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

// ---- Course features ---------------------------------------------------
// Emblems live in @/components/map/emblems — one registry for every course
// surface. This module only wraps them in Leaflet div icons.

export type { CourseFeatureType, FeatureGeom } from "@/components/map/emblems";
export { FEATURE_CONFIG } from "@/components/map/emblems";

export const featureIcon = (
  type: CourseFeatureType,
  opts: { active?: boolean; mandoSide?: "left" | "right" | "past" | "none"; mandoBearing?: number | null } = {},
) => {
  const c = FEATURE_CONFIG[type];
  if (type === "mando") return mandoIcon(opts.active, opts.mandoBearing ?? null, opts.mandoSide);
  if (type === "dropzone") return dropZoneIcon(opts.active, opts.mandoBearing ?? 0);
  const ring = opts.active ? "#a3e635" : c.color;
  const scale = opts.active ? 32 : 30;
  // Directional badge for mando features — small arrow(s) showing required pass side.
  let badge = "";
  if (false as boolean) {
    const arrow = (rot: number, x: number, y: number) =>
      `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M-7 0 L5 0 M0 -5 L5 0 L0 5" stroke="#a3e635" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>`;
    if (opts.mandoSide === "left") badge = arrow(180, 4, 22);
    else if (opts.mandoSide === "right") badge = arrow(0, 40, 22);
    else if (opts.mandoSide === "past") badge = arrow(-90, 22, 4);
  }
  return L.divIcon({
    className: "dg-marker dg-feature",
    html: `
<div style="width:44px;height:44px;display:grid;place-items:center;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55));cursor:grab;touch-action:none;user-select:none;pointer-events:auto;position:relative;">
  <div style="background:#0b1a10;border:${opts.active ? 3 : 2}px solid ${ring};border-radius:9999px;width:${scale}px;height:${scale}px;display:grid;place-items:center;color:${c.color};box-shadow:${opts.active ? "0 0 0 3px rgba(163,230,53,.35)" : "none"};pointer-events:auto;">
    ${featureGlyphSvg(type, 18)}
  </div>
  ${badge ? `<svg width="44" height="44" viewBox="0 0 44 44" style="position:absolute;inset:0;pointer-events:none;overflow:visible;" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${badge}</svg>` : ""}
</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
};

/** Mando: a large "M" with an arrow pointing the way players must pass, turned to any bearing (0 = north). */
function mandoIcon(active: boolean | undefined, bearing: number | null, side?: string) {
  const deg = markerBearing(bearing ?? (side === "left" ? 270 : side === "right" ? 90 : 0));
  const ring = active ? "#a3e635" : "#ffffff";
  const arrow =
    deg == null
      ? ""
      : `<g transform="rotate(${deg} 28 28)"><path d="M28 27 L28 3" stroke="#0b1a10" stroke-width="7" stroke-linecap="round"/><path d="M19 11 L28 2 L37 11" stroke="#0b1a10" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M28 27 L28 3" stroke="#facc15" stroke-width="3.5" stroke-linecap="round"/><path d="M19 11 L28 2 L37 11" stroke="#facc15" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  return L.divIcon({
    className: "dg-marker dg-feature",
    html: `<div style="width:56px;height:56px;position:relative;cursor:grab;touch-action:none;user-select:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55));">
<svg width="56" height="56" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" style="overflow:visible" aria-hidden="true">
  <g data-course-mando-arrow style="transform:rotate(var(--course-map-bearing,0deg));transform-origin:28px 28px">${arrow}</g>
  <circle cx="28" cy="28" r="15" fill="#0b1a10" stroke="${ring}" stroke-width="${active ? 3 : 2}"/>
  <text x="28" y="35.5" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="21" fill="#facc15">M</text>
</svg></div>`,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
  });
}

/** Drop zone: a rectangle marked "DZ", turned to face the way players throw from it. */
function dropZoneIcon(active: boolean | undefined, deg: number) {
  deg = markerBearing(deg);
  const ring = active ? "#a3e635" : "#0b1a10";
  return L.divIcon({
    className: "dg-marker dg-feature",
    html: `<div style="width:56px;height:56px;position:relative;cursor:grab;touch-action:none;user-select:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55));">
<svg width="56" height="56" viewBox="0 0 56 56" style="position:absolute;inset:0;overflow:visible;transform:rotate(var(--course-map-bearing,0deg));transform-origin:28px 28px" aria-hidden="true"><g transform="rotate(${deg} 28 28)">
  <rect x="17" y="6" width="22" height="44" rx="3" fill="#f97316" stroke="${ring}" stroke-width="${active ? 3 : 2}"/>
  <path d="M22 13 L28 7.5 L34 13" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
</g></svg>
<div style="position:absolute;inset:0;display:grid;place-items:center;font:900 14px Arial Black,Arial,sans-serif;color:#ffffff;text-shadow:0 0 3px #7c2d12;">DZ</div>
</div>`,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
  });
}

// Small, precise drag handle for editing polyline / polygon vertices.
// Uses a solid square with a colored ring — no pointer-events:none so drag
// and click always land on this handle, not on the midpoint circle beneath.
export const vertexHandleIcon = (color: string) =>
  L.divIcon({
    className: "dg-marker dg-vertex-handle",
    html: `<div style="width:14px;height:14px;background:#ffffff;border:2px solid ${markerColor(color)};border-radius:3px;box-shadow:0 1px 2px rgba(0,0,0,.6);cursor:grab;"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

export default L;
