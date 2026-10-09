import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CourseMapSign } from "@/components/tee-signs/course-map-sign";
import { ProSign } from "@/components/tee-signs/pro-sign";
import { projectHole, signReadiness } from "@/lib/tee-sign-pro";
import { courseRoutePreview } from "./course-route";
import {
  applyStudioFairways,
  studioFairways,
  writeTeePaths,
  writeBasketPath,
  type StudioHole,
} from "./studio-fairways";
import { createFairwayGeometry } from "./fairway-curves";
import { pathLengthFt } from "./geometry";
import { setPairScoring } from "./pair-scoring";
import { courseFeaturesForLayout } from "./layout-rules";

const fixture = () => {
  const hole: StudioHole = {
    par: 3,
    tee: [41, -87],
    basket: [41.002, -87],
    tee_name: "Blue",
    basket_name: "A",
    tee_color: "#2563eb",
    flight_path: [[41.001, -87.002]],
    extra_tees: [{ tempId: "red", name: "Red", color: "#dc2626", lat: 41.0003, lng: -87.001 }],
    extra_baskets: [{ tempId: "b", name: "B", color: "#a3e635", lat: 41.003, lng: -87.001 }],
  };
  const saved = applyStudioFairways(hole, studioFairways(hole));
  const row = {
    par: 3,
    tee_lat: 41,
    tee_lng: -87,
    basket_lat: 41.002,
    basket_lng: -87,
    flight_path: saved.flight_path,
  };
  const tees = saved.extra_tees.map((pin) => ({
    id: pin.tempId,
    name: pin.name,
    latitude: pin.lat,
    longitude: pin.lng,
    flight_path: writeTeePaths(pin),
  }));
  const baskets = saved.extra_baskets.map((pin) => ({
    id: pin.tempId,
    name: pin.name,
    latitude: pin.lat,
    longitude: pin.lng,
    split_point: writeBasketPath(pin),
  }));
  return { saved, row, tees, baskets };
};

describe("course map and sign geometry", () => {
  it("shares course ground, preserves selected rules, and excludes event-only features", () => {
    const ground = {
      type: "woods",
      geometry: {
        points: [
          [41, -87],
          [41.001, -87],
          [41.001, -87.001],
        ],
      },
      label: "Woods",
      layer: "base",
    };
    const features = [
      { ...ground, id: "old-copy", layout_id: "other" },
      { ...ground, id: "own-copy", layout_id: "current" },
      { id: "own-rule", type: "ob_line", layout_id: "current", geometry: ground.geometry },
      { id: "other-rule", type: "ob_line", layout_id: "other", geometry: ground.geometry },
      {
        id: "event-rule",
        type: "mando",
        layout_id: "current",
        layer: "event",
        geometry: ground.geometry,
      },
    ];
    expect(courseFeaturesForLayout(features, "current", null).map((feature) => feature.id)).toEqual(
      ["own-copy", "own-rule"],
    );
    expect(
      courseFeaturesForLayout(features, "current", ["own-rule", "other-rule", "event-rule"]).map(
        (feature) => feature.id,
      ),
    ).toEqual(["own-copy", "own-rule", "other-rule"]);
    expect(features.map((feature) => feature.id)).toEqual([
      "old-copy",
      "own-copy",
      "own-rule",
      "other-rule",
      "event-rule",
    ]);
  });
  it("resolves the same saved shared-network samples and length as Course Studio", () => {
    const { saved, row, tees, baskets } = fixture();
    const preview = courseRoutePreview(row, tees, baskets);
    const geometry = createFairwayGeometry(studioFairways(saved));
    expect(preview.curve).toEqual(geometry.route("main-tee/main-basket"));
    expect(preview.distance).toBe(Math.round(pathLengthFt(preview.curve!)));
    expect(preview.source).toBe("mapped");
    const sign = projectHole(
      { tee: saved.tee!, basket: saved.basket!, routeCurve: preview.curve, features: [] },
      400,
      700,
    );
    expect(sign.line).toEqual(preview.curve!.map(sign.project));
    expect(sign.line.length).toBe(preview.curve!.length);
    expect(sign.line.every(([x, y]) => x >= 0 && x <= 400 && y >= 0 && y <= 700)).toBe(true);
  });

  it("includes the complete dogleg in whole-course sign bounds", () => {
    const { row, tees, baskets } = fixture();
    const preview = courseRoutePreview(row, tees, baskets);
    const svg = renderToStaticMarkup(
      createElement(CourseMapSign, {
        courseName: "Dogleg",
        features: [],
        holes: [
          {
            number: 1,
            par: 3,
            tee: [41, -87],
            basket: [41.002, -87],
            routeCurve: preview.curve,
          },
        ],
      }),
    );
    const path = svg.match(/d="(M[^"]+)" fill="none" stroke="#ffffff" stroke-width="2.5"/)?.[1];
    expect(path).toBeDefined();
    const points = [...path!.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((match) => [
      Number(match[1]),
      Number(match[2]),
    ]);
    expect(points).toHaveLength(preview.curve!.length);
    expect(points.every(([x, y]) => x >= 50 && x <= 750 && y >= 70 && y <= 550)).toBe(true);
    expect(new Set(points.map(([x]) => x)).size).toBeGreaterThan(2);
  });

  it("prints mapped pair distances and each pairing's own par or measured override", () => {
    const { saved, row } = fixture();
    const scored = setPairScoring(saved, "red", "b", { par: 5, distanceOverride: 888 });
    const preview = courseRoutePreview(
      row,
      scored.extra_tees.map((pin) => ({
        id: pin.tempId,
        name: pin.name,
        latitude: pin.lat,
        longitude: pin.lng,
        flight_path: writeTeePaths(pin),
      })),
      scored.extra_baskets.map((pin) => ({
        id: pin.tempId,
        name: pin.name,
        latitude: pin.lat,
        longitude: pin.lng,
        split_point: writeBasketPath(pin),
      })),
    );
    expect(preview.pairs?.["red/b"]).toMatchObject({
      distance: 888,
      par: 5,
      distanceOverride: 888,
    });
    const svg = renderToStaticMarkup(
      createElement(ProSign, {
        courseName: "Shared routes",
        features: [],
        design: { showQr: false },
        urls: {},
        qrUrl: "https://example.test/course",
        hole: {
          number: 1,
          par: 3,
          distanceFt: preview.distance,
          tee: saved.tee,
          basket: saved.basket,
          routeCurve: preview.curve,
          pairDistances: preview.pairs,
          tees: [
            { id: "main-tee", name: "Blue", at: saved.tee! },
            { id: "red", name: "Red", at: [41.0003, -87.001] },
          ],
          baskets: [
            { id: "main-basket", name: "A", at: saved.basket! },
            { id: "b", name: "B", at: [41.003, -87.001] },
          ],
        },
      }),
    );
    expect(svg).toContain(`>${preview.distance}′</text>`);
    expect(svg).toContain(">888′</text>");
    expect(svg).toContain("Par 5 · measured");
    expect(svg).toContain("Par —");
  });

  it("does not substitute a straight fairway when saved geometry is corrupt", () => {
    const { row, tees, baskets } = fixture();
    const preview = courseRoutePreview({ ...row, flight_path: [[100, -87]] }, tees, baskets);
    expect(preview).toMatchObject({ curve: null, distance: null, source: "unknown" });
    expect(preview.issue).toBeTruthy();
    expect(
      signReadiness({
        tee: [41, -87],
        basket: [41.002, -87],
        parConfirmed: true,
        routeReady: !!preview.curve,
      }),
    ).toBe("needs_route");
    const sign = projectHole(
      { tee: [41, -87], basket: [41.002, -87], routeCurve: preview.curve, features: [] },
      400,
      700,
    );
    expect(sign.line).toEqual([]);
    expect(sign.fairway).toEqual([]);
    expect([...sign.tee, ...sign.basket]).toSatisfy((coordinates: number[]) =>
      coordinates.every(Number.isFinite),
    );
  });

  it("keeps missing endpoints, unassigned pairings and corrupt alternate routes unknown", () => {
    const { row, tees, baskets } = fixture();
    expect(courseRoutePreview({ ...row, tee_lng: null }, tees, baskets)).toEqual({
      curve: null,
      distance: null,
      source: "unknown",
    });
    const excluded = tees.map((pin) => ({
      ...pin,
      flight_path: { ...(pin.flight_path as object), main_basket_ids: ["b"] },
    }));
    expect(courseRoutePreview(row, excluded, baskets)).toMatchObject({
      curve: null,
      distance: null,
      source: "unknown",
      issue: "This tee is not assigned to the selected basket.",
    });
    // Invalid versioned values are rejected rather than interpreted as empty paths.
    expect(
      courseRoutePreview(
        row,
        [
          {
            ...tees[0],
            flight_path: {
              version: 1,
              routes: { b: { nodes: ["point:p"], points: { "point:p": [NaN, -87] } } },
            },
          },
        ],
        baskets,
      ).source,
    ).toBe("unknown");
  });
});
