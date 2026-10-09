import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { backtestV12, referencePrior, V12_SHADOW_FLAGS, V12_SHADOW_MODEL_ID } from "../dgd-v1/candidate-v12";
import { V13_MODEL_ID, V13_FIT, v13Options, v13Prior, v13ForecastMu } from "../dgd-v1/candidate-v13";
import { SCALE_CANDIDATES, LEADING_SCALE_VERSION, scaleByVersion, applyScale, publicRatingText, researchRatingText } from "../dgd-v1/display-scale";
import { formLabels } from "../dgd-v1/preview-format";
import type { CandRound } from "../dgd-v1/candidate";

const mig = (re: RegExp) => readdirSync("drizzle/migrations").filter((f) => re.test(f)).map((f) => readFileSync(`drizzle/migrations/${f}`, "utf8")).join("\n");

const R = (id: string, player: string, on: string, score: number, node: string | null, extra: Partial<CandRound> = {}): CandRound => ({
  id, player, played_on: on, event: `ev-${on}-${node}`, round_number: 1, division: "MA1", score, round_rating: null,
  node, pools: node ? 1 : 0, layout_name: null, par: 54, holes: 18, distance_ft: 5800, ...extra,
});
function world(prefix: string, n = 6) {
  const out: CandRound[] = [];
  for (let i = 0; i < n; i++) for (let p = 0; p < 4; p++) out.push(R(`${prefix}${i}-${p}`, `${prefix}p${p}`, `2023-0${1 + (i % 9)}-1${p}`, 52 + p * 3 + (i % 3), `${prefix}n${i % 3}`));
  return out;
}

describe("Phase 5B.1 queue wake-up", () => {
  const sql = mig(/dgd_queue_wake_on_insert/);
  it("every insert into the job table wakes the worker once per statement", () => {
    expect(sql).toMatch(/CREATE TRIGGER dgd_v11_jobs_wake AFTER INSERT ON public\.dgd_v11_jobs/);
    expect(sql).toMatch(/FOR EACH STATEMENT/);
    expect(sql).toMatch(/PERFORM public\.dgd_v11_wake_worker\(\)/);
  });
  it("enqueue no longer wakes directly, so there is one wake path", () => {
    const enq = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.dgd_v11_enqueue"));
    expect(enq).not.toMatch(/wake_worker/);
  });
  it("a full worker batch wakes the next run; hourly backstop untouched", () => {
    const route = readFileSync("src/routes/api/public/dgd-v11-worker.ts", "utf8");
    expect(route).toMatch(/r\.claimed >= 25[\s\S]*dgd_v11_wake_worker/);
    expect(route).toMatch(/dgd_v11_worker_token_ok/);
  });
});

describe("V1.2 frozen / V1.3 isolation", () => {
  it("V1.3 has its own id and V1.2 id is unchanged", () => {
    expect(V12_SHADOW_MODEL_ID).toBe("dgd-core-v1.2@0.2.0");
    expect(V13_MODEL_ID).not.toBe(V12_SHADOW_MODEL_ID);
  });
  it("V1.2 without hooks is bit-identical to the A control", () => {
    const w = world("a");
    const a = backtestV12(w, V12_SHADOW_FLAGS);
    const b = backtestV12(w, V12_SHADOW_FLAGS, undefined, v13Options("A_v12_control"));
    expect(b.predictions.map((p) => p.expected)).toEqual(a.predictions.map((p) => p.expected));
  });
  it("the updater only runs the frozen V1.3 research version (Phase 5B.2), never the 0.1.0 research id", () => {
    for (const f of ["src/lib/dgd-v1/shadow.server.ts", "src/lib/dgd-v1/v12.server.ts"]) expect(readFileSync(f, "utf8")).not.toMatch(/V13_MODEL_ID\b/);
  });
});

describe("unknown-layout prior", () => {
  it("only uses par/holes/length and lowers the prior by the frozen basis offset", () => {
    const r = { par: 54, holes: 18, distance_ft: 5800 };
    expect(v13Prior(r).mu).toBeCloseTo(referencePrior(r).mu - V13_FIT.prior_offsets.structure, 9);
    expect(v13Prior({ par: null, holes: null, distance_ft: null }).mu).toBeCloseTo(referencePrior({ par: null, holes: null, distance_ft: null }).mu - V13_FIT.prior_offsets.none, 9);
  });
});

describe("skill-band calibration", () => {
  it("is forecast-only: Skill trajectory is identical to V1.2", () => {
    const w = world("c");
    const a = backtestV12(w, V12_SHADOW_FLAGS);
    const c = backtestV12(w, V12_SHADOW_FLAGS, undefined, v13Options("C_skill_cal"));
    for (const [k, v] of a.final) expect(c.final.get(k)!.mu).toBe(v.mu);
  });
  it("pulls weak forecasts down and strong forecasts up toward centered residuals", () => {
    expect(v13ForecastMu(-10)).toBeGreaterThan(-10);
    expect(v13ForecastMu(15)).toBeLessThan(15);
    expect(v13ForecastMu(V13_FIT.skill_center)).toBeCloseTo(V13_FIT.skill_center, 9);
  });
});

describe("population invariance and coupling regressions", () => {
  it("unrelated players never move Skill under any V1.3 candidate", () => {
    const base = world("x");
    for (const c of ["B_prior", "C_skill_cal", "D_both"] as const) {
      const a = backtestV12(base, V12_SHADOW_FLAGS, undefined, v13Options(c));
      const b = backtestV12([...base, ...world("u", 9)], V12_SHADOW_FLAGS, undefined, v13Options(c));
      for (const [k, v] of a.final) expect(Math.abs(b.final.get(k)!.mu - v.mu)).toBe(0);
    }
  });
  it("280905-style: a disjoint player with no shared layout/event is unaffected", () => {
    const me = [R("m1", "me", "2024-01-01", 55, "solo1"), R("m2", "me", "2024-02-01", 54, "solo1")];
    const a = backtestV12(me, V12_SHADOW_FLAGS, undefined, v13Options("D_both"));
    const b = backtestV12([...me, ...world("z", 8)], V12_SHADOW_FLAGS, undefined, v13Options("D_both"));
    expect(b.final.get("me")!.mu).toBe(a.final.get("me")!.mu);
  });
  it("236190-style: a long course with known length is not read as a slump", () => {
    const hist = Array.from({ length: 8 }, (_, i) => R(`h${i}`, "p", `2025-0${1 + i}-01`, 58, "home", { par: 58, holes: 18, distance_ft: 6200 }));
    const long = R("long", "p", "2025-10-01", 79, "big", { par: 72, holes: 18, distance_ft: 10500 });
    for (const c of ["A_v12_control", "D_both"] as const) {
      const res = backtestV12([...hist, long], V12_SHADOW_FLAGS, undefined, v13Options(c));
      const p = res.predictions.find((x) => x.id === "long")!;
      expect(p.expected).toBeGreaterThan(70);
      expect(Math.abs(p.mu_after - p.mu_before)).toBeLessThan(2);
    }
  });
});

describe("Scale B leading candidate", () => {
  const B = scaleByVersion(LEADING_SCALE_VERSION)!;
  it("is versioned, linear 50 + 2 × latent, and marked leading (not production)", () => {
    expect(B.status).toBe("LEADING_CANDIDATE");
    expect(applyScale(B, 7.1)).toBeCloseTo(64.2, 9);
    expect(SCALE_CANDIDATES.some((s) => s.status === ("PRODUCTION" as never))).toBe(false);
  });
  it("never falls back to Scale C for extreme players", () => {
    expect(applyScale(B, 40)).toBe(130);
    expect(applyScale(B, -40)).toBe(-30);
  });
  it("public text is a whole number, research text one decimal", () => {
    expect(publicRatingText(64.24)).toBe("64");
    expect(researchRatingText(64.24)).toBe("64.2");
  });
  it("migration dry run changes display only, not latent Skill", () => {
    const A = scaleByVersion("dgd-scale-A-placeholder")!;
    const latent = 4.52;
    const before = applyScale(A, latent), after = applyScale(B, latent);
    expect(after - before).toBeCloseTo(-0.5 * latent, 9);
    expect(latent).toBe(4.52);
  });
});

describe("terminology and benchmark copy", () => {
  it("player-facing preview never calls a rating value Skill", () => {
    const l = formLabels(60, -1.2, 8);
    expect(l.vsSkill.label).toBe("Form vs Rating");
    const ui = readFileSync("src/components/stats/dgd-preview-panel.tsx", "utf8");
    expect(ui).not.toMatch(/label="Form vs Skill"|Skill after each round|long-term Skill/);
  });
  it("benchmark copy states the 10+ rated rounds requirement", () => {
    const ui = readFileSync("src/components/stats/dgd-preview-panel.tsx", "utf8");
    expect(ui).toMatch(/active in the last 2 years with 10\+ rated rounds/);
  });
  it("percentiles come from a stored benchmark snapshot, never recomputed on load", () => {
    const fn = readFileSync("src/lib/dgd-v1.functions.ts", "utf8");
    expect(fn).not.toMatch(/percentileIn\(/);
  });
});
