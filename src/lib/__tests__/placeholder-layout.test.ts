import { describe, expect, it } from "vitest";
import { isPlaceholderLayout, publishedName } from "@/lib/tracker/placeholder-layout";
import { courseLabel } from "@/lib/tracker-rounds";

describe("PDGA placeholder layout", () => {
  it("detects the default placeholder", () => {
    expect(isPlaceholderLayout("Default Layout; 18 holes; Par 54")).toBe(true);
    expect(isPlaceholderLayout("Westwood Blue")).toBe(false);
  });
  it("never shows the placeholder as a course", () => {
    expect(publishedName("Default Layout; 18 holes; Par 54")).toBeNull();
    expect(courseLabel("Default Layout; 18 holes; Par 54", null)).toBeNull();
    expect(courseLabel("Eureka", "Default Layout")).toBe("Eureka");
  });
});
