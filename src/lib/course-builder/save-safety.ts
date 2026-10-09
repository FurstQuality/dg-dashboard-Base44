/** Fail closed when an incomplete or stale editor would replace saved holes. */
export function assertCompleteHoleSave(
  saved: readonly {id: string; number: number}[],
  draft: readonly {id: string | null; number: number}[],
  removed: ReadonlySet<string>,
): void {
  const ids = new Set(draft.map(h => h.id));
  if (draft.some(h => !h.id) || ids.size !== draft.length) throw new Error("Every hole must have a unique saved identity before saving.");
  if (new Set(draft.map(h => h.number)).size !== draft.length || draft.some(h => !Number.isInteger(h.number) || h.number < 1)) {
    throw new Error("Hole numbers must be positive and unique. Saving is paused to protect the course.");
  }
  if (saved.some(h => !ids.has(h.id) && !removed.has(h.id))) {
    throw new Error("Saved holes are missing from this draft. Saving is paused to protect the course. Export your draft before reloading.");
  }
  if (saved.some(h => h.number < 1 && !removed.has(h.id))) throw new Error("This layout needs recovery from an interrupted save before it can be edited.");
}

/** A missing pin may only be deleted if this editor actually loaded/saved it. */
export function removedSavedPins(previous: ReadonlySet<string>, current: ReadonlySet<string>): string[] {
  return [...previous].filter(id => !current.has(id));
}

/** Missing state is not authorization to delete a previously loaded pin. */
export function assertExplicitPinRemoval(previous:ReadonlySet<string>,current:ReadonlySet<string>,removed:ReadonlySet<string>):void {
  if([...previous].some(id=>!current.has(id)&&!removed.has(id)))throw new Error("Saved tee pads or baskets are missing without an explicit removal. Saving is paused to protect your course; reload or recover the complete draft.");
}
