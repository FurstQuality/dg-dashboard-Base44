import { describe, expect, it } from "vitest";
import {
  buildHoleFocus,
  buildPracticePlan,
  cashLineFor,
  computeReadiness,
  daysUntilDate,
  familiarityFrom,
  percentileVsField,
  rankDivisions,
  simulatePlacement,
  summarizeRatings,
  type HolePlay,
} from "./prep-model";

describe("summarizeRatings", () => {
  it("returns nulls for an empty field", () => {
    expect(summarizeRatings([])).toEqual({ avg: null, median: null, top: null });
  });
  it("summarizes a field", () => {
    const s = summarizeRatings([900, 950, 1000]);
    expect(s.avg).toBe(950);
    expect(s.top).toBe(1000);
  });
});

describe("percentileVsField", () => {
  it("is null without a rating", () => {
    expect(percentileVsField(null, [900])).toBeNull();
  });
  it("counts the share of the field below the player", () => {
    expect(percentileVsField(950, [900, 920, 960, 1000])).toBe(50);
  });
});

describe("simulatePlacement", () => {
  it("is deterministic and favors stronger players", () => {
    const strong = simulatePlacement(1000, [900, 890, 880], cashLineFor(4));
    const weak = simulatePlacement(850, [900, 890, 880], cashLineFor(4));
    expect(strong).toEqual(simulatePlacement(1000, [900, 890, 880], cashLineFor(4)));
    expect(strong.winPct).toBeGreaterThan(weak.winPct);
  });
  it("gives a solo entrant certainty", () => {
    expect(simulatePlacement(900, [], 1).winPct).toBe(100);
  });
});

describe("rankDivisions", () => {
  it("marks divisions above the PDGA rating cap as ineligible", () => {
    // MA3 is capped under 900, so a 910-rated player cannot enter.
    const { options } = rankDivisions(910, [{ code: "MA3", ratings: [880, 875, 870] }]);
    expect(options[0].recommendation).toBe("over_cap");
  });
  it("keeps MA1 open at any rating — it has no cap", () => {
    const { options } = rankDivisions(985, [{ code: "MA1", ratings: [960, 950, 945] }]);
    expect(options[0].recommendation).not.toBe("over_cap");
  });

  it("recommends the best eligible division", () => {
    const { recommendedCode } = rankDivisions(925, [
      { code: "MPO", ratings: [1020, 1010, 1005, 1000, 995, 990] },
      { code: "MA1", ratings: [930, 925, 920, 915, 910, 905] },
    ]);
    expect(recommendedCode).toBe("MA1");
  });
  it("flags divisions the player has outgrown", () => {
    const { options } = rankDivisions(845, [
      { code: "MA3", ratings: [800, 790, 780, 770, 760, 750] },
    ]);
    expect(options[0].recommendation).toBe("too_easy");
  });
});

describe("buildHoleFocus", () => {
  const plays: HolePlay[] = [
    { courseKey: "c1", courseName: "Maple Hill", layoutName: "Gold", holeNumber: 5, par: 3, distanceFt: 320, strokes: 4, penalties: 1 },
    { courseKey: "c1", courseName: "Maple Hill", layoutName: "Gold", holeNumber: 5, par: 3, distanceFt: 320, strokes: 5, penalties: 1 },
    { courseKey: "c1", courseName: "Maple Hill", layoutName: "Gold", holeNumber: 7, par: 4, distanceFt: 600, strokes: 3 },
  ];

  it("ranks the most expensive hole first", () => {
    const focus = buildHoleFocus(plays, 2);
    expect(focus[0].holeNumber).toBe(5);
    expect(focus[0].avgVsPar).toBe(1.5);
    expect(focus[0].projectedCost).toBe(3);
    expect(focus[0].bogeyPlusPct).toBe(100);
    expect(focus[0].penaltyRate).toBe(100);
  });

  it("identifies birdie holes", () => {
    const focus = buildHoleFocus(plays);
    const hole7 = focus.find((h) => h.holeNumber === 7)!;
    expect(hole7.avgVsPar).toBe(-1);
    expect(hole7.birdiePct).toBe(100);
  });

  it("ignores unscored holes", () => {
    expect(buildHoleFocus([{ ...plays[0], strokes: 0 }])).toHaveLength(0);
  });
});

describe("buildPracticePlan", () => {
  it("builds a plan from leaks, holes, and practice recency", () => {
    const plan = buildPracticePlan({
      daysUntil: 3,
      leaks: [
        {
          id: "c1",
          category: "Circle 1 putting",
          strokesPerRound: 1.2,
          ratingImpact: 12,
          sample: 60,
          suggestion: "Putt more",
        },
      ],
      holeFocus: buildHoleFocus([
        { courseKey: "c1", courseName: "Maple Hill", layoutName: null, holeNumber: 5, par: 3, distanceFt: null, strokes: 4 },
      ]),
      familiarity: "none",
      puttingDaysAgo: null,
      rangeDaysAgo: 20,
      courseName: "Maple Hill",
    });
    const ids = plan.map((p) => p.id);
    expect(ids).toContain("leak-c1");
    expect(ids).toContain("hole-specific");
    expect(ids).toContain("course-recon");
    expect(ids).toContain("taper");
    expect(plan.find((p) => p.id === "leak-c1")?.href).toBe("/putting");
  });

  it("skips the taper item when the event is far out", () => {
    const plan = buildPracticePlan({
      daysUntil: 40,
      leaks: [],
      holeFocus: [],
      familiarity: "solid",
      puttingDaysAgo: 1,
      rangeDaysAgo: 2,
      courseName: null,
    });
    expect(plan.map((p) => p.id)).not.toContain("taper");
  });
});

describe("computeReadiness", () => {
  it("scores a fully prepared player near 100", () => {
    const { score } = computeReadiness({
      ratingOnFile: true,
      ratedRounds12mo: 12,
      coursePlays: 5,
      divisionChosen: true,
      fieldSynced: true,
      holeDataPoints: 90,
      puttingDaysAgo: 1,
      rangeDaysAgo: 2,
    });
    expect(score).toBe(100);
  });

  it("scores an unprepared player low and lists gaps", () => {
    const { score, items } = computeReadiness({
      ratingOnFile: false,
      ratedRounds12mo: 0,
      coursePlays: 0,
      divisionChosen: false,
      fieldSynced: false,
      holeDataPoints: 0,
      puttingDaysAgo: null,
      rangeDaysAgo: null,
    });
    expect(score).toBeLessThan(20);
    expect(items.filter((i) => i.status === "missing").length).toBeGreaterThan(4);
  });
});

describe("daysUntilDate and familiarityFrom", () => {
  it("counts whole days until the event", () => {
    expect(daysUntilDate("2026-01-10", new Date("2026-01-05T18:00:00Z"))).toBe(5);
    expect(daysUntilDate(null)).toBeNull();
  });
  it("buckets familiarity", () => {
    expect(familiarityFrom(0)).toBe("none");
    expect(familiarityFrom(1)).toBe("light");
    expect(familiarityFrom(4)).toBe("solid");
  });
});
