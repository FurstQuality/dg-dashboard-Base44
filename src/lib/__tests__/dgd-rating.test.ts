import { describe, expect, it } from "vitest";
import {
  computeDgdRating,
  computePdgaRating,
  computeUdiscRating,
} from "@/lib/stats/rating-engines";
import type { EngineRound } from "@/lib/stats/rating-engine";

const day = 86_400_000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString().slice(0, 10);

function round(rating: number, daysAgo: number, course: string, source = "app"): EngineRound {
  return {
    played_on: iso(daysAgo),
    round_rating: rating,
    score: null,
    ssa: null,
    source,
    format: "singles",
    course,
  };
}

/** Build an all-source pool the way stats.functions does before rating. */
function pool(rounds: EngineRound[]) {
  const empty = computeUdiscRating([]);
  const pdga = computePdgaRating(rounds);
  const all = computeUdiscRating(rounds, new Date());
  // computeUdiscRating filters by source, so use a permissive all-source calc.
  return { pdga, empty, all };
}

describe("DGD rating", () => {
  it("leans on the last 10 rounds so a rise moves the number up", () => {
    const older = Array.from({ length: 20 }, (_, i) => round(900, 200 + i, "Home Park"));
    const recent = Array.from({ length: 10 }, (_, i) => round(980, i + 1, "Home Park"));
    const { pdga, empty } = pool([]);
    const flatAll = computeAllSource([...older, ...older.map((r) => ({ ...r }))]);
    const risingAll = computeAllSource([...older, ...recent]);

    const flat = computeDgdRating(pdga, empty, [], flatAll);
    const rising = computeDgdRating(pdga, empty, [], risingAll);
    expect(rising.rating).not.toBeNull();
    expect(flat.rating).not.toBeNull();
    expect(rising.rating!).toBeGreaterThan(flat.rating!);
    expect(rising.recentTenDelta).toBeGreaterThan(0);
  });

  it("credits scoring well away from your home courses", () => {
    const home = Array.from({ length: 10 }, (_, i) => round(900, 30 + i, "Home Park"));
    const awayStrong = Array.from({ length: 6 }, (_, i) => round(950, i + 1, `Road Course ${i}`));
    const awayWeak = Array.from({ length: 6 }, (_, i) => round(900, i + 1, `Road Course ${i}`));
    const { pdga, empty } = pool([]);

    const strong = computeDgdRating(pdga, empty, [], computeAllSource([...home, ...awayStrong]));
    const weak = computeDgdRating(pdga, empty, [], computeAllSource([...home, ...awayWeak]));

    expect(strong.awayRounds).toBe(6);
    expect(strong.awayDelta).toBeGreaterThan(0);
    expect(weak.awayDelta).toBe(0);
    expect(strong.rating!).toBeGreaterThan(weak.rating!);
  });
});

/** All-source singles calc — mirrors the blended pool passed as `fallback`. */
function computeAllSource(rounds: EngineRound[]) {
  return computeUdiscRating(
    rounds.map((r) => ({ ...r, source: "udisc" })),
    new Date(),
  );
}
