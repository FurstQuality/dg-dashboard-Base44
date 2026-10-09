import { describe, expect, it } from "vitest";
import {
  CANDIDATE_CONFIG as C,
  CANDIDATE_MODEL_ID,
  CONTROL_MODEL_ID,
  NO_FLAGS,
  backtest,
  calibrateScale,
  combine,
  contextualMapping,
  coverage,
  fieldEstimate,
  fitStructural,
  pairedDiff,
  playerVolSigma,
  updateSkill,
  type CandRound,
  type Prediction,
} from "@/lib/dgd-v1/candidate";
import { DGD_V1_MODEL_ID } from "@/lib/dgd-v1/engine";
import { agreedPar, parsePdgaDetailPage, pdgaRoundIssues } from "@/lib/dgd-v1/pdga-details";

const row = (o: Partial<CandRound>): CandRound => ({
  id: Math.random().toString(36).slice(2),
  player: "p1",
  played_on: "2024-01-01",
  event: "e1",
  round_number: 1,
  division: "MA1",
  score: 60,
  round_rating: 900,
  node: "n1",
  pools: 1,
  layout_name: "Park - Blue",
  par: 60,
  holes: 18,
  distance_ft: 6000,
  ...o,
});

const html = (cells: string) => `<title>Jane Doe #1 | PDGA</title><p>Current Rating: 912</p>
<div id="layout-details-1-MA1-round-1"><div><a href="/node/77">Park - Blue</a> - Long; 18 holes; Par 60; 6,500 ft.</div></div></div>
<table id="player-results-details"><tr>${cells}</tr></table>`;
const goodRow = `<td class="tournament"><a href="/tour/event/1">Spring Open</a></td><td class="tier">C</td><td class="date" data-text="1714521600">01-May-2024</td><td class="division">MA1</td><td class="round tooltip" data-tooltip-content="#layout-details-1-MA1-round-1">1</td><td class="score">58</td><td class="round-rating">935</td><td class="evaluated">Yes</td><td class="included">Yes</td>`;

describe("personal PDGA importer parser", () => {
  it("maps score, rating, round and date by label", () => {
    const p = parsePdgaDetailPage(html(goodRow), 1);
    expect(p.current_rating).toBe(912);
    const r = p.rounds[0];
    expect([r.score, r.round_rating, r.round_number, r.played_on]).toEqual([58, 935, 1, "2024-05-01"]);
    expect(agreedPar(r)).toEqual({ par: 60, holes: 18 });
    expect(pdgaRoundIssues(r, "2026-10-02")).toEqual([]);
  });
  it("regression: column order changes don't shift values", () => {
    const shuffled = goodRow.split("</td>").filter(Boolean).reverse().join("</td>") + "</td>";
    const r = parsePdgaDetailPage(html(shuffled), 1).rounds[0];
    expect([r.score, r.round_rating]).toEqual([58, 935]);
  });
  it("flags impossible field relationships independently", () => {
    const base = { played_on: "2024-05-01", pools: [{ node_id: "1", name: "x", holes: 18, par: 60, distance_ft: null }] };
    expect(pdgaRoundIssues({ ...base, score: 935, round_rating: 58 })).toEqual(expect.arrayContaining(["SCORE_LOOKS_LIKE_RATING", "RATING_LOOKS_LIKE_SCORE"]));
    expect(pdgaRoundIssues({ ...base, score: 12, round_rating: 900 })).toContain("SCORE_BELOW_HOLES");
    expect(pdgaRoundIssues({ ...base, score: 125, round_rating: 700 })).toContain("TO_PAR_IMPLAUSIBLE");
    expect(pdgaRoundIssues({ ...base, played_on: "2001-02-01", score: 60, round_rating: 900 }, "2026-10-02")).toEqual([]);
    expect(pdgaRoundIssues({ ...base, played_on: "1975-01-01", score: 60, round_rating: 900 })).toContain("DATE_IMPLAUSIBLE");
  });
});

describe("robust update", () => {
  it("one surprising round is evidence, not a redefinition", () => {
    const P = 9; // wide prior after a long break
    const plain = updateSkill(0, P, 15, 9, C, false);
    const robust = updateSkill(0, P, 15, 9, C, true);
    expect(robust.gain).toBeLessThanOrEqual(C.gain_max + 1e-9);
    expect(Math.abs(robust.mu)).toBeLessThan(Math.abs(plain.mu));
    expect(robust.mu).toBeGreaterThan(0);
  });
  it("repeated surprising rounds still move skill a lot", () => {
    let s = { mu: 0, P: 4 };
    for (let i = 0; i < 8; i++) s = updateSkill(s.mu, s.P + 0.5, 6, 9, C, true);
    expect(s.mu).toBeGreaterThan(4);
  });
  it("leaves ordinary rounds untouched", () => {
    expect(updateSkill(0, 1, 1, 9, C, true)).toEqual(updateSkill(0, 1, 1, 9, C, false));
  });
});

describe("post-break behaviour", () => {
  it("inactivity widens uncertainty but robust mode caps the first-round gain", () => {
    const rs = [
      ...Array.from({ length: 12 }, (_, i) => row({ played_on: `2020-0${(i % 9) + 1}-1${i % 9}`, round_number: i, score: 60 })),
      row({ played_on: "2023-06-01", score: 45, event: "back" }),
    ];
    const a = backtest(rs, NO_FLAGS).predictions.at(-1)!;
    const b = backtest(rs, { ...NO_FLAGS, robust: true }).predictions.at(-1)!;
    expect(a.gap).toBeGreaterThan(365);
    expect(b.prior_sigma).toBeGreaterThan(1);
    expect(b.gain).toBeLessThanOrEqual(C.gain_max + 1e-9);
    expect(Math.abs(b.mu_after - b.mu_before)).toBeLessThan(Math.abs(a.mu_after - a.mu_before));
  });
});

describe("cold-start layouts", () => {
  it("field estimate leaves the player out and weights by certainty", () => {
    const fe = fieldEstimate([
      { score: 60, mu: 0, sigma: 0.5, obsSigma: 3 },
      { score: 70, mu: 0, sigma: 8, obsSigma: 3 },
    ], C)!;
    expect(fe.mu).toBeLessThan(63);
    expect(fe.effective_participant_count).toBeLessThan(2);
    expect(fieldEstimate([{ score: 60, mu: 0, sigma: 1, obsSigma: 3 }], C)).toBeNull();
  });
  it("tiny fields carry extra uncertainty", () => {
    const o = { score: 60, mu: 0, sigma: 1, obsSigma: 3 };
    const small = fieldEstimate([o, o], C)!;
    const big = fieldEstimate(Array(6).fill(o), C)!;
    expect(small.sigma / Math.sqrt(1 / (2 / 10))).toBeGreaterThan(big.sigma / Math.sqrt(1 / (6 / 10)));
  });
  it("own score never sets the difficulty used to judge that round", () => {
    const rs = ["a", "b", "c"].map((p, i) => row({ player: p, node: "new", score: 60 + i }));
    const lo = backtest(rs, { ...NO_FLAGS, coldStart: true });
    const hi = backtest(rs.map((r) => (r.player === "a" ? { ...r, score: 90 } : r)), { ...NO_FLAGS, coldStart: true });
    const ea = (x: typeof lo) => x.predictions.find((p) => p.player === "a")!.expected;
    expect(ea(lo)).toBeCloseTo(ea(hi), 6);
    expect(lo.levels.L3_event_field).toBe(3);
  });
  it("structural prior fits and reports large uncertainty inputs", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ d: 50 + i * 0.5 + (i % 3), par: 54 + (i % 10), ftPerHole: 280 + i * 5, w: 1 }));
    const s = fitStructural(rows)!;
    expect(s.n).toBe(40);
    expect(s.resid_sd).toBeGreaterThan(0);
    expect(fitStructural(rows.slice(0, 5))).toBeNull();
  });
  it("combine is precision weighted", () => {
    expect(combine([{ mu: 0, sigma: 1 }, { mu: 10, sigma: 100 }]).mu).toBeLessThan(0.01);
  });
  it("only safe contextual mappings are high confidence", () => {
    const m = contextualMapping([
      row({ id: "x", player: "a", node: "n9" }),
      row({ id: "y", player: "b", node: null, pools: 0 }),
      row({ id: "z", player: "c", node: null, pools: 2 }),
      row({ id: "w", player: "d", node: null, pools: 0, event: "solo" }),
    ]);
    expect(m.get("y")).toEqual({ mapping: "HIGH_CONFIDENCE", node: "n9" });
    expect(m.get("z")!.mapping).toBe("POSSIBLE");
    expect(m.get("w")!.mapping).toBe("UNMAPPED");
  });
});

describe("trend detector", () => {
  it("one strong round barely triggers it; a sustained run does", () => {
    const steady = Array.from({ length: 15 }, (_, i) => row({ played_on: `2024-01-${String(i + 1).padStart(2, "0")}`, score: 60 }));
    const one = [...steady, row({ played_on: "2024-02-01", score: 52 })];
    const many = [...steady, ...Array.from({ length: 6 }, (_, i) => row({ played_on: `2024-02-0${i + 1}`, score: 52 }))];
    const mv = (rs: CandRound[], t: boolean) => backtest(rs, { ...NO_FLAGS, trend: t }).predictions.at(-1)!;
    expect(mv(one, true).mu_after).toBeCloseTo(mv(one, false).mu_after, 6);
    expect(mv(many, true).mu_after).toBeGreaterThan(mv(many, false).mu_after);
  });
});

describe("confidence and volatility", () => {
  const p = (err: number, sd: number): Prediction => ({ id: String(Math.random()), player: "p", played_on: "2024-01-01", expected: 0, actual: 0, err, pred_sd: sd, layout_rounds_before: 0, layout_level: "", mapping: "EXACT", gap: null, prior_events: 1, prior_sigma: 1, obs_sigma: 3, gain: 0, mu_before: 0, mu_after: 0, perf: 0, round_rating: null, baseline_layout_difficulty: 0, perf_baseline: 0, ctx_expected: null, perf_ctx: null, event_round_adjustment: null, adjustment_uncertainty: null });
  it("coverage counts how often intervals contain the result", () => {
    const ps = [p(0.1, 1), p(5, 1), p(0.5, 1), p(3, 1)];
    expect(coverage(ps).p95).toBe(50);
    const s = calibrateScale(ps)!;
    expect(coverage(ps, s).p80).toBeGreaterThanOrEqual(50);
  });
  it("volatility shrinks toward the base sigma", () => {
    expect(playerVolSigma({ vol_ss: 0, vol_n: 0 }, C)).toBeCloseTo(3, 6);
    expect(playerVolSigma({ vol_ss: 64 * 100, vol_n: 100 }, C)).toBeGreaterThan(7);
  });
  it("paired difference is negative when the candidate is better", () => {
    const a = new Map([["1", { ...p(4, 1), id: "1" }], ["2", { ...p(4, 1), id: "2" }]]);
    const d = pairedDiff(a, [{ ...p(1, 1), id: "1" }, { ...p(2, 1), id: "2" }], 50);
    expect(d.mean_abs_err_diff).toBeLessThan(0);
    expect(d.rounds_better_pct).toBe(100);
  });
});

describe("model-version isolation", () => {
  it("candidate has its own id and the control id is V1", () => {
    expect(CANDIDATE_MODEL_ID).not.toBe(DGD_V1_MODEL_ID);
    expect(CONTROL_MODEL_ID).toBe(DGD_V1_MODEL_ID);
  });
  it("the control run is deterministic and unaffected by candidate runs", () => {
    const rs = Array.from({ length: 30 }, (_, i) => row({ id: `r${i}`, player: `p${i % 3}`, played_on: `2024-0${(i % 9) + 1}-01`, round_number: i, score: 55 + (i % 7) }));
    const a1 = backtest(rs, NO_FLAGS).predictions.map((x) => x.err);
    backtest(rs, { robust: true, coldStart: true, trend: true, volatility: true });
    expect(backtest(rs, NO_FLAGS).predictions.map((x) => x.err)).toEqual(a1);
  });
});
