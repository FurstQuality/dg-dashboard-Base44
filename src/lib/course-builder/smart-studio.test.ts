import {describe,it,expect} from "vitest";
import {teeInventory} from "./tee-inventory";
import {studioFairways,applyStudioFairways,connectStudioBaskets,readBasketPath,writeBasketPath,readTeePaths,writeTeePaths,remapBasketPath,persistentStudioPins,type StudioHole} from "./studio-fairways";
import {basketRouteKey,joinFairwayApproach,addFairwayShapeHandles,moveFairwayPoint,routePoints,routeDistance,validateFairwayDraft} from "./pairing-fairways";
const hole=():StudioHole=>({tee:[41,-87],tee_name:"Main",tee_color:"#2563eb",basket:[41.003,-87],basket_name:"A",flight_path:[[41.002,-87.001]],extra_tees:[{tempId:"red",name:"Red",color:"#dc2626",lat:41,lng:-87.001}],extra_baskets:[{tempId:"b",name:"B",color:"#a3e635",lat:41.004,lng:-87.001},{tempId:"c",name:"C",color:"#a3e635",lat:41.005,lng:-87.002}]});
const reload=(h:StudioHole):StudioHole=>({...h,extra_tees:h.extra_tees.map(t=>({...t,...readTeePaths(JSON.parse(JSON.stringify(writeTeePaths(t))))})),extra_baskets:h.extra_baskets.map(b=>({...b,...readBasketPath(JSON.parse(JSON.stringify(writeBasketPath(b))))}))});
describe("Smart Course Studio",()=>{
 it("counts mapped Main/extra blue pads by color and keeps unplaced pads separate",()=>{
  const h=hole();h.extra_tees.push({tempId:"blue",name:"Tee 2",color:"#2563EB",lat:41.002,lng:-87});
  const empty={...hole(),tee:null,tee_name:"Red",extra_tees:[]};
  const rows=teeInventory([h,empty],[{name:"Blue",color:"#2563eb"},{name:"Red",color:"#dc2626"}]);
  expect(rows.find(r=>r.name==="Blue")).toMatchObject({mapped:2,unplaced:0});
  expect(rows.find(r=>r.name==="Red")).toMatchObject({mapped:1,unplaced:1});
 });
 it("joins a second tee at the chosen point and follows the complete target approach",()=>{
  const h=hole(),d=studioFairways(h),target=d.network.routes["main-tee/main-basket"];
  const existing=routePoints(d,"main-tee/main-basket");
  d.network=joinFairwayApproach(d,"red/main-basket","main-tee/main-basket",0,[41.001,-87.0005],"point:join");
  expect(d.network.routes["red/main-basket"].nodes.slice(1)).toEqual(d.network.routes["main-tee/main-basket"].nodes.slice(1));
  expect(routePoints(d,"main-tee/main-basket").filter(p=>JSON.stringify(p)!==JSON.stringify([41.001,-87.0005]))).toEqual(existing);
  const loaded=studioFairways(reload(applyStudioFairways(h,d)));
  expect(loaded.network.routes["red/main-basket"].nodes).toContain("point:join");
  expect(()=>joinFairwayApproach(loaded,"red/b","main-tee/main-basket",0,[41,-87],"point:no")).toThrow("same basket");
 });
 it("creates editable basket connections and preserves them through save/reload, endpoint moves and copies",()=>{
  let h=connectStudioBaskets(hole(),"main-basket","b");const key=basketRouteKey("main-basket","b");
  let d=studioFairways(h);expect(Object.keys(d.network.routes)).toHaveLength(7);expect(d.tees).toHaveLength(2);
  expect(d.network.routes[key].nodes.length).toBeGreaterThanOrEqual(4);
  d.network=moveFairwayPoint(d.network,d.network.routes[key].nodes[1],[41.005,-87.003]);
  h=reload(applyStudioFairways(h,d));const saved=routePoints(studioFairways(h),key);
  h.basket=[41.0031,-87];d=studioFairways(h);
  expect(routePoints(d,key).slice(1)).toEqual(saved.slice(1));expect(routeDistance(d,key)).toBeGreaterThan(0);expect(validateFairwayDraft(d)).toEqual([]);
  const copied=readBasketPath(remapBasketPath(writeBasketPath(h.extra_baskets[0]),new Map([["b","copy-b"]])));
  expect(copied.basket_connections?.[0].to).toBe("copy-b");
  const stable=persistentStudioPins(h);expect(stable.extra_baskets[0].basket_connections?.[0].to).toBe(stable.extra_baskets[0].tempId);
  const removed=connectStudioBaskets(h,"main-basket","b",true);expect(studioFairways(reload(removed)).network.routes[key]).toBeUndefined();
 });
 it("keeps unrelated links when a basket is deleted and restores temporarily unplaced connections",()=>{
  let h=connectStudioBaskets(connectStudioBaskets(hole(),"main-basket","b"),"main-basket","c");
  const original=h.basket;h.basket=null;h=reload(applyStudioFairways(h,studioFairways(h)));h.basket=original;
  expect(studioFairways(h).network.routes[basketRouteKey("main-basket","c")]).toBeDefined();
  h.extra_baskets=h.extra_baskets.filter(b=>b.tempId!=="b");
  expect(studioFairways(reload(h)).network.routes[basketRouteKey("main-basket","c")]).toBeDefined();
  expect(()=>connectStudioBaskets(h,"c","c")).toThrow("different");
 });
});
