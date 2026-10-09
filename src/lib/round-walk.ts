// Round walk tracking — pure rules. Steps and calories are estimates from
// distance walked; GPS altitude is noisy, so climbs are counted with a
// hysteresis band instead of summing every jitter.
export type TrackPoint = [lat: number, lng: number, alt: number | null, t: number];

export const WALK_RULES = {
  maxAccuracyM: 25, // ignore fixes rougher than this
  minMoveM: 4, // ignore jitter while standing on a tee
  maxSpeedMps: 7, // ignore jumps faster than a sprint (bad fixes, cart rides)
  strideM: 0.762, // average walking stride
  kcalPerStep: 0.04, // average adult walking
  climbBandM: 3, // altitude must move this far before it counts
} as const;

export interface WalkTotals {
  distance_m: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  steps: number;
  calories: number;
}

export function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b[0] - a[0]);
  const dLng = toR(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Whether a new fix should be appended to the path. */
export function acceptPoint(prev: TrackPoint | undefined, next: TrackPoint, accuracyM: number | null): boolean {
  if (accuracyM != null && accuracyM > WALK_RULES.maxAccuracyM) return false;
  if (!prev) return true;
  const d = haversineM([prev[0], prev[1]], [next[0], next[1]]);
  if (d < WALK_RULES.minMoveM) return false;
  const dt = Math.max(1, (next[3] - prev[3]) / 1000);
  return d / dt <= WALK_RULES.maxSpeedMps;
}

export function computeWalk(points: TrackPoint[]): WalkTotals {
  let distance = 0;
  let gain = 0;
  let loss = 0;
  let anchor: number | null = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) distance += haversineM([points[i - 1][0], points[i - 1][1]], [p[0], p[1]]);
    const alt = p[2];
    if (alt == null) continue;
    if (anchor == null) anchor = alt;
    else if (alt - anchor >= WALK_RULES.climbBandM) { gain += alt - anchor; anchor = alt; }
    else if (anchor - alt >= WALK_RULES.climbBandM) { loss += anchor - alt; anchor = alt; }
  }
  const steps = Math.round(distance / WALK_RULES.strideM);
  return {
    distance_m: Math.round(distance),
    elevation_gain_m: Math.round(gain),
    elevation_loss_m: Math.round(loss),
    steps,
    calories: Math.round(steps * WALK_RULES.kcalPerStep),
  };
}

export const mToMi = (m: number) => m / 1609.344;
export const mToFt = (m: number) => m * 3.28084;
