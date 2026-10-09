import { describe, it, expect } from "vitest";
import {
  computeGoalProgress,
  currentValueFor,
  formatGoalValue,
  goalMetricDef,
  GOAL_METRICS,
  type GoalStatsSnapshot,
} from "@/lib/stats/goals";

const stats: GoalStatsSnapshot = {
  rating: 920,
  round_rating: 965,
  rounds: 24,
  birdies: 180,
  birdie_rate: 22.5,
  scoring_average: 4.2,
  courses_played: 17,
  coursePrs: { "northwood black": -2, "lemon lake": 3 },
};

const TODAY = "2026-09-01";

describe("goal metric definitions", () => {
  it("declares direction and bounds for every metric", () => {
    for (const m of GOAL_METRICS) {
      expect(typeof m.higherIsBetter).toBe("boolean");
      expect(m.min).toBeLessThan(m.max);
      expect(m.label.length).toBeGreaterThan(0);
    }
  });

  it("only marks course PR as needing a course", () => {
    expect(GOAL_METRICS.filter((m) => m.needsCourse).map((m) => m.metric)).toEqual(["course_pr"]);
  });
});

describe("currentValueFor", () => {
  it("reads plain metrics from the snapshot", () => {
    expect(currentValueFor({ metric: "rating", target: 950 }, stats)).toBe(920);
    expect(currentValueFor({ metric: "birdie_rate", target: 30 }, stats)).toBe(22.5);
  });

  it("matches course PRs case-insensitively", () => {
    expect(
      currentValueFor({ metric: "course_pr", target: -5, course_name: "Northwood Black" }, stats),
    ).toBe(-2);
  });

  it("returns null for a course with no rounds", () => {
    expect(
      currentValueFor({ metric: "course_pr", target: -5, course_name: "Maple Hill" }, stats),
    ).toBeNull();
  });
});

describe("computeGoalProgress", () => {
  it("reports no-data when the metric has no value yet", () => {
    const empty: GoalStatsSnapshot = { ...stats, rating: null };
    const p = computeGoalProgress({ metric: "rating", target: 950 }, empty, TODAY);
    expect(p.status).toBe("no-data");
    expect(p.pct).toBe(0);
  });

  it("marks a higher-is-better goal achieved once reached", () => {
    const p = computeGoalProgress({ metric: "rating", target: 900, baseline: 850 }, stats, TODAY);
    expect(p.status).toBe("achieved");
    expect(p.pct).toBe(100);
    expect(p.remaining).toBe(0);
  });

  it("marks a lower-is-better goal achieved once under target", () => {
    const p = computeGoalProgress(
      { metric: "scoring_average", target: 5, baseline: 8 },
      stats,
      TODAY,
    );
    expect(p.status).toBe("achieved");
  });

  it("scales progress between baseline and target", () => {
    const p = computeGoalProgress({ metric: "rating", target: 940, baseline: 900 }, stats, TODAY);
    expect(p.pct).toBe(50);
    expect(p.remaining).toBe(20);
    expect(p.status).not.toBe("achieved");
  });

  it("reads 0% when the player moved away from the target", () => {
    const p = computeGoalProgress({ metric: "rating", target: 1000, baseline: 940 }, stats, TODAY);
    expect(p.pct).toBe(0);
  });

  it("treats a passed deadline as behind", () => {
    const p = computeGoalProgress(
      { metric: "rating", target: 1000, baseline: 900, deadline: "2026-08-01" },
      stats,
      TODAY,
    );
    expect(p.status).toBe("behind");
    expect(p.daysLeft).toBeLessThan(0);
  });

  it("counts days left for a future deadline", () => {
    const p = computeGoalProgress(
      { metric: "rating", target: 950, baseline: 900, deadline: "2026-09-11" },
      stats,
      TODAY,
    );
    expect(p.daysLeft).toBe(10);
  });

  it("honours an explicit completed_at stamp", () => {
    const p = computeGoalProgress(
      { metric: "rating", target: 1000, baseline: 900, completed_at: "2026-08-20T00:00:00Z" },
      stats,
      TODAY,
    );
    expect(p.status).toBe("achieved");
  });

  it("never returns a percentage outside 0-100", () => {
    for (const m of GOAL_METRICS) {
      const p = computeGoalProgress(
        { metric: m.metric, target: m.min, course_name: "Lemon Lake" },
        stats,
        TODAY,
      );
      expect(p.pct).toBeGreaterThanOrEqual(0);
      expect(p.pct).toBeLessThanOrEqual(100);
    }
  });
});

describe("formatGoalValue", () => {
  it("signs score-relative metrics", () => {
    expect(formatGoalValue("scoring_average", 4.2)).toBe("+4.2");
    expect(formatGoalValue("course_pr", -2)).toBe("-2");
  });

  it("adds a percent sign to rate metrics", () => {
    expect(formatGoalValue("birdie_rate", 22.5)).toBe("23%");
  });

  it("renders an em dash for missing values", () => {
    expect(formatGoalValue("rating", null)).toBe("—");
  });

  it("resolves definitions by key", () => {
    expect(goalMetricDef("rating")?.higherIsBetter).toBe(true);
    expect(goalMetricDef("nope")).toBeNull();
  });
});
