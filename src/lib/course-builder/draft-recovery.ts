export type RecoveryHole = {id:string|null;number:number;extra_tees:{tempId:string}[];extra_baskets:{tempId:string}[]};
export type CourseDraft<T extends RecoveryHole> = {holes:T[];at:number;layoutId?:string};
export const layoutDraftKey=(courseId:string,layoutId:string)=>`dgd:course-offline-draft:${courseId}:layout:${layoutId}`;
export const editorLayoutKey=(courseId:string)=>`dgd:course-editor-layout:${courseId}`;
export function draftBelongsToLayout<T extends RecoveryHole>(draft:CourseDraft<T>,layoutId:string,loaded:T[]):boolean {
  if(!Array.isArray(draft?.holes)||!draft.holes.length)return false;
  if(draft.layoutId)return draft.layoutId===layoutId;
  // Legacy drafts lack layoutId: use saved identities, never hole numbers.
  const ids=new Set(loaded.map(h=>h.id));
  return draft.holes.some(h=>h.id&&ids.has(h.id)) && draft.holes.every(h=>!h.id||ids.has(h.id));
}
export function assertSafeDraftRestore<T extends RecoveryHole>(draft:CourseDraft<T>,layoutId:string,loaded:T[]):void {
  if(!draftBelongsToLayout(draft,layoutId,loaded))throw new Error("This recovery draft belongs to a different layout. Open its original layout before restoring it.");
  const byId=new Map(draft.holes.filter(h=>h.id).map(h=>[h.id,h]));
  for(const saved of loaded){
    if(!saved.id)continue;
    const restored=byId.get(saved.id);
    if(!restored)throw new Error("This draft is missing saved holes. The current course has not been replaced.");
    for(const key of ["extra_tees","extra_baskets"] as const){
      if(!Array.isArray(restored[key])||saved[key].some(p=>!restored[key].some(r=>r.tempId===p.tempId)))throw new Error("This older draft is missing saved tee pads or baskets. The current course has not been replaced.");
    }
  }
}
/** Keep distinct recent versions and the first checkpoint separately from the editable draft. */
export function checkpointDraft(storage:Pick<Storage,"getItem"|"setItem">,key:string,draft:unknown):void {
  const raw=JSON.stringify(draft);
  if(!storage.getItem(key+":first-checkpoint"))storage.setItem(key+":first-checkpoint",raw);
  let history:unknown[]=[];
  try {const parsed=JSON.parse(storage.getItem(key+":history")||"[]");if(Array.isArray(parsed))history=parsed;}catch{/* Preserve malformed history in its own recovery entry. */storage.setItem(key+":history-unreadable",storage.getItem(key+":history")||"");}
  if(history.some(value=>JSON.stringify(value)===raw))return;
  storage.setItem(key+":history",JSON.stringify([...history.slice(-19),draft]));
}
