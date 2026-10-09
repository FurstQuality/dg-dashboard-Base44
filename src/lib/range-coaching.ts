// Coaching prompt engine for the Digital Driving Range.
// Generates skill-building challenges based on the discs a player brought,
// current wind conditions, and cones they've set on the field.

export type DiscInfo = {
  id: string;
  label: string;
  speed: number | null; // 1-14
  glide: number | null;
  turn: number | null; // -5 (understable) to +1 (overstable)
  fade: number | null; // 0 (straight) to 5 (hard fade)
  stability?: string | null;
};

export type WindContext = {
  mph: number | null;
  /** Compass direction the wind is BLOWING FROM: N,NE,E,SE,S,SW,W,NW */
  from: string | null;
};

export type Challenge = {
  id: string;
  title: string;
  detail: string;
  target_ft: number | null;
  target_min_ft?: number | null;
  disc_hint?: string | null;
  shape_hint?: string | null;
  coaching: string;
  tier: "warmup" | "skill" | "stretch" | "wind";
};

const OPP: Record<string, string> = {
  N: "S",
  NE: "SW",
  E: "W",
  SE: "NW",
  S: "N",
  SW: "NE",
  W: "E",
  NW: "SE",
};

function speedBucket(speed: number | null): "putter" | "mid" | "fairway" | "distance" | "unknown" {
  if (speed == null) return "unknown";
  if (speed <= 4) return "putter";
  if (speed <= 6) return "mid";
  if (speed <= 9) return "fairway";
  return "distance";
}

function isUnderstable(d: DiscInfo) {
  return (d.turn ?? 0) <= -1.5;
}
function isOverstable(d: DiscInfo) {
  return (d.fade ?? 0) >= 2.5 && (d.turn ?? 0) >= 0;
}

/**
 * Build a live list of coaching challenges. The engine prefers challenges that
 * (a) match the discs the player actually has in their bag, and (b) match the
 * cones they've placed in the field so goals are visually anchored.
 */
export function buildChallenges({
  discs,
  wind,
  cones,
  completed,
}: {
  discs: DiscInfo[];
  wind: WindContext;
  cones: number[]; // distances in feet that are set as visible cones
  completed: string[]; // challenge ids the user has already completed this session
}): Challenge[] {
  const out: Challenge[] = [];
  const has = (test: (d: DiscInfo) => boolean) => discs.some(test);
  const coneAt = (ft: number) => cones.includes(ft);
  const push = (c: Challenge) => {
    if (!completed.includes(c.id)) out.push(c);
  };

  // ---- Warmup: putter control to first cone
  push({
    id: "warmup_putter_100",
    tier: "warmup",
    title: "Putter warmup to the 100 ft cone",
    detail: coneAt(100)
      ? "Land 3 putters near the 100 ft cone. Focus on smooth follow-through."
      : "Land 3 putters around 100 ft. Focus on smooth follow-through.",
    target_ft: 100,
    disc_hint: "Putter",
    shape_hint: "flat",
    coaching:
      "Slow arm, high release, weight through the shot. This grooves your form before you open up.",
  });

  // ---- Skill: slow disc past 300 ft (marquee coaching prompt)
  if (has((d) => speedBucket(d.speed) === "putter" || speedBucket(d.speed) === "mid")) {
    push({
      id: "skill_slow_over_300",
      tier: "stretch",
      title: "Slow speed disc past the 300 ft cone",
      detail: coneAt(300)
        ? "Land a putter or midrange past the 300 ft cone."
        : "Land a putter or midrange past 300 ft.",
      target_ft: 300,
      target_min_ft: 300,
      disc_hint: "Putter or Midrange",
      shape_hint: "hyzer_flip",
      coaching:
        "Get it up in the air and flat so it can flip and glide for a while before fading out. Nose down, smooth pull — don't muscle it.",
    });
  }

  // ---- Skill: overstable fairway safety line to 250-275 ft
  if (has(isOverstable)) {
    push({
      id: "skill_stable_safety",
      tier: "skill",
      title: "Repeatable stable line to 250 ft",
      detail: "Throw the same 250-ish ft hyzer line 3x with an overstable fairway/mid.",
      target_ft: 250,
      shape_hint: "hyzer",
      coaching:
        "This is your money shot in a headwind. Same grip, same release, same finish. Consistency beats distance.",
    });
  }

  // ---- Skill: hyzer flip S-curve
  if (has(isUnderstable)) {
    push({
      id: "skill_hyzer_flip_s",
      tier: "skill",
      title: "Hyzer-flip S-curve",
      detail:
        "Start on hyzer, flip to flat, hold, and let it fade back. Aim to land past the 250 ft cone.",
      target_ft: 275,
      target_min_ft: 250,
      shape_hint: "s_curve",
      disc_hint: "Understable fairway or distance driver",
      coaching:
        "Release angle is everything: 5-10° hyzer, flat height, nose down. Let the disc do the work.",
    });
  }

  // ---- Stretch: max distance driver past the 400 ft cone
  if (has((d) => speedBucket(d.speed) === "distance")) {
    push({
      id: "stretch_max_400",
      tier: "stretch",
      title: "Reach the 400 ft cone",
      detail: coneAt(400)
        ? "Land a distance driver past the 400 ft cone."
        : "Land a distance driver past 400 ft.",
      target_ft: 400,
      target_min_ft: 400,
      shape_hint: "s_curve",
      disc_hint: "Distance driver",
      coaching:
        "Reach back, hip rotation, late acceleration. Height + a small anhyzer angle gives the flight time it needs to open up.",
    });
  }

  // ---- Wind-aware prompts
  if (wind.mph != null && wind.mph >= 8 && wind.from) {
    const into = wind.from; // wind is FROM this direction, so throwing INTO wind means throwing toward `into`
    const with_ = OPP[wind.from] ?? "downwind";
    if (has(isOverstable)) {
      push({
        id: `wind_headwind_${into}`,
        tier: "wind",
        title: `Fight the wind: throw ${into} into the headwind`,
        detail: `${wind.mph} mph out of the ${into}. Grip lock a stable disc and drive it straight into the wind.`,
        target_ft: 250,
        disc_hint: "Overstable",
        shape_hint: "flat",
        coaching:
          "Headwinds turn understable discs over hard. Use overstable plastic, keep the nose down, and throw flat with a little extra spin. Do NOT throw high — the wind will balloon it.",
      });
    }
    if (has(isUnderstable)) {
      push({
        id: `wind_tailwind_${with_}`,
        tier: "wind",
        title: `Ride the wind: throw ${with_} downwind`,
        detail: `Downwind toward ${with_}. Reach for extra distance with an understable driver.`,
        target_ft: 400,
        target_min_ft: 350,
        disc_hint: "Understable",
        shape_hint: "flat",
        coaching:
          "Tailwinds make discs FEEL overstable — they hold their line. Throw flat and let it float. Understable plastic won't turn as hard as normal.",
      });
    }
  }

  // ---- Skill: touch shot inside 100 ft (turnover approach)
  push({
    id: "skill_approach_80",
    tier: "skill",
    title: "Touch approach to 80 ft",
    detail: "Land 3 in a row inside 100 ft with your favorite approach disc.",
    target_ft: 80,
    shape_hint: "flat",
    coaching:
      "Half power, high release, land flat. This is the shot that saves you strokes when everything else goes wrong.",
  });

  return out;
}

export function evaluateThrow(
  challenge: Challenge,
  throwData: {
    distance_ft: number;
    shape?: string | null;
    disc_speed?: number | null;
    disc_label?: string | null;
  },
): { met: boolean; message: string } {
  const d = throwData.distance_ft;
  const min =
    challenge.target_min_ft ?? (challenge.target_ft ? Math.max(0, challenge.target_ft - 20) : null);
  if (min != null && d < min) {
    return { met: false, message: `${d} ft — need ${min}+ ft to clear this one. Keep working.` };
  }
  // Slow-disc-over-300 gets a special congrats line
  if (challenge.id === "skill_slow_over_300" && d >= 300) {
    return {
      met: true,
      message: `${d} ft with a slow disc — that's ${d - 300} ft past the cone! Huge form win.`,
    };
  }
  if (challenge.id === "stretch_max_400" && d >= 400) {
    return { met: true, message: `${d} ft — you cleared the 400 cone!` };
  }
  return { met: true, message: `${d} ft — challenge cleared.` };
}
