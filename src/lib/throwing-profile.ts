/**
 * Throwing profile: everything the app knows about how a player actually throws.
 *
 * The survey answers live in public.throwing_profiles (one row per player).
 * Every derived number in here is an estimate built from the player's own
 * answers plus published flight numbers — never a measured result — so the UI
 * always labels it as an estimate.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ types */

export type ShotShapeKey =
  | "hyzer"
  | "flat"
  | "hyzer_flip"
  | "turnover"
  | "anhyzer"
  | "flex"
  | "spike_hyzer"
  | "roller"
  | "overhand"
  | "scoober";

export type ThrowStyleKey = "backhand" | "forehand" | "overhand" | "standstill" | "thumber";

export type ThrowingProfile = {
  user_id: string;
  handedness: "right" | "left";
  primary_style: "backhand" | "forehand";
  secondary_styles: string[];
  years_playing: number | null;
  rounds_per_month: number | null;
  field_work_per_month: number | null;
  power_band: string | null;
  backhand_max_ft: number | null;
  backhand_comfort_ft: number | null;
  forehand_max_ft: number | null;
  forehand_comfort_ft: number | null;
  disc_speed_mph: number | null;
  spin_rpm: number | null;
  launch_angle_deg: number | null;
  nose_angle_deg: number | null;
  hyzer_angle_deg: number | null;
  wobble_deg: number | null;
  measurement_device: string | null;
  measured_at: string | null;
  preferred_weight_min_g: number | null;
  preferred_weight_max_g: number | null;
  plastic_preference: string | null;
  stability_bias: string | null;
  shot_confidence: Partial<Record<ShotShapeKey, number>>;
  shot_usage: Partial<Record<ShotShapeKey, number>>;
  putting_style: string | null;
  putting_confident_ft: number | null;
  wind_comfort: string | null;
  physical_notes: string | null;
  goals: string[];
  notes: string | null;
  completed_at: string | null;
};

export type ThrowingProfileDraft = Partial<Omit<ThrowingProfile, "user_id">>;

/* ---------------------------------------------------------------- options */

export const SHOT_SHAPES: { key: ShotShapeKey; label: string; hint: string }[] = [
  { key: "hyzer", label: "Hyzer", hint: "Released edge-down, finishes the way it started." },
  { key: "flat", label: "Flat / straight", hint: "Level release, minimal shaping." },
  { key: "hyzer_flip", label: "Hyzer flip", hint: "Starts hyzer, flips up, holds straight." },
  { key: "turnover", label: "Turnover", hint: "Understable disc bending the other way." },
  { key: "anhyzer", label: "Anhyzer", hint: "Released edge-up to curve away from your hip." },
  { key: "flex", label: "Flex shot", hint: "Anhyzer release on a stable disc, fades back." },
  { key: "spike_hyzer", label: "Spike hyzer", hint: "Steep hyzer that lands flat and stops." },
  { key: "roller", label: "Roller", hint: "Lands on edge and rolls out." },
  { key: "overhand", label: "Tomahawk / thumber", hint: "Overhand shot over trouble." },
  { key: "scoober", label: "Scoober", hint: "Inverted short-range escape shot." },
];

export const THROW_STYLES: { key: ThrowStyleKey; label: string }[] = [
  { key: "backhand", label: "Backhand" },
  { key: "forehand", label: "Forehand / flick" },
  { key: "standstill", label: "Standstill" },
  { key: "overhand", label: "Tomahawk" },
  { key: "thumber", label: "Thumber" },
];

export const PLASTIC_PREFERENCES = [
  { value: "premium", label: "Premium — holds its flight longest" },
  { value: "base", label: "Base — beats in fast, grippy" },
  { value: "grippy_glow", label: "Grippy / glow" },
  { value: "mixed", label: "No strong preference" },
];

export const STABILITY_BIASES = [
  { value: "understable", label: "I lean understable" },
  { value: "neutral", label: "I lean neutral" },
  { value: "overstable", label: "I lean overstable" },
  { value: "balanced", label: "I try to stay balanced" },
];

export const WIND_COMFORT = [
  { value: "avoid", label: "Wind wrecks my round" },
  { value: "manage", label: "I manage, with mistakes" },
  { value: "confident", label: "I can shape shots into wind" },
];

export const PUTTING_STYLES = [
  { value: "spin", label: "Spin putt" },
  { value: "push", label: "Push putt" },
  { value: "straddle", label: "Straddle" },
  { value: "turbo", label: "Turbo" },
  { value: "mixed", label: "Mix depending on the lie" },
];

export const GOAL_OPTIONS = [
  { value: "distance", label: "Add distance" },
  { value: "accuracy", label: "Hit more fairways" },
  { value: "putting", label: "Make more putts" },
  { value: "forehand", label: "Build a real forehand" },
  { value: "wind", label: "Play better in wind" },
  { value: "scoring", label: "Lower my scoring average" },
  { value: "rating", label: "Raise my rating" },
  { value: "compete", label: "Compete in sanctioned events" },
];

export const CONFIDENCE_LABELS = ["Never throw it", "Learning", "Situational", "Reliable", "Go-to"];

/* ------------------------------------------------------------ persistence */

const EMPTY: Omit<ThrowingProfile, "user_id"> = {
  handedness: "right",
  primary_style: "backhand",
  secondary_styles: [],
  years_playing: null,
  rounds_per_month: null,
  field_work_per_month: null,
  power_band: null,
  backhand_max_ft: null,
  backhand_comfort_ft: null,
  forehand_max_ft: null,
  forehand_comfort_ft: null,
  disc_speed_mph: null,
  spin_rpm: null,
  launch_angle_deg: null,
  nose_angle_deg: null,
  hyzer_angle_deg: null,
  wobble_deg: null,
  measurement_device: null,
  measured_at: null,
  preferred_weight_min_g: null,
  preferred_weight_max_g: null,
  plastic_preference: null,
  stability_bias: null,
  shot_confidence: {},
  shot_usage: {},
  putting_style: null,
  putting_confident_ft: null,
  wind_comfort: null,
  physical_notes: null,
  goals: [],
  notes: null,
  completed_at: null,
};

export function emptyThrowingProfile(userId: string): ThrowingProfile {
  return { user_id: userId, ...EMPTY };
}

export async function fetchThrowingProfile(userId: string): Promise<ThrowingProfile | null> {
  const { data, error } = await supabase
    .from("throwing_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as ThrowingProfile | null) ?? null;
}

export function throwingProfileQueryOptions(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["throwing-profile", userId] as const,
    queryFn: () => fetchThrowingProfile(userId as string),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
  });
}

export async function saveThrowingProfile(
  userId: string,
  draft: ThrowingProfileDraft,
): Promise<ThrowingProfile> {
  const { data, error } = await supabase
    .from("throwing_profiles")
    .upsert(
      { user_id: userId, ...draft, completed_at: draft.completed_at ?? new Date().toISOString() },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as ThrowingProfile;
}

/* -------------------------------------------------------------- power math */

export type PowerBand = {
  key: "developing" | "moderate" | "strong" | "advanced" | "elite";
  label: string;
  /** Fastest disc this power can bring to its full flight, in flight-number speed. */
  maxUsefulSpeed: number;
  /** Estimated full-power backhand distance, in feet. */
  estimatedDistanceFt: number;
  blurb: string;
};

const BANDS: PowerBand[] = [
  {
    key: "developing",
    label: "Developing power",
    maxUsefulSpeed: 9,
    estimatedDistanceFt: 250,
    blurb: "Control discs will out-drive high-speed drivers until form catches up.",
  },
  {
    key: "moderate",
    label: "Moderate power",
    maxUsefulSpeed: 11,
    estimatedDistanceFt: 320,
    blurb: "Fairways and understable drivers give you the most usable distance.",
  },
  {
    key: "strong",
    label: "Strong power",
    maxUsefulSpeed: 13,
    estimatedDistanceFt: 380,
    blurb: "You can hold a stable driver flat and still get the fade you want.",
  },
  {
    key: "advanced",
    label: "Advanced power",
    maxUsefulSpeed: 14,
    estimatedDistanceFt: 440,
    blurb: "Overstable drivers stay usable; understable discs need lower angles.",
  },
  {
    key: "elite",
    label: "Elite power",
    maxUsefulSpeed: 15,
    estimatedDistanceFt: 500,
    blurb: "Every speed is in play — control and angle matter more than speed.",
  },
];

/**
 * Power band from measured launch numbers when the player has them, otherwise
 * from their reported full-power backhand distance.
 */
export function resolvePowerBand(profile: ThrowingProfile | null): PowerBand {
  if (!profile) return BANDS[1]!;
  const mph = profile.disc_speed_mph;
  if (mph) {
    if (mph < 45) return BANDS[0]!;
    if (mph < 53) return BANDS[1]!;
    if (mph < 61) return BANDS[2]!;
    if (mph < 69) return BANDS[3]!;
    return BANDS[4]!;
  }
  const ft = profile.backhand_max_ft;
  if (ft) {
    if (ft < 275) return BANDS[0]!;
    if (ft < 345) return BANDS[1]!;
    if (ft < 410) return BANDS[2]!;
    if (ft < 470) return BANDS[3]!;
    return BANDS[4]!;
  }
  return BANDS[1]!;
}

/** Full-power backhand distance we use for flight estimates. */
export function baseDistanceFt(profile: ThrowingProfile | null): number {
  if (profile?.backhand_max_ft) return profile.backhand_max_ft;
  if (profile?.disc_speed_mph) return Math.round(profile.disc_speed_mph * 7.2);
  return resolvePowerBand(profile).estimatedDistanceFt;
}

export function profileCompleteness(profile: ThrowingProfile | null): {
  pct: number;
  missing: string[];
} {
  if (!profile) return { pct: 0, missing: ["Take the throwing profile survey"] };
  const checks: [boolean, string][] = [
    [Boolean(profile.backhand_max_ft), "Full-power backhand distance"],
    [Boolean(profile.backhand_comfort_ft), "Comfortable backhand distance"],
    [Boolean(profile.forehand_max_ft || profile.primary_style === "backhand"), "Forehand distance"],
    [Boolean(profile.disc_speed_mph), "Measured disc speed (TechDisc or similar)"],
    [Boolean(profile.spin_rpm), "Measured spin rate"],
    [Object.keys(profile.shot_confidence ?? {}).length >= 5, "Shot-shape confidence"],
    [Boolean(profile.putting_confident_ft), "Putting range"],
    [Boolean(profile.wind_comfort), "Wind comfort"],
    [Boolean(profile.preferred_weight_min_g), "Preferred disc weight"],
    [(profile.goals ?? []).length > 0, "Goals"],
  ];
  const done = checks.filter(([ok]) => ok).length;
  return {
    pct: Math.round((done / checks.length) * 100),
    missing: checks.filter(([ok]) => !ok).map(([, label]) => label),
  };
}

/* ----------------------------------------------------------- flight model */

export type FlightInput = {
  speed: number;
  glide: number;
  turn: number;
  fade: number;
};

export type FlightPath = {
  /** Points as [distance downrange in ft, lateral offset in ft, right positive]. */
  points: [number, number][];
  distanceFt: number;
  lateralFt: number;
  /** True when the disc is faster than the player can bring up to speed. */
  overpowered: boolean;
  note: string;
};

const SHAPE_TUNING: Record<
  ShotShapeKey,
  { release: number; turnGain: number; fadeGain: number; distance: number; note: string }
> = {
  hyzer: { release: -0.55, turnGain: 0.3, fadeGain: 1.15, distance: 0.9, note: "Hyzer release" },
  flat: { release: 0, turnGain: 1, fadeGain: 1, distance: 1, note: "Flat release" },
  hyzer_flip: {
    release: -0.4,
    turnGain: 1.5,
    fadeGain: 0.85,
    distance: 1.02,
    note: "Hyzer flip — needs a disc that will turn up",
  },
  turnover: {
    release: 0.25,
    turnGain: 1.7,
    fadeGain: 0.6,
    distance: 0.95,
    note: "Turnover — understable discs only",
  },
  anhyzer: { release: 0.6, turnGain: 1.3, fadeGain: 0.7, distance: 0.88, note: "Anhyzer release" },
  flex: {
    release: 0.5,
    turnGain: 1.1,
    fadeGain: 1.4,
    distance: 0.97,
    note: "Flex — stable disc on an anhyzer angle",
  },
  spike_hyzer: {
    release: -1,
    turnGain: 0.15,
    fadeGain: 1.6,
    distance: 0.6,
    note: "Spike hyzer — lands steep and stops",
  },
  roller: { release: 0.9, turnGain: 1.8, fadeGain: 0.3, distance: 1.1, note: "Roller" },
  overhand: {
    release: -0.2,
    turnGain: 0.2,
    fadeGain: 1.5,
    distance: 0.85,
    note: "Overhand — flight numbers barely apply",
  },
  scoober: {
    release: 0.2,
    turnGain: 0.4,
    fadeGain: 0.6,
    distance: 0.35,
    note: "Scoober — short escape shot",
  },
};

/**
 * Estimated top-down flight path for one disc at one player's power, throwing
 * style and release angle. Physics-lite and clearly an estimate: it blends
 * published flight numbers with the player's power band.
 */
export function estimateFlightPath(
  disc: FlightInput,
  opts: {
    baseDistanceFt: number;
    maxUsefulSpeed: number;
    shape: ShotShapeKey;
    style: "backhand" | "forehand";
    handedness: "right" | "left";
    windMph?: number;
  },
): FlightPath {
  const tune = SHAPE_TUNING[opts.shape];
  const speed = Math.max(1, disc.speed);
  const wind = opts.windMph ?? 0;

  // How much of the disc's flight this player can actually access.
  const headroom = opts.maxUsefulSpeed - speed;
  const overpowered = headroom < -0.5;
  const speedFit = overpowered ? Math.max(0.55, 1 + headroom * 0.07) : 1;
  const ceiling = Math.min(1, 0.42 + speed * 0.05 + disc.glide * 0.035);

  let distance =
    opts.baseDistanceFt *
    ceiling *
    speedFit *
    tune.distance *
    (opts.style === "forehand" ? 0.9 : 1);
  distance = Math.max(40, Math.round(distance - wind * 2));

  // Turn works while the disc is at speed; fade takes over at the end.
  const powerRatio = Math.min(1.25, Math.max(0.5, opts.baseDistanceFt / 350));
  const turnPull = -disc.turn * tune.turnGain * powerRatio * (distance / 300) * 6;
  const fadePull = disc.fade * tune.fadeGain * (2 - powerRatio * 0.6) * (distance / 300) * 7;
  const releasePull = tune.release * (distance / 300) * 26;
  const windFade = wind * 0.8 * tune.fadeGain;

  const points: [number, number][] = [];
  const steps = 28;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const d = distance * t;
    const turnPhase = Math.max(0, Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 1.4);
    const fadePhase = t < 0.5 ? 0 : ((t - 0.5) / 0.5) ** 2.1;
    let lateral = releasePull * t + turnPull * turnPhase - (fadePull + windFade) * fadePhase;
    // Forehand mirrors a backhand; a left hand mirrors a right hand.
    const mirror = (opts.style === "forehand" ? -1 : 1) * (opts.handedness === "left" ? -1 : 1);
    lateral *= mirror;
    points.push([Math.round(d), Math.round(lateral * 10) / 10]);
  }

  const end = points[points.length - 1]!;
  return {
    points,
    distanceFt: distance,
    lateralFt: end[1],
    overpowered,
    note: overpowered
      ? `${tune.note} · speed ${speed} is above your estimated ceiling, so it fades early`
      : tune.note,
  };
}

/* ---------------------------------------------------- slot recommendations */

export type BagSlotFinding = {
  slot: string;
  detail: string;
  severity: "gap" | "tune" | "ok";
  suggestion: string;
};

type BagSummary = {
  count: number;
  bands: { putt: number; mid: number; fairway: number; distance: number };
  understable: number;
  neutral: number;
  overstable: number;
  maxSpeed: number | null;
};

/**
 * Bag slots to add or rethink, reasoned from the player's own answers rather
 * than a generic "ideal bag" template.
 */
export function bagSlotFindings(
  profile: ThrowingProfile | null,
  bag: BagSummary,
): BagSlotFinding[] {
  const band = resolvePowerBand(profile);
  const out: BagSlotFinding[] = [];
  const confident = (shape: ShotShapeKey) => (profile?.shot_confidence?.[shape] ?? 0) >= 4;
  const weak = (shape: ShotShapeKey) => (profile?.shot_confidence?.[shape] ?? 0) <= 2;

  if (bag.bands.putt < 2) {
    out.push({
      slot: "Second putter",
      detail: "You carry fewer than two putters.",
      severity: "gap",
      suggestion:
        "Carry the same putter mold twice — one clean for putting, one beat for upshots — so the feel never changes.",
    });
  }
  if (!bag.bands.mid) {
    out.push({
      slot: "Midrange",
      detail: "No midrange in the bag.",
      severity: "gap",
      suggestion: "A neutral midrange is the highest-percentage disc inside 250 feet.",
    });
  }
  if (!bag.bands.fairway) {
    out.push({
      slot: "Fairway driver",
      detail: "No fairway driver.",
      severity: "gap",
      suggestion: `At ${band.label.toLowerCase()}, a speed 7–9 fairway is usually your most accurate tee shot.`,
    });
  }
  if (bag.maxSpeed !== null && bag.maxSpeed > band.maxUsefulSpeed + 1) {
    out.push({
      slot: "Top-end speed",
      detail: `Your fastest disc is speed ${bag.maxSpeed}; your estimated ceiling is about speed ${band.maxUsefulSpeed}.`,
      severity: "tune",
      suggestion:
        "Swap the fastest driver for a lighter or slower one — it will fly farther and finish straighter.",
    });
  }
  if (!bag.understable) {
    out.push({
      slot: "Understable shaping disc",
      detail: "Nothing understable in the bag.",
      severity: "gap",
      suggestion: confident("turnover")
        ? "You trust turnovers but have nothing to throw them with — add an understable midrange."
        : "An understable midrange makes turnovers and hyzer flips learnable.",
    });
  }
  if (!bag.overstable) {
    out.push({
      slot: "Wind / flex disc",
      detail: "Nothing overstable in the bag.",
      severity: profile?.wind_comfort === "avoid" ? "gap" : "tune",
      suggestion:
        "One overstable approach disc covers headwind shots, flex lines and forced fades.",
    });
  }
  if (!bag.neutral && bag.count) {
    out.push({
      slot: "True straight disc",
      detail: "Nothing neutral to fall back on.",
      severity: "gap",
      suggestion: "A neutral fairway or midrange gives you a straight line under pressure.",
    });
  }
  if (profile?.primary_style === "backhand" && weak("flex") && bag.overstable === 0) {
    out.push({
      slot: "Forehand-friendly disc",
      detail: "You rate flex and forehand shapes low and carry nothing stable enough for them.",
      severity: "tune",
      suggestion: "A stable, flat-topped fairway is the easiest disc to learn a forehand with.",
    });
  }
  if (bag.count > 22) {
    out.push({
      slot: "Trim the bag",
      detail: `${bag.count} discs in play.`,
      severity: "tune",
      suggestion:
        "Cut to the discs you threw in your last five rounds — fewer choices, faster decisions.",
    });
  }
  if (!out.length) {
    out.push({
      slot: "Coverage looks complete",
      detail: "Every speed band and stability range is covered for your power.",
      severity: "ok",
      suggestion: "Keep a beat-in backup for your two most-thrown molds.",
    });
  }
  return out;
}

export type StyleSuggestion = { shape: ShotShapeKey; why: string; drill: string };

/** Shot shapes worth practising next, chosen from the player's own answers. */
export function styleSuggestions(profile: ThrowingProfile | null): StyleSuggestion[] {
  if (!profile) return [];
  const score = (shape: ShotShapeKey) => profile.shot_confidence?.[shape] ?? 0;
  const out: StyleSuggestion[] = [];

  if (score("hyzer_flip") <= 2) {
    out.push({
      shape: "hyzer_flip",
      why: "A hyzer flip is the highest-percentage way to add distance without adding arm speed.",
      drill:
        "Field work: throw an understable fairway on a 20° hyzer and let it stand up. Aim for it to finish straight, not turn over.",
    });
  }
  if (score("flex") <= 2) {
    out.push({
      shape: "flex",
      why: "Flex lines let one stable disc cover both a right-to-left and a long S-curve.",
      drill:
        "Take your most overstable driver, release it 15° anhyzer flat-nosed, and note where it finishes over ten throws.",
    });
  }
  if (score("spike_hyzer") <= 2) {
    out.push({
      shape: "spike_hyzer",
      why: "Spike hyzers stop on a dime and save strokes on elevated or guarded baskets.",
      drill:
        "From 180 feet, throw a putter on a steep hyzer and try to land inside a 15-foot circle.",
    });
  }
  if (profile.primary_style === "backhand" && score("turnover") <= 2) {
    out.push({
      shape: "turnover",
      why: "Without a turnover, every left-to-right line has to come from an anhyzer release.",
      drill: "Throw a beat-in midrange flat with a soft release and let the turn do the work.",
    });
  }
  if (profile.wind_comfort === "avoid") {
    out.push({
      shape: "hyzer",
      why: "You said wind wrecks your round; low, nose-down hyzers are the reliable wind shot.",
      drill:
        "Practise waist-high releases with a stable midrange into a headwind and watch nose angle, not power.",
    });
  }
  return out.slice(0, 4);
}
