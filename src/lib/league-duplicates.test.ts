import { describe, expect, it } from "vitest";
import { mergeLeagueMirrors, type MirrorListing } from "./league-duplicates";

function row(over: Partial<MirrorListing> & { id: string }): MirrorListing {
  return {
    name: "Portage Sanctioned Singles",
    source: "udisc",
    url: null,
    start_date: "2026-09-15",
    end_date: null,
    venue_name: null,
    city: "Portage",
    state: "IN",
    latitude: null,
    longitude: null,
    ...over,
  };
}

describe("mergeLeagueMirrors", () => {
  it("collapses the PDGA season row and the UDisc night into one entry", () => {
    const merged = mergeLeagueMirrors([
      row({
        id: "a",
        source: "pdga",
        name: "Portage Sanctioned Singles (Fall Session)",
        end_date: "2026-10-13",
        url: "https://pdga.com/x",
      }),
      row({
        id: "b",
        source: "udisc",
        venue_name: "Glenn Christopher Nicholson Memorial DGC",
        url: "https://udisc.com/y",
      }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.source).toBe("pdga");
    expect(merged[0]!.sources.map((s) => s.source)).toEqual(["pdga", "udisc"]);
    // Detail the sanctioned listing lacked is filled in from the other mirror.
    expect(merged[0]!.venue_name).toBe("Glenn Christopher Nicholson Memorial DGC");
  });

  it("keeps genuinely different leagues apart", () => {
    const merged = mergeLeagueMirrors([
      row({ id: "a", name: "Portage Sanctioned Singles" }),
      row({ id: "b", name: "Valparaiso Thursday Doubles", city: "Valparaiso" }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it("keeps same-name leagues in different cities apart", () => {
    const merged = mergeLeagueMirrors([
      row({ id: "a", source: "pdga", city: "Portage" }),
      row({ id: "b", source: "udisc", city: "Hobart" }),
    ]);
    expect(merged).toHaveLength(2);
  });
});
