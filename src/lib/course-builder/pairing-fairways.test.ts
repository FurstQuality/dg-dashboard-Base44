import { describe, expect, it } from "vitest";
import { emptyFairways, syncPairings, pairKey, insertFairwayPoint, moveFairwayPoint, shareFairwaySection, detachFairwaySection, detachFairwayPoint, routePoints, validateFairwayDraft, fairwayEdges, routeDistance, nearestFairwaySegment, separateFairway, straightenFairway, joinFairwayPoint, type FairwayDraft } from "./pairing-fairways";

function fixture(): FairwayDraft {
  const tees = ["t1", "t2"].map((id, i) => ({ id, name: id, point: [40 + i * .001, -90] as [number, number] }));
  const baskets = ["b1", "b2", "b3"].map((id, i) => ({ id, name: id, point: [40 + i * .001, -89.995] as [number, number] }));
  return { tees, baskets, network: syncPairings(emptyFairways(), tees, baskets) };
}
const a = pairKey("t1", "b1"), b = pairKey("t2", "b2");
function joined() {
  const d = fixture();
  for (const key of [a, b]) {
    d.network = insertFairwayPoint(d.network, key, 0, [40, -89.999], `point:${key}-start`);
    d.network = insertFairwayPoint(d.network, key, 1, [40, -89.996], `point:${key}-end`);
  }
  d.network = shareFairwaySection(d.network, a, `point:${a}-start`, `point:${a}-end`, b, `point:${b}-start`, `point:${b}-end`);
  return d;
}
describe("independent tee × basket fairways", () => {
  it("repairs an entire shared route without changing other routes", () => {
    const d=joined(), original=routePoints(d,a), other=routePoints(d,b);
    let id=0;
    d.network=separateFairway(d.network,a,()=>`point:repair${id++}`);
    expect(routePoints(d,a)).toEqual(original);
    expect(fairwayEdges(d.network).filter(e=>e.routes.length>1)).toHaveLength(0);
    d.network=straightenFairway(d.network,a);
    expect(routePoints(d,a)).toEqual([original[0],original.at(-1)]);
    expect(routePoints(d,b)).toEqual(other);
    expect(validateFairwayDraft(d)).toEqual([]);
  });
  it("rejects joins that loop through the same route or replace a tee endpoint", () => {
    const d=joined();
    expect(()=>joinFairwayPoint(d.network,a,`point:${b}-start`,`point:${b}-end`)).toThrow('loop');
    expect(()=>joinFairwayPoint(d.network,a,'tee:t1',`point:${b}-end`)).toThrow();
  });
  it("creates all six routes, retains geometry when a seventh pin pairing is added", () => {
    const d = fixture();
    expect(Object.keys(d.network.routes)).toHaveLength(6);
    d.network = insertFairwayPoint(d.network, a, 0, [40.001, -89.998], "point:bend");
    d.baskets.push({ id: "b4", name: "B4", point: [40, -89.994] });
    d.network = syncPairings(d.network, d.tees, d.baskets);
    expect(Object.keys(d.network.routes)).toHaveLength(8);
    expect(d.network.routes[a].nodes).toContain("point:bend");
    expect(validateFairwayDraft(d)).toEqual([]);
  });
  it("moving a pin updates every endpoint without moving unrelated bends", () => {
    const d = joined(); d.tees[0].point = [40.002, -90];
    for (const basket of d.baskets) expect(routePoints(d, pairKey("t1", basket.id))[0]).toEqual(d.tees[0].point);
    expect(d.network.points[`point:${b}-start`]).toEqual([40, -89.999]);
  });
  it("draws a linked edge once, inserts a shared bend and moves it on both routes", () => {
    const d = joined();
    expect(fairwayEdges(d.network).filter(e => e.routes.length === 2)).toHaveLength(1);
    d.network = insertFairwayPoint(d.network, a, 1, [40.001, -89.998], "point:shared");
    d.network = moveFairwayPoint(d.network, "point:shared", [40.002, -89.997]);
    expect(routePoints(d, a)).toContainEqual([40.002, -89.997]);
    expect(routePoints(d, b)).toContainEqual([40.002, -89.997]);
    expect(validateFairwayDraft(d)).toEqual([]);
  });
  it("splits a shared stretch and rejoins it repeatedly without changing other paths", () => {
    const d = joined(), original = routePoints(d, b);
    for (let i = 0; i < 3; i++) {
      d.network = detachFairwaySection(d, a, `point:${b}-start`, `point:${b}-end`, () => `point:branch${i}`);
      d.network = moveFairwayPoint(d.network, `point:branch${i}`, [40.003, -89.998]);
      expect(routePoints(d, b)).toEqual(original);
      expect(fairwayEdges(d.network).filter(e => e.routes.length === 2)).toHaveLength(0);
      d.network = shareFairwaySection(d.network, a, `point:${b}-start`, `point:${b}-end`, b, `point:${b}-start`, `point:${b}-end`);
      expect(fairwayEdges(d.network).filter(e => e.routes.length === 2)).toHaveLength(1);
      expect(validateFairwayDraft(d)).toEqual([]);
    }
  });
  it("can detach one shared point, and serialization keeps shared identity", () => {
    const d = joined();
    d.network = detachFairwayPoint(d.network, a, `point:${b}-start`, "point:private");
    d.network = moveFairwayPoint(d.network, "point:private", [40.003, -89.999]);
    expect(routePoints(d, b)).not.toContainEqual([40.003, -89.999]);
    expect(validateFairwayDraft(JSON.parse(JSON.stringify(d)))).toEqual([]);
  });
  it("measures the route, not the straight-line pin distance", () => {
    const d = fixture(), direct = routeDistance(d, a);
    d.network = insertFairwayPoint(d.network, a, 0, [40.005, -89.998], "point:detour");
    expect(routeDistance(d, a)).toBeGreaterThan(direct);
    const projected = nearestFairwaySegment([[40, -90], [40, -89.99]], [40.001, -89.995]);
    expect(projected.point).toEqual([40, -89.995]);
  });
  it("rejects endpoint merges, reversed intervals and invalid coordinates", () => {
    const d = joined();
    expect(() => shareFairwaySection(d.network, a, "tee:t1", `point:${b}-end`, b, `point:${b}-start`, `point:${b}-end`)).toThrow();
    expect(() => detachFairwaySection(d, a, `point:${b}-end`, `point:${b}-start`, () => "point:x")).toThrow();
    expect(() => moveFairwayPoint(d.network, `point:${b}-start`, [NaN, 0])).toThrow();
    expect(() => detachFairwaySection(d, a, `point:${b}-start`, `point:${b}-end`, () => `point:${b}-start`)).toThrow();
  });
});
