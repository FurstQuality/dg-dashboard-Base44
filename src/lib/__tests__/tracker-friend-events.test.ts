import { describe, expect, it } from "vitest";
import {
  findConflicts,
  friendEventSort,
  groupRegistrationsByEvent,
  rangesOverlap,
  sortFriendsByRating,
  type FriendEvent,
} from "@/lib/tracker/friend-events";

const friend = (num: string, name: string) => ({
  userId: `u-${num}`,
  displayName: name,
  username: name.toLowerCase(),
  pdgaNumber: num,
});

describe("rangesOverlap", () => {
  it("flags overlapping multi-day windows", () => {
    expect(
      rangesOverlap(
        { startDate: "2026-09-04", endDate: "2026-09-06" },
        { startDate: "2026-09-06", endDate: "2026-09-07" },
      ),
    ).toBe(true);
  });

  it("does not flag adjacent windows", () => {
    expect(
      rangesOverlap(
        { startDate: "2026-09-04", endDate: "2026-09-05" },
        { startDate: "2026-09-06", endDate: "2026-09-07" },
      ),
    ).toBe(false);
  });

  it("never guesses when a date is unknown", () => {
    expect(
      rangesOverlap({ startDate: null, endDate: null }, { startDate: "2026-09-06", endDate: null }),
    ).toBe(false);
  });

  it("treats a missing end date as a single day", () => {
    expect(
      rangesOverlap(
        { startDate: "2026-09-06", endDate: null },
        { startDate: "2026-09-06", endDate: null },
      ),
    ).toBe(true);
  });
});

describe("groupRegistrationsByEvent", () => {
  const friends = new Map([
    ["12345", friend("12345", "Ana")],
    ["67890", friend("67890", "Bo")],
  ]);

  it("keeps only known friends and dedupes repeat rows", () => {
    const grouped = groupRegistrationsByEvent(
      [
        { eventRef: "90210", pdgaNumber: "12345", division: "MPO", rating: 980 },
        { eventRef: "90210", pdgaNumber: "12345", division: "MPO", rating: 980 },
        { eventRef: "90210", pdgaNumber: "67890", division: "MA1", rating: 920 },
        { eventRef: "90210", pdgaNumber: "00000", division: "MA1", rating: 900 },
      ],
      friends,
    );
    expect(grouped.get("90210")?.map((f) => f.displayName)).toEqual(["Ana", "Bo"]);
  });

  it("returns no events when nobody matches", () => {
    expect(
      groupRegistrationsByEvent(
        [{ eventRef: "1", pdgaNumber: "999", division: null, rating: null }],
        friends,
      ).size,
    ).toBe(0);
  });
});

describe("sortFriendsByRating", () => {
  it("puts unrated friends last", () => {
    const sorted = sortFriendsByRating([
      { ...friend("1", "Low"), division: null, rating: 880 },
      { ...friend("2", "None"), division: null, rating: null },
      { ...friend("3", "High"), division: null, rating: 1000 },
    ]);
    expect(sorted.map((f) => f.displayName)).toEqual(["High", "Low", "None"]);
  });
});

describe("friendEventSort", () => {
  const base: FriendEvent = {
    eventRef: "1",
    name: "A",
    tier: null,
    startDate: "2026-09-10",
    endDate: null,
    location: null,
    pdgaUrl: "",
    tracked: false,
    friends: [],
    conflicts: [],
  };

  it("sorts soonest first and undated last", () => {
    const events = [
      { ...base, eventRef: "3", startDate: null },
      { ...base, eventRef: "2", startDate: "2026-10-01" },
      { ...base, eventRef: "1", startDate: "2026-09-10" },
    ];
    expect([...events].sort(friendEventSort).map((e) => e.eventRef)).toEqual(["1", "2", "3"]);
  });
});

describe("findConflicts", () => {
  it("reports only real collisions with the caller's commitments", () => {
    const conflicts = findConflicts({ startDate: "2026-09-05", endDate: "2026-09-06" }, [
      { title: "Club league", startDate: "2026-09-05", endDate: null, source: "schedule" },
      { title: "Later major", startDate: "2026-10-01", endDate: "2026-10-03", source: "tracked" },
    ]);
    expect(conflicts.map((c) => c.title)).toEqual(["Club league"]);
  });
});
