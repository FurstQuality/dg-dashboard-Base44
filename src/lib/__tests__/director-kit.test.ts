import { describe, expect, it } from "vitest";
import { describeMappedFeatures, kitWarnings, money, pdgaChecklistTemplate, daysUntil } from "@/lib/director-kit";
import type { KitDivision, KitLayout, KitRound } from "@/lib/director-kit";

const layout = (over: Partial<KitLayout> = {}): KitLayout => ({
  id: "l1",
  name: "Blue",
  courseName: "Rogers Lakewood",
  holeCount: 18,
  parTotal: 54,
  distanceTotal: 5400,
  holes: Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: 3,
    distanceFt: 300,
    nickname: null,
    caddyNotes: "Anhyzer line",
    hazards: [],
    mappedFeatures: [],
    teeName: null,
  })),
  ...over,
});

const round = (over: Partial<KitRound> = {}): KitRound => ({
  id: "r1",
  roundNumber: 1,
  status: "scheduled",
  courseName: "Rogers Lakewood",
  layoutId: "l1",
  layoutName: "Blue",
  startsAt: "2026-09-05T14:00:00Z",
  teeTimeStart: "09:00",
  shotgunTime: null,
  teeTimeType: "tee_times",
  holesPlayed: 18,
  notes: null,
  ...over,
});

const division = (): KitDivision => ({
  id: "d1",
  name: "MA1",
  code: "MA1",
  entryFeeCents: 5000,
  maxPlayers: 72,
  minRating: null,
  maxRating: null,
  players: 40,
});

describe("kitWarnings", () => {
  it("stays quiet when the event is fully built", () => {
    expect(
      kitWarnings({ layouts: [layout()], rounds: [round()], divisions: [division()] }),
    ).toEqual([]);
  });

  it("flags a missing layout, rounds, and divisions", () => {
    const out = kitWarnings({ layouts: [], rounds: [], divisions: [] });
    expect(out.some((w) => w.includes("No layout attached"))).toBe(true);
    expect(out.some((w) => w.includes("No rounds scheduled"))).toBe(true);
    expect(out.some((w) => w.includes("No divisions"))).toBe(true);
  });

  it("flags holes missing distances and caddy notes", () => {
    const holes = layout().holes.map((h, i) => ({
      ...h,
      distanceFt: i < 2 ? null : h.distanceFt,
      caddyNotes: null,
    }));
    const out = kitWarnings({
      layouts: [layout({ holes })],
      rounds: [round()],
      divisions: [division()],
    });
    expect(out.some((w) => w.startsWith("2 hole(s)"))).toBe(true);
    expect(out.some((w) => w.includes("no caddy notes"))).toBe(true);
  });

  it("flags a round without a course or a start time", () => {
    const out = kitWarnings({
      layouts: [layout()],
      rounds: [round({ courseName: null, teeTimeStart: null })],
      divisions: [division()],
    });
    expect(out).toContain("Round 1 has no course assigned.");
    expect(out).toContain("Round 1 has no tee time or shotgun start.");
  });

  it("flags a hole count that does not match the built holes", () => {
    const out = kitWarnings({
      layouts: [layout({ holeCount: 9 })],
      rounds: [round()],
      divisions: [division()],
    });
    expect(out.some((w) => w.includes("lists 9 holes but 18 are built"))).toBe(true);
  });
});

describe("money", () => {
  it("prints whole dollars without cents and partial amounts with cents", () => {
    expect(money(5000)).toBe("$50");
    expect(money(4999)).toBe("$49.99");
    expect(money(0)).toBe("$0");
    expect(money(null)).toBe("$0");
  });
});

describe("pdgaChecklistTemplate", () => {
  it("only uses phases the Staff & prep desk can label", () => {
    const allowed = new Set(["prep", "week_of", "event_day", "wrap_up"]);
    for (const item of pdgaChecklistTemplate()) expect(allowed.has(item.phase)).toBe(true);
  });
});

describe("daysUntil", () => {
  it("returns 0 for today and negative for past dates", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(daysUntil(today)).toBe(0);
    expect(daysUntil("2020-01-01")).toBeLessThan(0);
  });
});

describe("describeMappedFeatures", () => {
  it("pluralizes and counts mapped feature types", () => {
    expect(describeMappedFeatures(["mando", "mando", "ob_line"])).toEqual([
      "2 mandatories",
      "OB line",
    ]);
  });

  it("ignores unknown types and empty input", () => {
    expect(describeMappedFeatures(["tee", "basket"])).toEqual([]);
    expect(describeMappedFeatures([])).toEqual([]);
  });
});
