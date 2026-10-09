import { describe, expect, it } from "vitest";
import { matchesHaystack, matchesOmnisearch, tokenize } from "@/lib/omnisearch";

const event = {
  name: "Discraft Ledgestone Open",
  city: "Peoria",
  state: "IL",
  tier: "A",
};

describe("tokenize", () => {
  it("splits on whitespace and drops empties", () => {
    expect(tokenize("  ledgestone   open ")).toEqual(["ledgestone", "open"]);
    expect(tokenize("")).toEqual([]);
  });
});

describe("matchesOmnisearch", () => {
  it("matches every token in any order", () => {
    expect(matchesOmnisearch(event, "ledgestone")).toBe(true);
    expect(matchesOmnisearch(event, "open ledgestone")).toBe(true);
    expect(matchesOmnisearch(event, "peoria il")).toBe(true);
  });

  it("requires all tokens to match", () => {
    expect(matchesOmnisearch(event, "ledgestone chicago")).toBe(false);
  });

  it("treats an empty query as a match", () => {
    expect(matchesOmnisearch(event, "")).toBe(true);
  });

  it("searches extra values alongside the row", () => {
    expect(matchesOmnisearch(event, "northwood", ["Northwood Park"])).toBe(true);
  });
});

describe("matchesHaystack", () => {
  it("is case-insensitive", () => {
    expect(matchesHaystack("northwood park gold", "GOLD")).toBe(true);
    expect(matchesHaystack("northwood park gold", "blue")).toBe(false);
  });
});
