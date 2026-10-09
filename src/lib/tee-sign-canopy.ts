/**
 * Tree canopy read from the satellite photo around each hole, for tee signs only.
 * Browser-side: loads the photo into a canvas, marks leafy-green cells, and turns
 * dense clusters into tree points sized to the canopy. Nothing is saved; trees
 * drawn on the course map always win, and mapped water/parking/buildings are cleared.
 */
import type { SignFeature } from "@/lib/tee-sign-pro";

type LL = [number, number];
const CELL_M = 1.5; // grid cell size in metres

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("photo unavailable"));
    img.src = url;
  });
}

/** Leafy canopy: green-dominant and darker than mown grass. */
function isCanopy(r: number, g: number, b: number): boolean {
  const lum = 0.3 * r + 0.59 * g + 0.11 * b;
  return g >= r && g >= b - 4 && lum < 70 && lum > 12 && g - b > 4;
}

/** Splits the course box into photo tiles (≤900 m) and reads canopy from each, one at a time. */
export async function detectCanopy(points: LL[], padM = 70): Promise<SignFeature[]> {
  if (!points.length) return [];
  const lat0 = points[0][0];
  const mLat = 111132, mLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const lats = points.map((p) => p[0]), lngs = points.map((p) => p[1]);
  const s = Math.min(...lats) - padM / mLat, n = Math.max(...lats) + padM / mLat;
  const w = Math.min(...lngs) - padM / mLng, e = Math.max(...lngs) + padM / mLng;
  const widthM = (e - w) * mLng, heightM = (n - s) * mLat;
  if (widthM > 6000 || heightM > 6000) return [];
  const TILE = 900;
  const nx = Math.ceil(widthM / TILE), ny = Math.ceil(heightM / TILE);
  const out: SignFeature[] = [];
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const tw = w + (ix * TILE) / mLng, te = Math.min(e, w + ((ix + 1) * TILE) / mLng);
    const tn = n - (iy * TILE) / mLat, ts = Math.max(s, n - ((iy + 1) * TILE) / mLat);
    // Skip tiles with no hole point nearby.
    if (!points.some((p) => p[0] > ts - padM / mLat && p[0] < tn + padM / mLat && p[1] > tw - padM / mLng && p[1] < te + padM / mLng)) continue;
    try { out.push(...(await detectTile(ts, tn, tw, te, lat0))); } catch { /* photo tile missing — leave it open */ }
  }
  return out;
}

async function detectTile(s: number, n: number, w: number, e: number, lat0: number): Promise<SignFeature[]> {
  const mLat = 111132, mLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const widthM = (e - w) * mLng, heightM = (n - s) * mLat;
  if (widthM < 5 || heightM < 5) return [];
  const pxW = Math.min(2048, Math.round(widthM * 2)), pxH = Math.max(1, Math.round((pxW * heightM) / widthM));
  const R = 6378137, k = 1 / Math.cos((lat0 * Math.PI) / 180);
  const cx = (((w + e) / 2) * Math.PI * R) / 180;
  const cy = R * Math.log(Math.tan(Math.PI / 4 + (((s + n) / 2) * Math.PI) / 360));
  const hw = (widthM * k) / 2, hh = (heightM * k) / 2;
  const url = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export" +
    `?bbox=${cx - hw},${cy - hh},${cx + hw},${cy + hh}&bboxSR=3857&imageSR=3857&size=${pxW},${pxH}&format=png&f=image`;
  const img = await loadImage(url);
  const cv = document.createElement("canvas");
  cv.width = pxW; cv.height = pxH;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, pxW, pxH);
  const px = ctx.getImageData(0, 0, pxW, pxH).data;
  const pxPerM = pxW / widthM;

  // Mown grass brightness for this tile: canopy is noticeably darker than it.
  const greenLums: number[] = [];
  for (let i = 0; i < px.length; i += 4 * 37) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    if (g >= r && g > b) greenLums.push(0.3 * r + 0.59 * g + 0.11 * b);
  }
  greenLums.sort((x, y) => x - y);
  const grassLum = greenLums.length ? greenLums[Math.floor(greenLums.length * 0.7)] : 90;
  const cut = Math.min(78, Math.max(45, grassLum * 0.78));
  const leafy = (r: number, g: number, b: number) => {
    const lum = 0.3 * r + 0.59 * g + 0.11 * b;
    return lum > 10 && lum < cut && g >= r - 3 && g >= b - 6;
  };

  const C = CELL_M; // metres per cell
  const cols = Math.floor(widthM / C), rows = Math.floor(heightM / C);
  const dens = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let hit = 0, tot = 0;
    const x0 = Math.floor(c * C * pxPerM), x1 = Math.max(x0 + 1, Math.floor((c + 1) * C * pxPerM));
    const y0 = Math.floor(r * C * pxPerM), y1 = Math.max(y0 + 1, Math.floor((r + 1) * C * pxPerM));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * pxW + x) * 4;
      tot++; if (leafy(px[i], px[i + 1], px[i + 2])) hit++;
    }
    dens[r * cols + c] = tot ? hit / tot : 0;
  }
  // Canopy mask, lightly smoothed so speckled shade doesn't become trees.
  const mask = new Uint8Array(cols * rows);
  for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
    let sum = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) sum += dens[(r + dr) * cols + c + dc];
    if (sum / 9 >= 0.5 && dens[r * cols + c] >= 0.4) mask[r * cols + c] = 1;
  }
  // Distance (in cells) from each canopy cell to open ground — big for big crowns.
  const INF = 1e6, d = new Float32Array(cols * rows);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c; if (!d[i]) continue;
    if (c > 0) d[i] = Math.min(d[i], d[i - 1] + 1);
    if (r > 0) d[i] = Math.min(d[i], d[i - cols] + 1, c > 0 ? d[i - cols - 1] + 1.414 : INF, c < cols - 1 ? d[i - cols + 1] + 1.414 : INF);
  }
  for (let r = rows - 1; r >= 0; r--) for (let c = cols - 1; c >= 0; c--) {
    const i = r * cols + c; if (!d[i]) continue;
    if (c < cols - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
    if (r < rows - 1) d[i] = Math.min(d[i], d[i + cols] + 1, c < cols - 1 ? d[i + cols + 1] + 1.414 : INF, c > 0 ? d[i + cols - 1] + 1.414 : INF);
  }
  // Place crowns greedily, biggest first, so a giant oak stays one tree and a hedge becomes bushes.
  const cand: number[] = [];
  for (let i = 0; i < d.length; i++) if (d[i] >= 1) cand.push(i);
  cand.sort((a, b) => d[b] - d[a]);
  const placed: Array<{ x: number; y: number; r: number }> = [];
  const HB = 10; // hash bucket in metres
  const hash = new Map<string, number[]>();
  const out: SignFeature[] = [];
  for (const i of cand) {
    if (out.length > 4000) break;
    const r = Math.min(9, Math.max(1.6, d[i] * C * 0.95));
    const jx = (((i * 7) % 5) - 2) * 0.25, jy = (((i * 13) % 5) - 2) * 0.25;
    const x = (i % cols + 0.5) * C + jx, y = (Math.floor(i / cols) + 0.5) * C + jy;
    const bx = Math.floor(x / HB), by = Math.floor(y / HB);
    let ok = true;
    for (let ox = -2; ox <= 2 && ok; ox++) for (let oy = -2; oy <= 2 && ok; oy++) {
      for (const pi of hash.get(`${bx + ox},${by + oy}`) ?? []) {
        const p = placed[pi];
        if (Math.hypot(p.x - x, p.y - y) < 0.72 * Math.max(p.r, r) + 0.3 * Math.min(p.r, r)) { ok = false; break; }
      }
    }
    if (!ok) continue;
    const key = `${bx},${by}`;
    hash.set(key, [...(hash.get(key) ?? []), placed.length]);
    placed.push({ x, y, r });
    out.push({ type: "tree", geometry: { points: [[n - y / mLat, w + x / mLng]], canopy_m: r * 2 } });
  }
  return out;
}

const inPoly = (p: LL, poly: LL[]) => {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if ((yi > p[0]) !== (yj > p[0]) && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
};

/** Drop detected trees that sit on mapped water, parking, buildings, or right on a tee/basket. */
export function clearCanopy(trees: SignFeature[], blockers: SignFeature[], keepClear: LL[], lines: [LL, LL][] = []): SignFeature[] {
  const polys = blockers.filter((f) => ["water", "parking", "building", "pitch"].includes(f.type) && f.geometry.points.length > 2).map((f) => f.geometry.points);
  const mLat = 111132;
  return trees.filter((t) => {
    const p = t.geometry.points[0];
    if (polys.some((poly) => inPoly(p, poly))) return false;
    const mLng = 111320 * Math.cos((p[0] * Math.PI) / 180);
    if (keepClear.some((k) => Math.hypot((k[0] - p[0]) * mLat, (k[1] - p[1]) * mLng) < 5)) return false;
    // Keep the throwing line itself open, like a cut fairway.
    return !lines.some(([a, b]) => {
      const ax = (a[1] - p[1]) * mLng, ay = (a[0] - p[0]) * mLat, bx = (b[1] - p[1]) * mLng, by = (b[0] - p[0]) * mLat;
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L));
      return Math.hypot(ax + t * dx, ay + t * dy) < 4;
    });
  });
}
