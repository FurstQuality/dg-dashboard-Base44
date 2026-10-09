import { describe, expect, it } from "vitest";
import { teeColor } from "./tee-colors";
describe("course-wide tee colors", () => {
  it("inherits the set across case and surrounding whitespace", () => {
    expect(teeColor(" blue ", "#ffffff", [{ name: "Blue", color: "#2563eb" }])).toBe("#2563eb");
  });
  it("retains colors for pads without a named set and rejects unsafe CSS", () => {
    expect(teeColor("Safari", "#dc2626")).toBe("#dc2626");
    expect(teeColor("Blue", 'red; background:url("other")')).toBe("#2563eb");
  });
});
