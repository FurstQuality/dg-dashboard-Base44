/**
 * DGD Rated Round rules.
 *
 * DGD ratings mirror the PDGA sanctioned round system. A round only counts
 * toward a player's DGD rating when the card meets the sanctioning bar below.
 * Casual rounds still record scores and stats, but never touch DGD rating.
 */

// Minimum number of scorers required on a card of a given size for a round
// to be considered validly sanctioned. Follows the spec: 2→2, 3→2, 4→3, 5→3,
// 6→4, 7→5, 8→5, 9→6, 10→6 (roughly ≥60% of the card must be scoring).
export const MIN_SCORERS_BY_CARD_SIZE: Record<number, number> = {
  1: 1, // solo — never rated (see requiresPartner)
  2: 2,
  3: 2,
  4: 3,
  5: 3,
  6: 4,
  7: 5,
  8: 5,
  9: 6,
  10: 6,
};

/** Number of players who must be actively keeping score for a rated round. */
export function requiredScorerCount(cardSize: number): number {
  if (cardSize <= 1) return 1;
  const capped = Math.min(cardSize, 10);
  return MIN_SCORERS_BY_CARD_SIZE[capped] ?? Math.ceil(cardSize * 0.6);
}

/** True when the number of scorers meets the DGD sanctioning threshold. */
export function meetsSanctionedThreshold(cardSize: number, scorerCount: number): boolean {
  if (cardSize < 2) return false; // solo rounds never rate
  return scorerCount >= requiredScorerCount(cardSize);
}

/** Rated rounds require at least one other rated scorer on card besides you. */
export function requiresPartner(cardSize: number): boolean {
  return cardSize < 2;
}

/**
 * If 2+ players have scored hole 1 on a rated round, the round is "committed".
 * Quitting after this point earns an abandonment penalty on the player's
 * rating history. Prevents rage-quitting a bad round to protect a rating.
 */
export function isRoundCommitted(hole1ScorerCount: number): boolean {
  return hole1ScorerCount >= 2;
}

export const RATED_ROUND_RULES: { title: string; body: string }[] = [
  {
    title: "DGD Rated rounds follow PDGA sanctioned rules",
    body: "A DGD Rated round is scored exactly like a PDGA sanctioned singles round. Rated rounds feed your DGD rating alongside PDGA and UDisc results. Casual rounds record scores and stats but never affect your DGD rating.",
  },
  {
    title: "You must have a scoring partner",
    body: "Rated rounds require at least one other rated player on card who is also keeping score. Solo rounds and rounds with only guests are always casual.",
  },
  {
    title: "Enough of the card must be keeping score",
    body: "2-player card: both must score. 3–4: at least 3. 5–6: at least 4. 7–8: at least 5. 9–10: at least 6. If this drops mid-round, the round is completed as Casual.",
  },
  {
    title: "Score every hole and confirm each other",
    body: "As each hole is scored, cardmates review and confirm each other's strokes. A hole with two different scores shows a red Score Conflict banner until it's resolved.",
  },
  {
    title: "Finishing is mandatory once the round is committed",
    body: "Once at least two players have scored hole 1, quitting the round applies an abandonment penalty to every rated scorer. This keeps ratings honest — no bailing on a bad round.",
  },
  {
    title: "Confirm and submit at the end",
    body: "Every player on card confirms and signs off on their scores before submission. Submitted scores go straight into your DGD rating and the Statboard.",
  },
];
