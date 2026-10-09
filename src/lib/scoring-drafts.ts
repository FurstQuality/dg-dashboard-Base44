import { scoreKey } from "./score-sync";
import type { ProgressScore } from "./scoring-progress";

/** Refresh saved values while retaining strokes the player is actively editing. */
export function reconcileScoringDrafts(
  previous: Record<string, number>, dirty: ReadonlySet<string>,
  scores: ProgressScore[], playerIds: string[], hole: number, par: number,
): Record<string, number> {
  const next = { ...previous };
  const saved = new Map(scores.map(row => [scoreKey(row), row.strokes]));
  for (const key of Object.keys(next)) if (!dirty.has(key)) {
    if (saved.has(key)) next[key] = saved.get(key)!;
    else delete next[key];
  }
  for (const id of playerIds) {
    const key = `${id}:${hole}`;
    if (!dirty.has(key)) next[key] = saved.get(key) ?? par;
  }
  return next;
}
