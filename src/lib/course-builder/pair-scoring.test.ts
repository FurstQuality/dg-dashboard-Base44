import {describe,it,expect} from "vitest";
import {pairScoring,pairSummary,setPairScoring} from "./pair-scoring";
import {studioFairways,applyStudioFairways,readTeePaths,writeTeePaths,readBasketPath,writeBasketPath,remapTeePaths,remapBasketPath,assignStudioBaskets, type StudioHole} from "./studio-fairways";
import {insertFairwayPoint} from "./pairing-fairways";
const hole=():StudioHole=>({par:3,distance_override:null,tee:[41,-87],basket:[41.001,-87],tee_name:"Blue",basket_name:"Red",tee_color:"#2563eb",flight_path:[],extra_tees:[{tempId:"red",name:"Red",color:"#dc2626",lat:41,lng:-87.001}],extra_baskets:[{tempId:"blue",name:"Blue",color:"#2563eb",lat:41.003,lng:-87}]});
const roundtrip=(h:StudioHole):StudioHole=>({...h,extra_tees:h.extra_tees.map(t=>({...t,distance_override:null,...readTeePaths(JSON.parse(JSON.stringify(writeTeePaths(t))))})),extra_baskets:h.extra_baskets.map(b=>({...b,distance_override:null,...readBasketPath(JSON.parse(JSON.stringify(writeBasketPath(b))))}))});
describe("per-pair par and distance",()=>{
 it("keeps four distinct pairings through serialization and edits",()=>{
  let h=hole();h=setPairScoring(h,"main-tee","main-basket",{par:3,distanceOverride:220});h=setPairScoring(h,"main-tee","blue",{par:4,distanceOverride:600});h=setPairScoring(h,"red","blue",{par:5,distanceOverride:800});
  h=roundtrip(applyStudioFairways(h,studioFairways(h)));
  expect(pairScoring(h,"main-tee","main-basket")).toEqual({par:3,distanceOverride:220});expect(pairScoring(h,"main-tee","blue")).toEqual({par:4,distanceOverride:600});expect(pairScoring(h,"red","blue")).toEqual({par:5,distanceOverride:800});expect(pairScoring(h,"red","main-basket").par).toBeNull();
  expect(h.extra_tees).toHaveLength(1);expect(h.extra_baskets).toHaveLength(1);expect(h.par).toBe(3);
 });
 it("keeps manual distance and par when bends or endpoints move, and supports returning to mapped length",()=>{
  let h=setPairScoring(hole(),"main-tee","blue",{par:4,distanceOverride:600});let d=studioFairways(h);d.network=insertFairwayPoint(d.network,"main-tee/blue",0,[41.002,-87.005],"point:test");h=applyStudioFairways(h,d);h.extra_baskets[0].lat=41.006;
  h=roundtrip(h);const before=pairSummary(h,studioFairways(h),"main-tee/blue");expect(before.distance).toBe(600);expect(before.par).toBe(4);expect(before.mappedDistance).toBeGreaterThan(600);
  h=setPairScoring(h,"main-tee","blue",{distanceOverride:null});expect(pairSummary(h,studioFairways(h),"main-tee/blue").distance).toBe(before.mappedDistance);
 });
 it("preserves scoring through unmap/remap, renamed colors, and layout basket ID copies",()=>{
  let h=setPairScoring(hole(),"red","blue",{par:4,distanceOverride:600});h=assignStudioBaskets(h,"red",["main-basket"]);h=roundtrip(applyStudioFairways(h,studioFairways(h)));h=assignStudioBaskets(h,"red",["main-basket","blue"]);h.extra_tees[0].name="Elite";h.extra_tees[0].color="#fff";
  expect(pairScoring(h,"red","blue").par).toBe(4);
  const remapped=readTeePaths(remapTeePaths(writeTeePaths(h.extra_tees[0]),new Map([["blue","new-blue"]])));expect(remapped.pair_paths?.["new-blue"].scoring).toEqual({par:4,distanceOverride:600});
  h=setPairScoring(h,"main-tee","blue",{par:5});expect(readBasketPath(remapBasketPath(writeBasketPath(h.extra_baskets[0]),new Map([["blue","new-blue"]]))).main_path?.scoring?.par).toBe(5);
 });
 it("rejects invalid values without changing existing routes",()=>{
  const h=hole(),saved=JSON.stringify(h);for(const patch of [{par:NaN},{par:3.5},{distanceOverride:-1},{distanceOverride:Infinity},{distanceOverride:220.5}])expect(()=>setPairScoring(h,"main-tee","blue",patch)).toThrow();expect(JSON.stringify(h)).toBe(saved);
 });
});
