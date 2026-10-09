// Geometry helpers for OB reference features: given an existing OB source
// (polyline or polygon edge), project clicks onto the source and extract the
// sub-path between two projected points. Uses a local planar approximation
// which is accurate at course scale.

export type LatLng = [number, number]; // [lat, lng]

export type Projection = {
  point: LatLng;
  segIdx: number; // segment index i where projection lies between pts[i] and pts[i+1] (or pts[i] and pts[0] for closing edge on polygons)
  t: number; // 0..1 along that segment
  distMeters: number; // distance from input point to the projection
};

function planarScale(lat: number) {
  const latRad = (lat * Math.PI) / 180;
  return { mPerLat: 111132, mPerLng: 111320 * Math.cos(latRad) };
}

function projectOnSegment(
  p: LatLng,
  a: LatLng,
  b: LatLng,
): { point: LatLng; t: number; distMeters: number } {
  const { mPerLat, mPerLng } = planarScale(p[0]);
  const ax = a[1] * mPerLng,
    ay = a[0] * mPerLat;
  const bx = b[1] * mPerLng,
    by = b[0] * mPerLat;
  const px = p[1] * mPerLng,
    py = p[0] * mPerLat;
  const dx = bx - ax,
    dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx,
    cy = ay + t * dy;
  const distMeters = Math.hypot(px - cx, py - cy);
  const point: LatLng = [cy / mPerLat, cx / mPerLng];
  return { point, t, distMeters };
}

export function projectOnPolyline(p: LatLng, pts: LatLng[], closed: boolean): Projection | null {
  if (pts.length < 2) return null;
  const nSegs = closed ? pts.length : pts.length - 1;
  let best: Projection | null = null;
  for (let i = 0; i < nSegs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const r = projectOnSegment(p, a, b);
    if (!best || r.distMeters < best.distMeters) {
      best = { point: r.point, segIdx: i, t: r.t, distMeters: r.distMeters };
    }
  }
  return best;
}

function segmentLenMeters(a: LatLng, b: LatLng): number {
  const { mPerLat, mPerLng } = planarScale(a[0]);
  const dx = (b[1] - a[1]) * mPerLng;
  const dy = (b[0] - a[0]) * mPerLat;
  return Math.hypot(dx, dy);
}

function projectionParam(pts: LatLng[], closed: boolean, proj: Projection): number {
  let acc = 0;
  for (let i = 0; i < proj.segIdx; i++) {
    acc += segmentLenMeters(pts[i], pts[(i + 1) % pts.length]);
  }
  const segLen = segmentLenMeters(pts[proj.segIdx], pts[(proj.segIdx + 1) % pts.length]);
  return acc + proj.t * segLen;
}

function totalLength(pts: LatLng[], closed: boolean): number {
  let total = 0;
  const nSegs = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < nSegs; i++) total += segmentLenMeters(pts[i], pts[(i + 1) % pts.length]);
  return total;
}

// Extract the sub-path along the source between two projections. For open
// polylines the direction follows startProj -> endProj along the source. For
// closed polygons the shorter arc is used.
export function extractSubPath(
  pts: LatLng[],
  closed: boolean,
  startProj: Projection,
  endProj: Projection,
): LatLng[] {
  if (pts.length < 2) return [startProj.point, endProj.point];
  const total = totalLength(pts, closed);
  const sParam = projectionParam(pts, closed, startProj);
  const eParam = projectionParam(pts, closed, endProj);

  if (closed) {
    // Choose the shorter arc direction.
    const forward = (eParam - sParam + total) % total;
    const backward = total - forward;
    const goForward = forward <= backward;
    return walk(pts, true, startProj, endProj, goForward);
  }
  // Open polyline: honour click order (start->end along the source).
  const goForward = sParam <= eParam;
  return walk(pts, false, startProj, endProj, goForward);
}

function walk(
  pts: LatLng[],
  closed: boolean,
  startProj: Projection,
  endProj: Projection,
  forward: boolean,
): LatLng[] {
  const out: LatLng[] = [startProj.point];
  const n = pts.length;
  if (forward) {
    // Vertices strictly between startProj.segIdx+1 and endProj.segIdx (inclusive)
    let i = (startProj.segIdx + 1) % n;
    // stop condition: same segment as end -> no intermediate vertex
    if (startProj.segIdx === endProj.segIdx && startProj.t <= endProj.t) {
      out.push(endProj.point);
      return out;
    }
    let guard = 0;
    while (guard++ < n + 2) {
      out.push(pts[i]);
      if (i === endProj.segIdx) break;
      i = (i + 1) % n;
      if (!closed && i === 0) break;
    }
    out.push(endProj.point);
    return out;
  }
  // backward
  let i = startProj.segIdx;
  if (startProj.segIdx === endProj.segIdx && startProj.t >= endProj.t) {
    out.push(endProj.point);
    return out;
  }
  let guard = 0;
  while (guard++ < n + 2) {
    out.push(pts[i]);
    if ((i - 1 + n) % n === endProj.segIdx) break;
    i = (i - 1 + n) % n;
    if (!closed && i === 0) {
      out.push(pts[0]);
      break;
    }
  }
  out.push(endProj.point);
  return out;
}

// Find the nearest OB source (line or polygon edge) among candidates within
// the given tolerance in meters. Returns the winning source key + projection.
export function findNearestObSource<K>(
  click: LatLng,
  sources: Array<{ key: K; pts: LatLng[]; closed: boolean }>,
  toleranceMeters = 60,
): { key: K; proj: Projection } | null {
  let best: { key: K; proj: Projection } | null = null;
  for (const s of sources) {
    const p = projectOnPolyline(click, s.pts, s.closed);
    if (!p) continue;
    if (p.distMeters > toleranceMeters) continue;
    if (!best || p.distMeters < best.proj.distMeters) best = { key: s.key, proj: p };
  }
  return best;
}
