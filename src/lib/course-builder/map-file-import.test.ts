import { describe, expect, it } from "vitest";
import { parseGeoJson, parseMapFile } from "./map-file-import";

describe("parseGeoJson", () => {
  it("flips lng/lat and drops the closing polygon point", () => {
    const r = parseGeoJson(JSON.stringify({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { name: "Tee 1" }, geometry: { type: "Point", coordinates: [-87.1, 41.5] } },
        { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
      ],
    }));
    expect(r.shapes[0]).toEqual({ kind: "point", name: "Tee 1", points: [[41.5, -87.1]] });
    expect(r.shapes[1].points).toHaveLength(3);
  });
  it("skips invalid coordinates", () => {
    const r = parseGeoJson(JSON.stringify({ type: "Point", coordinates: [500, 0] }));
    expect(r.shapes).toHaveLength(0);
    expect(r.skipped).toBe(1);
  });
  it("rejects unsupported files", () => {
    expect(() => parseMapFile("map.kmz", "")).toThrow();
  });
});
