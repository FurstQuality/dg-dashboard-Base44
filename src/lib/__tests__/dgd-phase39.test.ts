import { describe, expect, it } from "vitest";
import { CANDIDATE_CONFIG as C, NO_FLAGS, backtest, eventRoundAdjustment, type CandRound } from "@/lib/dgd-v1/candidate";
import { correlations, promotionDecision } from "@/lib/dgd-v1/candidate-report";

let seq = 0;
const row = (o: Partial<CandRound>): CandRound => ({
  id: `r${seq++}`, player: "p1", played_on: "2024-01-01", event: "e1", round_number: 1, division: "MA1",
  score: 60, round_rating: 900, node: "n1", pools: 1, layout_name: "Park - Blue", par: 60, holes: 18, distance_ft: 6000, ...o,
});
const F = { robust: true, coldStart: true, trend: false, volatility: true };
const STRICT = { ...F, strictPreRound: true };

// Field of 6 players on a brand-new layout, then the target plays.
const fieldRound = (targetScore: number, othersScore: number) => {
  const hist = ["a", "b", "c", "d", "e", "t"].flatMap((p, i) =>
    Array.from({ length: 4 }, (_, k) => row({ player: p, played_on: `2023-0${k + 1}-0${i + 1}`, event: `h${k}${p}`, node: `h${p}${k}`, score: 60 })),
  );
  const day = ["a", "b", "c", "d", "e"].map((p) => row({ player: p, played_on: "2024-05-01", event: "big", node: "new", score: othersScore }));
  const target = row({ id: "target", player: "t", played_on: "2024-05-01", event: "big", node: "new", score: targetScore });
  return [...hist, ...day, target];
};

describe("phase 3.9 pre-round information boundary", () => {
  it("strict forecast does not change when same-round scores change", () => {
    const a = backtest(fieldRound(60, 55), STRICT).predictions.find((p) => p.id === "target")!;
    const b = backtest(fieldRound(70, 75), STRICT).predictions.find((p) => p.id === "target")!;
    expect(a.expected).toBeCloseTo(b.expected, 9);
    expect(a.pred_sd).toBeCloseTo(b.pred_sd, 9);
  });
  it("the leaky Phase 3.8 forecast did move with same-round scores (regression guard)", () => {
    const a = backtest(fieldRound(60, 55), F).predictions.find((p) => p.id === "target")!;
    const b = backtest(fieldRound(60, 75), F).predictions.find((p) => p.id === "target")!;
    expect(Math.abs(a.expected - b.expected)).toBeGreaterThan(0.5);
  });
  it("the player's own score never enters their event-round adjustment (leave-one-out)", () => {
    const a = backtest(fieldRound(50, 62), STRICT).predictions.find((p) => p.id === "target")!;
    const b = backtest(fieldRound(80, 62), STRICT).predictions.find((p) => p.id === "target")!;
    expect(a.event_round_adjustment).toBeCloseTo(b.event_round_adjustment!, 9);
    expect(a.ctx_expected).toBeCloseTo(b.ctx_expected!, 9);
  });
  it("a hard day shows up as a positive adjustment in the contextual expectation only", () => {
    const p = backtest(fieldRound(66, 66), STRICT).predictions.find((x) => x.id === "target")!;
    expect(p.event_round_adjustment!).toBeGreaterThan(0);
    expect(p.ctx_expected!).toBeGreaterThan(p.expected);
    expect(p.perf_ctx!).toBeGreaterThan(p.perf_baseline);
  });
});

describe("phase 3.9 adjustment persistence", () => {
  it("event adjustments never feed the persistent layout difficulty", () => {
    const rs = [...fieldRound(66, 66), ...["a", "b"].map((p) => row({ player: p, played_on: "2024-06-01", event: "later", node: "new", score: 60 }))];
    const a = backtest(rs, STRICT).predictions.filter((p) => p.played_on === "2024-06-01");
    const b = backtest(rs, { ...STRICT, contextUpdate: true }).predictions.filter((p) => p.played_on === "2024-06-01");
    // Same baseline layout difficulty regardless of how skill is updated from context.
    expect(a.map((p) => p.baseline_layout_difficulty)).toEqual(b.map((p) => p.baseline_layout_difficulty));
  });
  it("eventRoundAdjustment shrinks toward baseline with a weak field", () => {
    const strong = eventRoundAdjustment({ mu: 60, sigma: 1 }, { mu: 64, sigma: 0.5 }, C.event_adj_tau);
    const weak = eventRoundAdjustment({ mu: 60, sigma: 1 }, { mu: 64, sigma: 6 }, C.event_adj_tau);
    expect(strong.adjustment).toBeGreaterThan(weak.adjustment);
    expect(weak.adjustment).toBeGreaterThan(0);
  });
});

describe("phase 3.9 model isolation and promotion", () => {
  it("V1 control predictions are unaffected by Phase 3.9 flags not set", () => {
    const rs = fieldRound(60, 60);
    const a = backtest(rs, NO_FLAGS).predictions.map((p) => p.expected);
    const b = backtest(rs, { ...NO_FLAGS, strictPreRound: false }).predictions.map((p) => p.expected);
    expect(a).toEqual(b);
  });
  it("promotes only when beating the control and every simple baseline", () => {
    const preds = [{ err: 5 }, { err: -5 }] as any;
    expect(promotionDecision(preds, { ci95: [-0.2, -0.1] }, { recent_20: { mae: 5.5 } }).stage).toBe("shadow_champion");
    expect(promotionDecision(preds, { ci95: [-0.2, 0.1] }, { recent_20: { mae: 5.5 } }).stage).toBe("candidate");
    expect(promotionDecision(preds, { ci95: [-0.2, -0.1] }, { recent_20: { mae: 4.9 } }).stage).toBe("candidate");
  });
  it("correlations match known values", () => {
    const c = correlations([1, 2, 3, 4], [2, 4, 6, 9]);
    expect(c.spearman).toBeCloseTo(1, 9);
    expect(c.pearson!).toBeGreaterThan(0.98);
  });
});
