import { describe, expect, it } from "vitest";
import { haversineMiles, rankByDistance } from "../play-geo";

describe("haversineMiles", () => {
  it("returns zero for the same point", () => {
    expect(haversineMiles({ lat: 40.7, lng: -89.6 }, { lat: 40.7, lng: -89.6 })).toBe(0);
  });

  it("approximates a known distance (Peoria → Chicago ≈ 130 mi)", () => {
    const d = haversineMiles({ lat: 40.6936, lng: -89.589 }, { lat: 41.8781, lng: -87.6298 });
    expect(d).toBeGreaterThan(120);
    expect(d).toBeLessThan(145);
  });
});

describe("rankByDistance", () => {
  const origin = { lat: 40.0, lng: -89.0 };

  it("sorts nearest first and limits results", () => {
    const rows = [
      { id: "far", latitude: 41.0, longitude: -89.0 },
      { id: "near", latitude: 40.05, longitude: -89.0 },
      { id: "mid", latitude: 40.4, longitude: -89.0 },
    ];
    const ranked = rankByDistance(rows, origin, 2);
    expect(ranked.map((r) => r.id)).toEqual(["near", "mid"]);
    expect(ranked[0]!.distanceMi).toBeLessThan(ranked[1]!.distanceMi);
  });

  it("drops courses without coordinates", () => {
    const ranked = rankByDistance(
      [
        { id: "nogeo", latitude: null, longitude: null },
        { id: "geo", latitude: 40.1, longitude: -89.0 },
      ],
      origin,
      5,
    );
    expect(ranked.map((r) => r.id)).toEqual(["geo"]);
  });
});
