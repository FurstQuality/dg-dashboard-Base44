// Pure math for course-specific rating targets.
// PDGA formula:  rating = 1000 - (score - SSA) * stroke_value
// Inverted:      required_score = SSA + (1000 - target_rating) / stroke_value

export type PastCourseRound = {
  played_on: string;
  round_rating: number;
  score: number | null;
  to_par: number | null;
  ssa?: number | null;
  stroke_value?: number | null;
};

export type CourseModel = {
  ssa: number;
  stroke_value: number;
  n: number; // rows used
  source: "layout" | "fit" | "fallback";
  medianRating: number | null;
  bestRating: number | null;
  hitsAtOrAbove: (target: number) => number;
};

/**
 * Build a scoring model for a course/layout from past rated rounds.
 * Prefers stored SSA/stroke_value when present; otherwise fits both by
 * least-squares. Falls back to sensible defaults when no history exists.
 */
export function buildCourseModel(
  rounds: PastCourseRound[],
  layout?: {
    scratch_rating?: number | null;
    stroke_value?: number | null;
    par_total?: number | null;
  },
): CourseModel {
  const usable = rounds.filter(
    (r) => Number.isFinite(r.round_rating) && r.score != null && Number.isFinite(r.score as number),
  );

  const ratings = usable.map((r) => r.round_rating).sort((a, b) => a - b);
  const median = ratings.length ? ratings[Math.floor(ratings.length / 2)] : null;
  const best = ratings.length ? ratings[ratings.length - 1] : null;
  const hits = (t: number) => usable.filter((r) => r.round_rating >= t).length;

  const hasLayout =
    layout?.scratch_rating != null && layout?.stroke_value != null && layout.stroke_value > 0;
  const layoutModel = (): CourseModel => ({
    ssa: Number(layout!.scratch_rating),
    stroke_value: Number(layout!.stroke_value),
    n: usable.length,
    source: "layout",
    medianRating: median,
    bestRating: best,
    hitsAtOrAbove: hits,
  });

  // 1. What the course actually rated in rated rounds played here wins: three or
  //    more rated rounds describe the course better than any stored number.
  //    Below that, a stored layout rating is the steadier answer.
  const distinctScores = new Set(usable.map((r) => r.score as number));
  const enoughForFit = usable.length >= 3 && distinctScores.size >= 2;
  if (hasLayout && !enoughForFit) return layoutModel();

  // 2. Fit from rated rounds. Need >= 2 distinct scores.
  if (usable.length >= 2 && distinctScores.size >= 2) {
    // rating = 1000 - (score - SSA) * SV
    //        = (1000 + SSA * SV) - SV * score
    // Linear regression: rating = a + b * score, where b = -SV, a = 1000 + SSA * SV
    const n = usable.length;
    const meanX = usable.reduce((s, r) => s + (r.score as number), 0) / n;
    const meanY = usable.reduce((s, r) => s + r.round_rating, 0) / n;
    let num = 0;
    let den = 0;
    for (const r of usable) {
      const dx = (r.score as number) - meanX;
      num += dx * (r.round_rating - meanY);
      den += dx * dx;
    }
    const slope = den === 0 ? -10 : num / den;
    const sv = Math.max(4, Math.min(15, -slope));
    const intercept = meanY - slope * meanX;
    const ssa = (intercept - 1000) / sv;
    if (Number.isFinite(ssa) && ssa > 20 && ssa < 120) {
      return {
        ssa: Math.round(ssa * 10) / 10,
        stroke_value: Math.round(sv * 10) / 10,
        n: usable.length,
        source: "fit",
        medianRating: median,
        bestRating: best,
        hitsAtOrAbove: hits,
      };
    }
  }

  // 3. Stored layout rating when the rated rounds here can't produce a fit.
  if (hasLayout) return layoutModel();

  // 4. Fallback: use par as SSA proxy and PDGA-typical stroke value 10.
  const parGuess =
    layout?.par_total ??
    (usable.length ? (usable[0].score as number) - (usable[0].to_par ?? 0) : 54);
  return {
    ssa: Number(parGuess),
    stroke_value: 10,
    n: usable.length,
    source: "fallback",
    medianRating: median,
    bestRating: best,
    hitsAtOrAbove: hits,
  };
}

/** Score needed to earn `targetRating` on a course with this model. */
export function requiredScore(model: CourseModel, targetRating: number): number {
  const raw = model.ssa + (1000 - targetRating) / model.stroke_value;
  return Math.round(raw);
}

/** Rating produced by `score` on this course model. */
export function scoreToRating(model: CourseModel, score: number): number {
  return Math.round(1000 - (score - model.ssa) * model.stroke_value);
}

export type Confidence = "very_likely" | "likely" | "stretch" | "unlikely";

export function courseConfidence(
  model: CourseModel,
  targetRating: number,
): {
  verdict: Confidence;
  message: string;
} {
  if (model.n === 0) {
    return {
      verdict: "stretch",
      message: "No history at this course yet — log a round to sharpen this estimate.",
    };
  }
  const best = model.bestRating ?? 0;
  const median = model.medianRating ?? 0;
  const hits = model.hitsAtOrAbove(targetRating);
  if (targetRating <= median) {
    return {
      verdict: "very_likely",
      message: `You've matched or beaten this rating ${hits} time${hits === 1 ? "" : "s"} here.`,
    };
  }
  if (targetRating <= best - 5) {
    return {
      verdict: "likely",
      message: `Below your best round here (${best}). Achievable with focus.`,
    };
  }
  if (targetRating <= best + 10) {
    return {
      verdict: "stretch",
      message: `Near your ceiling on this course (best ${best}). Tough but possible.`,
    };
  }
  return {
    verdict: "unlikely",
    message: `Above your best round here (${best}) — consider a lower per-round target.`,
  };
}
