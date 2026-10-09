/**
 * Pure round-progress math shared by the scorecard: running totals, the first
 * hole still missing a score, projected finish, and keyboard key meaning.
 * Kept free of React and Supabase so it can be unit tested directly.
 */

export type ProgressHole = { number: number; par: number };
export type ProgressScore = { round_player_id: string; hole_number: number; strokes: number };

export type RunningTotals = {
  /** Holes with a saved score. */
  thru: number;
  /** Strokes taken on those holes. */
  strokes: number;
  /** Par for the holes played. */
  parThru: number;
  /** Strokes relative to par for the holes played. */
  toPar: number;
};

export function playerRunningTotals(
  holes: ProgressHole[],
  scores: ProgressScore[],
  playerId: string | null | undefined,
): RunningTotals {
  const empty: RunningTotals = { thru: 0, strokes: 0, parThru: 0, toPar: 0 };
  if (!playerId) return empty;
  const parByHole = new Map(holes.map((h) => [h.number, h.par]));
  const seen = new Set<number>();
  let thru = 0;
  let strokes = 0;
  let parThru = 0;
  for (const s of scores) {
    if (s.round_player_id !== playerId) continue;
    // A hole can appear twice if a card-mate re-saved it; count it once.
    if (seen.has(s.hole_number)) continue;
    if (!parByHole.has(s.hole_number)) continue;
    seen.add(s.hole_number);
    thru += 1;
    strokes += s.strokes;
    parThru += parByHole.get(s.hole_number) ?? 3;
  }
  return { thru, strokes, parThru, toPar: strokes - parThru };
}

/** The lowest-numbered hole this player has not scored yet, in card order. */
export function firstUnscoredHole(
  holes: ProgressHole[],
  scores: ProgressScore[],
  playerId: string | null | undefined,
): number | null {
  if (!playerId) return null;
  const scored = new Set(
    scores.filter((s) => s.round_player_id === playerId).map((s) => s.hole_number),
  );
  for (const h of holes) if (!scored.has(h.number)) return h.number;
  return null;
}

/**
 * Projects a finishing score by holding the player's current pace over the
 * holes still to play. Returns null until there is a hole in the books.
 */
export function paceProjection(
  totals: RunningTotals,
  totalHoles: number,
): { remaining: number; projectedToPar: number } | null {
  const remaining = Math.max(0, totalHoles - totals.thru);
  if (totals.thru === 0) return null;
  const perHole = totals.toPar / totals.thru;
  return { remaining, projectedToPar: Math.round(totals.toPar + perHole * remaining) };
}

/** Formats a to-par number the way a scorecard reads it. */
export { formatToPar } from "@/lib/score-display";

export type ScoringKeyAction =
  | { type: "set"; strokes: number }
  | { type: "bump"; delta: -1 | 1 }
  | { type: "nav"; delta: -1 | 1 }
  | { type: "confirm" }
  | { type: "jumpUnscored" };

/**
 * Maps a physical keypress to a scoring action. Digits set the score outright
 * (0 means 10), +/- nudge it, arrows change hole, Enter confirms, and "u"
 * jumps to the first hole still missing a score.
 */
export function resolveScoringKey(key: string): ScoringKeyAction | null {
  if (/^[0-9]$/.test(key)) return { type: "set", strokes: key === "0" ? 10 : Number(key) };
  switch (key) {
    case "+":
    case "=":
    case "ArrowUp":
      return { type: "bump", delta: 1 };
    case "-":
    case "_":
    case "ArrowDown":
      return { type: "bump", delta: -1 };
    case "ArrowLeft":
      return { type: "nav", delta: -1 };
    case "ArrowRight":
      return { type: "nav", delta: 1 };
    case "Enter":
      return { type: "confirm" };
    case "u":
    case "U":
      return { type: "jumpUnscored" };
    default:
      return null;
  }
}

/** True when a keypress belongs to whatever the user is typing in, not the card. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
}
