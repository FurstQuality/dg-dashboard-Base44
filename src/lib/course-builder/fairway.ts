/**
 * Fairway corridor drawn along a hole's flight line (tee → bends → basket).
 * The line is smoothed so the corridor curves through each bend instead of
 * kinking, then widened into a polygon in real metres so it scales with zoom.
 * Display only — nothing here is saved.
 */
type Pt = [number, number];

/** Catmull-Rom smoothing through every point; endpoints stay fixed. */
export function smoothLine(points: Pt[], steps = 10): Pt[] {
  if (points.length < 3) return points;
  const out: Pt[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

/**
 * Corridor polygon around a centreline. Width tapers from a narrow tee end to
 * the full fairway width so it reads like a real fairway.
 */
export function fairwayPolygon(line: Pt[], widthM = 14, teeWidthM = 5): Pt[] {
  if (line.length < 2) return [];
  const lat0 = (line[0][0] * Math.PI) / 180;
  const mLat = 111132;
  const mLng = 111320 * Math.cos(lat0);
  const left: Pt[] = [];
  const right: Pt[] = [];
  const n = line.length;
  for (let i = 0; i < n; i++) {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(n - 1, i + 1)];
    const dx = (b[1] - a[1]) * mLng;
    const dy = (b[0] - a[0]) * mLat;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const frac = n === 1 ? 1 : i / (n - 1);
    const half = (teeWidthM + (widthM - teeWidthM) * Math.min(1, frac * 2.5)) / 2;
    const p = line[i];
    left.push([p[0] + (ny * half) / mLat, p[1] + (nx * half) / mLng]);
    right.push([p[0] - (ny * half) / mLat, p[1] - (nx * half) / mLng]);
  }
  return [...left, ...right.reverse()];
}
