import { endpointName } from "./endpoint-identity";
import { seedStudioControlPoints } from "./studio-control-points";
import { emptyFairways, syncPairings, pairKey, basketRouteKey, basketNode, pointFor, prune, validateFairwayDraft, type FairwayDraft } from "./pairing-fairways";
import { validPoint } from "./pairing-fairways";
import type { LatLng } from "./geometry";
import {automaticBendPoints,connectNewFairways} from "./automatic-fairways";

export type PairScoring = { par: number | null; distanceOverride: number | null };
export type StoredRoute = { scoring?: PairScoring; nodes: string[]; points: Record<string, LatLng> };
export type TeePaths = Record<string, StoredRoute>;
export type BasketConnection = { from:string; to:string; path:StoredRoute };
export type StudioPad = { basket_connections?: BasketConnection[]; distance_override?: number | null; tempId: string; name: string; color: string; lat: number | null; lng: number | null; bends?: LatLng[]; route_mode?: "same" | "joins" | "own"; is_drop_zone?: boolean; pair_paths?: TeePaths; main_path?: StoredRoute; trunk_path?: StoredRoute; basket_ids?:string[]; main_basket_ids?:string[] };
export type StudioHole = { par?: number; par_confirmed?: boolean; distance_override?: number | null; basket_color?: string; tee: LatLng | null; basket: LatLng | null; tee_name: string; basket_name: string; tee_color: string; flight_path: LatLng[]; extra_tees: StudioPad[]; extra_baskets: StudioPad[] };
export const MAIN_TEE = "main-tee", MAIN_BASKET = "main-basket";
/** Scoring is attached to a route's endpoint IDs, never a color or display name. */
export function storedStudioRoute(hole: StudioHole, tee: string, basket: string): StoredRoute | undefined {
  if (tee === MAIN_TEE && basket === MAIN_BASKET) return [...hole.extra_tees, ...hole.extra_baskets].find(p => p.trunk_path)?.trunk_path;
  if (tee === MAIN_TEE) return hole.extra_baskets.find(b => b.tempId === basket)?.main_path;
  return hole.extra_tees.find(t => t.tempId === tee)?.pair_paths?.[basket];
}
export function validatePairScoring(score: PairScoring): void {
  if (!score || (score.par !== null && (!Number.isInteger(score.par) || score.par < 2 || score.par > 7)) ||
      (score.distanceOverride !== null && (!Number.isInteger(score.distanceOverride) || score.distanceOverride < 1 || score.distanceOverride > 20000))) {
    throw new Error("Set par from 2 to 7 and a whole-number distance from 1 to 20,000 feet, or use the mapped distance.");
  }
}
export function readPrimaryPath(value: unknown): LatLng[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some(point=>!validPoint(point))) {
    throw new Error("Saved fairway coordinates are invalid. Original paths have been retained.");
  }
  return value as LatLng[];
}
const readIds=(value:unknown):string[] | undefined=>{
  if(value===undefined || value===null) return undefined;
  if(!Array.isArray(value) || value.some(id=>typeof id!=="string")) throw new Error("Saved basket assignments are invalid. Original data has been retained.");
  return [...new Set(value as string[])];
};
function readStoredRoute(value: unknown): StoredRoute {
  const route=value as StoredRoute | null;
  if(!route || !Array.isArray(route.nodes) || !route.points || typeof route.points!=="object" || Array.isArray(route.points)
    || new Set(route.nodes).size!==route.nodes.length
    || Object.entries(route.points).some(([id,point])=>!id.startsWith("point:") || !validPoint(point))
    || route.nodes.some(id=>typeof id!=="string" || !id.startsWith("point:") || !validPoint(route.points[id]))) {
    throw new Error("Saved pairing paths are invalid. Original paths have been retained.");
  }
  if(route.scoring!==undefined) validatePairScoring(route.scoring);
  return route;
}
function readRoutes(value: unknown): TeePaths | undefined {
  if(value===undefined) return undefined;
  if(!value || typeof value!=="object" || Array.isArray(value)) throw new Error("Saved pairing paths are invalid. Original paths have been retained.");
  return Object.fromEntries(Object.entries(value).map(([key,path])=>[key,readStoredRoute(path)]));
}
export function readTeePaths(value: unknown): { bends: LatLng[]; pair_paths?: TeePaths; trunk_path?: StoredRoute; basket_ids?:string[]; main_basket_ids?:string[] } {
  if (Array.isArray(value)) return { bends: readPrimaryPath(value) };
  const v = value as { version?: number; bends?: unknown; routes?: TeePaths; trunk?: StoredRoute; basket_ids?:string[]; main_basket_ids?:string[] } | null;
  if(v && v.version !== 1) throw new Error("Unrecognized tee fairway data. Original routes have been retained.");
  return v?.version === 1 ? { bends: readPrimaryPath(v.bends), pair_paths: readRoutes(v.routes), trunk_path:v.trunk===undefined ? undefined : readStoredRoute(v.trunk), basket_ids:readIds(v.basket_ids), main_basket_ids:readIds(v.main_basket_ids) } : { bends: [] };
}
export function writeTeePaths(pad: StudioPad) { return pad.pair_paths || pad.basket_ids || pad.main_basket_ids ? { version: 1, bends: pad.bends ?? [], routes: pad.pair_paths ?? {}, basket_ids:pad.basket_ids, main_basket_ids:pad.main_basket_ids, ...(pad.trunk_path ? {trunk:pad.trunk_path} : {}) } : pad.bends ?? []; }
export function readBasketPath(value: unknown): { basket_connections?: BasketConnection[]; bends: LatLng[]; main_path?: StoredRoute; trunk_path?:StoredRoute; main_basket_ids?:string[] } {
  if (validPoint(value)) return { bends: [value] };
  const v = value as { basket_connections?: BasketConnection[]; version?: number; split?: unknown; route?: StoredRoute; trunk?:StoredRoute; main_basket_ids?:string[] } | null;
  if(v && v.version !== 1) throw new Error("Unrecognized basket fairway data. Original routes have been retained.");
  if(v?.split!=null && !validPoint(v.split)) throw new Error("Saved basket fairway coordinates are invalid. Original paths have been retained.");
  if(v?.basket_connections && (!Array.isArray(v.basket_connections) || v.basket_connections.some(c=>!c || typeof c.from!=="string" || typeof c.to!=="string" || !c.path))) throw new Error("Saved basket connections are invalid. Original data has been retained.");
  return v?.version === 1 ? { basket_connections:v.basket_connections?.map(connection=>({...connection,path:readStoredRoute(connection.path)})), bends: validPoint(v.split) ? [v.split] : [], main_path: v.route===undefined ? undefined : readStoredRoute(v.route), trunk_path:v.trunk===undefined ? undefined : readStoredRoute(v.trunk), main_basket_ids:readIds(v.main_basket_ids) } : { bends: [] };
}
export function writeBasketPath(pad: StudioPad) { return pad.main_path || pad.main_basket_ids || pad.basket_connections ? { version: 1, basket_connections:pad.basket_connections, split: pad.bends?.[0] ?? null, route: pad.main_path, main_basket_ids:pad.main_basket_ids, ...(pad.trunk_path ? {trunk:pad.trunk_path} : {}) } : pad.bends?.[0] ?? null; }

/** Existing JSON route columns retain their legacy shape until a pairing is edited. */
export function studioFairways(hole: StudioHole): FairwayDraft {
  const mainIds = [...hole.extra_tees,...hole.extra_baskets].find(p=>p.main_basket_ids)?.main_basket_ids;
  let draft: FairwayDraft = {
    tees: [{id:MAIN_TEE,name:hole.tee_name || "Main tee",color:hole.tee_color,point:hole.tee,basketIds:mainIds}, ...hole.extra_tees.map(t => ({id:t.tempId,name:endpointName("tee",t.tempId,t.name,t.is_drop_zone),color:t.color,basketIds:t.basket_ids,point:t.lat == null || t.lng == null ? null : [t.lat,t.lng] as LatLng}))],
    baskets: [{id:MAIN_BASKET,name:hole.basket_name || "Main basket",point:hole.basket}, ...hole.extra_baskets.map(b => ({id:b.tempId,name:endpointName("basket",b.tempId,b.name),point:b.lat == null || b.lng == null ? null : [b.lat,b.lng] as LatLng}))],
    network:emptyFairways(),
  };
  draft.network = syncPairings(draft.network,draft.tees,draft.baskets);
  seedStudioControlPoints(draft,hole);
  // Connections reference existing basket identities, never duplicate endpoints.
  const connections = new Map<string,BasketConnection>();
  for(const pad of hole.extra_baskets) for(const c of pad.basket_connections ?? []) {
    const key=basketRouteKey(c.from,c.to), previous=connections.get(key);
    if(previous && JSON.stringify(previous.path)!==JSON.stringify(c.path)) throw new Error("Saved basket connections disagree. Original data has been retained.");
    connections.set(key,c);
  }
  for(const [key,c] of connections) {
    if(!draft.baskets.some(b=>b.id===c.from && b.point) || !draft.baskets.some(b=>b.id===c.to && b.point)) continue;
    draft.network.routes[key]={teeId:`basket:${c.from}`,startBasketId:c.from,basketId:c.to,nodes:[basketNode(c.from),basketNode(c.to)]};
  }
  const restored = new Map<string,LatLng>();
  const restoredRoutes=new Set<string>();
  const restore = (tee:string,basket:string,saved:StoredRoute) => {
    const route = draft.network.routes[pairKey(tee,basket)];
    if (!route) return;
    restoredRoutes.add(pairKey(tee,basket));
    readStoredRoute(saved);
    for (const id of saved.nodes) {
      const existing = restored.get(id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(saved.points[id])) throw new Error("Shared fairway points disagree. Original paths have not been replaced.");
      draft.network.points[id] = saved.points[id];
      restored.set(id,saved.points[id]);
    }
    route.nodes = [route.nodes[0],...saved.nodes,route.nodes.at(-1)!];
  };
  const trunk = [...hole.extra_tees,...hole.extra_baskets].find(t=>t.trunk_path)?.trunk_path;
  if(trunk) readStoredRoute(trunk);
  if(trunk && JSON.stringify(trunk.nodes.map(id=>trunk.points[id])) === JSON.stringify(hole.flight_path)) restore(MAIN_TEE,MAIN_BASKET,trunk);
  for(const t of hole.extra_tees) for(const [basket,saved] of Object.entries(t.pair_paths ?? {})) restore(t.tempId,basket,saved);
  for(const b of hole.extra_baskets) if(b.main_path) restore(MAIN_TEE,b.tempId,b.main_path);
  for(const c of connections.values()) restore(`basket:${c.from}`,c.to,c.path);
  draft.network = prune(draft.network);
  draft=connectNewFairways(automaticBendPoints(draft),new Set(Object.keys(draft.network.routes).filter(key=>!restoredRoutes.has(key))));
  const errors = validateFairwayDraft(draft); if(errors.length) throw new Error(errors.join(" "));
  return draft;
}
export function applyStudioFairways<T extends StudioHole>(hole:T,draft:FairwayDraft):T {
  const errors = validateFairwayDraft(draft); if(errors.length) throw new Error(errors.join(" "));
  const refresh=(saved:StoredRoute | undefined):StoredRoute | undefined=>saved ? {...saved,points:Object.fromEntries(saved.nodes.map(id=>[id,draft.network.points[id] ?? saved.points[id]]))} : undefined;
  const save = (tee:string,basket:string):StoredRoute | undefined => {
    const route = draft.network.routes[pairKey(tee,basket)];
    if (!route) return undefined;
    const nodes = route.nodes.slice(1,-1);
    const existing = storedStudioRoute(hole,tee,basket);
    const scoring = tee === MAIN_TEE && basket === MAIN_BASKET
      ? {par:hole.par ?? null,distanceOverride:hole.distance_override ?? null} : existing?.scoring;
    if (scoring) validatePairScoring(scoring);
    return { ...existing, ...(scoring ? {scoring} : {}), nodes, points:Object.fromEntries(nodes.map(id=>[id,pointFor(draft,id)])) };
  };
  const basket_connections:BasketConnection[]=Object.values(draft.network.routes).filter(r=>r.startBasketId).map(r=>({from:r.startBasketId!,to:r.basketId,path:save(r.teeId,r.basketId)!}));
  // Retain connections to temporarily unplaced baskets; deleting an asset drops its links.
  const present=new Set(draft.baskets.map(b=>b.id));
  for(const c of hole.extra_baskets[0]?.basket_connections ?? []) if(present.has(c.from)&&present.has(c.to)&&!draft.network.routes[basketRouteKey(c.from,c.to)]) {
    if(!draft.baskets.find(b=>b.id===c.from)?.point || !draft.baskets.find(b=>b.id===c.to)?.point) basket_connections.push({...c,path:refresh(c.path)!});
  }
  const trunk=save(MAIN_TEE,MAIN_BASKET);
  const main_basket_ids=draft.tees.find(t=>t.id===MAIN_TEE)?.basketIds;
  return {...hole, flight_path:trunk ? trunk.nodes.map(id=>trunk.points[id]) : hole.flight_path,
    extra_tees:hole.extra_tees.map(t=> {
      const tee=draft.tees.find(p=>p.id===t.tempId);
      if(!tee?.point) return {...t,main_basket_ids};
      const main=save(t.tempId,MAIN_BASKET);
      return {...t,main_basket_ids,basket_ids:tee.basketIds,trunk_path:trunk ?? refresh(t.trunk_path),
        pair_paths:{...Object.fromEntries(Object.entries(t.pair_paths ?? {}).map(([id,path])=>[id,refresh(path)!])),...Object.fromEntries(draft.baskets.flatMap(b=>{const path=save(t.tempId,b.id);return path ? [[b.id,path]] : []}))},
        route_mode:"own" as const,bends:main ? main.nodes.map(id=>main.points[id]) : t.bends};
    }),
    extra_baskets:hole.extra_baskets.map(b=>({...b,basket_connections,main_basket_ids,trunk_path:trunk ?? refresh(b.trunk_path),main_path:save(MAIN_TEE,b.tempId) ?? refresh(b.main_path)}))};
}
/** Assignment changes hide routes without deleting their saved bends. */
export function assignStudioBaskets<T extends StudioHole>(hole:T,teeId:string,basketIds:string[]):T {
  if (!basketIds.length) throw new Error("Choose at least one destination basket for this tee pad.");
  const allowed=new Set([MAIN_BASKET,...hole.extra_baskets.map(b=>b.tempId)]);
  if (basketIds.some(id=>!allowed.has(id))) throw new Error("Choose baskets from this hole.");
  const ids=[...new Set(basketIds)];
  return teeId === MAIN_TEE ? {...hole,extra_tees:hole.extra_tees.map(t=>({...t,main_basket_ids:ids})),extra_baskets:hole.extra_baskets.map(b=>({...b,main_basket_ids:ids}))}
    : {...hole,extra_tees:hole.extra_tees.map(t=>t.tempId===teeId ? {...t,basket_ids:ids} : t)};
}
export function remapTeePaths(value:unknown,baskets:Map<string,string>) {
  const parsed = readTeePaths(value);
  if(!parsed.pair_paths && !parsed.basket_ids && !parsed.main_basket_ids) return value;
  return {version:1,bends:parsed.bends,...(parsed.trunk_path ? {trunk:parsed.trunk_path} : {}),basket_ids:parsed.basket_ids?.map(id=>baskets.get(id) ?? id),main_basket_ids:parsed.main_basket_ids?.map(id=>baskets.get(id) ?? id),routes:Object.fromEntries(Object.entries(parsed.pair_paths ?? {}).map(([id,path])=>[baskets.get(id) ?? id,path]))};
}

/** Older open Studio sessions used short temporary IDs. Normalize the entire
 * save batch together, so route keys and inserted basket IDs always agree. */
export function persistentStudioPins<T extends StudioHole>(hole:T,uid=()=>crypto.randomUUID()):T {
  const validId=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const baskets=new Map(hole.extra_baskets.map(b=>[b.tempId,validId(b.tempId) ? b.tempId : uid()]));
  return {...hole,extra_baskets:hole.extra_baskets.map(b=>({...b,tempId:baskets.get(b.tempId)!,basket_connections:b.basket_connections?.map(c=>({...c,from:baskets.get(c.from)??c.from,to:baskets.get(c.to)??c.to})),main_basket_ids:b.main_basket_ids?.map(id=>baskets.get(id) ?? id)})),extra_tees:hole.extra_tees.map(t=>({...t,tempId:validId(t.tempId) ? t.tempId : uid(),basket_ids:t.basket_ids?.map(id=>baskets.get(id) ?? id),main_basket_ids:t.main_basket_ids?.map(id=>baskets.get(id) ?? id),...(t.pair_paths ? {pair_paths:Object.fromEntries(Object.entries(t.pair_paths).map(([key,path])=>[baskets.get(key) ?? key,path]))} : {})}))};
}

export function remapBasketPath(value:unknown,baskets:Map<string,string>) {
  const parsed=readBasketPath(value);
  return parsed.main_basket_ids || parsed.basket_connections ? writeBasketPath({...parsed,tempId:"",name:"",color:"",lat:null,lng:null,basket_connections:parsed.basket_connections?.map(c=>({...c,from:baskets.get(c.from)??c.from,to:baskets.get(c.to)??c.to})),main_basket_ids:parsed.main_basket_ids?.map(id=>baskets.get(id) ?? id)}) : value;
}

/** Add/remove a basket connection using the same map, route editor and save batch. */
export function connectStudioBaskets<T extends StudioHole>(hole:T,from:string,to:string,remove=false):T {
  const draft=studioFairways(hole),key=basketRouteKey(from,to);
  if(remove) {
    delete draft.network.routes[key];
    return applyStudioFairways({...hole,extra_baskets:hole.extra_baskets.map(b=>({...b,basket_connections:b.basket_connections?.filter(c=>c.from!==from||c.to!==to)}))},draft);
  }
  if(!draft.baskets.some(b=>b.id===from&&b.point)||!draft.baskets.some(b=>b.id===to&&b.point)||from===to) throw new Error("Choose two different placed baskets.");
  draft.network.routes[key]??={teeId:`basket:${from}`,startBasketId:from,basketId:to,nodes:[basketNode(from),basketNode(to)]};
  return applyStudioFairways(hole,connectNewFairways(automaticBendPoints(draft),new Set([key])));
}
