import { describe, it, expect } from "vitest";
import {
  buildTournamentQuietWindows,
  mergeNotificationPrefs,
  quietHoursStatus,
} from "@/lib/platform-config";

describe("buildTournamentQuietWindows", () => {
  it("uses the published tee time and an estimated round length", () => {
    const [w] = buildTournamentQuietWindows(
      [{ title: "Ledgestone Open", status: "registered", starts_at: "2026-08-01T13:30:00.000Z" }],
      { roundHours: 4 },
    );
    expect(w.eventName).toBe("Ledgestone Open");
    expect(w.startsAt.toISOString()).toBe("2026-08-01T13:30:00.000Z");
    expect(w.endsAt.toISOString()).toBe("2026-08-01T17:30:00.000Z");
  });

  it("falls back to the whole event span when no tee time is published", () => {
    const [w] = buildTournamentQuietWindows([
      { title: "Club Champs", status: "confirmed", starts_on: "2026-08-01", ends_on: "2026-08-02" },
    ]);
    expect(w.startsAt.getFullYear()).toBe(2026);
    expect(w.endsAt.getTime()).toBeGreaterThan(w.startsAt.getTime());
  });

  it("ignores events the player is not actually playing", () => {
    expect(
      buildTournamentQuietWindows([
        { status: "interested", starts_on: "2026-08-01" },
        { status: "withdrawn", starts_on: "2026-08-01" },
        { status: "cancelled", starts_on: "2026-08-01" },
        { status: "completed", starts_on: "2026-08-01" },
      ]),
    ).toHaveLength(0);
  });

  it("skips rows without any date", () => {
    expect(buildTournamentQuietWindows([{ status: "registered" }])).toHaveLength(0);
  });
});

describe("quietHoursStatus", () => {
  const prefs = mergeNotificationPrefs({
    quietHours: {
      enabled: true,
      start: "22:00",
      end: "07:00",
      duringTournaments: true,
      duringLeagues: true,
      tournamentAwardsBufferMinutes: 60,
    },
  });

  it("holds alerts during a tournament window plus the awards buffer", () => {
    const windows = buildTournamentQuietWindows(
      [{ title: "Ledgestone Open", status: "registered", starts_at: "2026-08-01T13:00:00.000Z" }],
      { roundHours: 4 },
    );
    const during = quietHoursStatus(prefs, new Date("2026-08-01T15:00:00.000Z"), windows);
    expect(during).toMatchObject({
      quiet: true,
      reason: "tournament",
      eventName: "Ledgestone Open",
    });

    const inBuffer = quietHoursStatus(prefs, new Date("2026-08-01T17:30:00.000Z"), windows);
    expect(inBuffer.quiet).toBe(true);

    const afterAwards = quietHoursStatus(prefs, new Date("2026-08-01T19:00:00.000Z"), windows);
    expect(afterAwards.reason).not.toBe("tournament");
  });

  it("does not apply tournament quiet hours when the preference is off", () => {
    const off = mergeNotificationPrefs({
      quietHours: {
        enabled: false,
        start: "22:00",
        end: "07:00",
        duringTournaments: false,
        duringLeagues: false,
        tournamentAwardsBufferMinutes: 60,
      },
    });
    const windows = buildTournamentQuietWindows([
      { status: "registered", starts_at: "2026-08-01T13:00:00.000Z" },
    ]);
    expect(quietHoursStatus(off, new Date("2026-08-01T14:00:00.000Z"), windows).quiet).toBe(false);
  });
});
