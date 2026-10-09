/** Pure map geometry for the Course Builder. Points are [lat, lng]. */
export type LatLng = [number, number];

const R_FT = 20_902_231; // earth radius in feet

export function distanceFt(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R_FT * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathLengthFt(points: LatLng[]): number {
  let t = 0;
  for (let i = 1; i < points.length; i++) t += distanceFt(points[i - 1], points[i]);
  return t;
}

/** Flight path from tee to basket via bend points. */
export function flightPath(tee: LatLng, basket: LatLng, bends: LatLng[] = []): LatLng[] {
  return [tee, ...bends, basket];
}

export type HoleDistances = { straightFt: number; flightFt: number; differs: boolean };

export function holeDistances(tee: LatLng, basket: LatLng, bends: LatLng[] = []): HoleDistances {
  const straightFt = Math.round(distanceFt(tee, basket));
  const flightFt = Math.round(pathLengthFt(flightPath(tee, basket, bends)));
  return { straightFt, flightFt, differs: Math.abs(flightFt - straightFt) >= 3 };
}

export function insertBend(bends: LatLng[], index: number, p: LatLng): LatLng[] {
  const next = bends.slice();
  next.splice(Math.max(0, Math.min(index, next.length)), 0, p);
  return next;
}
export function removeBend(bends: LatLng[], index: number): LatLng[] {
  return bends.filter((_, i) => i !== index);
}

/** Polygon area in acres (equirectangular projection, fine for course scale). */
export function polygonAcres(points: LatLng[]): number {
  if (points.length < 3) return 0;
  const lat0 = (points.reduce((s, p) => s + p[0], 0) / points.length) * (Math.PI / 180);
  const ftPerDegLat = 364_000;
  const ftPerDegLng = ftPerDegLat * Math.cos(lat0);
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [y1, x1] = points[i];
    const [y2, x2] = points[(i + 1) % points.length];
    a += x1 * ftPerDegLng * (y2 * ftPerDegLat) - x2 * ftPerDegLng * (y1 * ftPerDegLat);
  }
  return Math.abs(a) / 2 / 43_560;
}

export function pointInPolygon(p: LatLng, poly: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > p[0] !== yj > p[0] && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function insideAny(p: LatLng, polys: LatLng[][]): boolean {
  return polys.some((poly) => pointInPolygon(p, poly));
}

/** Distance in feet from p to the nearest segment of a polyline. */
export function distanceToPathFt(p: LatLng, path: LatLng[]): number {
  if (path.length === 0) return Infinity;
  if (path.length === 1) return distanceFt(p, path[0]);
  const lat0 = (p[0] * Math.PI) / 180;
  const kx = 364_000 * Math.cos(lat0);
  const ky = 364_000;
  const P = { x: p[1] * kx, y: p[0] * ky };
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const A = { x: path[i - 1][1] * kx, y: path[i - 1][0] * ky };
    const B = { x: path[i][1] * kx, y: path[i][0] * ky };
    const dx = B.x - A.x, dy = B.y - A.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / len2)) : 0;
    const d = Math.hypot(P.x - (A.x + t * dx), P.y - (A.y + t * dy));
    if (d < best) best = d;
  }
  return best;
}
