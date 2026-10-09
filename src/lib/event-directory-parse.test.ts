import { describe, expect, it } from "vitest";
import {
  directoryMatchKey,
  parseSceneDatePhrase,
  parseSceneEventList,
  parseSceneTier,
  parseUdiscEventList,
} from "./event-directory-parse";

const SCENE_ROW = `
<div class="tournament-list list-record list-reg-open">
  <a href="https://www.discgolfscene.com/tournaments/NWI_Club_Challenge_2026">
    <span class="date"><span class="text-uppercase text-muted">Sep</span> 5</span>
    <img src="https://m.discgolfscene.com/logos/tournaments/107831/nwi.jpg" />
    <span class="name">NWI Club Challenge 2026</span>
    <span class="info">PDGA C-tier &middot; Sat, Sep 5, 2026</span>
    <span class="info"><i class="far fa-map"></i> <b>Countryside Park</b>
      <i class="far fa-map-marker-alt"></i> <b>Portage, Indiana</b>
      <b>87 / 88</b></span>
  </a>
</div>`;

const UDISC_ROW = `
<a class="group flex w-full flex-col items-center gap-2 text-left" href="/events/fall-flex-9xYz">
  <div style="background-image:url(https://udisc-parse.s3.amazonaws.com/cover.png)"></div>
  <div class="uppercase">Tournament</div>
  <div class="font-bold">Fall Flex Championship</div>
  <div class="leading-tight">Countryside Park • Portage, IN</div>
  <time dateTIme="2026-09-05T09:00:00Z"></time>
  <time dateTIme="2026-09-06T09:00:00Z"></time>
  <div>Registration open</div>
</a>`;

describe("parseSceneDatePhrase", () => {
  it("reads a single day", () => {
    expect(parseSceneDatePhrase("PDGA C-tier · Sat, Sep 5, 2026")).toEqual({
      start: "2026-09-05",
      end: "2026-09-05",
    });
  });

  it("reads a same-month range", () => {
    expect(parseSceneDatePhrase("PDGA A-tier · Fri-Sun, Sep 4-6, 2026")).toEqual({
      start: "2026-09-04",
      end: "2026-09-06",
    });
  });

  it("reads a cross-month range", () => {
    expect(parseSceneDatePhrase("Sat-Sun, Aug 30-Sep 1, 2026")).toEqual({
      start: "2026-08-30",
      end: "2026-09-01",
    });
  });

  it("reads a cross-year range", () => {
    expect(parseSceneDatePhrase("Wed-Fri, Dec 31, 2026-Jan 2, 2027")).toEqual({
      start: "2026-12-31",
      end: "2027-01-02",
    });
  });

  it("returns nulls without a year", () => {
    expect(parseSceneDatePhrase("Weekly league")).toEqual({ start: null, end: null });
  });
});

describe("parseSceneTier", () => {
  it("reads standard and flex tiers", () => {
    expect(parseSceneTier("PDGA C-tier · Sat, Sep 5, 2026")).toEqual({
      tier: "C",
      sanctioning: "PDGA",
    });
    expect(parseSceneTier("PDGA Flex C-tier · Fri, Sep 4, 2026")).toEqual({
      tier: "Flex C",
      sanctioning: "PDGA",
    });
  });

  it("leaves unsanctioned events untiered", () => {
    expect(parseSceneTier("Weekly league · Thu, Sep 3, 2026")).toEqual({
      tier: null,
      sanctioning: null,
    });
  });
});

describe("parseSceneEventList", () => {
  it("normalizes a listing row", () => {
    const [row] = parseSceneEventList(SCENE_ROW, {
      kind: "tournament",
      discoveredVia: "dgs_state:IN",
    });
    expect(row).toMatchObject({
      source: "disc_golf_scene",
      source_event_id: "NWI_Club_Challenge_2026",
      name: "NWI Club Challenge 2026",
      kind: "tournament",
      tier: "C",
      sanctioning: "PDGA",
      start_date: "2026-09-05",
      end_date: "2026-09-05",
      venue_name: "Countryside Park",
      city: "Portage",
      state: "IN",
      country: "United States",
      registration_status: "open",
      field_size: 87,
      field_capacity: 88,
      discovered_via: "dgs_state:IN",
    });
    expect(row.url).toBe("https://www.discgolfscene.com/tournaments/NWI_Club_Challenge_2026");
  });

  it("ignores markup with no event rows", () => {
    expect(parseSceneEventList("<html><body>No events</body></html>", {
      kind: "tournament",
      discoveredVia: "dgs_national",
    })).toEqual([]);
  });
});

describe("parseUdiscEventList", () => {
  it("normalizes a nearby-events card", () => {
    const [row] = parseUdiscEventList(UDISC_ROW, { discoveredVia: "udisc_geo:Chicago, IL" });
    expect(row).toMatchObject({
      source: "udisc",
      source_event_id: "fall-flex-9xYz",
      name: "Fall Flex Championship",
      kind: "tournament",
      venue_name: "Countryside Park",
      city: "Portage",
      state: "IN",
      country: "United States",
      start_date: "2026-09-05",
      end_date: "2026-09-06",
      registration_status: "open",
    });
    expect(row.url).toBe("https://udisc.com/events/fall-flex-9xYz");
  });

  it("dedupes repeated cards for the same event", () => {
    const rows = parseUdiscEventList(UDISC_ROW + UDISC_ROW, { discoveredVia: "udisc_geo:test" });
    expect(rows).toHaveLength(1);
  });
});

describe("directoryMatchKey", () => {
  it("matches the same event across sources", () => {
    const a = directoryMatchKey({
      name: "NWI Club Challenge 2026",
      start_date: "2026-09-05",
      city: "Portage",
    });
    const b = directoryMatchKey({
      name: "NWI Club Challenge presented by Local Shop",
      start_date: "2026-09-05",
      city: "portage",
    });
    expect(a).toBe(b);
  });

  it("separates different dates", () => {
    expect(
      directoryMatchKey({ name: "Fall Flex", start_date: "2026-09-05", city: "Portage" }),
    ).not.toBe(directoryMatchKey({ name: "Fall Flex", start_date: "2026-09-12", city: "Portage" }));
  });
});
