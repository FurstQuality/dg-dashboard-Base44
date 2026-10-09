/**
 * Rating-based handicap engine.
 *
 * Goal: a handicap that is fair (a stronger player still has to play well to
 * win), honest (every stroke traces back to published PDGA-style numbers, not
 * a director's gut feel) and open (a newer player has a real chance on any
 * given night).
 *
 * How it works
 *   1. Take each player's rating — their PDGA rating when we have one, or the
 *      DGD rating estimated from their rated rounds.
 *   2. Convert the gap between the player's rating and the night's target
 *      rating into throws using the course's rating points per throw. On a
 *      typical SSA-54 layout one throw is worth about 10 rating points, so a
 *      100-point gap is about 10 throws.
 *   3. Apply an allowance (default 80%). Giving 100% of the gap hands the
 *      night to whoever is furthest below their rating; 80% keeps the field
 *      close while still rewarding the player who beats their own rating.
 *   4. Cap the strokes so one player cannot be spotted an unwinnable lead, and
 *      mark players with too few rated rounds as provisional so the field can
 *      see the number is still settling.
 *
 * Points per throw comes from the PDGA's published relationship between
 * scoring spread and course difficulty: easier (lower SSA) courses compress
 * scores, so each throw is worth more rating points.
 */

export type HandicapBasis = "pdga_rating" | "dgd_rating" | "rolling_average";

export type HandicapTarget = "field_best" | "field_average" | "fixed";

export interface HandicapConfig {
  /** Which number the handicap is calculated from. */
  basis: HandicapBasis;
  /** What the field is levelled up to. */
  target: HandicapTarget;
  /** Used when target is "fixed". */
  target_rating: number;
  /** Percent of the rating gap awarded as strokes. 100 = full gap. */
  allowance_pct: number;
  /** Most strokes any player can receive. */
  max_strokes: number;
  /** Rated rounds needed before a handicap is final rather than provisional. */
  min_rounds: number;
  /** Show gross and net side by side on standings and scorecards. */
  publish_gross: boolean;
}

export const DEFAULT_HANDICAP_CONFIG: HandicapConfig = {
  basis: "pdga_rating",
  target: "field_best",
  target_rating: 1000,
  allowance_pct: 80,
  max_strokes: 12,
  min_rounds: 3,
  publish_gross: true,
};

export const HANDICAP_BASIS_OPTIONS: { value: HandicapBasis; label: string; blurb: string }[] = [
  {
    value: "pdga_rating",
    label: "PDGA rating",
    blurb: "Official rating when the player has one, DGD rating until then.",
  },
  {
    value: "dgd_rating",
    label: "DGD rating",
    blurb: "Every rated round played in the app, PDGA-style maths.",
  },
  {
    value: "rolling_average",
    label: "Rolling average",
    blurb: "Average of recent rounds on this layout. Best for new players.",
  },
];

export const HANDICAP_TARGET_OPTIONS: { value: HandicapTarget; label: string; blurb: string }[] = [
  {
    value: "field_best",
    label: "Up to the top player",
    blurb: "Nobody gives strokes away — the best rating plays scratch.",
  },
  {
    value: "field_average",
    label: "Up to the field average",
    blurb: "Players above average give strokes back, players below receive them.",
  },
  {
    value: "fixed",
    label: "Fixed rating",
    blurb: "Level everyone to one number, e.g. 1000, season long.",
  },
];

/**
 * Rating points per throw for a layout, from the PDGA scoring-spread curve.
 * Falls back to 10 points per throw (a typical 18-hole SSA-54 layout).
 */
export function pointsPerThrow(ssa: number | null | undefined): number {
  if (typeof ssa !== "number" || !Number.isFinite(ssa) || ssa <= 0) return 10;
  if (ssa <= 30) return 14.5;
  if (ssa <= 40) return 12.5;
  if (ssa <= 47) return 11.2;
  if (ssa <= 54) return 10;
  if (ssa <= 62) return 8.9;
  if (ssa <= 70) return 8.2;
  return 7.6;
}

export interface HandicapPlayer {
  user_id: string;
  name: string;
  /** Official PDGA rating, when known. */
  pdga_rating?: number | null;
  /** In-app rating estimated from rated rounds. */
  dgd_rating?: number | null;
  /** Scoring average on the layout, in throws relative to par. */
  rolling_average?: number | null;
  /** Rated rounds behind the number above. */
  rated_rounds?: number | null;
}

export interface HandicapRow {
  user_id: string;
  name: string;
  /** Rating used for the calculation, null when the player has no history. */
  rating: number | null;
  /** Where that rating came from. */
  source: "pdga" | "dgd" | "average" | "none";
  /** Strokes the player receives this round (never negative). */
  strokes: number;
  /** True when the number is still settling (too few rated rounds). */
  provisional: boolean;
  /** True when max_strokes clipped the calculated value. */
  capped: boolean;
  note: string;
}

export interface HandicapTable {
  rows: HandicapRow[];
  /** Rating the field was levelled up to. */
  targetRating: number | null;
  pointsPerThrow: number;
  /** Players with no rated history, handed the field's provisional handicap. */
  unratedCount: number;
}

function ratingFor(
  p: HandicapPlayer,
  basis: HandicapBasis,
  ssa: number | null | undefined,
): { rating: number | null; source: HandicapRow["source"] } {
  const pdga = typeof p.pdga_rating === "number" ? p.pdga_rating : null;
  const dgd = typeof p.dgd_rating === "number" ? p.dgd_rating : null;
  const avg = typeof p.rolling_average === "number" ? p.rolling_average : null;

  if (basis === "rolling_average" && avg != null) {
    // Turn "throws over par" into a rating-like number so one scale drives everything.
    return { rating: Math.round(1000 - avg * pointsPerThrow(ssa)), source: "average" };
  }
  if (basis === "dgd_rating") {
    if (dgd != null) return { rating: dgd, source: "dgd" };
    if (pdga != null) return { rating: pdga, source: "pdga" };
  } else {
    if (pdga != null) return { rating: pdga, source: "pdga" };
    if (dgd != null) return { rating: dgd, source: "dgd" };
  }
  if (avg != null) return { rating: Math.round(1000 - avg * pointsPerThrow(ssa)), source: "average" };
  return { rating: null, source: "none" };
}

/** Strokes awarded for one rating gap, before the cap. */
export function strokesForGap(gap: number, ppt: number, allowancePct: number): number {
  if (gap <= 0) return 0;
  return Math.round((gap / ppt) * (allowancePct / 100));
}

export function buildHandicapTable(
  players: HandicapPlayer[],
  config: HandicapConfig,
  ssa?: number | null,
): HandicapTable {
  const ppt = pointsPerThrow(ssa);
  const resolved = players.map((p) => ({ p, ...ratingFor(p, config.basis, ssa) }));
  const rated = resolved.filter((r) => r.rating != null).map((r) => r.rating as number);

  let targetRating: number | null = null;
  if (config.target === "fixed") targetRating = config.target_rating;
  else if (rated.length > 0) {
    targetRating =
      config.target === "field_best"
        ? Math.max(...rated)
        : Math.round(rated.reduce((a, b) => a + b, 0) / rated.length);
  }

  const fieldAverage =
    rated.length > 0 ? Math.round(rated.reduce((a, b) => a + b, 0) / rated.length) : null;

  const rows: HandicapRow[] = resolved.map(({ p, rating, source }) => {
    const rounds = typeof p.rated_rounds === "number" ? p.rated_rounds : 0;
    // No history: treat the player as the field average so they are neither
    // punished nor handed a windfall, and flag it as provisional.
    const effective = rating ?? fieldAverage;
    const provisional = rating == null || rounds < config.min_rounds;

    if (effective == null || targetRating == null) {
      return {
        user_id: p.user_id,
        name: p.name,
        rating,
        source,
        strokes: 0,
        provisional: true,
        capped: false,
        note: "No rated rounds yet — plays scratch until a rating settles.",
      };
    }

    const raw = strokesForGap(targetRating - effective, ppt, config.allowance_pct);
    const strokes = Math.min(raw, config.max_strokes);
    const capped = raw > config.max_strokes;

    const note =
      rating == null
        ? `Provisional — using the field average of ${effective}.`
        : provisional
          ? `Provisional — ${rounds} of ${config.min_rounds} rated rounds counted.`
          : capped
            ? `Calculated ${raw} strokes, capped at ${config.max_strokes}.`
            : strokes === 0
              ? "Plays scratch."
              : `${targetRating - effective} rating points at ${ppt} per throw.`;

    return { user_id: p.user_id, name: p.name, rating, source, strokes, provisional, capped, note };
  });

  return {
    rows,
    targetRating,
    pointsPerThrow: ppt,
    unratedCount: resolved.filter((r) => r.rating == null).length,
  };
}

export function netScore(gross: number, strokes: number): number {
  return gross - strokes;
}

/** One-line summary for the wizard, standings header and scorecard note. */
export function summarizeHandicap(config: HandicapConfig): string {
  const basis =
    HANDICAP_BASIS_OPTIONS.find((o) => o.value === config.basis)?.label ?? "Rating";
  const target =
    config.target === "fixed"
      ? `${config.target_rating} rating`
      : config.target === "field_best"
        ? "the top player"
        : "the field average";
  return `${basis} handicap, ${config.allowance_pct}% allowance up to ${target}, capped at ${config.max_strokes} strokes.`;
}

/** Fairness warnings the director should see before publishing. */
export function handicapWarnings(config: HandicapConfig): string[] {
  const out: string[] = [];
  if (config.allowance_pct >= 100)
    out.push(
      "A 100% allowance hands the night to whoever plays furthest above their rating. 80% keeps it competitive.",
    );
  if (config.allowance_pct < 50)
    out.push("Below 50% the handicap barely moves the standings — newer players will rarely contend.");
  if (config.max_strokes > 20)
    out.push("Caps above 20 strokes can decide the round before the first tee shot.");
  if (config.min_rounds < 2)
    out.push("Requiring fewer than 2 rated rounds lets a single outlier round set someone's handicap.");
  if (config.target === "fixed" && (config.target_rating < 700 || config.target_rating > 1100))
    out.push("Fixed targets outside 700–1100 will produce strokes no one can use.");
  return out;
}
