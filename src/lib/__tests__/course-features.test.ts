import { describe, expect, it } from "vitest";
import { featureAppliesToHole, featureIsCourseWide } from "@/lib/course-features";

describe("featureAppliesToHole", () => {
  it("matches a multi-hole scope", () => {
    expect(featureAppliesToHole({ hole_number: null, hole_numbers: [3, 7] }, 7)).toBe(true);
    expect(featureAppliesToHole({ hole_number: null, hole_numbers: [3, 7] }, 4)).toBe(false);
  });

  it("matches a single-hole scope", () => {
    expect(featureAppliesToHole({ hole_number: 5, hole_numbers: null }, 5)).toBe(true);
    expect(featureAppliesToHole({ hole_number: 5, hole_numbers: null }, 6)).toBe(false);
  });

  it("treats an unscoped feature as course-wide", () => {
    expect(featureAppliesToHole({ hole_number: null, hole_numbers: [] }, 12)).toBe(true);
  });
});

describe("featureIsCourseWide", () => {
  it("is true only when no hole scope is set", () => {
    expect(featureIsCourseWide({ hole_number: null, hole_numbers: null })).toBe(true);
    expect(featureIsCourseWide({ hole_number: 2, hole_numbers: null })).toBe(false);
    expect(featureIsCourseWide({ hole_number: null, hole_numbers: [1] })).toBe(false);
  });
});
