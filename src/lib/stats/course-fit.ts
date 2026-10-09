/**
 * Course Fit math — "how will I actually play this course, and what should I
 * work on before I get there?"
 *
 * Pure functions only. Everything the UI shows is derived here so the server
 * function, the tests, and the panel agree on the numbers.
 *
 * Inputs come from three places, in order of trust:
 *   1. The player's own rounds at this course (score + rating history).
 *   2. The player's hole history everywhere else, bucketed by par.
 *   3. Field scoring data for the layout (hole_intel) and the layout's
 *      scratch scoring average.
 */

export type FitHole = {
  number: number;
  par: number | null;
  distanceFt: number | null;
  hazards: string[];
  /** Field average strokes on this hole, when the app has scored rounds here. */
  fieldAvgStrokes: number | null;
  fieldScoresCount: number;
};

export type ParProfile = {
  /** Player's average strokes over par, keyed by hole par. */
  byPar: Record<number, { avgVsPar: number; holes: number }>;
  overallVsPar: number | null;
  holes: number;
};

export type CourseHistory = {
  rounds: number;
  avgScore: number | null;
  bestScore: number | null;
  avgRating: number | null;
  lastPlayedOn: string | null;
};

export type FitStance = "attack" | "hold" | "danger" | "unknown";

export type HolePlanRow = {
  number: number;
  par: number | null;
  distanceFt: number | null;
  stance: FitStance;
  /** Strokes the player projects to take here. */
  projected: number | null;
  projectedVsPar: number | null;
  fieldAvgStrokes: number | null;
  /** The player's own average on this hole, from their scored rounds here. */
  yourAvgHere: number | null;
  yourRoundsHere: number;
  /** Always filled: their average here, or their scoring profile's estimate. */
  yourAvgShown: number | null;
  /** True when `yourAvgShown` is an estimate rather than scored rounds here. */
  yourAvgEstimated: boolean;
  /** Their average minus the field average on this hole (negative = better). */
  vsField: number | null;
  hazards: string[];
  note: string;
};

/** One hole called out as a strength or a leak, with the number behind it. */
export type HoleCallout = {
  number: number;
  par: number | null;
  distanceFt: number | null;
  yourAvg: number | null;
  fieldAvg: number | null;
  /** Strokes gained (negative) or lost (positive) against the field here. */
  vsField: number | null;
  detail: string;
};

/** Score needed for a given round rating on this layout. */
export type RatingStep = {
  rating: number;
  score: number;
  toPar: number | null;
  /** True when this is the rating the player asked about. */
  isTarget: boolean;
};

export type FitFactor = {
  id: string;
  label: string;
  detail: string;
  lean: "good" | "neutral" | "tough";
};

export type FitVerdict = "ready" | "stretch" | "reach" | "unknown";

export type CourseFit = {
  holeCount: number | null;
  parTotal: number | null;
  distanceTotal: number | null;
  projectedScore: number | null;
  projectedToPar: number | null;
  projectedRange: { low: number; high: number } | null;
  projectedRating: number | null;
  ssa: number | null;
  strokeValue: number;
  requiredScore: number | null;
  requiredToPar: number | null;
  /** Strokes between the projection and the score the target rating needs. */
  gap: number | null;
  verdict: FitVerdict;
  headline: string;
  holePlan: HolePlanRow[];
  /** Score needed for a spread of ratings, so the number is easy to read off. */
  ratingLadder: RatingStep[];
  /** Holes where the player already beats the field or their own par norm. */
  strengths: HoleCallout[];
  /** Holes where the strokes are leaking. */
  weaknesses: HoleCallout[];
  factors: FitFactor[];
  focus: Array<{ id: string; title: string; detail: string }>;
  sources: string[];
};

export const DEFAULT_STROKE_VALUE = 10;
const ELITE_VS_PAR: Record<number, number> = { 3: -0.32, 4: -0.55, 5: -0.85 };

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Bucket a player's hole history (any course) by par. */
export function buildParProfile(rows: Array<{ par: number | null; strokes: number | null }>): ParProfile {
  const agg = new Map<number, { sum: number; holes: number }>();
  let totalDiff = 0;
  let total = 0;
  for (const r of rows) {
    if (!r.par || !r.strokes || r.par < 2 || r.par > 6) continue;
    const diff = r.strokes - r.par;
    if (diff < -3 || diff > 8) continue; // guard against import junk
    const bucket = agg.get(r.par) ?? { sum: 0, holes: 0 };
    bucket.sum += diff;
    bucket.holes += 1;
    agg.set(r.par, bucket);
    totalDiff += diff;
    total += 1;
  }
  const byPar: ParProfile["byPar"] = {};
  for (const [par, b] of agg) {
    byPar[par] = { avgVsPar: round1(b.sum / b.holes), holes: b.holes };
  }
  return {
    byPar,
    overallVsPar: total ? round1(totalDiff / total) : null,
    holes: total,
  };
}

function playerVsPar(profile: ParProfile, par: number | null): number | null {
  if (par && profile.byPar[par] && profile.byPar[par].holes >= 8) return profile.byPar[par].avgVsPar;
  return profile.overallVsPar;
}

function distanceLean(par: number | null, distanceFt: number | null): "long" | "short" | null {
  if (!par || !distanceFt) return null;
  if (par === 3) return distanceFt >= 360 ? "long" : distanceFt <= 250 ? "short" : null;
  if (par === 4) return distanceFt >= 640 ? "long" : distanceFt <= 460 ? "short" : null;
  if (par >= 5) return distanceFt >= 900 ? "long" : null;
  return null;
}

/**
 * A scratch scoring average is a stroke total, so it has to sit near the
 * course's par (or in a sane strokes-per-hole band). Rating values stored in
 * the same column (e.g. 950) are rejected here.
 */
export function plausibleSsa(
  ssa: number | null,
  parTotal: number | null,
  holeCount: number | null,
): boolean {
  if (ssa == null || !Number.isFinite(ssa) || ssa <= 0) return false;
  if (parTotal != null && parTotal > 0) return Math.abs(ssa - parTotal) <= 20;
  if (holeCount != null && holeCount > 0) return ssa >= holeCount * 2 && ssa <= holeCount * 5;
  return ssa >= 20 && ssa <= 120;
}

export type CourseFitInput = {
  holes: FitHole[];
  holeCount: number | null;
  parTotal: number | null;
  distanceTotal: number | null;
  /** Scratch scoring average for the layout, when known. */
  ssa: number | null;
  strokeValue: number | null;
  ssaSource: string;
  playerProfile: ParProfile;
  courseHistory: CourseHistory;
  targetRating: number;
  /** Player's typical course length in feet, for the length fit factor. */
  typicalCourseDistanceFt: number | null;
  /** Spread (std dev) of the player's round scores, for the projection range. */
  scoreSpread: number | null;
  /** The player's own scoring on each hole here, keyed by hole number. */
  myHoleStats?: Record<number, { avg: number; rounds: number }>;
};

export function buildCourseFit(input: CourseFitInput): CourseFit {
  const holes = input.holes.slice().sort((a, b) => a.number - b.number);
  const strokeValue =
    input.strokeValue && input.strokeValue > 0 ? input.strokeValue : DEFAULT_STROKE_VALUE;
  const sources: string[] = [];

  /* ---- hole-by-hole projection ---------------------------------------- */
  const myHoleStats = input.myHoleStats ?? {};
  const holePlan: HolePlanRow[] = holes.map((h) => {
    const vsPar = playerVsPar(input.playerProfile, h.par);
    const own = myHoleStats[h.number];
    const yourAvgHere = own && own.rounds >= 2 ? round1(own.avg) : null;
    /* A single round here isn't an average yet, so blend it with the estimate. */
    const parEstimate = h.par != null && vsPar != null ? round1(h.par + vsPar) : null;
    const oneRound = own && own.rounds === 1 ? round1(own.avg) : null;
    // Their own scoring on this exact hole beats any par-bucket estimate.
    const projected =
      yourAvgHere != null
        ? yourAvgHere
        : oneRound != null && parEstimate != null
          ? round1((oneRound + parEstimate) / 2)
          : (oneRound ?? parEstimate);
    const fieldVsPar = h.par != null && h.fieldAvgStrokes != null ? h.fieldAvgStrokes - h.par : null;
    const vsField =
      yourAvgHere != null && h.fieldAvgStrokes != null
        ? round1(yourAvgHere - h.fieldAvgStrokes)
        : null;
    const lean = distanceLean(h.par, h.distanceFt);
    const hazardous = h.hazards.length > 0;
    const projectedVsPar = projected != null && h.par != null ? round1(projected - h.par) : null;

    let stance: FitStance = "unknown";
    if (projected == null) stance = "unknown";
    else if (vsField != null && vsField >= 0.2) stance = "danger";
    else if (vsField != null && vsField <= -0.2) stance = "attack";
    else if (projectedVsPar != null && projectedVsPar >= 0.25) stance = "danger";
    else if (hazardous || (fieldVsPar != null && fieldVsPar >= 0.35) || lean === "long")
      stance = "danger";
    else if (projectedVsPar != null && projectedVsPar <= -0.1) stance = "attack";
    else stance = "hold";

    const notes: string[] = [];
    /* Every hole starts as a birdie look. Par is the fallback the numbers
       justify, never the goal. */
    if (vsField != null && vsField >= 0.2)
      notes.push(
        `You average ${yourAvgHere} here — ${round1(Math.abs(vsField))} worse than the field. Take the birdie look from a safe angle; par is a win if the line isn't there.`,
      );
    if (vsField != null && vsField <= -0.2)
      notes.push(
        `You average ${yourAvgHere} here — ${round1(Math.abs(vsField))} better than the field. Go get the birdie.`,
      );
    if (stance === "attack") notes.push("Birdie hole — take the aggressive line.");
    if (stance === "danger" && hazardous)
      notes.push(
        `Hazard in play (${h.hazards.slice(0, 2).join(", ")}) — go at the birdie only if the line is clean, otherwise take par.`,
      );
    if (stance === "danger" && !hazardous && lean === "long")
      notes.push("Long for its par — put a birdie look in play instead of forcing the green.");
    if (stance === "danger" && !hazardous && lean !== "long" && fieldVsPar != null)
      notes.push("Plays over par for the field — birdie if it's there, and par still gains strokes.");
    if (stance === "hold")
      notes.push("Birdie is in reach — take the look, and settle for par only if you're out of position.");
    if (stance === "unknown") notes.push("No hole detail on file yet.");

    return {
      number: h.number,
      par: h.par,
      distanceFt: h.distanceFt,
      stance,
      projected,
      projectedVsPar,
      fieldAvgStrokes: h.fieldAvgStrokes,
      yourAvgHere,
      yourRoundsHere: own?.rounds ?? 0,
      yourAvgShown: yourAvgHere ?? oneRound ?? projected,
      yourAvgEstimated: yourAvgHere == null,
      vsField,
      hazards: h.hazards,
      note: notes[0] ?? "",
    };
  });

  /* ---- strengths and leaks on this course ------------------------------ */
  /* Rank on the player's own scoring here when we have it; otherwise compare
     their projected score against what the field averages on the hole. */
  const scored = holePlan.filter((h) => h.projected != null);
  /** Strokes gained (negative) or lost (positive) against the field on a hole. */
  const edgeOf = (h: HolePlanRow): number | null =>
    h.vsField != null
      ? h.vsField
      : h.projected != null && h.fieldAvgStrokes != null
        ? round1(h.projected - h.fieldAvgStrokes)
        : null;
  const callout = (h: HolePlanRow, detail: string): HoleCallout => ({
    number: h.number,
    par: h.par,
    distanceFt: h.distanceFt,
    yourAvg: h.yourAvgHere,
    fieldAvg: h.fieldAvgStrokes,
    vsField: edgeOf(h),
    detail,
  });

  const rankable = scored.filter((h) => edgeOf(h) != null);
  const byField = rankable.slice().sort((a, b) => (edgeOf(a) as number) - (edgeOf(b) as number));
  /* Only rank on par buckets when the player has real scores on these holes —
     otherwise every par 3 reads the same and the callouts say nothing. */
  const byPar = scored
    .filter((h) => h.projectedVsPar != null && h.yourAvgHere != null)
    .slice()
    .sort((a, b) => (a.projectedVsPar as number) - (b.projectedVsPar as number));

  /** How the row describes itself: own history when available, else the field. */
  const detailFor = (h: HolePlanRow, worse: boolean): string => {
    const edge = edgeOf(h);
    const gap = edge != null ? round1(Math.abs(edge)) : null;
    if (h.yourAvgHere != null && h.fieldAvgStrokes != null && gap != null)
      return `You average ${h.yourAvgHere} here vs the field's ${h.fieldAvgStrokes.toFixed(2)} — ${gap} ${worse ? "worse" : "better"} over ${h.yourRoundsHere} rounds.${worse && h.distanceFt ? ` ${h.distanceFt.toLocaleString()} ft.` : ""}`;
    if (h.yourAvgHere != null)
      return `You average ${h.yourAvgHere} on a par ${h.par ?? "?"} — ${fmtToPar(h.projectedVsPar as number)} across ${h.yourRoundsHere} rounds.${worse && h.distanceFt ? ` ${h.distanceFt.toLocaleString()} ft.` : ""}`;
    if (h.fieldAvgStrokes != null && gap != null)
      return `Your game projects ${h.projected} here while the field averages ${h.fieldAvgStrokes.toFixed(2)} — ${gap} ${worse ? "behind" : "ahead"}.${worse && h.distanceFt ? ` ${h.distanceFt.toLocaleString()} ft.` : ""}`;
    return `Projects ${h.projected} on a par ${h.par ?? "?"} (${fmtToPar(h.projectedVsPar as number)}).${worse && h.distanceFt ? ` ${h.distanceFt.toLocaleString()} ft.` : ""}`;
  };

  const strengths: HoleCallout[] = (byField.length ? byField : byPar)
    .filter((h) => {
      const edge = edgeOf(h);
      return edge != null ? edge <= -0.15 : (h.projectedVsPar as number) <= -0.3;
    })
    .slice(0, 4)
    .map((h) => callout(h, detailFor(h, false)));

  const weaknesses: HoleCallout[] = (byField.length ? byField.slice().reverse() : byPar.slice().reverse())
    .filter((h) => {
      const edge = edgeOf(h);
      return edge != null ? edge >= 0.15 : (h.projectedVsPar as number) >= 0.25;
    })
    .slice(0, 4)
    .map((h) => callout(h, detailFor(h, true)));

  /* ---- projected score ------------------------------------------------- */
  const projectedFromHoles = holePlan.every((h) => h.projected != null) && holePlan.length > 0
    ? holePlan.reduce((s, h) => s + (h.projected as number), 0)
    : null;

  const parTotal =
    input.parTotal ??
    (holes.length && holes.every((h) => h.par != null)
      ? holes.reduce((s, h) => s + (h.par as number), 0)
      : null);
  const holeCount = input.holeCount ?? (holes.length || null);

  const projectedFromPar =
    parTotal != null && input.playerProfile.overallVsPar != null && holeCount
      ? parTotal + input.playerProfile.overallVsPar * holeCount
      : null;

  let projectedScore: number | null = null;
  if (input.courseHistory.rounds >= 3 && input.courseHistory.avgScore != null) {
    // Real history here wins, nudged by their all-course form.
    const modelled = projectedFromHoles ?? projectedFromPar;
    projectedScore =
      modelled != null
        ? round1(input.courseHistory.avgScore * 0.65 + modelled * 0.35)
        : round1(input.courseHistory.avgScore);
    sources.push(`${input.courseHistory.rounds} of your rounds at this course`);
  } else if (projectedFromHoles != null) {
    projectedScore = round1(projectedFromHoles);
    sources.push(`hole detail for all ${holes.length} holes + your par-by-par scoring`);
  } else if (projectedFromPar != null) {
    projectedScore = round1(projectedFromPar);
    sources.push("course par + your scoring average per hole");
  }
  if (input.playerProfile.holes > 0)
    sources.push(`${input.playerProfile.holes.toLocaleString()} scored holes in your history`);

  const spread = input.scoreSpread != null && input.scoreSpread > 0 ? input.scoreSpread : 2.5;
  const projectedRange =
    projectedScore != null
      ? { low: Math.round(projectedScore - spread), high: Math.round(projectedScore + spread) }
      : null;

  /* ---- rating math ----------------------------------------------------- */
  // Guard against a "scratch rating" (a 900-something rating value) being
  // stored where a scratch scoring average in strokes belongs — otherwise the
  // required score comes out as nonsense like 957 on a par 54 course.
  const ssa = plausibleSsa(input.ssa, parTotal, holeCount) ? input.ssa : null;
  if (ssa != null) sources.push(`scratch average ${round1(ssa)} (${input.ssaSource})`);
  const scoreForRating = (rating: number): number | null =>
    ssa != null ? round1(ssa - (rating - 1000) / strokeValue) : null;
  const requiredScore = scoreForRating(input.targetRating);
  const ratingLadder: RatingStep[] =
    ssa == null
      ? []
      : Array.from(
          new Set([
            input.targetRating - 50,
            input.targetRating - 25,
            input.targetRating,
            input.targetRating + 25,
            input.targetRating + 50,
          ]),
        )
          .filter((r) => r >= 500 && r <= 1100)
          .sort((a, b) => a - b)
          .map((rating) => {
            const score = Math.round(scoreForRating(rating) as number);
            return {
              rating,
              score,
              toPar: parTotal != null ? round1(score - parTotal) : null,
              isTarget: rating === input.targetRating,
            };
          });
  const projectedRating =
    ssa != null && projectedScore != null
      ? Math.round(1000 - (projectedScore - ssa) * strokeValue)
      : null;
  const gap =
    requiredScore != null && projectedScore != null ? round1(projectedScore - requiredScore) : null;

  let verdict: FitVerdict = "unknown";
  if (gap != null) verdict = gap <= 0 ? "ready" : gap <= 3 ? "stretch" : "reach";

  const headline =
    projectedScore == null
      ? "Not enough course or scoring data yet to project how you'll play here."
      : verdict === "ready"
        ? `You project around ${projectedScore}${parTotal != null ? ` (${fmtToPar(projectedScore - parTotal)})` : ""} — that already clears your ${input.targetRating} target.`
        : verdict === "stretch"
          ? `You project around ${projectedScore}; you need ${requiredScore} for a ${input.targetRating} round — ${gap} stroke${gap === 1 ? "" : "s"} to find.`
          : verdict === "reach"
            ? `You project around ${projectedScore}; a ${input.targetRating} round here takes ${requiredScore}, so this is a reach without prep.`
            : `You project around ${projectedScore}${parTotal != null ? ` (${fmtToPar(projectedScore - parTotal)})` : ""}. No scratch average on file, so we can't turn that into a rating yet.`;

  /* ---- fit factors ----------------------------------------------------- */
  const factors: FitFactor[] = [];
  if (input.distanceTotal && input.typicalCourseDistanceFt) {
    const diff = input.distanceTotal - input.typicalCourseDistanceFt;
    const pct = Math.round((100 * diff) / input.typicalCourseDistanceFt);
    factors.push({
      id: "length",
      label: "Course length",
      detail:
        Math.abs(pct) < 8
          ? `${input.distanceTotal.toLocaleString()} ft — right in line with the courses you usually play.`
          : `${input.distanceTotal.toLocaleString()} ft, ${Math.abs(pct)}% ${diff > 0 ? "longer" : "shorter"} than your usual courses.`,
      lean: Math.abs(pct) < 8 ? "neutral" : diff > 0 ? "tough" : "good",
    });
  }

  const parCounts = new Map<number, number>();
  for (const h of holes) if (h.par) parCounts.set(h.par, (parCounts.get(h.par) ?? 0) + 1);
  for (const [par, count] of Array.from(parCounts).sort((a, b) => b[1] - a[1]).slice(0, 3)) {
    const mine = input.playerProfile.byPar[par];
    if (!mine || mine.holes < 8) continue;
    const elite = ELITE_VS_PAR[par] ?? -0.4;
    const delta = round1(mine.avgVsPar - elite);
    factors.push({
      id: `par-${par}`,
      label: `${count} par ${par}${count === 1 ? "" : "s"}`,
      detail: `You average ${fmtToPar(mine.avgVsPar)} on par ${par}s across ${mine.holes} holes — ${delta <= 0.15 ? "a strength here" : `${delta} over the elite benchmark`}.`,
      lean: delta <= 0.15 ? "good" : delta >= 0.45 ? "tough" : "neutral",
    });
  }

  const hazardHoles = holePlan.filter((h) => h.hazards.length > 0).length;
  if (hazardHoles > 0) {
    factors.push({
      id: "hazards",
      label: `${hazardHoles} hole${hazardHoles === 1 ? "" : "s"} with hazards`,
      detail: "Water, OB, or mando in play — the cheapest strokes here are the ones you don't gamble away.",
      lean: hazardHoles >= 4 ? "tough" : "neutral",
    });
  }

  if (input.courseHistory.rounds === 0) {
    factors.push({
      id: "familiarity",
      label: "First time here",
      detail: "No rounds logged at this course, so the projection leans on your scoring everywhere else.",
      lean: "tough",
    });
  } else {
    factors.push({
      id: "familiarity",
      label: `${input.courseHistory.rounds} round${input.courseHistory.rounds === 1 ? "" : "s"} played here`,
      detail: `Best ${input.courseHistory.bestScore ?? "—"}${input.courseHistory.avgRating != null ? `, average round rating ${Math.round(input.courseHistory.avgRating)}` : ""}${input.courseHistory.lastPlayedOn ? `, last played ${input.courseHistory.lastPlayedOn}` : ""}.`,
      lean: "good",
    });
  }

  /* ---- what to work on ------------------------------------------------- */
  const focus: Array<{ id: string; title: string; detail: string }> = [];
  const parWeights = Array.from(parCounts)
    .map(([par, count]) => {
      const mine = input.playerProfile.byPar[par];
      const elite = ELITE_VS_PAR[par] ?? -0.4;
      const lost = mine && mine.holes >= 8 ? mine.avgVsPar - elite : null;
      return { par, count, lost, holes: mine?.holes ?? 0 };
    })
    .filter((r) => r.lost != null && (r.lost as number) > 0.1)
    .sort((a, b) => (b.lost as number) * b.count - (a.lost as number) * a.count);

  for (const w of parWeights.slice(0, 2)) {
    const strokes = round1((w.lost as number) * w.count);
    focus.push({
      id: `focus-par-${w.par}`,
      title: `Par ${w.par}s — about ${strokes} stroke${strokes === 1 ? "" : "s"} on the table`,
      detail:
        w.par === 3
          ? "Drill 250–330 ft repeatable lines and inside-circle putting; these holes decide your round."
          : w.par === 4
            ? "Rehearse the tee → 120 ft upshot sequence so you take a Circle 2 look instead of a gamble."
            : "Plan each par 5 as three committed shots — the rushed second shot is where the stroke goes.",
    });
  }
  if (hazardHoles > 0)
    focus.push({
      id: "focus-hazards",
      title: `Chart the ${hazardHoles} hazard hole${hazardHoles === 1 ? "" : "s"}`,
      detail: "Pick your bail-out line and a safe disc for each one before you tee off.",
    });
  if (input.courseHistory.rounds === 0)
    focus.push({
      id: "focus-practice-round",
      title: "Get one practice round in",
      detail: "A single lap here replaces guesswork with real numbers in this plan.",
    });
  if (gap != null && gap > 0)
    focus.push({
      id: "focus-gap",
      title: `Find ${gap} stroke${gap === 1 ? "" : "s"}`,
      detail: `That's the difference between your projection and the ${requiredScore} you need for a ${input.targetRating} round.`,
    });

  // Practice notes tied to the exact holes leaking strokes here.
  if (weaknesses.length) {
    const holesList = weaknesses.map((w) => `#${w.number}`).join(", ");
    const lost = round1(
      weaknesses.reduce((s, w) => s + Math.max(0, w.vsField ?? 0), 0),
    );
    focus.unshift({
      id: "focus-weak-holes",
      title: `Practice holes ${holesList}${lost > 0 ? ` — about ${lost} strokes back` : ""}`,
      detail: weaknesses
        .slice(0, 2)
        .map((w) =>
          w.distanceFt
            ? `#${w.number} is ${w.distanceFt.toLocaleString()} ft — rehearse that exact shot and your bail-out.`
            : `#${w.number} — walk it and pick one committed line.`,
        )
        .join(" "),
    });
  }

  return {
    ratingLadder,
    strengths,
    weaknesses,
    holeCount,
    parTotal,
    distanceTotal: input.distanceTotal,
    projectedScore,
    projectedToPar: projectedScore != null && parTotal != null ? round1(projectedScore - parTotal) : null,
    projectedRange,
    projectedRating,
    ssa: ssa != null ? round1(ssa) : null,
    strokeValue: round1(strokeValue),
    requiredScore,
    requiredToPar: requiredScore != null && parTotal != null ? round1(requiredScore - parTotal) : null,
    gap,
    verdict,
    headline,
    holePlan,
    factors,
    focus: focus.slice(0, 4),
    sources,
  };
}

export function fmtToPar(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (r === 0) return "even";
  return r > 0 ? `+${r}` : `${r}`;
}
