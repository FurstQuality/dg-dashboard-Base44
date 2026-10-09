import { describe, expect, it } from "vitest";
import {
  bearingBetween,
  effectiveDistanceFt,
  normalizeDeg,
  parValueNote,
  shapeAdvice,
  summarizeHoleHistory,
  windEffect,
} from "@/lib/scoring-caddy";

describe("normalizeDeg", () => {
  it("wraps negatives and overflow", () => {
    expect(normalizeDeg(-90)).toBe(270);
    expect(normalizeDeg(450)).toBe(90);
  });
});

describe("bearingBetween", () => {
  it("returns roughly north for a due-north target", () => {
    const b = bearingBetween({ latitude: 40, longitude: -90 }, { latitude: 40.01, longitude: -90 });
    expect(Math.round(b)).toBe(0);
  });
  it("returns roughly east for a due-east target", () => {
    const b = bearingBetween({ latitude: 40, longitude: -90 }, { latitude: 40, longitude: -89.99 });
    expect(Math.round(b)).toBe(90);
  });
});

describe("windEffect", () => {
  it("returns null without complete inputs", () => {
    expect(windEffect({ speedMph: 10, fromDeg: null, holeBearingDeg: 0 })).toBeNull();
  });

  it("reads a pure headwind when wind comes from the target", () => {
    const e = windEffect({ speedMph: 12, fromDeg: 0, holeBearingDeg: 0 })!;
    expect(Math.round(e.alongMph)).toBe(-12);
    expect(Math.abs(e.crossMph)).toBeLessThan(0.001);
    expect(e.label).toContain("headwind");
  });

  it("reads a pure tailwind when wind comes from behind the tee", () => {
    const e = windEffect({ speedMph: 10, fromDeg: 180, holeBearingDeg: 0 })!;
    expect(Math.round(e.alongMph)).toBe(10);
    expect(e.label).toContain("tailwind");
  });

  it("detects crosswind direction", () => {
    const right = windEffect({ speedMph: 10, fromDeg: 270, holeBearingDeg: 0 })!;
    expect(right.crossPush).toBe("right");
    const left = windEffect({ speedMph: 10, fromDeg: 90, holeBearingDeg: 0 })!;
    expect(left.crossPush).toBe("left");
  });

  it("calls a zero wind calm", () => {
    expect(windEffect({ speedMph: 0, fromDeg: 90, holeBearingDeg: 0 })!.label).toBe("Calm");
  });
});

describe("effectiveDistanceFt", () => {
  it("plays longer into a headwind", () => {
    expect(effectiveDistanceFt(300, -10)).toBeGreaterThan(300);
  });
  it("plays shorter downwind", () => {
    expect(effectiveDistanceFt(300, 10)).toBeLessThan(300);
  });
  it("is unchanged in calm air", () => {
    expect(effectiveDistanceFt(320, 0)).toBe(320);
  });
  it("guards nonsense input", () => {
    expect(effectiveDistanceFt(0, -10)).toBe(0);
  });
});

describe("shapeAdvice", () => {
  it("suggests overstable into a strong headwind", () => {
    const a = shapeAdvice(windEffect({ speedMph: 15, fromDeg: 0, holeBearingDeg: 0 }));
    expect(a).toMatch(/overstable/i);
  });
  it("suggests hyzer for a right-pushing crosswind", () => {
    const a = shapeAdvice(windEffect({ speedMph: 10, fromDeg: 270, holeBearingDeg: 0 }));
    expect(a).toMatch(/hyzer/i);
  });
  it("says nothing in calm air", () => {
    expect(shapeAdvice(windEffect({ speedMph: 1, fromDeg: 0, holeBearingDeg: 0 }))).toBeNull();
  });
});

describe("summarizeHoleHistory", () => {
  it("handles an empty record", () => {
    expect(summarizeHoleHistory([])).toEqual({
      rounds: 0,
      average: null,
      best: null,
      birdieRatePct: null,
      lastThree: [],
    });
  });

  it("summarizes average, best, birdie rate, and last three", () => {
    const s = summarizeHoleHistory([
      { strokes: 2, par: 3 },
      { strokes: 3, par: 3 },
      { strokes: 4, par: 3 },
      { strokes: 3, par: 3 },
    ]);
    expect(s.rounds).toBe(4);
    expect(s.average).toBe(3);
    expect(s.best).toBe(2);
    expect(s.birdieRatePct).toBe(25);
    expect(s.lastThree).toEqual([2, 3, 4]);
  });
});

describe("parValueNote", () => {
  it("flags a birdie hole", () => {
    expect(parValueNote(2.5, 3)).toMatch(/birdie/i);
  });
  it("flags a hole that gives strokes back", () => {
    expect(parValueNote(3.5, 3)).toMatch(/gain/i);
  });
  it("returns null without data", () => {
    expect(parValueNote(null, 3)).toBeNull();
  });
});
