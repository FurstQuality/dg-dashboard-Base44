import { describe, expect, it } from "vitest";
import {
  evaluateRegistrationCheckIn,
  normalizePlayerCode,
  parseScanPayload,
  playerPassPayload,
  resolveCheckInWindow,
} from "../checkin-rules";

describe("resolveCheckInWindow", () => {
  it("opens four hours before the first tee when no explicit time is set", () => {
    const w = resolveCheckInWindow({
      startDate: "2026-09-05",
      now: new Date("2026-09-04T21:00:00.000Z"),
    });
    expect(w.opensAt.toISOString()).toBe("2026-09-04T20:00:00.000Z");
    expect(w.isOpen).toBe(true);
  });

  it("stays closed before the director's check-in time", () => {
    const w = resolveCheckInWindow({
      checkInOpens: "2026-09-05T12:00:00.000Z",
      startDate: "2026-09-05",
      now: new Date("2026-09-05T09:00:00.000Z"),
    });
    expect(w.isOpen).toBe(false);
    expect(w.reason).toMatch(/hasn't opened/i);
  });

  it("stays open through the final day of a multi-day event", () => {
    const w = resolveCheckInWindow({
      startDate: "2026-09-05",
      endDate: "2026-09-06",
      now: new Date("2026-09-06T18:00:00.000Z"),
    });
    expect(w.isOpen).toBe(true);
  });

  it("closes a day after the event ends", () => {
    const w = resolveCheckInWindow({
      startDate: "2026-09-05",
      endDate: "2026-09-05",
      now: new Date("2026-09-07T01:00:00.000Z"),
    });
    expect(w.isOpen).toBe(false);
    expect(w.reason).toMatch(/closed/i);
  });
});

describe("evaluateRegistrationCheckIn", () => {
  const open = { windowOpen: true, override: false };

  it("checks in a confirmed player", () => {
    expect(evaluateRegistrationCheckIn({ status: "confirmed" }, open).outcome).toBe("checked_in");
  });

  it("is idempotent for a player already checked in", () => {
    const v = evaluateRegistrationCheckIn({ status: "checked_in" }, open);
    expect(v.outcome).toBe("already");
  });

  it("blocks withdrawn players", () => {
    const v = evaluateRegistrationCheckIn({ status: "withdrawn" }, open);
    expect(v.outcome).toBe("blocked");
  });

  it("blocks outside the window unless the director overrides", () => {
    expect(
      evaluateRegistrationCheckIn({ status: "pending" }, { windowOpen: false, override: false })
        .outcome,
    ).toBe("blocked");
    expect(
      evaluateRegistrationCheckIn({ status: "pending" }, { windowOpen: false, override: true })
        .outcome,
    ).toBe("checked_in");
  });
});

describe("scan payloads", () => {
  it("reads the dgd player URI", () => {
    expect(parseScanPayload(playerPassPayload("abc123"))).toBe("abc123");
  });

  it("reads a pass query parameter", () => {
    expect(parseScanPayload("https://dgdashboard.lovable.app/pass?pass=tok99")).toBe("tok99");
  });

  it("falls back to the raw value", () => {
    expect(parseScanPayload("  tok42 ")).toBe("tok42");
  });

  it("normalizes typed player codes", () => {
    expect(normalizePlayerCode(" ab3d-9kx2 ")).toBe("AB3D9KX2");
  });
});
