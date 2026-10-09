import { describe, expect, it } from "vitest";
import {
  buildLayoutMeasurements,
  layoutSlotMeasurement,
  layoutMeasuredTotals,
  type RouteHoleRow,
} from "./layout-measurements";
import {
  bulkSwap,
  layoutReadiness,
  restoreLayoutVersion,
  validateLayout,
  type Asset,
  type Slot,
} from "./layouts";
import { createFairwayGeometry } from "./fairway-curves";
import {
  applyStudioFairways,
  readPrimaryPath,
  readTeePaths,
  readBasketPath,
  studioFairways,
  writeBasketPath,
  type StudioHole,
} from "./studio-fairways";
import { setPairScoring } from "./pair-scoring";
import { routeDistance, moveFairwayPoint } from "./pairing-fairways";

const fixture = () => {
  const slot: Slot = {
    id: "slot",
    legacy_hole_id: "legacy",
    position: 1,
    display_label: "1",
    course_hole_id: "physical",
    tee_id: "blue",
    basket_id: "a",
    par: 3,
    included: true,
    rules: [{ kind: "hazard" }],
  };
  const tees = new Map<string, Asset>([
    [
      "blue",
      { id: "blue", course_hole_id: "physical", name: "Blue", latitude: 41, longitude: -87 },
    ],
    [
      "red",
      { id: "red", course_hole_id: "physical", name: "Red", latitude: 41.0002, longitude: -87.001 },
    ],
  ]);
  const baskets = new Map<string, Asset>([
    ["a", { id: "a", course_hole_id: "physical", name: "A", latitude: 41.002, longitude: -87 }],
  ]);
  const hole: StudioHole = {
    par: 3,
    tee: [41, -87],
    basket: [41.002, -87],
    tee_name: "Blue",
    basket_name: "A",
    tee_color: "#2563eb",
    flight_path: [[41.001, -87.002]],
    extra_tees: [],
    extra_baskets: [],
  };
  const row: RouteHoleRow = {
    id: "legacy",
    par: 3,
    tee_lat: 41,
    tee_lng: -87,
    basket_lat: 41.002,
    basket_lng: -87,
    flight_path: hole.flight_path,
  };
  return { slot, tees, baskets, hole, row };
};

describe("course-builder completion regressions", () => {
  it("shows the dogleg's curved length in Layout Studio, rather than its direct distance", () => {
    const { slot, tees, baskets, hole, row } = fixture();
    const measurements = buildLayoutMeasurements([slot], tees, baskets, [row], [], []);
    const measured = layoutSlotMeasurement(slot, tees, baskets, measurements);
    expect(measured.source).toBe("mapped");
    expect(measured.distance).toBe(routeDistance(studioFairways(hole), "main-tee/main-basket"));
    expect(measured.distance).toBeGreaterThan(layoutSlotMeasurement(slot, tees, baskets).distance!);
    expect(layoutMeasuredTotals([slot], tees, baskets, measurements).directHoles).toBe(0);
  });

  it("does not reuse a Blue route when a draft slot selects Red", () => {
    const { slot, tees, baskets, row } = fixture();
    const measurements = buildLayoutMeasurements([slot], tees, baskets, [row], [], []);
    const changed = { ...slot, tee_id: "red" };
    expect(layoutSlotMeasurement(changed, tees, baskets, measurements).source).toBe("direct");
    expect(buildLayoutMeasurements([changed], tees, baskets, [row], [], []).size).toBe(0);
  });

  it("does not present a partial sum as a complete layout distance", () => {
    const { slot, tees, baskets, row } = fixture();
    const slots = [slot, { ...slot, id: "unmapped", position: 2, tee_id: "missing" }];
    const measurements = buildLayoutMeasurements(slots, tees, baskets, [row], [], []);
    expect(layoutMeasuredTotals(slots, tees, baskets, measurements)).toMatchObject({
      distanceFt: null,
      measuredHoles: 1,
    });
  });

  it("retains a distinct measured distance and reports malformed route geometry as unknown", () => {
    const { slot, tees, baskets, row } = fixture();
    let measurements = buildLayoutMeasurements(
      [slot],
      tees,
      baskets,
      [{ ...row, distance_ft: 1800 }],
      [],
      [],
    );
    expect(layoutSlotMeasurement(slot, tees, baskets, measurements)).toEqual({
      distance: 1800,
      source: "measured",
    });
    measurements = buildLayoutMeasurements(
      [slot],
      tees,
      baskets,
      [{ ...row, flight_path: [[NaN, -87]] }],
      [],
      [],
    );
    expect(layoutSlotMeasurement(slot, tees, baskets, measurements)).toMatchObject({
      distance: null,
      source: "unknown",
    });
  });

  it("retains explicit mapped-distance metadata even if the legacy distance column is stale", () => {
    const { slot, tees, baskets, hole, row } = fixture();
    hole.extra_baskets = [{ tempId: "alternate", name: "B", color: "#fff", lat: 41.003, lng: -87 }];
    const saved = applyStudioFairways(hole, studioFairways(hole));
    const measurements = buildLayoutMeasurements(
      [slot],
      tees,
      baskets,
      [{ ...row, flight_path: saved.flight_path, distance_ft: 1800 }],
      [],
      [
        {
          id: "alternate",
          hole_id: "legacy",
          name: "B",
          latitude: 41.003,
          longitude: -87,
          split_point: writeBasketPath(saved.extra_baskets[0]),
        },
      ],
    );
    expect(layoutSlotMeasurement(slot, tees, baskets, measurements).source).toBe("mapped");
    expect(layoutSlotMeasurement(slot, tees, baskets, measurements).distance).toBe(
      routeDistance(studioFairways(saved), "main-tee/main-basket"),
    );
  });

  it("requires review of par and route when a bulk swap changes the pairing", () => {
    const { slot, tees } = fixture();
    const changed = bulkSwap([{ ...slot, flight_path: [[41.001, -87.002]] }], "tee", "Red", [
      ...tees.values(),
    ]);
    expect(changed.slots[0]).toMatchObject({
      tee_id: "red",
      par: null,
      flight_path: null,
      rules: slot.rules,
    });
    expect(slot.par).toBe(3);
    expect(bulkSwap([slot], "tee", "Blue", [...tees.values()]).slots[0]).toBe(slot);
  });

  it("detects invalid pars, unavailable assets, and non-finite map coordinates", () => {
    const { slot, tees, baskets } = fixture();
    const invalid = { ...slot, par: 3.5 };
    expect(validateLayout([invalid], tees, baskets).some((issue) => issue.level === "error")).toBe(
      true,
    );
    expect(layoutReadiness([invalid], tees, baskets).scoring.ready).toBe(false);
    expect(layoutReadiness([{ ...slot, tee_id: "missing" }], tees, baskets).scoring.ready).toBe(
      false,
    );
    tees.set("blue", { ...tees.get("blue")!, latitude: Infinity });
    expect(layoutReadiness([slot], tees, baskets).map.ready).toBe(false);
  });

  it("restores each occurrence of a repeated physical hole to a distinct slot", () => {
    const { slot } = fixture();
    const current = [
      slot,
      { ...slot, id: "second", position: 2, display_label: "2", rules: [{ kind: "ob" }] },
      { ...slot, id: "third", position: 3, display_label: "3" },
    ];
    const snapshot = [
      {
        position: 1,
        label: "1",
        course_hole_id: "physical",
        tee_id: "blue",
        basket_id: "a",
        par: 3,
        rules: [{ kind: "mando" }],
      },
      {
        position: 2,
        label: "2",
        course_hole_id: "physical",
        tee_id: "red",
        basket_id: "a",
        par: 4,
      },
    ];
    const restored = restoreLayoutVersion(current, snapshot);
    expect(restored.map((item) => item.id)).toEqual(["slot", "second", "third"]);
    expect(restored[0].rules).toEqual([{ kind: "mando" }]);
    expect(restored[1].legacy_hole_id).toBeNull();
    expect(restored[2].included).toBe(false);
    expect(current[0].rules).toEqual(slot.rules);
  });

  it("rejects corrupt published versions without changing the current layout", () => {
    const { slot } = fixture();
    expect(() => restoreLayoutVersion([slot], [{ position: 1, label: "1" }])).toThrow(
      "invalid hole",
    );
    expect(() =>
      restoreLayoutVersion(
        [slot],
        [
          {
            position: 1,
            label: "1",
            course_hole_id: "physical",
            tee_id: "blue",
            basket_id: "a",
            par: 3,
            flight_path: [[100, -87]],
          },
        ],
      ),
    ).toThrow("invalid hole");
    expect(slot.included).toBe(true);
  });

  it("rejects invalid archived route data before it can be overwritten by a save", () => {
    const bad = { nodes: ["point:p"], points: { "point:p": [100, -87] } };
    expect(() => readTeePaths({ version: 1, routes: { "unassigned-basket": bad } })).toThrow(
      "Original paths",
    );
    expect(() =>
      readBasketPath({ version: 1, basket_connections: [{ from: "a", to: "b", path: bad }] }),
    ).toThrow("Original paths");
    expect(() =>
      readTeePaths({
        version: 1,
        routes: { b: { nodes: ["point:p", "point:p"], points: { "point:p": [41, -87] } } },
      }),
    ).toThrow("Original paths");
  });

  it("rejects malformed legacy bends instead of dropping coordinates on the next save", () => {
    for (const path of [
      [
        [41, -87],
        [100, -87],
      ],
      [[NaN, -87]],
      { version: 99 },
      "broken",
    ]) {
      expect(() => readPrimaryPath(path)).toThrow("Original paths");
      expect(() => readTeePaths(path)).toThrow();
    }
    expect(() => readBasketPath({ version: 1, split: [100, -87] })).toThrow("Original paths");
    expect(readPrimaryPath(null)).toEqual([]);
  });

  it("keeps Layout Studio's supported par 7 through pair scoring and JSON reload", () => {
    const { hole } = fixture();
    hole.extra_baskets = [{ tempId: "alternate", name: "B", color: "#fff", lat: 41.003, lng: -87 }];
    const saved = applyStudioFairways(
      setPairScoring(hole, "main-tee", "main-basket", { par: 7 }),
      studioFairways(hole),
    );
    expect(readBasketPath(writeBasketPath(saved.extra_baskets[0])).trunk_path?.scoring?.par).toBe(
      7,
    );
    expect(() => setPairScoring(hole, "main-tee", "main-basket", { par: 8 })).toThrow();
  });

  it.each(["tee", "basket"] as const)(
    "keeps the primary route's bends and identities when its %s is temporarily unplaced",
    (endpoint) => {
      const { hole } = fixture();
      hole.extra_baskets = [{ tempId: "other", name: "B", color: "#fff", lat: 41.003, lng: -87 }];
      const saved = applyStudioFairways(hole, studioFairways(hole));
      const before = studioFairways(saved).network.routes["main-tee/main-basket"].nodes;
      const hidden = { ...saved, [endpoint]: null };
      const applied = applyStudioFairways(hidden, studioFairways(hidden));
      expect(applied.flight_path).toEqual(saved.flight_path);
      const restored = studioFairways({ ...applied, [endpoint]: hole[endpoint] });
      expect(restored.network.routes["main-tee/main-basket"].nodes).toEqual(before);
      expect(readBasketPath(writeBasketPath(applied.extra_baskets[0])).trunk_path).toEqual(
        saved.extra_baskets[0].trunk_path,
      );
    },
  );

  it("reuses sampled edges within a draft and rebuilds after a shared bend moves", () => {
    const { hole } = fixture();
    const draft = studioFairways(hole),
      route = draft.network.routes["main-tee/main-basket"];
    const geometry = createFairwayGeometry(draft),
      [a, b] = route.nodes;
    const edge = geometry.edge(a, b);
    expect(geometry.edge(a, b)).toBe(edge);
    expect(geometry.edge(b, a)).toEqual([...edge].reverse());
    const moved = { ...draft, network: moveFairwayPoint(draft.network, b, [41.001, -87.004]) };
    expect(createFairwayGeometry(moved).distance("main-tee/main-basket")).not.toBe(
      geometry.distance("main-tee/main-basket"),
    );
    expect(draft.network.points[b]).not.toEqual(moved.network.points[b]);
  });
});
