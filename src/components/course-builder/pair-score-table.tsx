import { studioFairways, MAIN_TEE, MAIN_BASKET, type StudioHole, type PairScoring } from "@/lib/course-builder/studio-fairways";
import { pairSummary, pairScoreLabel } from "@/lib/course-builder/pair-scoring";
import { PairScoreFields } from "./pair-score-fields";
import { createFairwayGeometry } from "@/lib/course-builder/fairway-curves";

export function PairScoreTable({hole,onChange,onEdit}: {hole:StudioHole;onChange:(tee:string,basket:string,patch:Partial<PairScoring>)=>void;onEdit:(key:string)=>void}) {
  try {
    const draft=studioFairways(hole), routes=Object.entries(draft.network.routes).filter(([,r])=>!r.startBasketId);
    const geometry=createFairwayGeometry(draft);
    const scores=new Map(routes.map(([key])=>[key,pairSummary(hole,draft,key,geometry)]));
    const missing=routes.filter(([key])=>scores.get(key)!.par==null).length;
    return <div className="space-y-2" aria-label="Tee to basket pars and distances">
      <p className="text-xs text-muted-foreground">{routes.length} mapped pairings{missing ? ` · ${missing} need par` : ""}. Set each route independently. Blank measured distance follows the curved fairway.</p>
      {!routes.length && <p className="text-xs">Place a tee pad and a basket to map their distance and set par.</p>}
      {routes.map(([key,r])=>{
        const tee=draft.tees.find(t=>t.id===r.teeId)!, basket=draft.baskets.find(b=>b.id===r.basketId)!;
        const label=`${tee.name} tee → ${basket.name} basket`;
        const color=r.basketId===MAIN_BASKET ? hole.basket_color : hole.extra_baskets.find(b=>b.tempId===r.basketId)?.color;
        const score=scores.get(key)!;
        return <section key={key} aria-label={label} className="space-y-2 rounded-lg border bg-background p-2">
          <button type="button" className="flex w-full flex-wrap items-center gap-1 text-left text-xs font-semibold" onClick={()=>onEdit(key)}>
            <span className="h-3 w-3 rounded-sm border" style={{background:tee.color}}/>{tee.name} tee → <span className="h-3 w-3 rounded-full border" style={{background:color}}/>{basket.name} basket<span className="ml-auto font-normal text-primary">Edit fairway</span>
          </button>
          <p className="text-xs font-medium">{pairScoreLabel(hole,draft,key,geometry)}</p>
          <PairScoreFields label={label} score={score} mappedDistance={score.mappedDistance} main={r.teeId===MAIN_TEE&&r.basketId===MAIN_BASKET} onChange={patch=>onChange(r.teeId,r.basketId,patch)}/>
        </section>;
      })}
    </div>;
  }catch(error){return <p role="alert">{(error as Error).message}</p>;}
}
