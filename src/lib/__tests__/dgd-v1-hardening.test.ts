import { describe, expect, it } from "vitest";
import {
  DGD_V1_DEFAULT_CONFIG as C,
  DGD_V1_DISPLAY_SCALE_STATUS,
  checkEligibility,
  chronologicalHoldout,
  effectivePlayers,
  errorStats,
  fitLayoutDifficulty,
  layoutKeyFor,
  layoutSigma,
  layoutStatus,
  replayPlayer,
  singleRoundWeight,
  spearman,
  toObservations,
  type CanonicalRoundInput,
} from "../dgd-v1/engine";
import { holesFromLayoutName, isMalformedPdga } from "../dgd-v1/normalize.server";

let n = 0;
const r = (o: Partial<CanonicalRoundInput>): CanonicalRoundInput => ({
  id: `00000000-0000-0000-0001-${String(++n).padStart(12, "0")}`,
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
  format: "singles",
  ...o,
});

describe("Phase 3.5 eligibility states", () => {
  it("every round gets exactly one state; precedence EXCLUDED > INELIGIBLE > PENDING_REVIEW", () => {
    const e = checkEligibility(r({ format: "doubles", canonical_eligibility: "ineligible", score: 9 }), C);
    expect(e.state).toBe("EXCLUDED");
    expect(e.reason_codes).toEqual(expect.arrayContaining(["DOUBLES", "IMPOSSIBLE_SCORE"]));
    expect(checkEligibility(r({ score: 200, has_possible_duplicate: true }), C).state).toBe("INELIGIBLE");
    expect(checkEligibility(r({ has_possible_duplicate: true }), C).state).toBe("PENDING_REVIEW");
    expect(checkEligibility(r({}), C).state).toBe("ELIGIBLE");
  });
  it("resolved KEEP_SEPARATE duplicates become eligible", () => {
    const e = checkEligibility(r({ has_possible_duplicate: true, duplicate_resolution: "KEEP_SEPARATE" }), C);
    expect(e.state).toBe("ELIGIBLE");
  });
  it("low score with small par is an incomplete round, not an impossible one", () => {
    const e = checkEligibility(r({ score: 6, to_par: 0, par_played: 6 }), C);
    expect(e.reason_codes).toContain("INCOMPLETE_SCORE");
    expect(e.reason_codes).not.toContain("IMPOSSIBLE_SCORE");
  });
  it("unknown hole count / layout are informational only", () => {
    const e = checkEligibility(r({ layout_name: null }), C);
    expect(e.state).toBe("ELIGIBLE");
    expect(e.reason_codes).toEqual(expect.arrayContaining(["UNKNOWN_LAYOUT", "UNKNOWN_HOLE_COUNT"]));
  });
  it("malformed source data is excluded", () => {
    expect(checkEligibility(r({ data_issue: "MALFORMED_SOURCE" }), C).state).toBe("EXCLUDED");
  });
  it("hole count is never defaulted", () => {
    expect(r({}).hole_count).toBeNull();
    expect(holesFromLayoutName("Main", 54)).toBeNull();
    expect(holesFromLayoutName("2024 21 Hole Layout", 64)).toBe(21);
    expect(holesFromLayoutName("2024 21 Hole Layout", 16)).toBeNull(); // par contradicts
    expect(holesFromLayoutName("Back 9", 27)).toBe(9);
  });
});

describe("Layout mapping + diversity", () => {
  it("safe mappings collapse aliases; possible mappings do not", () => {
    expect(layoutKeyFor({ course_key: "a", layout_name: "Main", layout_mapping: "EXACT", mapped_layout_id: "L1" }).key).toBe("layout:L1");
    expect(layoutKeyFor({ course_key: "a", layout_name: "Main", layout_mapping: "POSSIBLE", mapped_layout_id: "L1" }).key).toBe("a|main");
  });
  it("many rounds by one player never makes a layout established", () => {
    expect(effectivePlayers([60])).toBe(1);
    expect(layoutStatus(60, 1, "EXACT", C)).toBe("developing");
    expect(layoutStatus(25, 3.2, "EXACT", C)).toBe("established");
    expect(layoutStatus(25, 3.2, "POSSIBLE", C)).toBe("developing");
    expect(layoutStatus(5, 2, "EXACT", C)).toBe("provisional");
  });
  it("single-player layouts keep high difficulty uncertainty", () => {
    expect(layoutSigma(60, 1, C)).toBeGreaterThan(layoutSigma(60, 4, C));
    expect(layoutSigma(60, 1, C)).toBeGreaterThanOrEqual(C.layout_confounding_sigma);
  });
  it("an unseen layout moves an established player less than a well-known one", () => {
    expect(singleRoundWeight(C.layout_prior_sigma, 2, C)).toBeLessThan(singleRoundWeight(1, 2, C));
  });
});

describe("Convergence", () => {
  const rounds = [
    ...Array.from({ length: 8 }, (_, i) => r({ user_id: "a", score: 50 + (i % 3), played_on: `2026-01-0${i + 1}` })),
    ...Array.from({ length: 8 }, (_, i) => r({ user_id: "b", score: 60 - (i % 2), course_key: i % 2 ? "elm" : "oak", played_on: `2026-01-0${i + 1}` })),
  ];
  const { obs } = toObservations(rounds, C);
  it("reports diagnostics and stops on thresholds", () => {
    const fit = fitLayoutDifficulty(obs, C, "2026-02-01");
    expect(fit.convergence_status).toBe("CONVERGED");
    expect(fit.stop_reason).toBe("thresholds_met");
    expect(fit.final_delta!.max_player_skill_change).toBeLessThan(C.convergence_max_skill_delta);
    expect(fit.final_delta!.max_layout_difficulty_change).toBeLessThan(C.convergence_max_layout_delta);
  });
  it("hitting the cap is NOT_CONVERGED, never silently converged", () => {
    const fit = fitLayoutDifficulty(obs, { ...C, layout_max_iterations: 1, convergence_max_skill_delta: 1e-15, convergence_max_layout_delta: 1e-15 });
    expect(fit.convergence_status).toBe("NOT_CONVERGED");
    expect(fit.stop_reason).toBe("max_iterations");
  });
});

describe("Leakage-free holdout", () => {
  const day = (i: number) => new Date(Date.UTC(2025, 0, 1) + i * 5 * 86_400_000).toISOString().slice(0, 10);
  const rounds = Array.from({ length: 40 }, (_, i) =>
    r({ user_id: i % 2 ? "a" : "b", score: (i % 2 ? 50 : 60) + (i % 5), played_on: day(i) }),
  );
  const { obs } = toObservations(rounds, C);
  it("training never sees rounds on or after the cutoff; test rounds don't change training", () => {
    const h = chronologicalHoldout(obs, C)!;
    expect(h.leakage_free).toBe(true);
    for (const c of h.cutoffs as any[]) {
      expect(c.train_rounds + c.test_rounds).toBe(obs.length);
      expect(Object.keys(c.overall)).toEqual(
        expect.arrayContaining(["A_layout_only", "B_player_history", "C_player_recent_form", "D_player_plus_layout", "E_dgd_v1"]),
      );
    }
    const cut = (h.cutoffs[0] as any).cutoff as string;
    const trainOnly = obs.filter((o) => o.round.played_on < cut);
    const a = fitLayoutDifficulty(trainOnly, C, cut);
    const mutated = obs.map((o) => (o.round.played_on >= cut ? { ...o, score: o.score + 40 } : o));
    const b = fitLayoutDifficulty(mutated.filter((o) => o.round.played_on < cut), C, cut);
    expect([...a.layouts.values()].map((l) => l.difficulty_mu)).toEqual([...b.layouts.values()].map((l) => l.difficulty_mu));
  });
  it("error stats report MAE, median, RMSE and n", () => {
    expect(errorStats([1, -2, 3])).toEqual({ n: 3, mae: 2, median_ae: 2, rmse: Math.sqrt(14 / 3) });
  });
});

describe("Metrics + display scale", () => {
  it("spearman keeps the -1..+1 sign", () => {
    const up: [number, number][] = [[1, 10], [2, 20], [3, 30], [4, 40], [5, 50]];
    expect(spearman(up)).toBeCloseTo(1);
    expect(spearman(up.map(([x, y]) => [x, -y]))).toBeCloseTo(-1);
  });
  it("display scale stays a placeholder", () => {
    expect(DGD_V1_DISPLAY_SCALE_STATUS).toBe("PLACEHOLDER_UNCALIBRATED");
  });
  it("replay counts each physical round once", () => {
    const { obs } = toObservations([r({ id: "x1" }), r({ id: "x2", user_id: "u1", played_on: "2026-01-02" })], C);
    const fit = fitLayoutDifficulty(obs, C);
    const res = replayPlayer(obs, fit.layouts, C, "2026-01-03");
    expect(new Set(res.events.map((e) => e.canonical_round_id)).size).toBe(res.events.length);
  });
});

describe("Malformed PDGA detection", () => {
  it("flags shifted-column rows only when there is no event reference", () => {
    expect(isMalformedPdga({ source: "pdga", pdga_event_ref: null, played_on: "2001-03-01" })).toBe(true);
    expect(isMalformedPdga({ source: "pdga", pdga_event_ref: null, played_on: "2026-01-01" })).toBe(true);
    expect(isMalformedPdga({ source: "pdga", pdga_event_ref: "93789", played_on: "2001-03-01" })).toBe(false);
    expect(isMalformedPdga({ source: "udisc", pdga_event_ref: null, played_on: "2001-03-01" })).toBe(false);
  });
});
