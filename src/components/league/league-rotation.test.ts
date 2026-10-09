import { describe, expect, it } from "vitest";
import { rotationPlan } from "./league-rotation-dialog";
describe("rotationPlan", () => {
  it("cycles courses weekly", () => {
    const p = rotationPlan("2026-10-06", 4, ["a", "b", "c"]);
    expect(p.map((x) => x.course_id)).toEqual(["a", "b", "c", "a"]);
    expect(p[3].date).toBe("2026-10-27");
  });
});
