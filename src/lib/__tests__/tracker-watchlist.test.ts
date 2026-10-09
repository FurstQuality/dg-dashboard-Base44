import { describe, expect, it } from "vitest";
import { eventPhase, watchlistSort, type TrackedEvent } from "@/lib/tracker-watchlist.server";

const TODAY = "2026-08-30";

describe("eventPhase", () => {
  it("treats a PDGA live status as live regardless of dates", () => {
    expect(
      eventPhase({
        startDate: "2026-09-10",
        endDate: "2026-09-12",
        liveStatus: "live",
        eventStatus: null,
        today: TODAY,
      }),
    ).toBe("live");
  });

  it("buckets a finished event as past", () => {
    expect(
      eventPhase({
        startDate: "2026-08-01",
        endDate: "2026-08-03",
        liveStatus: null,
        eventStatus: null,
        today: TODAY,
      }),
    ).toBe("past");
  });

  it("buckets a future event as upcoming", () => {
    expect(
      eventPhase({
        startDate: "2026-09-05",
        endDate: null,
        liveStatus: null,
        eventStatus: null,
        today: TODAY,
      }),
    ).toBe("upcoming");
  });

  it("treats an event spanning today as live", () => {
    expect(
      eventPhase({
        startDate: "2026-08-29",
        endDate: "2026-08-31",
        liveStatus: null,
        eventStatus: null,
        today: TODAY,
      }),
    ).toBe("live");
  });

  it("respects a complete status on the final day", () => {
    expect(
      eventPhase({
        startDate: TODAY,
        endDate: TODAY,
        liveStatus: "complete",
        eventStatus: null,
        today: TODAY,
      }),
    ).toBe("past");
  });

  it("falls back to upcoming when no date is published", () => {
    expect(
      eventPhase({
        startDate: null,
        endDate: null,
        liveStatus: null,
        eventStatus: null,
        today: TODAY,
      }),
    ).toBe("upcoming");
  });
});

function ev(partial: Partial<TrackedEvent>): TrackedEvent {
  return {
    id: partial.id ?? "e",
    groupId: "g",
    groupName: "My Tracker",
    isPersonal: true,
    name: partial.name ?? "Event",
    pdgaEventRef: null,
    tier: null,
    startDate: partial.startDate ?? null,
    endDate: partial.endDate ?? null,
    location: null,
    url: null,
    eventStatus: null,
    liveStatus: null,
    liveCurrentRound: null,
    lastSyncedAt: null,
    phase: partial.phase ?? "upcoming",
    playersTracked: 0,
    roundsPublished: 0,
  };
}

describe("watchlistSort", () => {
  it("puts live events first, then soonest upcoming, then most recent past", () => {
    const rows = [
      ev({ id: "past-old", phase: "past", startDate: "2026-05-01" }),
      ev({ id: "later", phase: "upcoming", startDate: "2026-10-01" }),
      ev({ id: "soon", phase: "upcoming", startDate: "2026-09-01" }),
      ev({ id: "live", phase: "live", startDate: "2026-08-29" }),
      ev({ id: "past-recent", phase: "past", startDate: "2026-08-01" }),
    ];
    expect([...rows].sort(watchlistSort).map((r) => r.id)).toEqual([
      "live",
      "soon",
      "later",
      "past-recent",
      "past-old",
    ]);
  });

  it("sorts dateless upcoming events last within their bucket", () => {
    const rows = [
      ev({ id: "tbd", phase: "upcoming", startDate: null }),
      ev({ id: "dated", phase: "upcoming", startDate: "2026-12-01" }),
    ];
    expect([...rows].sort(watchlistSort).map((r) => r.id)).toEqual(["dated", "tbd"]);
  });
});
