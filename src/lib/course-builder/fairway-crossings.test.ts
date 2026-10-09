import { describe, expect, it } from "vitest";
import { combineFairwayCrossings } from "./fairway-crossings";
import { emptyFairways, syncPairings, routePoints, moveFairwayPoint, fairwayEdges, validateFairwayDraft, type FairwayDraft } from "./pairing-fairways";

function crossing():FairwayDraft {
  const tees=[{id:"a",name:"A",point:[41,-87] as [number,number],basketIds:["x"]},{id:"b",name:"B",point:[41,-86.998] as [number,number],basketIds:["y"]}];
  const baskets=[{id:"x",name:"X",point:[41.002,-86.998] as [number,number]},{id:"y",name:"Y",point:[41.002,-87] as [number,number]}];
  return {tees,baskets,network:syncPairings(emptyFairways(),tees,baskets)};
}
describe("automatic fairway junctions",()=>{
  it("joins an X crossing without changing either start or destination",()=>{
    const original=crossing(),draft=combineFairwayCrossings(original);
    const junction=draft.network.routes["a/x"].nodes[1];
    expect(draft.network.routes["b/y"].nodes[1]).toBe(junction);
    expect(routePoints(draft,"a/x")[0]).toEqual(original.tees[0].point);
    expect(routePoints(draft,"b/y").at(-1)).toEqual(original.baskets[1].point);
    expect(validateFairwayDraft(draft)).toEqual([]);
    expect(original.network.points).toEqual({});
    expect(combineFairwayCrossings(draft)).toEqual(draft);
  });
  it("moving a junction bends every participating route",()=>{
    const draft=combineFairwayCrossings(crossing());
    draft.network=moveFairwayPoint(draft.network,draft.network.routes["a/x"].nodes[1],[41.0012,-86.999]);
    expect(routePoints(draft,"a/x")).toContainEqual([41.0012,-86.999]);
    expect(routePoints(draft,"b/y")).toContainEqual([41.0012,-86.999]);
  });
  it("joins overlapping sections with different bend identities",()=>{
    const draft=crossing();
    draft.network.points={"point:a":[41.0005,-86.999],"point:b":[41.0015,-86.999],"point:c":[41.0005,-86.999],"point:d":[41.0015,-86.999]};
    draft.network.routes["a/x"].nodes=["tee:a","point:a","point:b","basket:x"];
    draft.network.routes["b/y"].nodes=["tee:b","point:c","point:d","basket:y"];
    const joined=combineFairwayCrossings(draft);
    expect(fairwayEdges(joined.network).some(e=>e.routes.length===2)).toBe(true);
    expect(validateFairwayDraft(joined)).toEqual([]);
    expect(combineFairwayCrossings(joined)).toEqual(joined);
  });
  it("keeps near parallel routes separate",()=>{
    const draft=crossing();draft.baskets[0].point=[41.002,-87];draft.baskets[1].point=[41.002,-86.998];
    expect(combineFairwayCrossings(draft).network.points).toEqual({});
  });
  it("joins a bend touching another route",()=>{
    const draft=crossing();draft.network.points={"point:touch":[41.001,-86.999]};
    draft.network.routes["a/x"].nodes.splice(1,0,"point:touch");
    const joined=combineFairwayCrossings(draft);
    expect(joined.network.routes["b/y"].nodes).toContain("point:touch");
    expect(validateFairwayDraft(joined)).toEqual([]);
  });
});
