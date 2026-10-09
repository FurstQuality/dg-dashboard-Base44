import { describe, expect, it } from "vitest";
import { projectToScreenSegment } from "./segment-projection";
describe("map segment placement", () => {
  it("places a point on the clicked segment and clamps to its endpoints", () => {
    expect(projectToScreenSegment({ x: 4, y: 8 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ x: 4, y: 0 });
    expect(projectToScreenSegment({ x: 20, y: 8 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ x: 10, y: 0 });
    expect(projectToScreenSegment({ x: 4, y: 8 }, { x: 2, y: 2 }, { x: 2, y: 2 })).toEqual({ x: 2, y: 2 });
  });
  it("is invariant under map translation and zoom scaling", () => {
    const point = { x: 4, y: 8 }, a = { x: 1, y: 2 }, b = { x: 9, y: 12 };
    const transform = (p: typeof point) => ({ x: p.x * 8 + 75, y: p.y * 8 - 46 });
    expect(projectToScreenSegment(transform(point), transform(a), transform(b))).toEqual(transform(projectToScreenSegment(point, a, b)));
  });
});
