import { describe, expect, it } from "vitest";
import { canonicalTeeTime, dayTeeSortKey, formatTeeTime, teeTimeSortKey } from "@/lib/tee-time";

describe("canonicalTeeTime", () => {
  it("normalizes 12-hour input to stored HH:MM:SS", () => {
    expect(canonicalTeeTime("8:05 am")).toBe("08:05:00");
    expect(canonicalTeeTime("2:30 pm")).toBe("14:30:00");
    expect(canonicalTeeTime("12:00 am")).toBe("00:00:00");
    expect(canonicalTeeTime("12:15 pm")).toBe("12:15:00");
  });

  it("leaves already-canonical values untouched", () => {
    expect(canonicalTeeTime("07:30:00")).toBe("07:30:00");
  });

  it("passes unparseable text through trimmed and keeps blanks null", () => {
    expect(canonicalTeeTime("  shotgun start ")).toBe("shotgun start");
    expect(canonicalTeeTime("")).toBeNull();
    expect(canonicalTeeTime(null)).toBeNull();
  });
});

describe("formatTeeTime", () => {
  it("renders stored times as readable 12-hour strings", () => {
    expect(formatTeeTime("07:30:00")).toBe("7:30 AM");
    expect(formatTeeTime("14:10:00")).toBe("2:10 PM");
    expect(formatTeeTime("00:05:00")).toBe("12:05 AM");
    expect(formatTeeTime("12:00:00")).toBe("12:00 PM");
  });

  it("returns an empty string for missing times", () => {
    expect(formatTeeTime(null)).toBe("");
  });
});

describe("sort keys", () => {
  it("orders known tee times before unknown ones", () => {
    expect(teeTimeSortKey("07:30:00")).toBeLessThan(teeTimeSortKey("14:10:00"));
    expect(teeTimeSortKey("14:10:00")).toBeLessThan(teeTimeSortKey("shotgun"));
    expect(teeTimeSortKey("shotgun")).toBeLessThan(teeTimeSortKey(null));
  });

  it("sorts by day first, then tee time", () => {
    const a = dayTeeSortKey("2026-07-30", "14:10:00");
    const b = dayTeeSortKey("2026-07-31", "07:30:00");
    const c = dayTeeSortKey("2026-07-30", "07:30:00");
    expect([a, b, c].sort()).toEqual([c, a, b]);
  });
});
