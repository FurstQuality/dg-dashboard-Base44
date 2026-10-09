import { describe, it, expect } from "vitest";
import {
  distanceFeet,
  holeNumberFromTags,
  pairPinsIntoHoles,
  nameLooksLikeSame,
  type Pin,
} from "@/lib/course-holes.server";

describe("distanceFeet", () => {
  it("measures a short tee-to-basket shot", () => {
    const d = distanceFeet({ lat: 41.6, lng: -87.4 }, { lat: 41.6009, lng: -87.4 });
    expect(d).toBeGreaterThan(300);
    expect(d).toBeLessThan(340);
  });

  it("is zero for the same point", () => {
    expect(distanceFeet({ lat: 41.6, lng: -87.4 }, { lat: 41.6, lng: -87.4 })).toBe(0);
  });
});

describe("holeNumberFromTags", () => {
  it("reads a bare ref", () => {
    expect(holeNumberFromTags({ ref: "7" })).toBe(7);
  });
  it("reads a named hole", () => {
    expect(holeNumberFromTags({ name: "Hole 12" })).toBe(12);
  });
  it("returns null when nothing is numbered", () => {
    expect(holeNumberFromTags({ name: "Basket" })).toBeNull();
  });
  it("ignores out-of-range numbers", () => {
    expect(holeNumberFromTags({ ref: "84" })).toBeNull();
  });
});

describe("pairPinsIntoHoles", () => {
  it("pairs matching hole numbers and measures the distance", () => {
    const pins: Pin[] = [
      { kind: "tee", lat: 41.6, lng: -87.4, hole: 1 },
      { kind: "basket", lat: 41.6009, lng: -87.4, hole: 1 },
      { kind: "tee", lat: 41.601, lng: -87.401, hole: 2 },
      { kind: "basket", lat: 41.6018, lng: -87.401, hole: 2 },
    ];
    const { holes, unnumbered } = pairPinsIntoHoles(pins);
    expect(unnumbered).toBe(0);
    expect(holes.map((h) => h.number)).toEqual([1, 2]);
    expect(holes[0].distance_ft).toBeGreaterThan(250);
    expect(holes[1].tee).not.toBeNull();
  });

  it("treats a second pad beside a mapped tee as an alternate tee, not a new hole", () => {
    const pins: Pin[] = [
      { kind: "tee", lat: 41.6, lng: -87.4, hole: 1 },
      { kind: "basket", lat: 41.6009, lng: -87.4, hole: 1 },
      // Pro pad about 20 m behind the am pad on the same hole.
      { kind: "tee", lat: 41.59982, lng: -87.4, hole: null },
    ];
    const { holes, alternateTees, unnumbered } = pairPinsIntoHoles(pins, 1);
    expect(alternateTees).toBe(1);
    expect(unnumbered).toBe(0);
    expect(holes).toHaveLength(1);
    expect(holes[0].number).toBe(1);
  });

  it("fills a missing tee from a nearby unnumbered pin", () => {
    const pins: Pin[] = [
      { kind: "basket", lat: 41.6009, lng: -87.4, hole: 3 },
      { kind: "tee", lat: 41.6, lng: -87.4, hole: null },
    ];
    const { holes } = pairPinsIntoHoles(pins);
    expect(holes).toHaveLength(1);
    expect(holes[0].number).toBe(3);
    expect(holes[0].tee).not.toBeNull();
    expect(holes[0].distance_ft).toBeGreaterThan(0);
  });

  it("places unnumbered baskets in walking order and flags them as inferred", () => {
    const pins: Pin[] = [
      { kind: "basket", lat: 41.6009, lng: -87.4, hole: null },
      { kind: "basket", lat: 41.602, lng: -87.402, hole: null },
    ];
    const { holes, unnumbered, inferred } = pairPinsIntoHoles(pins, 9);
    expect(holes).toHaveLength(2);
    expect(inferred).toBe(2);
    expect(unnumbered).toBe(0);
    expect(holes.every((h) => h.basket && !h.tee)).toBe(true);
  });

  it("does not borrow a pin from far away", () => {
    const pins: Pin[] = [
      { kind: "basket", lat: 41.6, lng: -87.4, hole: 1 },
      { kind: "tee", lat: 41.7, lng: -87.5, hole: null },
    ];
    const { holes } = pairPinsIntoHoles(pins);
    expect(holes[0].tee).toBeNull();
    expect(holes[0].distance_ft).toBeNull();
  });
});

describe("nameLooksLikeSame", () => {
  it("matches the same course written differently", () => {
    expect(nameLooksLikeSame("Lemon Lake Disc Golf Course", "Lemon Lake DGC")).toBe(true);
  });
  it("rejects different courses", () => {
    expect(nameLooksLikeSame("Lemon Lake DGC", "Sunset Hill Farm")).toBe(false);
  });
});

describe("pairPinsIntoHoles with unnumbered pins", () => {
  it("places unnumbered tee/basket pairs into open hole slots in walking order", () => {
    const pins = [
      { kind: "tee" as const, lat: 41.6, lng: -87.5, hole: null },
      { kind: "basket" as const, lat: 41.6008, lng: -87.5, hole: null },
      { kind: "tee" as const, lat: 41.602, lng: -87.5, hole: null },
      { kind: "basket" as const, lat: 41.6028, lng: -87.5, hole: null },
    ];
    const res = pairPinsIntoHoles(pins, 9);
    expect(res.holes.filter((h) => h.tee && h.basket)).toHaveLength(2);
    expect(res.inferred).toBe(2);
    expect(res.holes.map((h) => h.number)).toEqual([1, 2]);
    expect(res.unnumbered).toBe(0);
  });

  it("keeps numbered holes and fills the rest around them", () => {
    const pins = [
      { kind: "tee" as const, lat: 41.6, lng: -87.5, hole: 1 },
      { kind: "basket" as const, lat: 41.6008, lng: -87.5, hole: 1 },
      { kind: "tee" as const, lat: 41.62, lng: -87.52, hole: null },
      { kind: "basket" as const, lat: 41.6208, lng: -87.52, hole: null },
    ];
    const res = pairPinsIntoHoles(pins, 9);
    expect(res.holes.map((h) => h.number)).toEqual([1, 2]);
  });
});

describe("pairPinsIntoHoles pairs shortest-first", () => {
  it("gives each basket the tee that is genuinely closest to it", () => {
    // Basket A sits between two tees; the far tee belongs to basket B.
    const pins = [
      { kind: "basket" as const, lat: 41.6004, lng: -87.5, hole: null },
      { kind: "tee" as const, lat: 41.6, lng: -87.5, hole: null },
      { kind: "basket" as const, lat: 41.6016, lng: -87.5, hole: null },
      { kind: "tee" as const, lat: 41.6012, lng: -87.5, hole: null },
    ];
    const res = pairPinsIntoHoles(pins, 9);
    const paired = res.holes.filter((h) => h.tee && h.basket);
    expect(paired).toHaveLength(2);
    for (const hole of paired) {
      expect(hole.distance_ft).not.toBeNull();
      expect(hole.distance_ft!).toBeLessThan(300);
    }
  });

  it("leaves pins unpaired when nothing sits within a realistic hole length", () => {
    const pins = [
      { kind: "tee" as const, lat: 41.6, lng: -87.5, hole: null },
      { kind: "basket" as const, lat: 41.62, lng: -87.5, hole: null },
    ];
    const res = pairPinsIntoHoles(pins, 9);
    expect(res.holes.filter((h) => h.tee && h.basket)).toHaveLength(0);
  });
});
