/**
 * Pure helpers for the Round Companion scorecard grid.
 * Kept out of the component so the OUT / IN subtotal math is unit-tested.
 */

export type SegmentHole = { number: number; par: number };

/** Nine-hole segments only make sense on cards longer than a single nine. */
export function segmentSize(holeCount: number): number {
  return holeCount > 9 ? 9 : 0;
}

/** True when a subtotal column belongs immediately after this hole index. */
export function isSegmentBoundary(index: number, holeCount: number): boolean {
  const size = segmentSize(holeCount);
  if (!size) return false;
  return (index + 1) % size === 0 && index + 1 < holeCount;
}

/** Familiar label for the nine ending at `index` (0-based). */
export function segmentLabel(index: number): string {
  if (index === 8) return "Out";
  if (index === 17) return "In";
  return "Seg";
}

/**
 * Strokes played across the nine holes ending at `endIndex`.
 * Returns null when no hole in that nine has a score yet.
 */
export function segmentTotal(
  holes: SegmentHole[],
  scores: Map<string, number>,
  playerId: string,
  endIndex: number,
): number | null {
  const start = Math.max(0, endIndex - 8);
  let total = 0;
  let played = 0;
  for (let i = start; i <= endIndex; i += 1) {
    const hole = holes[i];
    if (!hole) continue;
    const value = scores.get(`${playerId}:${hole.number}`);
    if (value == null) continue;
    total += value;
    played += 1;
  }
  return played ? total : null;
}
