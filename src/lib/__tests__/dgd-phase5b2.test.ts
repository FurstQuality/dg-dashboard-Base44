import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { backtestV12, V12_SHADOW_FLAGS, V12_SHADOW_MODEL_ID } from "../dgd-v1/candidate-v12";
import { V13_RESEARCH_MODEL_ID, V13_RESEARCH_CANDIDATE, V13_MODEL_ID, v13Options, v13ForecastMu } from "../dgd-v1/candidate-v13";
import { scaleByVersion, LEADING_SCALE_VERSION, applyScale } from "../dgd-v1/display-scale";
import type { CandRound } from "../dgd-v1/candidate";

const R = (id: string, player: string, on: string, score: number, node: string | null, extra: Partial<CandRound> = {}): CandRound => ({
  id, player, played_on: on, event: `ev-${on}-${node}`, round_number: 1, division: "MA1", score, round_rating: null,
  node, pools: node ? 1 : 0, layout_name: null, par: 54, holes: 18, distance_ft: 5800, ...extra,
});
function world(prefix: string, n = 8, players = 5) {
  const out: CandRound[] = [];
  for (let i = 0; i < n; i++) for (let p = 0; p < players; p++) out.push(R(`${prefix}${i}-${p}`, `${prefix}p${p}`, `2023-0${1 + (i % 9)}-1${p}`, 50 + p * 3 + (i % 3), `${prefix}n${i % 3}`));
  return out;
}
const D = (w: CandRound[]) => backtestV12(w, V12_SHADOW_FLAGS, undefined, v13Options(V13_RESEARCH_CANDIDATE));
const A = (w: CandRound[]) => backtestV12(w, V12_SHADOW_FLAGS);
const src = (f: string) => readFileSync(f, "utf8");

describe("V1.3 version isolation", () => {
  it("V1.3 is its own frozen version built from Candidate D", () => {
    expect(V13_RESEARCH_MODEL_ID).toBe("dgd-core-v1.3@0.3.0");
    expect(V13_RESEARCH_CANDIDATE).toBe("D_both");
    expect(V13_RESEARCH_MODEL_ID).not.toBe(V12_SHADOW_MODEL_ID);
    expect(V13_RESEARCH_MODEL_ID).not.toBe(V13_MODEL_ID);
  });
  it("V1.3 writes to its own admin-only tables", () => {
    const sql = readdirSync("drizzle/migrations").filter((f) => /dgd_v13_research_candidate/.test(f)).map((f) => src(`drizzle/migrations/${f}`)).join("\n");
    expect(sql).toMatch(/CREATE TABLE public\.dgd_v13_player_state/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/is_platform_admin\(auth\.uid\(\)\)/);
    expect(sql).not.toMatch(/TO anon/);
  });
  it("V1.2 output is unchanged when V1.3 is also computed", () => {
    const w = world("iso");
    const before = A(w).predictions.map((p) => p.expected);
    D(w);
    expect(A(w).predictions.map((p) => p.expected)).toEqual(before);
  });
});

describe("parallel V1.2/V1.3 updater", () => {
  const s = src("src/lib/dgd-v1/shadow.server.ts");
  it("calculates V1.1, V1.2 and V1.3 for the same job", () => {
    expect(s).toMatch(/loadV12World\(admin, \{ v13: true \}\)/);
    expect(s).toMatch(/writeUser\(admin, j\.user_id, built,/);
    expect(s).toMatch(/V12_TARGET/);
    expect(s).toMatch(/writeUser\(admin, j\.user_id, builtV13,[^\n]*V13_TARGET/);
  });
  it("V1.3 target never points at V1.2 tables", () => {
    expect(s).toMatch(/V13_TARGET: Target = \{ model: V13_RESEARCH_MODEL_ID, stateTable: "dgd_v13_player_state", history: "dgd_v13_state_history" \}/);
  });
  it("player preview functions never read V1.3", () => {
    for (const f of readdirSync("src/routes").filter((x) => x.endsWith(".tsx"))) expect(src(`src/routes/${f}`)).not.toMatch(/dgd_v13_/);
  });
});

describe("monotonicity and feedback", () => {
  it("forecast calibration is strictly increasing in Skill", () => {
    let prev = -Infinity;
    for (let m = -25; m <= 25; m += 0.25) { const v = v13ForecastMu(m); expect(v).toBeGreaterThan(prev); prev = v; }
  });
  it("calibration does not compress bands beyond its frozen slope", () => {
    expect(v13ForecastMu(10) - v13ForecastMu(0)).toBeCloseTo(10 * (1 - 0.0654), 6);
  });
  it("stronger players keep lower expected scores on a shared layout", () => {
    const res = D(world("mono"));
    const last = new Map<string, number>(); for (const p of res.predictions) last.set(p.player, p.mu_before);
    const order = [...res.final].sort((a, b) => b[1].mu - a[1].mu).map(([k]) => k);
    expect(order[0]).toBe("monop0");
  });
  it("replays deterministically (no self-reinforcing loop)", () => {
    const w = world("det");
    const a = D(w), b = D(w);
    for (const [k, v] of a.final) expect(b.final.get(k)!.mu).toBe(v.mu);
  });
  it("Skill stays bounded over a long repeated history", () => {
    const w: CandRound[] = [];
    for (let i = 0; i < 120; i++) w.push(R(`long${i}`, "longp", `20${10 + Math.floor(i / 12)}-0${1 + (i % 9)}-15`, 54, "longn"));
    const mus = D(w).predictions.map((p) => p.mu_before);
    expect(Math.max(...mus) - Math.min(...mus)).toBeLessThan(30);
    const tail = mus.slice(-20); expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(2);
  });
});

describe("skill distribution, first-time and insufficient context", () => {
  it("V1.3 shifts Skill but preserves ranking on a shared world", () => {
    const w = world("rank");
    const a = A(w), d = D(w);
    const ra = [...a.final].sort((x, y) => x[1].mu - y[1].mu).map(([k]) => k);
    const rd = [...d.final].sort((x, y) => x[1].mu - y[1].mu).map(([k]) => k);
    expect(rd).toEqual(ra);
  });
  it("first-time and unmapped layouts use the recalibrated prior", () => {
    const w = [R("f1", "fp", "2023-01-01", 60, "fresh1"), R("f2", "fp", "2023-02-01", 60, null, { par: null, holes: null, distance_ft: null })];
    const a = A(w).predictions, d = D(w).predictions;
    expect(d[0].expected).not.toBe(a[0].expected);
  });
});

describe("population invariance and fixed Scale B", () => {
  it("unrelated players never move V1.3 Skill (10/100/250)", () => {
    const base = world("inv");
    const ref = D(base);
    for (const n of [10, 100, 250]) {
      const synth = Array.from({ length: n * 3 }, (_, i) => R(`s${n}_${i}`, `syn${i % n}`, `2024-0${1 + (i % 9)}-15`, 50 + (i % 13), `synnode${i % 7}`));
      const res = D([...base, ...synth]);
      for (const [k, v] of ref.final) expect(res.final.get(k)!.mu).toBe(v.mu);
    }
  });
  it("Scale B is the same transform for V1.2 and V1.3", () => {
    const s = scaleByVersion(LEADING_SCALE_VERSION)!;
    expect(applyScale(s, 3)).toBeCloseTo(56, 6);
    expect(src("src/lib/dgd-v1/display-scale.ts")).not.toMatch(/v1\.3|V13/);
  });
});

describe("regression players are not hard-coded", () => {
  it("engine and candidates contain no player-specific offsets", () => {
    for (const f of ["src/lib/dgd-v1/candidate-v13.ts", "src/lib/dgd-v1/candidate-v12.ts"]) expect(src(f)).not.toMatch(/236190|280905/);
  });
});
