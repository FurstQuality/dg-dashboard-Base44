import { describe, it, expect } from "vitest";
import { computeTier, resolveTier, TierSignals, TIERS } from "@/lib/dgd-tier/engine";
import { scale1000Public } from "@/lib/dgd-v1/scale-1000";
import { readFileSync } from "node:fs";

const base: TierSignals = {
  first_activity_on: null, as_of: "2026-10-05", active_years: 0, active_months: 0, verified_rounds: 0, play_days: 0,
  unique_courses: 0, events_played: 0, events_directed: 0, leagues_organized: 0, club_leadership: 0, contribution_points: 0, credentials: [],
};
const newPlayer: TierSignals = { ...base, first_activity_on: "2026-08-01", active_years: 1, active_months: 2, verified_rounds: 6, play_days: 6, unique_courses: 2, events_played: 0 };
const veteranLeader: TierSignals = {
  ...base, first_activity_on: "2014-04-01", active_years: 12, active_months: 100, verified_rounds: 600, play_days: 500, unique_courses: 60,
  events_played: 40, events_directed: 20, leagues_organized: 5, club_leadership: 1, contribution_points: 400,
  credentials: ["TOURNAMENT_DIRECTOR", "LEAGUE_DIRECTOR", "COURSE_STEWARD"],
};
const strongCompetitor: TierSignals = {
  ...base, first_activity_on: "2023-06-01", active_years: 4, active_months: 30, verified_rounds: 220, play_days: 200, unique_courses: 12,
  events_played: 15, credentials: ["PDGA_OFFICIAL"],
};

describe("DGD Tier — required profiles", () => {
  it("GREEN 650: new low-rated player", () => {
    expect(computeTier(newPlayer).computed_tier).toBe("GREEN");
    expect(scale1000Public(-12)).toBeGreaterThan(500);
  });
  it("GOLD 650: long-time low-skill leader", () => {
    const r = computeTier(veteranLeader);
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.computed_tier).toBe("GOLD");
  });
  it("BRONZE 950: high-skill established competitor without service", () => {
    const r = computeTier(strongCompetitor);
    expect(r.computed_tier).toBe("BRONZE");
    expect(r.next?.tier).toBe("SILVER");
    expect(r.next?.requirements.find((q) => q.key === "service")?.met).toBe(false);
  });
});

describe("DGD Tier — independence and rules", () => {
  it("has no rating/form/skill input at all", () => {
    const src = readFileSync("src/lib/dgd-tier/engine.ts", "utf8");
    expect(src).not.toMatch(/display_rating|form_value|\bmu\b|scale1000/);
  });
  it("85 points without leadership does not make Gold", () => {
    const r = computeTier({ ...veteranLeader, events_directed: 0, leagues_organized: 0, club_leadership: 0, contribution_points: 0, credentials: ["PDGA_OFFICIAL", "TOURNAMENT_DIRECTOR", "COURSE_DESIGNER"], adjustments: [{ category: "SERVICE", points: 0 }] });
    expect(r.computed_tier).not.toBe("GOLD");
  });
  it("tiers are earned in order — missing a lower requirement caps the tier", () => {
    const r = computeTier({ ...veteranLeader, events_played: 1 });
    expect(TIERS.indexOf(r.computed_tier)).toBeLessThan(TIERS.indexOf("BRONZE"));
  });
  it("tier does not decay on normal recalculation, only on correction", () => {
    expect(resolveTier("SILVER", "BRONZE", false)).toBe("SILVER");
    expect(resolveTier("SILVER", "BRONZE", true)).toBe("BRONZE");
    expect(resolveTier("BRONZE", "SILVER", false)).toBe("SILVER");
  });
  it("anti-gaming: duplicate imports and social activity do not inflate the score", () => {
    const dup = computeTier({ ...newPlayer, verified_rounds: 5000 });
    expect(dup.categories.PLAYING.points).toBe(computeTier(newPlayer).categories.PLAYING.points);
    expect(computeTier({ ...newPlayer, unique_courses: 2 }).categories.COURSES.points).toBeLessThan(2);
  });
  it("every category respects its maximum and the total stays within 0–100", () => {
    const r = computeTier({ ...veteranLeader, credentials: ["PDGA_OFFICIAL", "TOURNAMENT_DIRECTOR", "LEAGUE_DIRECTOR", "COURSE_STEWARD", "CLUB_ORGANIZER"], adjustments: [{ category: "SERVICE", points: 25 }] });
    for (const c of Object.values(r.categories)) expect(c.points).toBeLessThanOrEqual(c.max);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});
