import { describe, expect, it } from "vitest";
import { directorAlerts, eventAlerts, fillPct, type DirectorEvent } from "@/lib/director-alerts";
import { emptyCounts, money } from "@/lib/director-kit";

function makeEvent(patch: Partial<DirectorEvent> = {}): DirectorEvent {
  return {
    id: "e1",
    name: "Spring Shootout",
    slug: "spring-shootout",
    status: "registration_open",
    startDate: "2026-09-12",
    endDate: "2026-09-12",
    location: "Peoria, IL",
    courseId: "c1",
    layoutId: "l1",
    courseName: "Northwood Black",
    maxPlayers: 72,
    pdgaSanctioned: false,
    entryFeeCents: 5000,
    divisions: 4,
    rounds: 2,
    roundsWithCourse: 2,
    roundsWithTeeTimes: 2,
    registrations: { ...emptyCounts(), confirmed: 40 },
    feesCollectedCents: 200000,
    feesOutstandingCents: 0,
    checklistDone: 6,
    checklistTotal: 6,
    staffCount: 2,
    isLiveToday: false,
    daysOut: 10,
    ...patch,
  };
}

describe("eventAlerts", () => {
  it("stays quiet for a fully built, fully paid event", () => {
    expect(eventAlerts(makeEvent())).toEqual([]);
  });

  it("ignores completed and cancelled events entirely", () => {
    expect(eventAlerts(makeEvent({ status: "completed", divisions: 0, rounds: 0 }))).toEqual([]);
    expect(eventAlerts(makeEvent({ status: "cancelled", courseId: null }))).toEqual([]);
  });

  it("flags a missing course as critical", () => {
    const alerts = eventAlerts(makeEvent({ courseId: null, courseName: null }));
    expect(alerts.some((a) => a.severity === "critical")).toBe(true);
  });

  it("flags pending entries to the registration desk", () => {
    const alerts = eventAlerts(
      makeEvent({ registrations: { ...emptyCounts(), confirmed: 10, pending: 5 } }),
    );
    const pending = alerts.find((a) => a.fix === "registrations");
    expect(pending).toBeDefined();
    expect(`${pending!.title} ${pending!.detail}`).toContain("5");
  });
});

describe("directorAlerts", () => {
  it("puts critical items ahead of informational ones", () => {
    const alerts = directorAlerts([
      makeEvent({ id: "a", registrations: { ...emptyCounts(), confirmed: 5, pending: 2 } }),
      makeEvent({ id: "b", slug: "b", courseId: null, courseName: null }),
    ]);
    expect(alerts[0]!.severity).toBe("critical");
  });
});

describe("fillPct", () => {
  it("returns null without a player cap", () => {
    expect(fillPct(makeEvent({ maxPlayers: null }))).toBeNull();
  });

  it("counts confirmed plus checked-in players against the cap", () => {
    const pct = fillPct(
      makeEvent({
        maxPlayers: 100,
        registrations: { ...emptyCounts(), confirmed: 30, checkedIn: 20 },
      }),
    );
    expect(pct).toBe(50);
  });
});

describe("money", () => {
  it("formats cents as dollars and handles nothing collected", () => {
    expect(money(5000)).toContain("50");
    expect(money(0)).toContain("0");
    expect(money(null)).toContain("0");
  });
});
