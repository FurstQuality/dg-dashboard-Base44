import { describe, expect, it } from "vitest";
import { adapterFor, planParFill } from "./adapters";

describe("course adapters", () => {
  it("routes urls to the right adapter", () => {
    expect(adapterFor("https://udisc.com/courses/x-ab12")?.source).toBe("udisc");
    expect(adapterFor("https://www.discgolfscene.com/courses/123/x")?.source).toBe("disc_golf_scene");
    expect(adapterFor("https://evil.com/udisc.com/courses/x")).toBeNull();
  });

  it("fills par only when hole counts match and par is unconfirmed", () => {
    const holes = [
      { id: "a", number: 1, par_confirmed: false, par_source: null },
      { id: "b", number: 2, par_confirmed: true, par_source: null },
    ];
    const listing = [
      { number: 1, par: 4, distance_ft: 400 },
      { number: 2, par: 5, distance_ft: 600 },
    ];
    expect(planParFill(holes, listing)).toEqual([{ id: "a", par: 4 }]);
    expect(planParFill(holes, listing.slice(0, 1))).toEqual([]);
    expect(planParFill(holes, [{ number: 1, par: 9, distance_ft: null }, listing[1]])).toEqual([]);
  });
});

import { nameMatchScore } from "./adapters";
describe("nameMatchScore", () => {
  it("ignores generic words", () => {
    expect(nameMatchScore("Rolling Hills DGC", "Rolling Hills Disc Golf Course")).toBe(1);
    expect(nameMatchScore("North Park", "South Park")).toBe(0);
  });
});
