import { Button } from "@/components/ui/button";
import { studioFairways, type StudioHole } from "@/lib/course-builder/studio-fairways";
import { pairScoreLabel } from "@/lib/course-builder/pair-scoring";
import { createFairwayGeometry } from "@/lib/course-builder/fairway-curves";

/** Routes belong to a physical pin pair; organizing them never changes pin allocation. */
export function PinFairways({ hole, teeId, basketId, onEdit, onAssign, onConnect }: {
  hole: StudioHole; teeId?: string; basketId?: string; onEdit: (route: string) => void; onAssign?: (basketIds:string[]) => void; onConnect?: (from:string,to:string,remove?:boolean)=>void;
}) {
  try {
    const draft = studioFairways(hole);
    const geometry = createFairwayGeometry(draft);
    const pin = teeId ? draft.tees.find(t => t.id === teeId) : draft.baskets.find(b => b.id === basketId);
    const routes = Object.entries(draft.network.routes).filter(([, r]) => teeId ? r.teeId === teeId : r.basketId === basketId || r.startBasketId === basketId);
    if (!pin) return <p className="mt-2 text-xs text-muted-foreground">This starting point or destination is unavailable.</p>;
    return <div data-pin={`${teeId ? "tee" : "basket"}:${teeId ?? basketId}`} className="mt-2 space-y-1 rounded-md border border-border p-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <strong>{teeId ? "Tee pad" : "Basket"} {pin.name} · {teeId ? "starting point" : "destination"}</strong>
        <span className={pin.point ? "text-primary" : "text-muted-foreground"}>{pin.point ? "Placed" : "Not placed"}</span>
      </div>
      {teeId && onAssign && <fieldset className="space-y-1 py-1">
        <legend className="text-xs font-semibold">Destination baskets</legend>
        <p className="text-[11px] text-muted-foreground">Select one or more baskets. Unmapping retains saved bends.</p>
        {draft.baskets.map(basket=>{
          const ids=pin.basketIds ?? draft.baskets.map(b=>b.id);
          const checked=ids.includes(basket.id);
          return <label key={basket.id} className="flex items-center gap-2 text-xs">
            <input type="checkbox" aria-label={`Map tee pad ${pin.name} to basket ${basket.name}`} checked={checked} disabled={checked && ids.length===1} onChange={e=>onAssign(e.target.checked ? [...ids,basket.id] : ids.filter(id=>id!==basket.id))}/>
            Basket {basket.name}{!basket.point ? " · awaiting placement" : ""}
          </label>;
        })}
      </fieldset>}
      {basketId && onConnect && <fieldset className="space-y-1 border-t pt-2">
        <legend className="text-xs font-semibold">Connect to another basket</legend>
        {draft.baskets.filter(b=>b.id!==basketId).map(b=>{
          const connected=Object.values(draft.network.routes).some(r=>r.startBasketId===basketId&&r.basketId===b.id);
          return <Button key={b.id} size="sm" variant="outline" className="w-full" disabled={!pin.point||!b.point} onClick={()=>onConnect(basketId,b.id,connected)}>{connected ? "Remove connection to" : "Connect to"} basket {b.name}</Button>;
        })}
      </fieldset>}
      {!pin.point ? <p className="text-[11px] text-muted-foreground">Place this {teeId ? "tee pad" : "basket"} to create its routes.</p> : !routes.length ? <p className="text-[11px] text-muted-foreground">Assign and place a {teeId ? "basket" : "tee pad"} to create a fairway.</p> : <>
        <p className="text-[11px] text-muted-foreground">{routes.length} allocated {routes.length === 1 ? "route" : "routes"} · Edit bends and shared sections</p>
        {routes.map(([key, r]) => {
          const outgoing=r.startBasketId===basketId;
          const opposite = teeId || outgoing ? draft.baskets.find(b => b.id === r.basketId) : r.startBasketId ? draft.baskets.find(b=>b.id===r.startBasketId) : draft.tees.find(t => t.id === r.teeId);
          const bends = r.nodes.slice(1, -1);
          const shared = bends.filter(id => Object.values(draft.network.routes).some(other => other !== r && other.nodes.includes(id))).length;
          return <Button key={key} size="sm" variant="outline" className="h-auto w-full justify-between gap-2 px-2 py-1.5 text-left" onClick={() => onEdit(key)} aria-label={`Edit ${pin.name} ${teeId || outgoing ? "to" : "from"} ${opposite?.name} fairway`}>
            <span className="min-w-0 whitespace-normal text-xs">{teeId || outgoing ? "To" : "From"} {opposite?.name}<span className="block text-[10px] font-normal text-muted-foreground">{bends.length} bends{shared ? ` · ${shared} shared` : " · independent"}</span></span>
            <span className="shrink-0 text-[11px]">{pairScoreLabel(hole,draft,key,geometry)} · Edit</span>
          </Button>;
        })}
      </>}
    </div>;
  } catch (error) {
    return <p role="alert" className="text-xs text-destructive">Fairways could not be loaded: {(error as Error).message}</p>;
  }
}
