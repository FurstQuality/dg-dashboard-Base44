import { describe, expect, it } from "vitest";
import {
  formatToPar,
  isEventInPlay,
  isOnTheCourse,
  latestRoundPerPlayer,
  liveEventSort,
  livePlayerSort,
  type FriendLiveEvent,
  type FriendLivePlayer,
} from "@/lib/live/friend-live";

function player(overrides: Partial<FriendLivePlayer> = {}): FriendLivePlayer {
  return {
    userId: "u1",
    displayName: "Player",
    username: null,
    pdgaNumber: "12345",
    division: "MPO",
    roundNumber: 1,
    thru: 0,
    holeCount: 18,
    place: null,
    total: null,
    toPar: null,
    roundToPar: null,
    teeTime: null,
    cardNumber: null,
    completed: false,
    roundStarted: false,
    holeScores: null,
    holePars: null,
    lastSyncedAt: null,
    ...overrides,
  };
}

function event(overrides: Partial<FriendLiveEvent> = {}): FriendLiveEvent {
  return {
    eventRef: "1",
    name: "Event",
    location: null,
    startDate: "2026-06-01",
    endDate: "2026-06-03",
    tier: null,
    pdgaUrl: "https://www.pdga.com/tour/event/1",
    lastSyncedAt: null,
    syncStatus: null,
    players: [],
    ...overrides,
  };
}

describe("friend live helpers", () => {
  it("keeps only the furthest round for each player", () => {
    const rows = latestRoundPerPlayer([
      player({ roundNumber: 1 }),
      player({ roundNumber: 3 }),
      player({ pdgaNumber: "999", roundNumber: 2 }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.pdgaNumber === "12345")?.roundNumber).toBe(3);
  });

  it("treats a started, unfinished card as on the course", () => {
    expect(isOnTheCourse(player({ roundStarted: true }))).toBe(true);
    expect(isOnTheCourse(player({ thru: 6 }))).toBe(true);
    expect(isOnTheCourse(player({ roundStarted: true, completed: true }))).toBe(false);
    expect(isOnTheCourse(player())).toBe(false);
  });

  it("sorts events with live cards first", () => {
    const quiet = event({ name: "Quiet", players: [player({ completed: true })] });
    const live = event({ name: "Live", players: [player({ roundStarted: true })] });
    expect([quiet, live].sort(liveEventSort)[0]!.name).toBe("Live");
  });

  it("sorts live players ahead of finished ones, then by place", () => {
    const sorted = [
      player({ displayName: "Done", completed: true, place: 1 }),
      player({ displayName: "Second", roundStarted: true, place: 12 }),
      player({ displayName: "Leader", roundStarted: true, place: 2 }),
    ].sort(livePlayerSort);
    expect(sorted.map((p) => p.displayName)).toEqual(["Leader", "Second", "Done"]);
  });

  it("formats scores the way players read them", () => {
    expect(formatToPar(0)).toBe("E");
    expect(formatToPar(-4)).toBe("-4");
    expect(formatToPar(3)).toBe("+3");
    expect(formatToPar(null)).toBe("—");
  });

  it("only counts an event as in play inside its date window", () => {
    expect(isEventInPlay("2026-06-01", "2026-06-03", "2026-06-02")).toBe(true);
    expect(isEventInPlay("2026-06-01", "2026-06-03", "2026-06-04")).toBe(false);
    expect(isEventInPlay(null, null, "2026-06-02")).toBe(false);
  });
});
