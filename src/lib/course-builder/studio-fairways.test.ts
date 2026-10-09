import {describe,it,expect} from "vitest";
import {studioFairways,applyStudioFairways,persistentStudioPins,readTeePaths,writeTeePaths,readBasketPath,writeBasketPath,remapTeePaths,remapBasketPath,assignStudioBaskets,MAIN_TEE,MAIN_BASKET,type StudioHole} from "./studio-fairways";
import {pairKey,insertFairwayPoint,routePoints,shareFairwaySection,detachFairwayPoint,moveFairwayPoint,joinFairwayPoint,routeDistance} from "./pairing-fairways";
const hole = ():StudioHole => ({tee:[41,-87],basket:[41.003,-87],tee_name:"Blue",basket_name:"A",tee_color:"#2563eb",flight_path:[[41.002,-87]],extra_tees:[{tempId:"red",name:"Red",color:"#dc2626",lat:41.002,lng:-86.999,route_mode:"joins",bends:[[41.0025,-87]]}],extra_baskets:[{tempId:"b",name:"B",color:"#fff",lat:41.001,lng:-87.002,bends:[[41.0005,-87]]},{tempId:"c",name:"C",color:"#fff",lat:41.0015,lng:-86.998,bends:[[41.001,-87]]}]});
function roundtrip(h:StudioHole):StudioHole {return {...h,extra_tees:h.extra_tees.map(t=>({...t,...readTeePaths(JSON.parse(JSON.stringify(writeTeePaths(t))))})),extra_baskets:h.extra_baskets.map(b=>({...b,...readBasketPath(JSON.parse(JSON.stringify(writeBasketPath(b))))}))};}
describe("Studio tee-to-basket paths",()=> {
  it("retains recorded bends and adds a small set of automatic handles",()=>{
    const h=hole(),draft=studioFairways(h);
    expect(routePoints(draft,`${MAIN_TEE}/${MAIN_BASKET}`)).toEqual(expect.arrayContaining([h.tee,...h.flight_path,h.basket]));
    expect(routePoints(draft,"red/b")).toHaveLength(4);
    expect(draft.network.routes[`${MAIN_TEE}/${MAIN_BASKET}`].nodes.slice(1,-1).length).toBeGreaterThanOrEqual(2);
  });
  it("keeps deliberate joins and persistent breakaways across save/reload",()=>{
    const h=hole();let draft=studioFairways(h);
    draft.network=insertFairwayPoint(draft.network,"red/b",0,[41.0015,-87],"point:source");
    draft.network=insertFairwayPoint(draft.network,"red/c",0,[41.0016,-87],"point:target");
    draft.network=joinFairwayPoint(draft.network,"red/b","point:source","point:target");
    draft=studioFairways(roundtrip(applyStudioFairways(h,draft)));
    expect(draft.network.routes["red/b"].nodes).toContain("point:target");
    draft.network=detachFairwayPoint(draft.network,"red/b","point:target","point:breakaway");
    const broken=studioFairways(roundtrip(applyStudioFairways(h,draft)));
    expect(broken.network.routes["red/b"].nodes).not.toContain("point:target");
    expect(broken.network.routes["red/b"].nodes).toContain("point:breakaway");
    expect(broken.network.points["point:breakaway"]).toEqual(broken.network.points["point:target"]);
    const other=routePoints(broken,"red/c");
    broken.network=moveFairwayPoint(broken.network,"point:breakaway",[41.002,-87.002]);
    expect(routePoints(broken,"red/c")).toEqual(other);
  });
  it("measures every bend and keeps them fixed when endpoints move",()=>{
    const h=hole(),draft=studioFairways(h),key="red/b";
    const direct=routeDistance(draft,key);
    draft.network=insertFairwayPoint(draft.network,key,0,[41.004,-87.003],"point:wide");
    expect(routeDistance(draft,key)).toBeGreaterThan(direct);
    const saved=applyStudioFairways(h,draft);saved.extra_tees[0].lat=41.003;
    const moved=studioFairways(roundtrip(saved));
    expect(moved.network.points["point:wide"]).toEqual([41.004,-87.003]);
    expect(routeDistance(moved,key)).not.toBe(routeDistance(draft,key));
  });
  it("creates paths for placed extra endpoints even while primary endpoints are missing",()=>{
    const h=hole();h.tee=null;h.basket=null;
    const draft=studioFairways(h);
    expect(Object.keys(draft.network.routes).sort()).toEqual(["red/b","red/c"]);
    expect(()=>applyStudioFairways(h,draft)).not.toThrow();
  });
  it("maps an extra tee to selected destinations and restores unmapped bends",()=>{
    const saved=applyStudioFairways(hole(),studioFairways(hole()));
    const archived=JSON.stringify(saved.extra_tees[0].pair_paths!["b"]);
    const mapped=assignStudioBaskets(saved,"red",[MAIN_BASKET,"c"]);
    const draft=studioFairways(roundtrip(mapped));
    expect(draft.network.routes["red/b"]).toBeUndefined();
    expect(draft.network.routes["red/c"]).toBeDefined();
    const applied=roundtrip(applyStudioFairways(mapped,draft));
    expect(JSON.stringify(applied.extra_tees[0].pair_paths!["b"])).toBe(archived);
    const restored=studioFairways(assignStudioBaskets(applied,"red",[MAIN_BASKET,"b","c"]));
    expect(restored.network.routes["red/b"]).toBeDefined();
    expect(()=>assignStudioBaskets(saved,"red",[])).toThrow("at least one");
  });
  it("persists primary tee destinations and remaps copied basket metadata",()=>{
    const saved=assignStudioBaskets(hole(),MAIN_TEE,["b","c"]);
    const reloaded=roundtrip(saved),draft=studioFairways(reloaded);
    expect(draft.network.routes[`${MAIN_TEE}/${MAIN_BASKET}`]).toBeUndefined();
    expect(draft.network.routes[`${MAIN_TEE}/b`]).toBeDefined();
    const copied=readBasketPath(remapBasketPath(writeBasketPath(saved.extra_baskets[0]),new Map([["b","copy-b"],["c","copy-c"]])));
    expect(copied.main_basket_ids).toEqual(["copy-b","copy-c"]);
    const stable=persistentStudioPins(saved);
    expect(stable.extra_baskets[0].main_basket_ids).toEqual(stable.extra_baskets.map(b=>b.tempId));
    expect(studioFairways(roundtrip(applyStudioFairways(reloaded,draft))).network.routes[`${MAIN_TEE}/${MAIN_BASKET}`]).toBeUndefined();
  });
  it("normalizes old open-session IDs and all persisted basket references together",()=> {
    const h=applyStudioFairways(hole(),studioFairways(hole()));
    const stable=persistentStudioPins(h);
    expect(stable.extra_baskets[0].tempId).toMatch(/^[a-f0-9-]{36}$/);
    expect(stable.extra_tees[0].pair_paths![stable.extra_baskets[0].tempId]).toBeDefined();
    expect(stable.extra_tees[0].pair_paths!["b"]).toBeUndefined();
    const again=persistentStudioPins(stable);expect(again.extra_baskets[0].tempId).toBe(stable.extra_baskets[0].tempId);
  });
  it("gives a downstream red tee all three basket paths",()=> {
    const draft=studioFairways(hole()); expect(Object.keys(draft.network.routes)).toHaveLength(6);
    for(const id of [MAIN_BASKET,"b","c"]) {const p=routePoints(draft,pairKey("red",id));expect(p[0]).toEqual([41.002,-86.999]);expect(p.at(-1)).toEqual(draft.baskets.find(b=>b.id===id)!.point);}
  });
  it("keeps multiple bends for each red pairing after JSON save/reload",()=> {
    const h=hole(),draft=studioFairways(h);const key=pairKey("red","b");
    draft.network=insertFairwayPoint(draft.network,key,0,[41.0018,-86.9998],"point:bend1");
    draft.network=insertFairwayPoint(draft.network,key,1,[41.0013,-87.001],"point:bend2");
    const before=routePoints(draft,key); const after=studioFairways(roundtrip(applyStudioFairways(h,draft)));
    expect(routePoints(after,key)).toEqual(before);expect(after.network.routes[key].nodes).toContain("point:bend2");expect(Object.keys(after.network.routes)).toHaveLength(6);
  });
  it("preserves explicit shared point identities and supports splitting again",()=> {
    const h=hole(),draft=studioFairways(h); const source=pairKey("red","b"), target=pairKey("red","c");
    for(const [key,prefix] of [[source,"s"],[target,"t"]]) {draft.network=insertFairwayPoint(draft.network,key,0,[41.0018,-87],`point:${prefix}1`);draft.network=insertFairwayPoint(draft.network,key,1,[41.0016,-87.0002],`point:${prefix}2`);}
    draft.network=shareFairwaySection(draft.network,source,"point:s1","point:s2",target,"point:t1","point:t2");
    const restored=studioFairways(roundtrip(applyStudioFairways(h,draft)));
    restored.network=moveFairwayPoint(restored.network,"point:t1",[41.0019,-87.0003]);
    expect(routePoints(restored,source)).toContainEqual([41.0019,-87.0003]);expect(routePoints(restored,target)).toContainEqual([41.0019,-87.0003]);
    restored.network=detachFairwayPoint(restored.network,source,"point:t1","point:independent");restored.network=moveFairwayPoint(restored.network,"point:independent",[41.002,-87.0004]);
    expect(routePoints(restored,target)).not.toContainEqual([41.002,-87.0004]);
  });
  it("keeps legacy JSON unchanged and remaps basket IDs on layout copy",()=> {
    expect(writeTeePaths({...hole().extra_tees[0],bends:[[41,-87]]})).toEqual([[41,-87]]);
    expect(readBasketPath([41,-87]).bends).toEqual([[41,-87]]);
    const saved=applyStudioFairways(hole(),studioFairways(hole()));const copied=readTeePaths(remapTeePaths(writeTeePaths(saved.extra_tees[0]),new Map([["b","copy-b"]])));
    expect(copied.pair_paths!["copy-b"]).toBeDefined();expect(copied.pair_paths!["b"]).toBeUndefined();
  });
  it("resolves moved pin endpoints without moving other pairings",()=> {
    const h=applyStudioFairways(hole(),studioFairways(hole()));h.extra_tees[0].lat=41.0022; const draft=studioFairways(h);
    expect(routePoints(draft,pairKey("red","b"))[0]).toEqual([41.0022,-86.999]);expect(routePoints(draft,pairKey(MAIN_TEE,MAIN_BASKET))[0]).toEqual(h.tee);
  });
});
