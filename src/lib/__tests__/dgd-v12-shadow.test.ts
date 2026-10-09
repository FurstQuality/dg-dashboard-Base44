import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { CandRound } from "@/lib/dgd-v1/candidate";
import {
  backtestV12,
  fieldCoverage,
  formConfidenceV12,
  formDisplay,
  V12_SHADOW_FLAGS,
  V12_SHADOW_MODEL_ID,
  type V12Prediction,
} from "@/lib/dgd-v1/candidate-v12";
import { CANDIDATE_MODEL_ID } from "@/lib/dgd-v1/candidate";
import { buildShadowPreview } from "@/lib/dgd-v1/shadow-preview";
import { connectedEvidence, detectRatingConflicts, v12Form, v12Hooks } from "@/lib/dgd-v1/v12-shadow";
import { eventRoundLayoutKey } from "@/lib/dgd-v1/pdga-context";
import { fullFieldLookup } from "@/lib/dgd-v1/v12.server";
import { replayMode, toShadowRounds, type ExternalMeta } from "@/lib/dgd-v1/shadow-input";
import type { CanonicalRoundInput, EligibilityResult } from "@/lib/dgd-v1/engine";

let seq = 0;
const rnd = (p: Partial<CandRound> & { player: string; played_on: string; score: number }): CandRound => ({
  id: `r${++seq}`, event: `e${seq}`, round_number: 1, division: "MA1", round_rating: null, node: null, pools: 0,
  layout_name: null, par: null, holes: null, distance_ft: null, ...p,
});
const day = (i: number) => new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
const history = (player: string, n: number, base: number, node: string, step = 7) =>
  Array.from({ length: n }, (_, i) => rnd({ player, played_on: day(i * step), score: base + ((i * 7) % 5) - 2, node, par: 60, holes: 18, distance_ft: 7200, event: `${player}-ev${i}` }));
const pred = (p: Partial<V12Prediction>): V12Prediction => ({ perf: 0, obs_sigma: 5, context_status: "ESTABLISHED_LAYOUT", played_on: day(0), ...p } as V12Prediction);

describe("V1.2 shadow champion", () => {
  it("has its own frozen model id, separate from V1.1", () => {
    expect(V12_SHADOW_MODEL_ID).not.toBe(CANDIDATE_MODEL_ID);
    expect(V12_SHADOW_FLAGS).toEqual({ ctxSigma: true, contextUpdate: true, fieldCoverage: true });
  });

  it("updater builds V1.2 rows under the V1.2 model id, V1.1 rows unchanged", () => {
    const rounds = history("u1", 12, 60, "n1");
    const res = backtestV12(rounds, V12_SHADOW_FLAGS);
    const meta = new Map(rounds.map((r) => [r.id, { id: r.id, user_id: "u1", played_on: r.played_on, state: "ELIGIBLE", sources: ["pdga"], reason_codes: [] } as any]));
    const res2 = { ...res, predictions: res.predictions.map((p) => ({ ...p, player: "u1" })), final: new Map([["u1", res.final.get("u1")!]]) };
    const v12 = buildShadowPreview(res2, meta, ["u1"], day(100), v12Hooks()).players.get("u1")!;
    expect(v12.state.model_version).toBe(V12_SHADOW_MODEL_ID);
    expect(v12.rounds.every((r) => r.model_version === V12_SHADOW_MODEL_ID)).toBe(true);
    expect(v12.state.form_method).toBe("D_recency_uncertainty");
    expect(["HIGH", "MEDIUM", "LOW", "NONE"]).toContain(v12.state.form_confidence);
    expect(v12.rounds[0]).toHaveProperty("context_status");
    const v11 = buildShadowPreview(res2, meta, ["u1"], day(100)).players.get("u1")!;
    expect(v11.state.model_version).toBe(CANDIDATE_MODEL_ID);
    expect(v11.state).not.toHaveProperty("form_confidence");
  });

  it("historical context enrichment replays from the old round, not just the final Skill", () => {
    const base = history("u", 20, 60, "n");
    const before = backtestV12(base.map((r, i) => (i === 3 ? { ...r, node: null, par: null, holes: null, distance_ft: null } : r)), V12_SHADOW_FLAGS);
    const after = backtestV12(base, V12_SHADOW_FLAGS);
    const changed = after.predictions.filter((p, i) => Math.abs(p.mu_after - before.predictions[i].mu_after) > 1e-9);
    expect(changed[0].played_on).toBe(base[3].played_on);
    expect(changed.length).toBeGreaterThan(1);
    expect(replayMode([base[3].played_on], day(200)).mode).toBe("historical_replay");
  });
});

describe("source conflicts", () => {
  const field = (score: number, rating: number, player: string, extra: Partial<CandRound> = {}) =>
    rnd({ player, played_on: day(1), score, round_rating: rating, node: "N", event: "ev", round_number: 2, ...extra });
  it("flags a rating far off the line from others on the same listed layout", () => {
    const rs = [field(50, 1000, "a"), field(52, 980, "b"), field(54, 960, "c"), field(56, 940, "d"), field(54, 1010, "me")];
    const c = detectRatingConflicts(rs, eventRoundLayoutKey);
    const me = c.find((x) => x.player === "me")!;
    expect(me).toBeTruthy();
    expect(Math.abs(me.detail.gap as number)).toBeGreaterThan(25);
    expect(me.kind).toBe("RATING_INCONSISTENT_WITH_LISTED_LAYOUT");
  });
  it("does not flag consistent rounds or thin fields, and never edits the layout", () => {
    const rs = [field(50, 1000, "a"), field(52, 980, "b"), field(54, 960, "c"), field(56, 941, "me")];
    expect(detectRatingConflicts(rs, eventRoundLayoutKey)).toHaveLength(0);
    expect(detectRatingConflicts(rs.slice(0, 2), eventRoundLayoutKey)).toHaveLength(0);
    expect(rs.every((r) => r.node === "N")).toBe(true);
  });
});

describe("field coverage", () => {
  it("confidence rises with independent scores, coverage and exact layout", () => {
    expect(fieldCoverage(12, 14, 10, true).confidence).toBe("HIGH");
    expect(fieldCoverage(12, 80, 10, true).confidence).not.toBe("HIGH");
    expect(fieldCoverage(12, 14, 10, false).confidence).not.toBe("HIGH");
    expect(fieldCoverage(1, 14, 1, true).confidence).toBe("NONE");
  });
  it("partial or unknown fields carry wider uncertainty, never labeled complete", () => {
    expect(fieldCoverage(20, 20, 15, true).inflate).toBe(1);
    expect(fieldCoverage(5, 40, 4, true).inflate).toBeGreaterThan(1.9);
    const unk = fieldCoverage(5, null, 4, true);
    expect(unk.ratio).toBeNull();
    expect(unk.inflate).toBeGreaterThan(1);
  });
  it("partial fields move Skill less than a fully observed field", () => {
    const mk = () => [
      ...["a", "b", "c", "d", "e"].flatMap((p, k) => history(p, 6, 58 + k, `own${p}`)),
      ...["a", "b", "c", "d", "e", "me"].map((p) => rnd({ player: p, played_on: day(60), score: 70, node: "X", event: "big", round_number: 1 })),
    ];
    const rounds = mk();
    const full = backtestV12(rounds, V12_SHADOW_FLAGS, undefined, { fullField: () => 6 }).predictions.find((p) => p.player === "me")!;
    const part = backtestV12(rounds, V12_SHADOW_FLAGS, undefined, { fullField: () => 120 }).predictions.find((p) => p.player === "me")!;
    expect(part.adjustment_uncertainty!).toBeGreaterThan(full.adjustment_uncertainty!);
    expect(part.field_coverage_ratio!).toBeLessThan(0.1);
    expect(full.field_coverage_ratio).toBe(1);
  });
  it("full field is only reported when every division's field is synced", () => {
    const f = fullFieldLookup([{ event_ref: "1", division: "MA1" }, { event_ref: "1", division: "MA1" }, { event_ref: "1", division: "MA2" }]);
    expect(f("k", "1", ["MA1", "MA2"])).toBe(3);
    expect(f("k", "1", ["MA1", "MA3"])).toBeNull();
  });
});

describe("V1.2 Form", () => {
  const disp = (x: number) => x;
  it("is recency + uncertainty weighted, not the plain latest-8 average", () => {
    const ps = Array.from({ length: 8 }, (_, i) => pred({ played_on: day(i * 30), perf: i < 7 ? 0 : 10 }));
    const f = v12Form(ps, disp, day(220));
    expect(f.value!).toBeGreaterThan(10 / 8);
    const noisy = ps.map((p, i) => (i === 7 ? { ...p, obs_sigma: 40 } : p));
    expect(v12Form(noisy, disp, day(220)).value!).toBeLessThan(f.value!);
  });
  it("Form Confidence uses context, uncertainty, count and recency", () => {
    const good = Array.from({ length: 8 }, (_, i) => pred({ played_on: day(i * 7) }));
    expect(formConfidenceV12(good, day(60)).level).toBe("HIGH");
    expect(formConfidenceV12(good.map((p) => ({ ...p, context_status: "INSUFFICIENT_CONTEXT" as const })), day(60)).level).toBe("LOW");
    expect(formConfidenceV12(good.slice(0, 3), day(60)).level).toBe("NONE");
    expect(formConfidenceV12(good, day(700)).level).toBe("LOW");
    expect(formConfidenceV12(good.map((p) => ({ ...p, obs_sigma: 30 })), day(60)).level).not.toBe("HIGH");
  });
  it("low-confidence Form keeps the estimate internally but is shown as Low Context", () => {
    const ps = Array.from({ length: 8 }, (_, i) => pred({ played_on: day(i * 7), perf: 5, context_status: "INSUFFICIENT_CONTEXT" }));
    const f = v12Form(ps, disp, day(60));
    expect(f.value).not.toBeNull();
    expect(f.extra.form_state).toBe("LOW_CONTEXT");
    expect(formDisplay(5, "LOW")).toEqual({ state: "LOW_CONTEXT", value: null });
  });
});

describe("first DG Dashboard native round", () => {
  it("one native multiplayer singles round becomes V1.2 eligible and updates state", () => {
    const round = {
      id: "native1", user_id: "nu", played_on: "2026-10-01", score: 58, par_played: 54, hole_count: 18,
      course_name: "Home Park", layout_name: "Blue", course_key: "home-blue", layout_mapping: "EXACT",
      duplicate_resolution: null, canonical_eligibility: "rated",
      sources: [{ source: "app", source_table: "rounds", source_row_id: "app-row-1", source_round_rating: null }],
    } as unknown as CanonicalRoundInput;
    const elig = { canonical_round_id: "native1", state: "ELIGIBLE", reason_codes: [], layout_known: true, layout_key: "home:blue" } as unknown as EligibilityResult;
    const { cand, meta } = toShadowRounds([round], [elig], new Map<string, ExternalMeta>());
    expect(cand).toHaveLength(1);
    expect(meta.get("native1")?.sources).toEqual(["app"]);
    const res = backtestV12(cand, V12_SHADOW_FLAGS);
    const built = buildShadowPreview(res, meta, ["nu"], "2026-10-02", v12Hooks()).players.get("nu")!;
    expect(built.state.eligible_rounds).toBe(1);
    expect(built.state.skill_latent).not.toBeNull();
    expect(built.rounds).toHaveLength(1);
    expect(built.rounds[0].origin_source ?? built.rounds[0].sources).toBeTruthy();
  });
});

describe("population invariance at scale (permanent regression)", () => {
  it("unrelated players never move a frozen player's Skill at 10/100/250 players", () => {
    const f = history("F", 30, 60, "nodeF");
    const base = backtestV12(f, V12_SHADOW_FLAGS).final.get("F")!.mu;
    for (const n of [10, 100, 250]) {
      const others = Array.from({ length: n - 1 }, (_, k) => history(`U${k}`, 6, 50 + (k % 30), `nodeU${k}`, 30)).flat();
      expect(backtestV12([...f, ...others], V12_SHADOW_FLAGS).final.get("F")!.mu).toBeCloseTo(base, 9);
    }
  });
  it("connected movement is traceable to a shared layout path", () => {
    const a = history("A", 10, 52, "shared");
    const b = history("B", 10, 58, "shared");
    const paths = connectedEvidence([...a, ...b], "A", "B", eventRoundLayoutKey);
    expect(paths.some((p) => p.via === "shared_layout" && p.key === "node:shared")).toBe(true);
    expect(connectedEvidence([...history("X", 3, 60, "x"), ...history("Y", 3, 60, "y")], "X", "Y", eventRoundLayoutKey)).toHaveLength(0);
  });
});

describe("security regression", () => {
  const fns = readFileSync("src/lib/dgd-v1.functions.ts", "utf8");
  it("player preview reads go through gated database functions, never the admin client", () => {
    const player = fns.slice(fns.indexOf("export const getMyDgdPreview "), fns.indexOf("// ---------- Phase 5A: shadow pipeline"));
    expect(player).toContain("get_my_dgd_preview_summary_v2");
    expect(player).not.toContain("client.server");
  });
  it("admin client is only loaded inside handlers", () => {
    expect(fns).not.toMatch(/^import .*client\.server/m);
  });
  it("V1.1 comparison is admin-only in the database function", () => {
    const sql = readFileSync("drizzle/migrations/0012_dgd_v12_shadow_champion.sql", "utf8");
    expect(sql).toMatch(/_model = 'v11' AND is_admin/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.get_my_dgd_preview_summary_v2\(text\) FROM PUBLIC, anon/);
  });
});
