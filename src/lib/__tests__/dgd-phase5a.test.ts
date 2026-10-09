import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DGD_V1_DEFAULT_CONFIG, toObservations, type CanonicalRoundInput } from "@/lib/dgd-v1/engine";
import { backtest } from "@/lib/dgd-v1/candidate";
import {
  coverageFor, ratingStatus, replayMode, residualsBySource, roundCategory, rowHash, sourceMix, sourceQuality, toShadowRounds,
} from "@/lib/dgd-v1/shadow-input";
import { buildShadowPreview } from "@/lib/dgd-v1/shadow-preview";
import { freshnessState, freshnessWording, indexedSeries, resolveModelView } from "@/lib/dgd-v1/preview-format";

const FLAGS = { robust: true, coldStart: true, trend: false, volatility: true, strictPreRound: true, contextUpdate: true };
let n = 0;
function round(p: Partial<CanonicalRoundInput> & { src?: string[] } = {}): CanonicalRoundInput {
  const id = p.id ?? `r${++n}`;
  const src = p.src ?? ["udisc"];
  return {
    id, user_id: "u1", played_on: "2026-05-01", course_key: "oak", course_name: "Oak Park", layout_name: "Main",
    score: 54, to_par: null, hole_count: 18, canonical_eligibility: "rated", has_possible_duplicate: false,
    format: "singles", hole_count_origin: "SOURCE", par_played: 54, layout_mapping: "EXACT", mapped_layout_id: "L1",
    sources: src.map((s, i) => ({ source: s, source_table: s === "app" ? "round_ratings" : "external_rounds", source_row_id: `${id}-${i}`, match_level: i ? "high" : "origin", source_round_rating: s === "pdga" ? 950 : null })),
    ...p,
  } as CanonicalRoundInput;
}
const run = (rs: CanonicalRoundInput[]) => {
  const { elig } = toObservations(rs, DGD_V1_DEFAULT_CONFIG);
  return toShadowRounds(rs, elig, new Map());
};

describe("Phase 5A source-agnostic eligibility", () => {
  it("PDGA, UDisc and native rounds all reach V1.1", () => {
    const { cand, meta } = run([round({ src: ["pdga"] }), round({ src: ["udisc"], played_on: "2026-05-02" }), round({ src: ["app"], played_on: "2026-05-03" })]);
    expect(cand).toHaveLength(3);
    expect([...meta.values()].map((m) => m.origin).sort()).toEqual(["app", "pdga", "udisc"]);
  });
  it("native practice rounds stay out", () => {
    const { cand, meta } = run([round({ src: ["app"], canonical_eligibility: "practice" })]);
    expect(cand).toHaveLength(0);
    expect([...meta.values()][0].category).toBe("practice");
  });
  it("UDisc rounds with an unknown layout stay eligible but separate (wider uncertainty, no deduction)", () => {
    const { cand } = run([round({ src: ["udisc"], mapped_layout_id: null, layout_mapping: "UNMAPPED", layout_name: null })]);
    expect(cand).toHaveLength(1);
  });
  it("incomplete scores are not rated", () => {
    const { cand, meta } = run([round({ score: null })]);
    expect(cand).toHaveLength(0);
    expect([...meta.values()][0].reason_codes).toContain("INCOMPLETE_SCORE");
  });
});

describe("Phase 5A cross-source duplicates count once", () => {
  for (const pair of [["pdga", "udisc"], ["pdga", "app"], ["udisc", "app"]]) {
    it(`${pair.join(" + ")} linked into one canonical round → one observation`, () => {
      const { cand, meta } = run([round({ src: pair })]);
      expect(cand).toHaveLength(1);
      expect([...meta.values()][0].sources).toEqual(pair);
      expect(coverageFor([...meta.values()]).multi_source).toBe(1);
    });
    it(`${pair.join(" + ")} left as two unresolved canonical twins → still one observation`, () => {
      const { cand, meta } = run([round({ src: [pair[0]] }), round({ src: [pair[1]] })]);
      expect(cand).toHaveLength(1);
      expect([...meta.values()].filter((m) => m.reason_codes.includes("DUPLICATE"))).toHaveLength(1);
    });
  }
  it("coverage never sums source records into physical rounds", () => {
    const { meta } = run([round({ src: ["pdga", "udisc"] }), round({ src: ["udisc"], played_on: "2026-06-01" })]);
    const c = coverageFor([...meta.values()]);
    expect(c.physical_rounds).toBe(2);
    expect(c.source_records).toBe(3);
  });
});

describe("Phase 5A field context boundary", () => {
  it("unrelated casual rounds at the same course never form a field", () => {
    const rs = [round({ user_id: "a" }), round({ user_id: "b" }), round({ user_id: "c" })];
    const { cand } = run(rs);
    const res = backtest(cand, FLAGS);
    expect(res.predictions.every((p) => p.ctx_expected == null)).toBe(true);
  });
});

describe("Phase 5A pipeline behaviour", () => {
  it("replay mode: first build, incremental, historical replay, no-op", () => {
    expect(replayMode([], "2026-05-01").mode).toBe("noop");
    expect(replayMode(["2026-05-03"], null).mode).toBe("full_build");
    expect(replayMode(["2026-06-01"], "2026-05-01")).toEqual({ mode: "incremental", from: "2026-06-01" });
    expect(replayMode(["2026-06-01", "2025-01-02"], "2026-05-01")).toEqual({ mode: "historical_replay", from: "2025-01-02" });
  });
  it("is deterministic, so repeated jobs converge (idempotent row hashes)", () => {
    const rs = Array.from({ length: 12 }, (_, i) => round({ played_on: `2026-0${1 + (i % 8)}-1${i % 9}`, score: 50 + (i % 5) }));
    const a = run(rs), b = run(rs);
    const pa = buildShadowPreview(backtest(a.cand, FLAGS), a.meta, ["u1"], "2026-10-01").players.get("u1")!;
    const pb = buildShadowPreview(backtest(b.cand, FLAGS), b.meta, ["u1"], "2026-10-01").players.get("u1")!;
    expect(pa.rounds.map((r) => r.row_hash)).toEqual(pb.rounds.map((r) => r.row_hash));
    expect(rowHash({ a: 1, b: "x" })).toBe(rowHash({ b: "x", a: 1 }));
  });
  it("rating status: unrated, provisional, established", () => {
    expect(ratingStatus(0, null)).toBe("UNRATED");
    expect(ratingStatus(3, 5)).toBe("PROVISIONAL");
    expect(ratingStatus(20, 4)).toBe("ESTABLISHED");
  });
  it("source mix and residual inputs are diagnostics keyed by origin", () => {
    const rs = Array.from({ length: 10 }, (_, i) => round({ src: [i % 2 ? "pdga" : "udisc"], played_on: `2026-0${1 + (i % 9)}-0${1 + (i % 8)}` }));
    const { cand, meta } = run(rs);
    const res = backtest(cand, FLAGS);
    const mix = sourceMix(res.predictions, meta);
    expect(mix.pdga + mix.udisc).toBeCloseTo(1, 2);
    expect(residualsBySource(res.predictions, meta).some((r) => r.key === "udisc")).toBe(true);
    expect(sourceQuality([...meta.values()]).pdga.rate).toBe(1);
  });
  it("categories come only from reliable signals", () => {
    expect(roundCategory(["pdga"], "Some Open", false)).toBe("sanctioned_tournament");
    expect(roundCategory(["udisc"], "Friday Night Glow League", false)).toBe("league");
    expect(roundCategory(["udisc"], null, false)).toBe("casual");
  });
});

describe("Phase 5A preview freshness and fallback", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");
  it("current / rebuilding / stale / error", () => {
    expect(freshnessState({ last_calculated_at: "2026-10-02T11:56:00Z", recalculation_pending: false }, now)).toBe("CURRENT");
    expect(freshnessWording({ last_calculated_at: "2026-10-02T11:56:00Z" }, now).text).toBe("Updated 4 minutes ago");
    expect(freshnessState({ last_calculated_at: "2026-10-02T10:00:00Z", latest_source_change_at: "2026-10-02T11:59:00Z", recalculation_pending: true, open_job: "queued" }, now)).toBe("REBUILDING");
    expect(freshnessState({ last_calculated_at: "2026-10-02T10:00:00Z", latest_source_change_at: "2026-10-02T11:00:00Z", recalculation_pending: true, open_job: "queued" }, now)).toBe("STALE");
    expect(freshnessState({ last_calculated_at: "2026-10-02T10:00:00Z", recalculation_pending: true, last_job_status: "failed" }, now)).toBe("ERROR");
  });
  it("never reports a missing calculation as current", () => {
    expect(freshnessState(null, now)).toBe("STALE");
    expect(freshnessState({ open_job: "processing" }, now)).toBe("REBUILDING");
  });
  it("missing preview falls back to Production", () => {
    expect(resolveModelView("preview", true, false)).toBe("production");
  });
  it("unlike scales are compared as indexed change", () => {
    expect(indexedSeries([null, 930, 935, 925])).toEqual([null, 0, 5, -5]);
  });
});

describe("Phase 5A security and wiring", () => {
  const sql = readFileSync("drizzle/migrations/0006_dgd_phase5a_shadow_pipeline.sql", "utf8");
  const wake = readFileSync("drizzle/migrations/0007_dgd_v11_wake_on_enqueue.sql", "utf8");
  it("internal tables are admin-read only and the worker token is never granted", () => {
    expect(sql).toMatch(/Admins read v11 jobs[\s\S]*is_platform_admin/);
    expect(sql).toMatch(/Admins read v11 freshness[\s\S]*is_platform_admin/);
    expect(sql).toMatch(/REVOKE ALL ON public\.dgd_v11_worker_secret FROM PUBLIC, anon, authenticated, service_role/);
  });
  it("queue functions are service-role only; player reads require preview access and own rows", () => {
    for (const f of ["dgd_v11_claim_jobs(integer)", "dgd_v11_worker_token_ok(text)"]) expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated`);
    expect(wake).toContain("REVOKE ALL ON FUNCTION public.dgd_v11_enqueue(uuid, text, date) FROM PUBLIC, anon, authenticated");
    expect(sql).toMatch(/get_my_dgd_preview_rounds_v2[\s\S]*dgd_preview_allowed\(\) AND r\.user_id = auth\.uid\(\)/);
  });
  it("evidence changes enqueue jobs; repeats merge into one open job", () => {
    expect(sql).toMatch(/CREATE TRIGGER dgd_v11_canonical_change AFTER INSERT OR DELETE ON public\.canonical_rounds/);
    expect(sql).toMatch(/dgd_v11_jobs_open_key ON public\.dgd_v11_jobs \(user_id, model_version\) WHERE status IN \('queued','retry_pending'\)/);
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
  });
  it("Statboard code never calls the calculation pipeline", () => {
    const panel = readFileSync("src/components/stats/dgd-preview-panel.tsx", "utf8");
    expect(panel).not.toMatch(/processDgdV11|backtest|shadow\.server/);
  });
  it("history pages are bounded", () => {
    expect(sql).toContain("LIMIT LEAST(GREATEST(_limit, 1), 100)");
  });
});
