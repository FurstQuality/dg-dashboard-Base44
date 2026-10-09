import { describe, expect, it } from "vitest";
import {
  bulkSwap,
  compareLayouts,
  keepRange,
  layoutTotals,
  layoutsUsingAsset,
  moveSlot,
  renumber,
  suggestName,
  validateLayout,
  type Asset,
  type Slot,
} from "./layouts";

// Fixture: 24 canonical holes. White tee everywhere, Blue on 1–20, Red on 1–9.
// Basket A everywhere, B on even holes.
const holes = Array.from({ length: 24 }, (_, i) => `h${i + 1}`);
const tees: Asset[] = [];
const baskets: Asset[] = [];
holes.forEach((h, i) => {
  const lat = 41 + i * 0.001;
  tees.push({ id: `${h}-white`, course_hole_id: h, name: "White", latitude: lat, longitude: -87 });
  if (i < 20) tees.push({ id: `${h}-blue`, course_hole_id: h, name: "Blue", latitude: lat - 0.0003, longitude: -87 });
  if (i < 9) tees.push({ id: `${h}-red`, course_hole_id: h, name: "Red", latitude: lat + 0.0002, longitude: -87 });
  baskets.push({ id: `${h}-A`, course_hole_id: h, name: "A", latitude: lat, longitude: -86.999 });
  if (i % 2 === 1) baskets.push({ id: `${h}-B`, course_hole_id: h, name: "B", latitude: lat, longitude: -86.9985 });
});
const teeMap = new Map(tees.map((t) => [t.id, t]));
const basketMap = new Map(baskets.map((b) => [b.id, b]));

const white = (n: number): Slot[] =>
  holes.slice(0, n).map((h, i) => ({
    position: i + 1,
    display_label: String(i + 1),
    course_hole_id: h,
    tee_id: `${h}-white`,
    basket_id: `${h}-A`,
    par: 3,
    included: true,
  }));

describe("layout studio", () => {
  it("derives hole count, par and distance", () => {
    const t = layoutTotals(white(18), teeMap, basketMap);
    expect(t.holes).toBe(18);
    expect(t.par).toBe(54);
    expect(t.distanceFt).toBeGreaterThan(0);
    expect(layoutTotals(white(24), teeMap, basketMap).holes).toBe(24);
  });

  it("copy keeps references, never new geometry, and stays independent", () => {
    const w18 = white(18);
    const blue = bulkSwap(w18, "tee", "Blue", tees);
    expect(blue.changed).toBe(18);
    expect(blue.exceptions).toEqual([]);
    // White 18 untouched
    expect(w18.every((s) => s.tee_id!.endsWith("-white"))).toBe(true);
    // Every referenced id is an existing asset
    for (const s of blue.slots) {
      expect(teeMap.has(s.tee_id!)).toBe(true);
      expect(basketMap.has(s.basket_id!)).toBe(true);
    }
    // Changing Blue hole 4 doesn't alter White
    blue.slots[3] = { ...blue.slots[3], tee_id: "h4-red" };
    expect(w18[3].tee_id).toBe("h4-white");
  });

  it("flags holes without the requested tee", () => {
    const r = bulkSwap(white(24), "tee", "Blue", tees);
    expect(r.changed).toBe(20);
    expect(r.exceptions).toEqual(["21", "22", "23", "24"]);
    const red = bulkSwap(white(18), "tee", "Red", tees);
    expect(red.exceptions.length).toBe(9);
  });

  it("swaps baskets where B exists", () => {
    const r = bulkSwap(white(18), "basket", "B", baskets);
    expect(r.changed).toBe(9);
    expect(r.exceptions.length).toBe(9);
  });

  it("front nine excludes without touching holes", () => {
    const w18 = white(18);
    const f9 = keepRange(w18, 1, 9);
    expect(layoutTotals(f9, teeMap, basketMap).holes).toBe(9);
    expect(layoutTotals(w18, teeMap, basketMap).holes).toBe(18);
  });

  it("mixed tournament 21 with A/B/C extras", () => {
    const base = white(18);
    const extras: Slot[] = ["A", "B", "C"].map((l, i) => ({
      position: 19 + i,
      display_label: l,
      course_hole_id: holes[18 + i],
      tee_id: `${holes[18 + i]}-white`,
      basket_id: `${holes[18 + i]}-A`,
      par: 3,
      included: true,
    }));
    let slots = [...base, ...extras].map((s, i) => ({
      ...s,
      tee_id: i < 15 ? `${s.course_hole_id}-blue` : i < 19 ? `${s.course_hole_id}-white` : s.course_hole_id === "h20" ? "h20-blue" : s.tee_id,
    }));
    slots[0] = { ...slots[0], tee_id: "h1-red" };
    slots[1] = { ...slots[1], tee_id: "h2-red", basket_id: "h2-B" };
    slots = moveSlot(slots, 18, 1); // move "A" to second
    slots = renumber(slots, "route");
    expect(slots[1].display_label).toBe("A");
    expect(slots.map((s) => s.position)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    const t = layoutTotals(slots, teeMap, basketMap);
    expect(t.holes).toBe(21);
    expect(t.par).toBe(63);
    expect(validateLayout(slots).filter((x) => x.level === "error")).toEqual([]);
  });

  it("warns on intentionally repeated holes and missing data", () => {
    const s = white(3);
    s.push({ ...s[0], position: 4, display_label: "4" });
    s[1] = { ...s[1], basket_id: null };
    const issues = validateLayout(s);
    expect(issues.some((i) => i.level === "warning" && i.message.includes("appears 2 times"))).toBe(true);
    expect(issues.some((i) => i.message === "Hole 2 has no basket.")).toBe(true);
  });

  it("compares layouts by difference only", () => {
    const w = white(18);
    const b = bulkSwap(w, "tee", "Blue", tees).slots;
    b[7] = { ...b[7], basket_id: "h8-B" };
    const name = (id: string | null) => (id ? (teeMap.get(id) ?? basketMap.get(id))!.name : "—");
    const r = compareLayouts(w, b, { tee: name, basket: name });
    expect(r.diffs.length).toBe(18);
    expect(r.diffs[7].changes).toContain("A → B");
  });

  it("suggests names and lists shared users", () => {
    expect(suggestName("White 18", { tee: "Blue" })).toBe("Blue 18");
    expect(suggestName("White 18", { holes: "front" })).toBe("White Front 9");
    const m = new Map([
      ["w", { name: "White 18", slots: white(18) }],
      ["f", { name: "Front 9", slots: keepRange(white(18), 1, 9) }],
    ]);
    expect(layoutsUsingAsset("h3-A", m)).toEqual(["White 18", "Front 9"]);
  });
});

import { layoutReadiness as lr } from "./layouts";
describe("layoutReadiness", () => {
  it("flags unplaced tees and missing par", () => {
    const tees = new Map([["t", { id: "t", course_hole_id: "h", name: "Red", latitude: 41, longitude: -87 }]]);
    const baskets = new Map([["b", { id: "b", course_hole_id: "h", name: "A", latitude: null, longitude: null }]]);
    const r = lr([{ position: 1, display_label: "1", course_hole_id: "h", tee_id: "t", basket_id: "b", par: null, included: true }], tees, baskets);
    expect(r.scoring).toEqual({ ready: false, missing: 1 });
    expect(r.map).toEqual({ ready: false, missing: 1 });
  });
});
