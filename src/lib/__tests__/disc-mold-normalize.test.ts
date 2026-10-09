import { describe, expect, it } from "vitest";
import {
  categoryFromSpeed,
  cleanBrandName,
  cleanMoldName,
  repairMojibake,
  slugifyName,
  stabilityFromFlight,
} from "@/lib/disc-mold-normalize";

describe("disc mold name cleanup", () => {
  it("repairs garbled characters", () => {
    expect(repairMojibake("CafÃ©")).toBe("Café");
  });

  it("keeps the mold name and captures the note in parentheses", () => {
    const cleaned = cleanMoldName("Destroyer (Star)");
    expect(cleaned.name).toBe("Destroyer");
    expect(cleaned.note).toBe("Star");
    expect(cleaned.skipReason).toBeNull();
  });

  it("refuses blank, numeric and too-short names", () => {
    expect(cleanMoldName("   ").name).toBeNull();
    expect(cleanMoldName("   ").skipReason).toBeTruthy();
    expect(cleanMoldName("175").name).toBeNull();
    expect(cleanMoldName("X").name).toBeNull();
  });

  it("tidies brand names and slugs", () => {
    expect(cleanBrandName("  innova  ")).toBe("Innova");
    expect(cleanBrandName("!")).toBeNull();
    expect(slugifyName("Discraft Buzzz")).toBe("discraft-buzzz");
  });
});

describe("flight derivations", () => {
  it("buckets a disc by speed", () => {
    expect(categoryFromSpeed(13)).toBe("distance_driver");
    expect(categoryFromSpeed(8)).toBe("fairway_driver");
    expect(categoryFromSpeed(6)).toBe("midrange");
    expect(categoryFromSpeed(5)).toBe("approach");
    expect(categoryFromSpeed(3)).toBe("putter");
    expect(categoryFromSpeed(null)).toBe("specialty");
  });

  it("maps turn and fade to stability", () => {
    expect(stabilityFromFlight(0, 4)).toBe("very_overstable");
    expect(stabilityFromFlight(-1, 3)).toBe("overstable");
    expect(stabilityFromFlight(0, 2)).toBe("overstable");
    expect(stabilityFromFlight(-2, 2)).toBe("stable");
    expect(stabilityFromFlight(-3, 1)).toBe("understable");
    expect(stabilityFromFlight(-4, 0)).toBe("very_understable");
    expect(stabilityFromFlight(null, null)).toBeNull();
  });
});
