import { describe, expect, it } from "vitest";
import { backtest, CANDIDATE_CONFIG, type CandRound } from "@/lib/dgd-v1/candidate";
import { backtestV12, connectionPaths, formConfidence, formDisplay, formValue, referencePrior, V12_REFERENCE, type V12Prediction } from "@/lib/dgd-v1/candidate-v12";
import { contextReplayFrom, contextStatus, eventRoundLayoutKey, matchPdgaContext, type DetailRow } from "@/lib/dgd-v1/pdga-context";
import { STRICT_FLAGS } from "@/lib/dgd-v1/shadow.server";

const D = { ctxSigma: true, contextUpdate: true };
let seq = 0;
const rnd = (p: Partial<CandRound> & { player: string; played_on: string; score: number }): CandRound => ({
  id: `r${++seq}`, event: `e${seq}`, round_number: 1, division: "MA1", round_rating: null, node: null, pools: 0,
  layout_name: null, par: null, holes: null, distance_ft: null, ...p,
});
const day = (i: number) => new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
/** Player history on its own private layouts (no shared modeled context). */
const history = (player: string, n: number, base: number, node: string) =>
  Array.from({ length: n }, (_, i) => rnd({ player, played_on: day(i * 7), score: base + ((i * 7) % 5) - 2, node, par: 60, holes: 18, distance_ft: 7200, event: `${player}-ev${i}`, round_number: 1 }));

describe("V1.2 fixed reference frame", () => {
  it("uses frozen structural priors, never a population average", () => {
    const p = referencePrior({ par: 60, holes: 18, distance_ft: 7200 });
    const [a, b, c] = V12_REFERENCE.struct_full;
    expect(p.mu).toBeCloseTo(a + b * 60 + c * 4, 6);
    expect(referencePrior({ par: null, holes: null, distance_ft: null }).mu).toBe(V12_REFERENCE.unknown_mu);
  });

  it("population invariance: unrelated players leave Skill unchanged", () => {
    const b = history("B", 30, 58, "nodeB");
    const a = history("A", 120, 70, "nodeA");
    const alone = backtestV12(b, D).final.get("B")!.mu;
    const mixed = backtestV12([...b, ...a], D).final.get("B")!.mu;
    expect(Math.abs(alone - mixed)).toBeLessThan(1e-9);
  });

  it("V1.1 control is coupled through its dynamic anchor (documented regression)", () => {
    const b = history("B", 30, 58, "nodeB");
    const a = history("A", 120, 75, "nodeA");
    const alone = backtest(b, STRICT_FLAGS).final.get("B")!.mu;
    const mixed = backtest([...b, ...a], STRICT_FLAGS).final.get("B")!.mu;
    expect(Math.abs(alone - mixed)).toBeGreaterThan(0.01);
  });

  it("reference-frame stability across 2/10/25 unrelated players", () => {
    const f = history("F", 25, 60, "nodeF");
    const base = backtestV12(f, D).final.get("F")!.mu;
    for (const n of [2, 10, 25]) {
      const others = Array.from({ length: n - 1 }, (_, k) => history(`U${k}`, 15, 55 + k, `nodeU${k}`)).flat();
      expect(backtestV12([...f, ...others], D).final.get("F")!.mu).toBeCloseTo(base, 9);
    }
  });

  it("connected layouts may propagate information", () => {
    const b = history("B", 20, 58, "shared");
    const a = history("A", 60, 52, "shared").map((r, i) => ({ ...r, played_on: day(-500 + i * 7) }));
    const alone = backtestV12(b, D).final.get("B")!.mu;
    const mixed = backtestV12([...a, ...b], D).final.get("B")!.mu;
    expect(Math.abs(alone - mixed)).toBeGreaterThan(0.01);
    expect(connectionPaths([...a, ...b]).sharedKeys("A", "B")).toContain("node:shared");
    expect(connectionPaths([...history("X", 3, 60, "x"), ...history("Y", 3, 60, "y")]).connected("X", "Y")).toBe(false);
  });
});

describe("PDGA context enrichment", () => {
  const det = (p: Partial<DetailRow>): DetailRow => ({
    id: `d${++seq}`, pdga_event_id: "97343", event_name: "Am Worlds", played_on: "2026-08-11", division: "MA1", round_number: 1, score: 63,
    layout_node_ids: ["264561"], layout_name: "Bond Lake", hole_count: 18, par: 67, distance_ft: 9543, source_url: "https://www.pdga.com/player/1/details", fetched_at: "2026-10-03", ...p,
  });
  const ext = (p: Partial<{ id: string; score: number; division: string }>) => ({ id: p.id ?? `x${++seq}`, user_id: "u", pdga_event_ref: "97343", event_name: "Am Worlds", played_on: "2026-08-11", division: p.division ?? "MA1", score: p.score ?? 63 });

  it("recovers layout, holes, par and length with provenance", () => {
    const [m] = matchPdgaContext([ext({ id: "e1" })], [det({})]);
    expect(m).toMatchObject({ external_round_id: "e1", layout_node_ids: ["264561"], hole_count: 18, par: 67, distance_ft: 9543, match_method: "EXACT", provenance: "pdga_player_details" });
    expect(m.source_url).toContain("pdga.com");
  });

  it("matches a placeholder division but never invents missing details", () => {
    const [m] = matchPdgaContext([ext({ division: "XC" })], [det({ hole_count: null, par: null, distance_ft: null })]);
    expect(m.par).toBeNull();
    expect(m.hole_count).toBeNull();
    expect(matchPdgaContext([ext({ score: 99 })], [det({})])).toHaveLength(0);
  });

  it("same score on different layouts is AMBIGUOUS and drops layout fields", () => {
    const out = matchPdgaContext([ext({}), ext({})], [det({ round_number: 1 }), det({ round_number: 2, layout_node_ids: ["292951"], par: 62 })]);
    expect(out.every((r) => r.match_method === "AMBIGUOUS" && r.layout_node_ids.length === 0 && r.par == null)).toBe(true);
  });

  it("event-round-layout identity separates layouts and requires a single node", () => {
    expect(eventRoundLayoutKey({ event: "1", round_number: 2, node: "A" })).not.toBe(eventRoundLayoutKey({ event: "1", round_number: 2, node: "B" }));
    expect(eventRoundLayoutKey({ event: "1", round_number: 2, node: null })).toBeNull();
  });

  it("divisions on different layouts never share a field", () => {
    const rs = [
      rnd({ player: "P", played_on: day(1), score: 60, event: "E", round_number: 1, node: "A", par: 60, holes: 18, distance_ft: 7000 }),
      rnd({ player: "Q", played_on: day(1), score: 60, event: "E", round_number: 1, node: "B", par: 60, holes: 18, distance_ft: 7000 }),
      rnd({ player: "R", played_on: day(1), score: 60, event: "E", round_number: 1, node: "B", par: 60, holes: 18, distance_ft: 7000 }),
    ];
    const p = backtestV12(rs, D).predictions.find((x) => x.player === "P")!;
    expect(p.field_others).toBe(0);
  });

  it("leave-one-out: a player's own score never sets the difficulty used to judge them", () => {
    const mk = (s: number) => [
      rnd({ player: "P", played_on: day(1), score: s, event: "E", round_number: 1, node: "A", par: 60, holes: 18, distance_ft: 7000 }),
      ...["Q", "R", "S"].map((pl) => rnd({ player: pl, played_on: day(1), score: 60, event: "E", round_number: 1, node: "A", par: 60, holes: 18, distance_ft: 7000 })),
    ];
    const a = backtestV12(mk(50), D).predictions.find((x) => x.player === "P")!;
    const b = backtestV12(mk(70), D).predictions.find((x) => x.player === "P")!;
    expect(a.ctx_expected).toBeCloseTo(b.ctx_expected!, 9);
    expect(a.expected).toBeCloseTo(b.expected, 9); // pre-round never sees same-round scores
  });

  it("context change triggers replay from the earliest affected round", () => {
    const prev = new Map([["a", { layout_node_ids: [], par: null, hole_count: null, distance_ft: null, played_on: "2024-05-01" }]]);
    const next = new Map([["a", { layout_node_ids: ["1"], par: 60, hole_count: 18, distance_ft: 7000, played_on: "2024-05-01" }]]);
    expect(contextReplayFrom(prev, next)).toBe("2024-05-01");
    expect(contextReplayFrom(next, next)).toBeNull();
  });
});

describe("Insufficient context", () => {
  it("classifies context states", () => {
    expect(contextStatus({ layout_known: true, layout_rounds_before: 12, hole_count: 18, par: 60, distance_ft: 1, field_others: 0 })).toBe("ESTABLISHED_LAYOUT");
    expect(contextStatus({ layout_known: false, layout_rounds_before: 0, hole_count: null, par: null, distance_ft: null, field_others: 0 })).toBe("INSUFFICIENT_CONTEXT");
    expect(contextStatus({ layout_known: false, layout_rounds_before: 0, hole_count: 18, par: 60, distance_ft: null, field_others: 0 })).toBe("STRUCTURAL_CONTEXT_ONLY");
  });

  it("keeps the round but limits its pull on Skill", () => {
    const base = history("P", 20, 58, "n");
    const bad = rnd({ player: "P", played_on: day(200), score: 80 });
    const d = backtestV12([...base, bad], D).predictions.at(-1)!;
    const c = backtestV12([...base, bad], { ctxSigma: false, contextUpdate: true }).predictions.at(-1)!;
    expect(d.context_status).toBe("INSUFFICIENT_CONTEXT");
    expect(d.gain).toBeLessThan(c.gain / 2);
    expect(d.obs_sigma).toBeGreaterThanOrEqual(30);
  });
});

describe("Form confidence", () => {
  const p = (status: V12Prediction["context_status"], perf: number, i: number) => ({ context_status: status, perf, obs_sigma: 4, played_on: day(i) });
  it("is LOW when recent rounds lack reliable context, and Form is not shown as precise", () => {
    const recent = Array.from({ length: 8 }, (_, i) => p("INSUFFICIENT_CONTEXT", -10, i));
    const c = formConfidence(recent);
    expect(c.level).toBe("LOW");
    expect(formValue(recent, "E_suppressed")).toBeNull();
    expect(formDisplay(formValue(recent, "A_unweighted"), c.level).state).toBe("LOW_CONTEXT");
  });
  it("is HIGH with established layouts", () => {
    const recent = Array.from({ length: 8 }, (_, i) => p("ESTABLISHED_LAYOUT", 2, i));
    expect(formConfidence(recent).level).toBe("HIGH");
    expect(formDisplay(formValue(recent, "D_recency_uncertainty"), "HIGH")).toEqual({ state: "AVAILABLE", value: 2 });
  });
});

describe("V1.1 stays frozen", () => {
  it("V1.1 config is untouched by V1.2", () => {
    expect(CANDIDATE_CONFIG.obs_sigma_max).toBe(12);
    expect(CANDIDATE_CONFIG.unknown_layout_mult).toBe(1.25);
  });
});
