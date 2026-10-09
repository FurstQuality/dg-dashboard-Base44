import { describe, expect, it } from "vitest";
import { buildHoleRouteNetwork, type HoleRouteNetworkInput } from "./route-network";

const blue: [number, number] = [41.562, -87.142];
const red: [number, number] = [41.5618, -87.1424];
const merge: [number, number] = [41.5624, -87.1416];
const split: [number, number] = [41.5629, -87.1411];
const basketA: [number, number] = [41.5632, -87.1408];
const basketC: [number, number] = [41.5631, -87.14035];

function rogersStyleHole(): HoleRouteNetworkInput {
  return {
    holeId: "rogers-hole-1",
    holeNumber: 1,
    mainTee: { id: "tee-blue-1", name: "Blue", point: blue },
    mainBasket: { id: "basket-a-1", name: "A", point: basketA },
    mainBends: [merge, split],
    extraTees: [
      {
        id: "tee-red-1",
        name: "Red",
        point: red,
        routeMode: "joins",
        bends: [merge],
      },
    ],
    extraBaskets: [
      {
        id: "basket-c-1",
        name: "C",
        point: basketC,
        splitPoint: split,
      },
    ],
  };
}

describe("course route network", () => {
  it("keeps alternate asset identities when main assets are inactive", () => {
    const input = rogersStyleHole();
    input.mainTee.active = false;
    input.mainBasket.active = false;
    const network = buildHoleRouteNetwork(input);
    expect(network.summary.expectedPairings).toBe(1);
    expect(network.pairings[0].path[0]).toEqual(red);
    expect(network.pairings[0].path.at(-1)).toEqual(basketC);
    expect(network.segments.some((segment) => segment.kind === "basket-branch")).toBe(true);
  });

  it("counts unplaced active assets as missing pairings", () => {
    const input = rogersStyleHole();
    input.extraTees![0].point = null;
    const network = buildHoleRouteNetwork(input);
    expect(network.summary).toMatchObject({ expectedPairings: 4, completePairings: 2, missingPairings: 2 });
    expect(network.tees).toHaveLength(2);
  });

  it("retains required pairings when the main route is unplaced", () => {
    const input = rogersStyleHole();
    input.mainBasket.point = null;
    expect(buildHoleRouteNetwork(input).summary).toMatchObject({ expectedPairings: 4, completePairings: 0, missingPairings: 4 });
  });

  it.each([[], [red], [blue, basketA], [red, [NaN, 0], basketC]].map((path) => ({ path })))(
    "rejects an override that does not connect its selected assets ($path)",
    ({ path }) => {
      const input = rogersStyleHole();
      input.routeOverrides = [{ teeId: "tee-red-1", basketId: "basket-c-1", path: path as [number, number][] }];
      const network = buildHoleRouteNetwork(input);
      expect(network.pairings.find((pairing) => pairing.id === "tee-red-1->basket-c-1")).toMatchObject({
        complete: false, issueCode: "invalid_route_override", segmentIds: [], distanceFt: null,
      });
    },
  );

  it("resolves every active tee to every active basket without duplicating the shared fairway", () => {
    const network = buildHoleRouteNetwork(rogersStyleHole());

    expect(network.summary.expectedPairings).toBe(4);
    expect(network.summary.completePairings).toBe(4);
    expect(network.summary.missingPairings).toBe(0);
    expect(network.pairings.map((pairing) => pairing.id).sort()).toEqual([
      "tee-blue-1->basket-a-1",
      "tee-blue-1->basket-c-1",
      "tee-red-1->basket-a-1",
      "tee-red-1->basket-c-1",
    ]);

    const sharedTrunk = network.segments.find(
      (segment) =>
        segment.kind === "shared-fairway" &&
        segment.path[0][0] === merge[0] &&
        segment.path[segment.path.length - 1][0] === split[0],
    );
    expect(sharedTrunk?.pairingIds.sort()).toEqual([
      "tee-blue-1->basket-a-1",
      "tee-blue-1->basket-c-1",
      "tee-red-1->basket-a-1",
      "tee-red-1->basket-c-1",
    ]);

    const cBranch = network.segments.find((segment) => segment.kind === "basket-branch" && segment.id.startsWith("basket:basket-c-1"));
    expect(cBranch?.pairingIds.sort()).toEqual(["tee-blue-1->basket-c-1", "tee-red-1->basket-c-1"]);
  });

  it("flags a basket branch that splits before a tee has merged", () => {
    const input = rogersStyleHole();
    const network = buildHoleRouteNetwork({
      ...input,
      extraBaskets: [{ id: "basket-short-1", name: "Short", point: basketC, splitPoint: blue }],
    });

    const redToShort = network.pairings.find((pairing) => pairing.id === "tee-red-1->basket-short-1");
    expect(redToShort?.complete).toBe(false);
    expect(redToShort?.issueCode).toBe("basket_splits_before_tee_merge");
    expect(network.issues.some((issue) => issue.code === "basket_splits_before_tee_merge")).toBe(true);
  });

  it("requires explicit basket overrides for tees with their own independent fairway", () => {
    const input = rogersStyleHole();
    const network = buildHoleRouteNetwork({
      ...input,
      extraTees: [
        {
          id: "tee-gold-1",
          name: "Gold",
          point: [41.5615, -87.1428],
          routeMode: "own",
          bends: [[41.56235, -87.1422]],
        },
      ],
    });

    expect(network.pairings.find((pairing) => pairing.id === "tee-gold-1->basket-a-1")?.complete).toBe(true);
    const goldToC = network.pairings.find((pairing) => pairing.id === "tee-gold-1->basket-c-1");
    expect(goldToC?.complete).toBe(false);
    expect(goldToC?.issueCode).toBe("own_route_needs_basket_override");
  });

  it("uses explicit overrides for safari or otherwise unusual tee to basket pairings", () => {
    const input = rogersStyleHole();
    const network = buildHoleRouteNetwork({
      ...input,
      extraTees: [
        {
          id: "tee-gold-1",
          name: "Gold",
          point: [41.5615, -87.1428],
          routeMode: "own",
          bends: [[41.56235, -87.1422]],
        },
      ],
      routeOverrides: [
        {
          teeId: "tee-gold-1",
          basketId: "basket-c-1",
          path: [[41.5615, -87.1428], [41.5625, -87.1417], basketC],
          reason: "Gold tee has a separate pin C route.",
        },
      ],
    });

    const goldToC = network.pairings.find((pairing) => pairing.id === "tee-gold-1->basket-c-1");
    expect(goldToC?.complete).toBe(true);
    expect(goldToC?.status).toBe("override");
    expect(goldToC?.segmentIds).toEqual(["override:tee-gold-1:basket-c-1"]);
  });
});
