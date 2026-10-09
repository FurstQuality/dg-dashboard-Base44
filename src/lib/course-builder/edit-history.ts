/** Session history: capture edits synchronously, including rapid drags and Undo.
 * Saving changes the persistence baseline, never clears the user's history. */
export type EditHistory = {past: string[]; future: string[]; last: string | null};
export function recordEdit(history: EditHistory, snapshot: string): boolean {
  if (history.last === snapshot) return false;
  if (history.last !== null) history.past.push(history.last);
  history.last = snapshot;
  history.future = [];
  return true;
}
export function undoEdit(history: EditHistory): string | null {
  if (!history.past.length || history.last === null) return null;
  const previous = history.past.pop()!;
  history.future.push(history.last);
  history.last = previous;
  return previous;
}
export function redoEdit(history: EditHistory): string | null {
  if (!history.future.length || history.last === null) return null;
  const next = history.future.pop()!;
  history.past.push(history.last);
  history.last = next;
  return next;
}
/** Database ID assignment is bookkeeping, not another undoable edit. */
export function rebaseEditHistory(history: EditHistory, transform: (snapshot: string) => string): void {
  history.past = history.past.map(transform);
  history.future = history.future.map(transform);
  if (history.last !== null) history.last = transform(history.last);
}
