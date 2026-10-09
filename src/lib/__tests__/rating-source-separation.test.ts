import { describe, expect, it } from "vitest";
import {
  computeDgdRating,
  computePdgaRating,
  computeUdiscRating,
} from "@/lib/stats/rating-engines";
import type { EngineRound } from "@/lib/stats/rating-engine";

/**
 * Phase 1 regression guard (DGD spec §3, §13): PDGA, UDisc, and DGD ratings
 * are computed independently and never bleed into one another.
 */
const day = 86_400_000;
const iso = (d: number) => new Date(Date.now() - d * day).toISOString().slice(0, 10);
const r = (rating: number, d: number, source: string, course = "Park"): EngineRound => ({
  played_on: iso(d),
  round_rating: rating,
  score: null,
  ssa: null,
  source,
  format: "singles",
  course,
});

const pdgaRounds = Array.from({ length: 10 }, (_, i) => r(950, 10 + i * 20, "pdga"));
const udiscRounds = Array.from({ length: 10 }, (_, i) => r(880, 5 + i * 15, "udisc"));
const appRounds = Array.from({ length: 5 }, (_, i) => r(1000, 2 + i, "app"));
const all = [...pdgaRounds, ...udiscRounds, ...appRounds];

describe("rating source separation", () => {
  it("PDGA rating ignores UDisc and in-app rounds", () => {
    expect(computePdgaRating(all).rating).toBe(computePdgaRating(pdgaRounds).rating);
    expect(computePdgaRating(all).rating).toBe(950);
  });

  it("UDisc rating ignores PDGA and in-app rounds", () => {
    expect(computeUdiscRating(all).rating).toBe(computeUdiscRating(udiscRounds).rating);
    expect(computeUdiscRating(all).rating).toBe(880);
  });

  it("computing DGD does not mutate the PDGA or UDisc results", () => {
    const pdga = computePdgaRating(all);
    const udisc = computeUdiscRating(all);
    const snapshot = JSON.stringify({ pdga, udisc });
    const fallback = computeUdiscRating(all.map((x) => ({ ...x, source: "udisc" })));
    computeDgdRating(pdga, udisc, [], fallback);
    expect(JSON.stringify({ pdga, udisc })).toBe(snapshot);
  });

  it("no rated rounds produces no rating rather than a borrowed one", () => {
    expect(computePdgaRating(udiscRounds).rating).toBeNull();
    expect(computeUdiscRating(pdgaRounds).rating).toBeNull();
  });

  it("doubles rounds never count toward any source", () => {
    const doubles = pdgaRounds.map((x) => ({ ...x, format: "doubles" }));
    expect(computePdgaRating(doubles).rating).toBeNull();
  });
});
