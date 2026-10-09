/**
 * Course Readiness math — "what do I have to shoot here to hit my rating?"
 *
 * PDGA round ratings come from a straight line through the scratch scoring
 * average (SSA) of the layout:
 *
 *   round_rating = 1000 - (score - ssa) * stroke_value
 *
 * Rearranged, the score needed for a target rating is:
 *
 *   score = ssa - (target - 1000) / stroke_value
 *
 * Pure functions only, so the server function and the tests agree.
 */

export const DEFAULT_STROKE_VALUE = 10;

export type ReadinessLayoutInput = {
  layoutId: string | null;
  layoutName: string;
  /** Scratch scoring average for the layout. Null when no profile exists. */
  ssa: number | null;
  strokeValue: number | null;
  parTotal: number | null;
  holeCount: number | null;
  /** Total layout distance in feet, when the layout has been measured. */
  distanceTotal?: number | null;
  /** Where the SSA came from, shown to the player. */
  ssaSource: "rating-profile" | "layout-scratch" | "unknown";
};

export type PlayerCourseHistory = {
  rounds: number;
  bestScore: number | null;
  avgScore: number | null;
  bestToPar: number | null;
  avgToPar: number | null;
  bestRating: number | null;
  avgRating: number | null;
  lastPlayedOn: string | null;
};

export type ReadinessVerdict = "ready" | "stretch" | "reach" | "unknown";

export type ReadinessRow = {
  layoutId: string | null;
  layoutName: string;
  ssa: number | null;
  ssaSource: ReadinessLayoutInput["ssaSource"];
  strokeValue: number;
  parTotal: number | null;
  holeCount: number | null;
  distanceTotal: number | null;
  /** Score needed for the target round rating. */
  requiredScore: number | null;
  /** Same number expressed against par, when par is known. */
  requiredToPar: number | null;
  /** Strokes between the player's average here and the required score. */
  gapFromAverage: number | null;
  /** Strokes between the player's best here and the required score. */
  gapFromBest: number | null;
  verdict: ReadinessVerdict;
  /** One-line plain-language read on the layout. */
  note: string;
};

export function requiredScoreForRating(
  targetRating: number,
  ssa: number,
  strokeValue: number = DEFAULT_STROKE_VALUE,
): number {
  const sv = strokeValue > 0 ? strokeValue : DEFAULT_STROKE_VALUE;
  return +(ssa - (targetRating - 1000) / sv).toFixed(1);
}

export function ratingForScore(
  score: number,
  ssa: number,
  strokeValue: number = DEFAULT_STROKE_VALUE,
): number {
  const sv = strokeValue > 0 ? strokeValue : DEFAULT_STROKE_VALUE;
  return Math.round(1000 - (score - ssa) * sv);
}

/** Builds one readiness row for a layout given the player's history there. */
export function buildReadinessRow(
  layout: ReadinessLayoutInput,
  targetRating: number,
  history: PlayerCourseHistory,
): ReadinessRow {
  const strokeValue =
    layout.strokeValue && layout.strokeValue > 0 ? layout.strokeValue : DEFAULT_STROKE_VALUE;

  if (layout.ssa == null) {
    return {
      layoutId: layout.layoutId,
      layoutName: layout.layoutName,
      ssa: null,
      ssaSource: layout.ssaSource,
      strokeValue,
      parTotal: layout.parTotal,
      holeCount: layout.holeCount,
      distanceTotal: layout.distanceTotal ?? null,
      requiredScore: null,
      requiredToPar: null,
      gapFromAverage: null,
      gapFromBest: null,
      verdict: "unknown",
      note: "No scratch scoring average on file for this layout yet, so we can't turn your rating target into a score.",
    };
  }

  const requiredScore = requiredScoreForRating(targetRating, layout.ssa, strokeValue);
  const requiredToPar =
    layout.parTotal != null ? +(requiredScore - layout.parTotal).toFixed(1) : null;

  const gapFromAverage =
    history.avgScore != null ? +(history.avgScore - requiredScore).toFixed(1) : null;
  const gapFromBest =
    history.bestScore != null ? +(history.bestScore - requiredScore).toFixed(1) : null;

  let verdict: ReadinessVerdict = "unknown";
  let note =
    "You haven't logged a rated round here, so this is the score to beat based on the layout's scratch average.";

  if (gapFromBest != null) {
    if (gapFromAverage != null && gapFromAverage <= 0) {
      verdict = "ready";
      note = `Your average here already clears the number by ${Math.abs(gapFromAverage)} stroke${
        Math.abs(gapFromAverage) === 1 ? "" : "s"
      }.`;
    } else if (gapFromBest <= 0) {
      verdict = "stretch";
      note = `You've shot it before — your best here beats the number, but your average is ${gapFromAverage} over.`;
    } else if (gapFromBest <= 4) {
      verdict = "stretch";
      note = `Your best round here is ${gapFromBest} stroke${gapFromBest === 1 ? "" : "s"} short. It's in range on a clean day.`;
    } else {
      verdict = "reach";
      note = `Your best here is ${gapFromBest} strokes short of the number — treat this as a stretch layout.`;
    }
  }

  return {
    layoutId: layout.layoutId,
    layoutName: layout.layoutName,
    ssa: layout.ssa,
    ssaSource: layout.ssaSource,
    strokeValue,
    parTotal: layout.parTotal,
    holeCount: layout.holeCount,
    distanceTotal: layout.distanceTotal ?? null,
    requiredScore,
    requiredToPar,
    gapFromAverage,
    gapFromBest,
    verdict,
    note,
  };
}

/** Aggregates a player's rounds at one course into the history shape. */
export function summarizeCourseHistory(
  rounds: Array<{
    played_on: string;
    score: number | null;
    to_par: number | null;
    round_rating: number | null;
  }>,
): PlayerCourseHistory {
  const scores = rounds.map((r) => r.score).filter((v): v is number => typeof v === "number");
  const toPars = rounds.map((r) => r.to_par).filter((v): v is number => typeof v === "number");
  const ratings = rounds
    .map((r) => r.round_rating)
    .filter((v): v is number => typeof v === "number");
  const dates = rounds
    .map((r) => r.played_on)
    .filter((v): v is string => !!v)
    .sort();

  const avg = (arr: number[]) =>
    arr.length ? +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1) : null;

  return {
    rounds: rounds.length,
    bestScore: scores.length ? Math.min(...scores) : null,
    avgScore: avg(scores),
    bestToPar: toPars.length ? Math.min(...toPars) : null,
    avgToPar: avg(toPars),
    bestRating: ratings.length ? Math.max(...ratings) : null,
    avgRating: avg(ratings),
    lastPlayedOn: dates.length ? dates[dates.length - 1]! : null,
  };
}

export const VERDICT_LABEL: Record<ReadinessVerdict, string> = {
  ready: "In your range",
  stretch: "Stretch",
  reach: "Reach",
  unknown: "Needs data",
};

/* ---------------------------------------------------------------------------
 * Game plan — "how do I actually have to play it?"
 *
 * The required score answers "what number do I need". The plan turns that
 * number into holes: where the birdies have to come from, how many bogeys the
 * number can absorb, and which holes have historically taken strokes back.
 * ------------------------------------------------------------------------- */

export type PlanHoleInput = {
  number: number;
  par: number | null;
  distanceFt: number | null;
  /** Field-average strokes on the hole, when the mirror has scoring data. */
  avgStrokes: number | null;
  birdieRate: number | null;
  bogeyPlusRate: number | null;
  obStrokes: number | null;
  shotShape?: string | null;
  caddyNote?: string | null;
};

export type PlanHoleTarget = "birdie" | "par" | "protect";

export type PlanHole = {
  number: number;
  par: number | null;
  distanceFt: number | null;
  target: PlanHoleTarget;
  avgStrokes: number | null;
  birdieRate: number | null;
  bogeyPlusRate: number | null;
  shotShape: string | null;
  note: string;
};

export type ReadinessPlan = {
  /** Strokes under par the target rating asks for (0 when par or worse). */
  underParNeeded: number;
  /** Birdies needed if you play every other hole at par. */
  birdiesNeeded: number;
  /** Bogeys the number survives if you convert every attack hole. */
  bogeyBudget: number;
  /** Total gettable / play-safe holes (lists below are trimmed for display). */
  attackCount: number;
  protectCount: number;
  attack: PlanHole[];
  protect: PlanHole[];
  holes: PlanHole[];
  /** Front/back (or first/second half) stroke split for the required score. */
  paceNote: string;
  summary: string;
};

function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

/** Hazard words in a hole's caddy note that argue for the safe line. */
const HAZARD_WORDS =
  /\b(ob\b|out of bounds|water|creek|pond|lake|guarded|tight|wooded|gap|mando|island|road|parking|fence|elevated|blind|drop ?zone|penalty)/i;

function classifyHole(h: PlanHoleInput): { target: PlanHoleTarget; note: string } {
  const par = h.par ?? 3;
  const avgVsPar = h.avgStrokes != null ? +(h.avgStrokes - par).toFixed(2) : null;
  const hasScoring = h.birdieRate != null || avgVsPar != null;
  const noteHazard = h.caddyNote ? HAZARD_WORDS.test(h.caddyNote) : false;

  const risky =
    (h.obStrokes ?? 0) > 0 ||
    (h.bogeyPlusRate != null && h.bogeyPlusRate >= 0.3) ||
    (avgVsPar != null && avgVsPar >= 0.3) ||
    (!hasScoring && noteHazard) ||
    (!hasScoring && par === 3 && h.distanceFt != null && h.distanceFt >= 380);

  // With no scoring history, only genuinely short par 3s and reachable par 4+
  // holes count as birdie looks — otherwise every hole reads "gettable".
  const gettable = hasScoring
    ? (h.birdieRate != null && h.birdieRate >= 0.3) || (avgVsPar != null && avgVsPar <= -0.25)
    : !noteHazard &&
      ((par >= 4 && h.distanceFt != null && h.distanceFt <= 600) ||
        (par === 3 && h.distanceFt != null && h.distanceFt <= 275));

  if (risky && !gettable) {
    return {
      target: "protect",
      note:
        (h.obStrokes ?? 0) > 0
          ? "Strokes get lost here — take the safe line and walk off with par."
          : h.bogeyPlusRate != null
            ? `Bogey or worse ${pct(h.bogeyPlusRate)} of the time. Par is a good score.`
            : "Trouble in play. Take the safe line and walk off with par.",
    };
  }
  if (gettable) {
    return {
      target: "birdie",
      note:
        h.birdieRate != null
          ? `Birdied ${pct(h.birdieRate)} of the time — this is one to convert.`
          : par >= 4
            ? "Reachable in two. Get inside the circle and take your look."
            : "Short enough to attack. Give yourself a look at the birdie.",
    };
  }
  return { target: "par", note: "Straightforward par hole. Stay patient and keep the card clean." };
}

export function buildReadinessPlan(row: ReadinessRow, holes: PlanHoleInput[]): ReadinessPlan | null {
  // Without a scratch average we can't set a number, but the hole-by-hole plan
  // is still useful, so only the hole data is required.
  if (holes.length === 0) return null;

  const planHoles: PlanHole[] = holes
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((h) => {
      const { target, note } = classifyHole(h);
      return {
        number: h.number,
        par: h.par,
        distanceFt: h.distanceFt,
        target,
        avgStrokes: h.avgStrokes,
        birdieRate: h.birdieRate,
        bogeyPlusRate: h.bogeyPlusRate,
        shotShape: h.shotShape ?? null,
        note: h.caddyNote?.trim() ? h.caddyNote.trim() : note,
      };
    });

  const parTotal =
    row.parTotal ??
    (planHoles.every((h) => h.par != null)
      ? planHoles.reduce((s, h) => s + (h.par ?? 0), 0)
      : null);

  const underParNeeded =
    parTotal != null && row.requiredScore != null
      ? Math.max(0, Math.ceil(parTotal - row.requiredScore))
      : 0;

  const attack = planHoles.filter((h) => h.target === "birdie");
  const protectHoles = planHoles.filter((h) => h.target === "protect");
  const birdiesNeeded = underParNeeded;
  const bogeyBudget = Math.max(0, attack.length - birdiesNeeded);

  const half = Math.ceil(planHoles.length / 2);
  const firstHalfPar = planHoles.slice(0, half).reduce((s, h) => s + (h.par ?? 0), 0);
  const hasTarget = row.requiredScore != null;
  const paceNote =
    hasTarget && parTotal != null && firstHalfPar > 0
      ? `Through ${half} holes you want to be ${
          birdiesNeeded > 0 ? `${Math.round(birdiesNeeded / 2)} under` : "even"
        } — about ${Math.round(firstHalfPar - Math.round(birdiesNeeded / 2))} strokes.`
      : "Play it one hole at a time and keep the big numbers off the card.";

  const summary = !hasTarget
    ? `No target score yet for this layout, but the shape of the round is clear: ${attack.length} hole${attack.length === 1 ? "" : "s"} to attack and ${protectHoles.length} to play safe.`
    : birdiesNeeded === 0
      ? `Par golf gets you there. Protect the card on ${protectHoles.length || "the tough"} hole${protectHoles.length === 1 ? "" : "s"} and the number takes care of itself.`
      : `You need ${birdiesNeeded} birdie${birdiesNeeded === 1 ? "" : "s"} with ${bogeyBudget} bogey${bogeyBudget === 1 ? "" : "s"} to spare. ${attack.length} hole${attack.length === 1 ? " is" : "s are"} playing gettable and ${protectHoles.length} need${protectHoles.length === 1 ? "s" : ""} respect.`;

  return {
    underParNeeded,
    birdiesNeeded,
    bogeyBudget,
    attackCount: attack.length,
    protectCount: protectHoles.length,
    attack: attack.slice(0, 6),
    protect: protectHoles.slice(0, 6),
    holes: planHoles,
    paceNote,
    summary,
  };
}
