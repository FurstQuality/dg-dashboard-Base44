import {describe,it,expect} from "vitest";
import {emptyFairways,syncPairings,insertFairwayPoint,routeDistance,moveFairwayPoint,type FairwayDraft} from "./pairing-fairways";
import {automaticBendPoints,connectNewFairways,nearbyFairway,snapFairwayBend} from "./automatic-fairways";
import {curvedFairwayEdge,curvedRoutePoints} from "./fairway-curves";
import {pathLengthFt} from "./geometry";
const draft=():FairwayDraft=>{
  const d:FairwayDraft={tees:[{id:"a",name:"Blue",point:[41,-87]},{id:"b",name:"Red",point:[41,-87.0001]}],baskets:[{id:"z",name:"A",point:[41.003,-87]}],network:emptyFairways()};
  d.network=syncPairings(d.network,d.tees,d.baskets);return d;
};
describe("Rounded automatic fairways",()=>{
  it("automatically joins crossings between handles, while saved independent routes remain untouched",()=>{
    let d:FairwayDraft={tees:[{id:"a",name:"A",point:[41,-87],basketIds:["x"]},{id:"b",name:"B",point:[41,-86.998],basketIds:["y"]}],baskets:[{id:"x",name:"X",point:[41.002,-86.998]},{id:"y",name:"Y",point:[41.002,-87]}],network:emptyFairways()};
    d.network=syncPairings(d.network,d.tees,d.baskets);d=automaticBendPoints(d);
    expect(connectNewFairways(d,new Set())).toEqual(d);
    const connected=connectNewFairways(d,new Set(["a/x"]));
    const shared=connected.network.routes["a/x"].nodes.filter(id=>connected.network.points[id]&&connected.network.routes["b/y"].nodes.includes(id));
    expect(shared).toHaveLength(1);
    expect(connected.network.points[shared[0]][0]).toBeCloseTo(41.001,5);
    expect(connected.tees).toEqual(d.tees);expect(connected.baskets).toEqual(d.baskets);
  });
  it("gives every route two deterministic handles without changing endpoints",()=>{
    const d=automaticBendPoints(draft());
    expect(Object.values(d.network.routes).every(r=>r.nodes.length>=4)).toBe(true);
    expect(automaticBendPoints(d)).toEqual(d);
    expect(d.tees).toEqual(draft().tees);
  });
  it("draws a smooth curve through actual handles and measures that exact curve",()=>{
    let d=automaticBendPoints(draft());const r=d.network.routes["a/z"];
    d={...d,network:moveFairwayPoint(d.network,r.nodes[1],[41.001,-87.001])};
    const p=curvedRoutePoints(d,"a/z");
    expect(p[0]).toEqual(d.tees[0].point);expect(p.at(-1)).toEqual(d.baskets[0].point);
    expect(p).toContainEqual(d.network.points[r.nodes[1]]);
    expect(routeDistance(d,"a/z")).toBe(Math.round(pathLengthFt(p)));
    const incoming=curvedFairwayEdge(d,r.nodes[0],r.nodes[1],1000),outgoing=curvedFairwayEdge(d,r.nodes[1],r.nodes[2],1000);
    const a=incoming.at(-2)!,b=incoming.at(-1)!,c=outgoing[1];
    const u=[b[0]-a[0],b[1]-a[1]],v=[c[0]-b[0],c[1]-b[1]];
    expect((u[0]*v[0]+u[1]*v[1])/(Math.hypot(...u)*Math.hypot(...v))).toBeGreaterThan(.999);
  });
  it("snaps a dragged bend to a nearby curve and preserves independent endpoints",()=>{
    let d=automaticBendPoints(draft());const id=d.network.routes["b/z"].nodes[1];
    d={...d,network:moveFairwayPoint(d.network,id,[41.001,-87.00001])};
    expect(nearbyFairway(d,"b/z",id,6)).not.toBeNull();
    const joined=snapFairwayBend(d,"b/z",id,()=>"point:j",6);
    expect(joined.network.routes["b/z"].nodes.slice(1,-1).some(n=>joined.network.routes["a/z"].nodes.includes(n))).toBe(true);
    expect(joined.tees).toEqual(d.tees);expect(joined.baskets).toEqual(d.baskets);
    const far={...d,network:moveFairwayPoint(d.network,id,[41.001,-87.01])};
    expect(snapFairwayBend(far,"b/z",id,()=>"point:far",6)).toEqual(far);
  });
  it("uses exactly the same curved coordinates for a shared segment in either direction",()=>{
    let d=draft();d.network=insertFairwayPoint(d.network,"a/z",0,[41.001,-87.001],"point:p");
    const a=curvedFairwayEdge(d,"point:p","basket:z"),b=curvedFairwayEdge(d,"basket:z","point:p").reverse();
    a.forEach((p,i)=>{expect(p[0]).toBeCloseTo(b[i][0],10);expect(p[1]).toBeCloseTo(b[i][1],10);});
  });
});
