import { describe, expect, it } from "vitest";
import { stripEventSourceBrands } from "@/lib/event-name";

describe("stripEventSourceBrands", () => {
  it("drops the source brand from listing titles", () => {
    expect(stripEventSourceBrands("League Leaderboard: NWI High Flyers UDisc")).toBe(
      "NWI High Flyers",
    );
    expect(
      stripEventSourceBrands(
        "League Leaderboard | NWI High Flyers Friday Night Glow! | UDisc Events",
      ),
    ).toBe("NWI High Flyers Friday Night Glow!");
    expect(stripEventSourceBrands("PDGA Sanctioned — Fall Fling")).toBe("Sanctioned — Fall Fling");
    expect(stripEventSourceBrands("Friday Night Glow (powered by UDisc)")).toBe(
      "Friday Night Glow",
    );
    expect(stripEventSourceBrands("Winter Doubles - scored on U Disc")).toBe("Winter Doubles");
  });

  it("leaves ordinary names alone and never returns an empty title", () => {
    expect(stripEventSourceBrands("Hamilton County Open")).toBe("Hamilton County Open");
    expect(stripEventSourceBrands("UDisc")).toBe("UDisc");
  });
});
