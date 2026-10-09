import { describe, expect, it } from "vitest";
import {
  DGD_V1_DEFAULT_CONFIG as C,
  checkEligibility,
  computeForm,
  fitLayoutDifficulty,
  inputHash,
  replayPlayer,
  toObservations,
  type CanonicalRoundInput,
} from "../dgd-v1/engine";

let n = 0;
const r = (o: Partial<CanonicalRoundInput>): CanonicalRoundInput => ({
  id: `00000000-0000-0000-0000-${String(++n).padStart(12, "0")}`,
  user_id: "u1",
  played_on: "2026-01-01",
  course_key: "oak",
  course_name: "Oak",
  layout_name: "Main",
  score: 54,
  to_par: null,
  hole_count: null,
  canonical_eligibility: "rated",
  has_possible_duplicate: false,
  sources: [],
  ...o,
});

describe("DGD V1 eligibility", () => {
  it("null to_par stays unknown and does not block", () => {
    expect(checkEligibility(r({ to_par: null }), C).eligible).toBe(true);
  });
  it("rejects rating-looking scores, duplicates, unmapped courses", () => {
    expect(checkEligibility(r({ score: 912 }), C).reasons).toContain("score_looks_like_rating");
    expect(checkEligibility(r({ to_par: 905 }), C).reasons).toContain("to_par_looks_like_rating");
    expect(checkEligibility(r({ has_possible_duplicate: true }), C).eligible).toBe(false);
    expect(checkEligibility(r({ course_key: null }), C).reasons).toContain("course_unmapped");
    expect(checkEligibility(r({ canonical_eligibility: "ineligible" }), C).eligible).toBe(false);
  });
});

describe("DGD V1 replay", () => {
  const rounds = [
    ...Array.from({ length: 6 }, (_, i) => r({ user_id: "a", score: 50, played_on: `2026-01-0${i + 1}` })),
    ...Array.from({ length: 6 }, (_, i) => r({ user_id: "b", score: 60, played_on: `2026-01-0${i + 1}` })),
  ];
  const { obs } = toObservations(rounds, C);
  const fit = fitLayoutDifficulty(obs, C);

  it("layout fit converges and is anchored at mean player offset 0", () => {
    expect(fit.converged).toBe(true);
    expect(fit.layouts.get("oak|main")!.difficulty_mu).toBeCloseTo(55, 1);
  });

  it("better player gets higher skill; sigma shrinks with evidence", () => {
    const a = replayPlayer(obs.filter((o) => o.round.user_id === "a"), fit.layouts, C, "2026-01-07");
    const b = replayPlayer(obs.filter((o) => o.round.user_id === "b"), fit.layouts, C, "2026-01-07");
    expect(a.state.skill_mu).toBeGreaterThan(b.state.skill_mu);
    expect(a.state.skill_sigma).toBeLessThan(C.population_prior_sigma);
    // sign: positive strokes_vs_expectation = better than expected
    const e = a.events[0];
    expect(e.strokes_vs_expectation).toBeCloseTo(e.expected_score - e.actual_score);
  });

  it("inactivity widens sigma but never moves mu", () => {
    const os = obs.filter((o) => o.round.user_id === "a");
    const soon = replayPlayer(os, fit.layouts, C, "2026-01-07").state;
    const late = replayPlayer(os, fit.layouts, C, "2027-01-07").state;
    expect(late.skill_mu).toBe(soon.skill_mu);
    expect(late.skill_sigma).toBeGreaterThan(soon.skill_sigma);
    expect(late.confidence).toBeLessThan(soon.confidence);
  });

  it("late-arriving older round is replayed in chronological order", () => {
    const os = obs.filter((o) => o.round.user_id === "a");
    const late = toObservations([r({ user_id: "a", score: 58, played_on: "2025-07-01" })], C).obs;
    const res = replayPlayer([...os, ...late], fit.layouts, C, "2026-01-07");
    expect(res.events[0].played_on).toBe("2025-07-01");
    expect(res.events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("input hash is order-independent and changes with inputs", () => {
    const os = obs.filter((o) => o.round.user_id === "a");
    expect(inputHash("m", os, fit.layouts)).toBe(inputHash("m", [...os].reverse(), fit.layouts));
    expect(inputHash("m", os.slice(1), fit.layouts)).not.toBe(inputHash("m", os, fit.layouts));
  });

  it("form needs enough recent evidence, else null", () => {
    const a = replayPlayer(obs.filter((o) => o.round.user_id === "a"), fit.layouts, C, "2026-01-07");
    expect(computeForm(a.events, C, "2026-01-07")).not.toBeNull();
    expect(computeForm(a.events.slice(0, 1), C, "2026-01-07")).toBeNull();
    expect(computeForm(a.events, C, "2030-01-01")).toBeNull();
  });
});
