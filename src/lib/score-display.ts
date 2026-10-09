/**
 * One scoring language everywhere (Global Scoring Display Standard).
 * Relative-to-par first, then raw score, exact layout par, and DGD rating.
 * Par must be the par of the layout/version actually played — callers pass it;
 * this module never guesses or treats missing par as zero.
 */

/** Score minus exact layout par, or null when either is unknown. */
export function relativeToPar(score: number | null | undefined, par: number | null | undefined): number | null {
  if (score == null || par == null || !Number.isFinite(score) || !Number.isFinite(par) || par <= 0) return null;
  return score - par;
}

/** "-6", "E", "+5"; "—" when unknown. Averages keep one decimal. */
export function formatToPar(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const r = Math.round(value * 10) / 10;
  if (r === 0) return "E";
  return r > 0 ? `+${r}` : `${r}`;
}

export type RatingSource = "DGD" | "DGD_PROJECTED" | "PDGA" | "UDISC";
export const RATING_LABEL: Record<RatingSource, string> = {
  DGD: "DGD Round Rating",
  DGD_PROJECTED: "Projected DGD Round Rating",
  PDGA: "Official PDGA Round Rating",
  UDISC: "Native UDisc Round Rating",
};
const SHORT: Record<RatingSource, string> = {
  DGD: "DGD",
  DGD_PROJECTED: "Projected DGD",
  PDGA: "PDGA",
  UDISC: "UDisc",
};

/** "58 (+4) · Par 54 · DGD 917" — or "58 · Par unknown" when par is missing. */
export function compactScoreLine(input: {
  score: number | null | undefined;
  par: number | null | undefined;
  rating?: number | null;
  ratingSource?: RatingSource;
}): string {
  if (input.score == null) return "—";
  const rel = relativeToPar(input.score, input.par);
  const parts = [rel == null ? `${input.score}` : `${input.score} (${formatToPar(rel)})`];
  parts.push(rel == null ? "Par unknown" : `Par ${input.par}`);
  if (input.rating != null) parts.push(`${SHORT[input.ratingSource ?? "DGD"]} ${Math.round(input.rating)}`);
  return parts.join(" · ");
}

/**
 * Projected DGD Round Rating from a projected finish on THIS layout. Uses the
 * layout's own scratch rating and stroke value — never a universal
 * points-per-stroke — and returns null when the layout has no calibration.
 */
export function projectedRoundRating(input: {
  projectedToPar: number | null;
  scratchRating: number | null | undefined;
  strokeValue: number | null | undefined;
}): number | null {
  const { projectedToPar, scratchRating, strokeValue } = input;
  if (projectedToPar == null || scratchRating == null || strokeValue == null || strokeValue <= 0) return null;
  return Math.round(scratchRating - projectedToPar * strokeValue);
}
