import { describe, expect, it } from "vitest";
import { estimateEventWindow, evaluateSameDayConflict } from "@/lib/tournament-knowledge";

describe("estimateEventWindow", () => {
  it("uses the posted tee time when one is known", () => {
    const w = estimateEventWindow({
      dateISO: "2026-07-30",
      teeTime: "10:10:00",
      format: "three_day",
    })!;
    expect(w).not.toBeNull();
    expect(w.startAssumed).toBe(false);
    expect(new Date(w.startMs).getHours()).toBe(10);
    // A single tournament round is treated as roughly a 3 hour block.
    expect(w.hours).toBeGreaterThanOrEqual(2.5);
    expect(w.hours).toBeLessThanOrEqual(3.5);
  });

  it("assumes a start time when no tee time is posted", () => {
    const w = estimateEventWindow({ dateISO: "2026-07-30", teeTime: null, format: "three_day" })!;
    expect(w.startAssumed).toBe(true);
    expect(new Date(w.startMs).getHours()).toBe(9);
  });

  it("treats leagues as evening events", () => {
    const w = estimateEventWindow({ dateISO: "2026-07-30", format: "singles_league" })!;
    expect(new Date(w.startMs).getHours()).toBe(17);
  });

  it("widens the busy window for flex-start events with no chosen time", () => {
    const flex = estimateEventWindow({ dateISO: "2026-07-30", format: "flex_start" })!;
    const fixed = estimateEventWindow({
      dateISO: "2026-07-30",
      teeTime: "08:00:00",
      format: "flex_start",
    })!;
    expect(flex.hours).toBeGreaterThan(fixed.hours);
  });

  it("returns null for an unparseable date", () => {
    expect(estimateEventWindow({ dateISO: "not-a-date", format: "three_day" })).toBeNull();
  });
});

describe("evaluateSameDayConflict", () => {
  const window = (dateISO: string, teeTime: string) =>
    estimateEventWindow({ dateISO, teeTime, format: "three_day" })!;

  it("clears a morning round followed by a late-afternoon round", () => {
    const result = evaluateSameDayConflict(
      window("2026-07-30", "10:10:00"),
      window("2026-07-30", "14:30:00"),
    );
    expect(result.severity).not.toBe("error");
    expect(result.gapHours).toBeGreaterThan(0);
  });

  it("flags genuinely overlapping rounds as an error", () => {
    const result = evaluateSameDayConflict(
      window("2026-07-30", "10:00:00"),
      window("2026-07-30", "11:00:00"),
    );
    expect(result.severity).toBe("error");
    expect(result.gapHours).toBeLessThan(0);
    expect(result.reason).toMatch(/overlap/i);
  });

  it("softens overlaps to a warning when both tee times are unknown", () => {
    const a = estimateEventWindow({ dateISO: "2026-07-30", format: "three_day" })!;
    const b = estimateEventWindow({ dateISO: "2026-07-30", format: "two_round_day" })!;
    const result = evaluateSameDayConflict(a, b);
    expect(result.severity).toBe("warning");
    expect(result.reason).toMatch(/tee time/i);
  });
});
