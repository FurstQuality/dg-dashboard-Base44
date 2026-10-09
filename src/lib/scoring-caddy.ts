/**
 * On-course caddy math: turn raw hole + weather data into the numbers a player
 * actually throws to. Pure functions so they are unit-testable and safe to call
 * on every render of the scoring stage.
 */

export type WindInput = {
  /** Wind speed in mph. */
  speedMph: number | null | undefined;
  /** Direction the wind is coming FROM, in degrees (meteorological). */
  fromDeg: number | null | undefined;
  /** Bearing from tee to basket, in degrees. */
  holeBearingDeg: number | null | undefined;
};

export type WindEffect = {
  /** Component along the shot line: negative = headwind, positive = tailwind (mph). */
  alongMph: number;
  /** Crosswind magnitude (mph). */
  crossMph: number;
  /** "left" = pushes disc left, "right" = pushes disc right, null when negligible. */
  crossPush: "left" | "right" | null;
  label: string;
};

const RAD = Math.PI / 180;

/** Normalize any angle into 0..360. */
export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Bearing in degrees from one lat/lng to another. */
export function bearingBetween(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const φ1 = from.latitude * RAD;
  const φ2 = to.latitude * RAD;
  const Δλ = (to.longitude - from.longitude) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalizeDeg(Math.atan2(y, x) / RAD);
}

/**
 * Resolve wind into along-line and cross-line components for the shot.
 * `fromDeg` is meteorological (direction the wind blows from), so the wind
 * vector points toward `fromDeg + 180`.
 */
export function windEffect({ speedMph, fromDeg, holeBearingDeg }: WindInput): WindEffect | null {
  if (speedMph == null || fromDeg == null || holeBearingDeg == null) return null;
  if (!Number.isFinite(speedMph) || speedMph <= 0) {
    return { alongMph: 0, crossMph: 0, crossPush: null, label: "Calm" };
  }
  const towardDeg = normalizeDeg(fromDeg + 180);
  const delta = normalizeDeg(towardDeg - holeBearingDeg);
  const along = speedMph * Math.cos(delta * RAD);
  const cross = speedMph * Math.sin(delta * RAD);
  const crossMag = Math.abs(cross);
  const crossPush = crossMag < 2 ? null : cross > 0 ? "right" : "left";
  const alongLabel =
    along <= -3
      ? `${Math.round(Math.abs(along))} mph headwind`
      : along >= 3
        ? `${Math.round(along)} mph tailwind`
        : "Light along the line";
  const crossLabel = crossPush ? ` · ${Math.round(crossMag)} mph pushing ${crossPush}` : "";
  return { alongMph: along, crossMph: cross, crossPush, label: `${alongLabel}${crossLabel}` };
}

/**
 * Distance the hole "plays" once wind is applied. Headwinds shorten a disc's
 * carry roughly 1.5% per mph, tailwinds add about 1% per mph (tailwinds also
 * flatten flight, so the gain is smaller than the headwind loss).
 */
export function effectiveDistanceFt(distanceFt: number, alongMph: number): number {
  if (!Number.isFinite(distanceFt) || distanceFt <= 0) return 0;
  const factor = alongMph < 0 ? 1 + Math.abs(alongMph) * 0.015 : 1 - alongMph * 0.01;
  return Math.max(1, Math.round(distanceFt * Math.max(0.7, Math.min(1.6, factor))));
}

/** 16-point compass label for a bearing in degrees, e.g. 41 -> "NE". */
export function compassPoint(deg: number | null | undefined): string | null {
  if (deg == null || !Number.isFinite(deg)) return null;
  const points = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  return points[Math.round(normalizeDeg(deg) / 22.5) % 16];
}

/** "Tee plays NE (41°) toward the basket" style line for the caddy. */
export function teeFacingNote(bearingDeg: number | null | undefined): string | null {
  const point = compassPoint(bearingDeg);
  if (!point || bearingDeg == null) return null;
  return `Tee faces ${point} (${Math.round(normalizeDeg(bearingDeg))}°) to the basket`;
}

/** Where the wind is coming from, in plain compass terms. */
export function windFromNote(
  fromDeg: number | null | undefined,
  speedMph: number | null | undefined,
): string | null {
  const point = compassPoint(fromDeg);
  if (!point || speedMph == null || !Number.isFinite(speedMph)) return null;
  return `Wind out of the ${point} at ${Math.round(speedMph)} mph`;
}

/**
 * Distance an elevation change adds or removes. Uphill throws land short —
 * roughly 1.2 ft of extra carry needed per foot of rise; downhill gives back
 * about 0.8 ft per foot of drop (glide keeps some of the gain).
 */
export function elevationDistanceFt(elevationFt: number | null | undefined): number {
  if (elevationFt == null || !Number.isFinite(elevationFt) || elevationFt === 0) return 0;
  return Math.round(elevationFt > 0 ? elevationFt * 1.2 : elevationFt * 0.8);
}

/** Short elevation guidance, including how it stacks with the wind. */
export function elevationNote(
  elevationFt: number | null | undefined,
  alongMph?: number | null,
): string | null {
  if (elevationFt == null || !Number.isFinite(elevationFt) || Math.abs(elevationFt) < 5) return null;
  const feet = Math.abs(Math.round(elevationFt));
  if (elevationFt > 0) {
    const stacked =
      alongMph != null && alongMph <= -5
        ? " Uphill into the wind — take an extra disc and keep the nose down."
        : " Throw with more height and expect it to land short.";
    return `Uphill ${feet} ft to the basket.${stacked}`;
  }
  const stacked =
    alongMph != null && alongMph >= 5
      ? " Downhill with the wind — it will run out, so club down and land it short."
      : " Downhill — flight stays up longer and fades late.";
  return `Downhill ${feet} ft to the basket.${stacked}`;
}

/**
 * Combined plays-like distance: sign distance adjusted for wind along the line
 * and for elevation change from tee to basket.
 */
export function holePlaysLikeFt(
  distanceFt: number | null | undefined,
  alongMph: number | null | undefined,
  elevationFt: number | null | undefined,
): number | null {
  if (distanceFt == null || !Number.isFinite(distanceFt) || distanceFt <= 0) return null;
  const windAdjusted =
    alongMph != null && Number.isFinite(alongMph)
      ? effectiveDistanceFt(distanceFt, alongMph)
      : Math.round(distanceFt);
  return Math.max(1, windAdjusted + elevationDistanceFt(elevationFt));
}

/** Short, glanceable shape guidance for the current wind. */
export function shapeAdvice(effect: WindEffect | null): string | null {
  if (!effect) return null;
  if (effect.alongMph <= -8) return "Headwind — go more overstable and keep the nose down.";
  if (effect.alongMph >= 8) return "Tailwind — more stability off the tee, expect a flat, long skip.";
  if (effect.crossPush === "right") return "Crosswind pushing right — favor a hyzer line.";
  if (effect.crossPush === "left") return "Crosswind pushing left — favor an anhyzer or flip line.";
  return null;
}


export type HoleHistoryScore = { strokes: number; par: number };

export type HoleHistorySummary = {
  rounds: number;
  average: number | null;
  best: number | null;
  birdieRatePct: number | null;
  lastThree: number[];
};

/** Your personal record on a single hole, ordered newest-first on input. */
export function summarizeHoleHistory(scores: HoleHistoryScore[]): HoleHistorySummary {
  if (!scores.length) {
    return { rounds: 0, average: null, best: null, birdieRatePct: null, lastThree: [] };
  }
  const total = scores.reduce((s, x) => s + x.strokes, 0);
  const best = scores.reduce((m, x) => Math.min(m, x.strokes), Infinity);
  const birdies = scores.filter((x) => x.strokes < x.par).length;
  return {
    rounds: scores.length,
    average: Math.round((total / scores.length) * 100) / 100,
    best,
    birdieRatePct: Math.round((birdies / scores.length) * 100),
    lastThree: scores.slice(0, 3).map((x) => x.strokes),
  };
}

/** What a par is worth here, relative to how the field actually scores it. */
export function parValueNote(scoringAverage: number | null, par: number): string | null {
  if (scoringAverage == null || !Number.isFinite(scoringAverage)) return null;
  const diff = scoringAverage - par;
  if (diff >= 0.35) return "Par is a gain here — the field gives strokes back on this hole.";
  if (diff <= -0.35) return "Birdie hole — par likely loses ground to the field.";
  return "Scores near par — take the clean look and move on.";
}
