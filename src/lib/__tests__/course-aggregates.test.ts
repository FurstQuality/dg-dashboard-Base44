import { describe, it, expect } from "vitest";
import {
  feetBetween,
  polylineFeet,
  summarizeHole,
  summarizeLayout,
  designHighlights,
  designGaps,
  pointInPolygon,
  holeLengthWarning,
  snapToNearbyVertex,
  SNAP_RADIUS_FT,
  type AggregateHole,
  type AggregateFeature,
} from "@/lib/course-aggregates";

const TEE: [number, number] = [40.7, -89.6];
// Roughly 1000 ft east of the tee at this latitude.
const BASKET: [number, number] = [40.7, -89.59637];

function hole(overrides: Partial<AggregateHole> = {}): AggregateHole {
  return {
    number: 1,
    par: 3,
    distance_ft: 300,
    tee: TEE,
    basket: BASKET,
    ...overrides,
  };
}

describe("feetBetween / polylineFeet", () => {
  it("measures a known east-west span in feet", () => {
    const ft = feetBetween(TEE, BASKET);
    expect(ft).toBeGreaterThan(900);
    expect(ft).toBeLessThan(1100);
  });

  it("returns 0 for a degenerate polyline and sums segments otherwise", () => {
    expect(polylineFeet([TEE])).toBe(0);
    const total = polylineFeet([TEE, BASKET, TEE]);
    expect(total).toBeCloseTo(feetBetween(TEE, BASKET) * 2, 0);
  });
});

describe("summarizeHole", () => {
  it("counts hazards scoped to that hole", () => {
    const features: AggregateFeature[] = [
      { type: "mando", points: [TEE], hole_numbers: [1] },
      { type: "dropzone", points: [TEE], hole_numbers: [1] },
      { type: "water", points: [TEE, BASKET], hole_numbers: [1] },
      { type: "mando", points: [TEE], hole_numbers: [2] },
    ];
    const summary = summarizeHole(hole(), features);
    expect(summary.mando_count).toBe(1);
    expect(summary.dropzone_count).toBe(1);
    expect(summary.water).toBe(true);
  });

  it("falls back to measured tee-to-basket distance when none is stored", () => {
    const summary = summarizeHole(hole({ distance_ft: null }), []);
    expect(summary.distance_ft ?? 0).toBeGreaterThan(900);
  });
});

describe("summarizeLayout", () => {
  const holes: AggregateHole[] = [
    hole({ number: 1, par: 3, distance_ft: 300 }),
    hole({ number: 2, par: 4, distance_ft: 700 }),
    hole({ number: 3, par: 3, distance_ft: null, tee: null, basket: null }),
  ];
  const features: AggregateFeature[] = [
    { type: "mando", points: [TEE], hole_numbers: [1] },
    { type: "ob_line", points: [TEE, BASKET], hole_numbers: [2] },
    { type: "ob_area", points: [TEE, BASKET, [40.71, -89.6]], hole_numbers: [2] },
    { type: "island_green", points: [TEE, BASKET, [40.71, -89.6]], hole_numbers: [2] },
  ];

  it("rolls up par, distance, and hazard totals", () => {
    const summary = summarizeLayout(holes, features);
    expect(summary.hole_count).toBe(3);
    expect(summary.mapped_hole_count).toBe(2);
    expect(summary.par_total).toBe(10);
    expect(summary.distance_total).toBe(1000);
    expect(summary.longest_hole_ft).toBe(700);
    expect(summary.shortest_hole_ft).toBe(300);
    expect(summary.mando_count).toBe(1);
    expect(summary.ob_area_count).toBe(1);
    expect(summary.island_green_count).toBe(1);
    expect(summary.ob_line_feet).toBeGreaterThan(900);
  });

  it("flags unmapped holes as a gap and describes real hazards as highlights", () => {
    const summary = summarizeLayout(holes, features);
    expect(designGaps(summary).join(" ")).toMatch(/hole/i);
    expect(designHighlights(summary).length).toBeGreaterThan(0);
  });

  it("reports no gaps once every hole is mapped", () => {
    const complete = summarizeLayout(
      [hole({ number: 1 }), hole({ number: 2, par: 4, distance_ft: 700 })],
      features,
    );
    expect(complete.mapped_hole_count).toBe(2);
    expect(designGaps(complete).join(" ")).not.toMatch(/no tee or basket|hole\(s\) still need/i);
  });
});

describe("builder guard rails", () => {
  const square: [number, number][] = [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
  ];

  it("detects points inside and outside a boundary", () => {
    expect(pointInPolygon([0.5, 0.5], square)).toBe(true);
    expect(pointInPolygon([1.5, 0.5], square)).toBe(false);
    expect(pointInPolygon([0.5, 0.5], [[0, 0]])).toBe(false);
  });

  it("warns only on implausible hole lengths", () => {
    expect(holeLengthWarning(300)).toBeNull();
    expect(holeLengthWarning(40)).toMatch(/only 40 ft/);
    expect(holeLengthWarning(2000)).toMatch(/unusually long/);
    expect(holeLengthWarning(0)).toBeNull();
  });
});

describe("snapToNearbyVertex", () => {
  it("snaps to the nearest vertex inside the radius", () => {
    const target: [number, number] = [40.0, -89.0];
    const near: [number, number] = [40.00001, -89.00001];
    expect(snapToNearbyVertex(near, [target], SNAP_RADIUS_FT)).toEqual(target);
  });

  it("leaves the point alone when nothing is close", () => {
    const far: [number, number] = [40.1, -89.1];
    const pt: [number, number] = [40.0, -89.0];
    expect(snapToNearbyVertex(pt, [far], SNAP_RADIUS_FT)).toEqual(pt);
  });
});
