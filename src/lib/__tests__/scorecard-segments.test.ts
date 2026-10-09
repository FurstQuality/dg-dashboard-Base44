import { describe, expect, it } from "vitest";
import {
  isSegmentBoundary,
  segmentLabel,
  segmentSize,
  segmentTotal,
  type SegmentHole,
} from "../scorecard-segments";

const holes = (count: number): SegmentHole[] =>
  Array.from({ length: count }, (_, i) => ({ number: i + 1, par: 3 }));

describe("scorecard segments", () => {
  it("skips subtotals on a single nine", () => {
    expect(segmentSize(9)).toBe(0);
    expect(isSegmentBoundary(8, 9)).toBe(false);
  });

  it("marks the boundary after each nine except the last hole", () => {
    expect(isSegmentBoundary(8, 18)).toBe(true);
    expect(isSegmentBoundary(17, 18)).toBe(false);
    expect(isSegmentBoundary(17, 27)).toBe(true);
    expect(isSegmentBoundary(4, 18)).toBe(false);
  });

  it("labels the familiar nines", () => {
    expect(segmentLabel(8)).toBe("Out");
    expect(segmentLabel(17)).toBe("In");
    expect(segmentLabel(26)).toBe("Seg");
  });

  it("totals only scored holes in the nine", () => {
    const scores = new Map<string, number>([
      ["p1:1", 3],
      ["p1:2", 4],
      ["p1:10", 5],
    ]);
    expect(segmentTotal(holes(18), scores, "p1", 8)).toBe(7);
    expect(segmentTotal(holes(18), scores, "p1", 17)).toBe(5);
  });

  it("returns null when the nine has no scores", () => {
    expect(segmentTotal(holes(18), new Map(), "p1", 8)).toBeNull();
  });
});
