import { describe, expect, it } from "vitest";
import { classifyEventMatches, pdgaRefFromQuery } from "@/lib/tracker/event-match";

describe("event match", () => {
  it("reads PDGA ids and links", () => {
    expect(pdgaRefFromQuery("https://www.pdga.com/tour/event/88276")).toBe("88276");
    expect(pdgaRefFromQuery("https://www.pdga.com/apps/tournament/live/event?TournID=88276")).toBe("88276");
    expect(pdgaRefFromQuery("#88276")).toBe("88276");
    expect(pdgaRefFromQuery("Ledgestone")).toBeNull();
  });
  it("id match is exact; others only possible", () => {
    expect(classifyEventMatches("88276", [{ pdgaEventId: "88276", name: "A" }, { pdgaEventId: "1", name: "B" }])).toEqual(["EXACT", "POSSIBLE"]);
  });
  it("two equally strong name hits are ambiguous", () => {
    const rows = [
      { pdgaEventId: "1", name: "Ledgestone Open Pro", location: "Peoria, IL" },
      { pdgaEventId: "2", name: "Ledgestone Open Am", location: "Peoria, IL" },
    ];
    expect(classifyEventMatches("ledgestone peoria", rows)).toEqual(["AMBIGUOUS", "AMBIGUOUS"]);
    expect(classifyEventMatches("Ledgestone Open Pro", rows)).toEqual(["HIGH_CONFIDENCE", "POSSIBLE"]);
  });
});
