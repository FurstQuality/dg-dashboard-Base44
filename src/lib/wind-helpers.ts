// Shared wind helpers for practice tools (range + putting green).
// Converts Open-Meteo direction degrees to compass, and generates
// short, human-coach style tips based on wind speed + gusts.

export const COMPASS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type Compass = (typeof COMPASS_8)[number];

/** Meteorological wind_direction is where the wind is BLOWING FROM (degrees). */
export function degToCompass(deg: number | null | undefined): Compass | null {
  if (deg == null || Number.isNaN(deg)) return null;
  const norm = ((deg % 360) + 360) % 360;
  const idx = Math.round(norm / 45) % 8;
  return COMPASS_8[idx];
}

const OPP: Record<Compass, Compass> = {
  N: "S",
  NE: "SW",
  E: "W",
  SE: "NW",
  S: "N",
  SW: "NE",
  W: "E",
  NW: "SE",
};
export const oppositeCompass = (c: Compass) => OPP[c];

export type WindTip = {
  title: string;
  detail: string;
  severity: "calm" | "breeze" | "strong" | "gusty";
};

export function rangeWindTip(
  mph: number | null,
  gustMph: number | null,
  from: Compass | null,
): WindTip | null {
  if (mph == null) return null;
  if (mph < 5) {
    return {
      severity: "calm",
      title: "Calm conditions — groove your form",
      detail:
        "Under 5 mph. Perfect window to work on release angle and nose control without wind masking mistakes.",
    };
  }
  const gustJump = gustMph != null && gustMph - mph >= 6;
  const strong = mph >= 12;
  if (gustJump) {
    return {
      severity: "gusty",
      title: `Gusty ${mph}–${gustMph} mph from the ${from ?? "?"}`,
      detail:
        "Time each throw between gusts. Grip lock overstable plastic, throw flat, and keep the disc under the wind — no high releases.",
    };
  }
  if (strong) {
    return {
      severity: "strong",
      title: `${mph} mph headwind window — beadown & throw flat`,
      detail: `Wind is out of the ${from ?? "?"}. Into the wind: overstable, nose down, low ceiling. Downwind toward the ${from ? oppositeCompass(from) : "opposite side"}: understable, flat, hunt for extra distance.`,
    };
  }
  return {
    severity: "breeze",
    title: `${mph} mph breeze from the ${from ?? "?"}`,
    detail:
      "Enough to shape shots. Practice both a hyzer safety line into the breeze and an understable flip line downwind.",
  };
}

export function puttingWindTip(
  mph: number | null,
  gustMph: number | null,
  from: Compass | null,
): WindTip | null {
  if (mph == null) return null;
  if (mph < 4) {
    return {
      severity: "calm",
      title: "Calm — hit the chains",
      detail: "Under 4 mph. Trust your line, no aim-off needed. Attack the pole.",
    };
  }
  const gustJump = gustMph != null && gustMph - mph >= 6;
  if (gustJump) {
    return {
      severity: "gusty",
      title: `Gusty ${mph}–${gustMph} mph`,
      detail:
        "Wait for the lull before releasing. Straddle or step for extra stability and don't try to power through a gust.",
    };
  }
  if (mph >= 12) {
    return {
      severity: "strong",
      title: `${mph} mph — putt low and firm`,
      detail: `Wind out of the ${from ?? "?"}. Into the wind: extra spin, low & firm push putt. With the wind: touch putt, aim slightly low so the wind doesn't lift it over.`,
    };
  }
  return {
    severity: "breeze",
    title: `${mph} mph breeze from the ${from ?? "?"}`,
    detail: `Aim a chain link into the wind. Cross-winds from the ${from ?? "?"} push putts toward the ${from ? oppositeCompass(from) : "downwind"} — favor that edge of the chains.`,
  };
}
