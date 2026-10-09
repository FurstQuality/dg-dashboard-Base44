import { describe, expect, it } from "vitest";
import { toShadowRounds, type ExternalMeta } from "@/lib/dgd-v1/shadow-input";
import { backtest } from "@/lib/dgd-v1/candidate";
import { STRICT_FLAGS } from "@/lib/dgd-v1/shadow.server";
import { playerSourceAudit, residualTable, sameDayUdisc, effectiveEvidence } from "@/lib/dgd-v1/source-audit";
import type { CanonicalRoundInput, EligibilityResult } from "@/lib/dgd-v1/engine";

type Src = "pdga" | "udisc" | "app";
let seq = 0;
function mk(user: string, day: number, srcs: Src[], opts: { cls?: string; score?: number; course?: string; udiscRating?: number } = {}) {
  const id = `r${++seq}`;
  const played_on = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
  const course = opts.course ?? `c${day % 3}`;
  const sources = srcs.map((s) => ({
    source: s,
    source_table: s === "app" ? "rounds" : "external_rounds",
    source_row_id: `${id}-${s}`,
    source_round_rating: s === "pdga" ? 950 : s === "udisc" ? opts.udiscRating ?? null : null,
  }));
  const round = {
    id, user_id: user, played_on, score: opts.score ?? 54 + (day % 5), par_played: 54, hole_count: 18,
    course_name: course, layout_name: "Main", course_key: `${course}-${day}`, layout_mapping: "EXACT",
    duplicate_resolution: null, canonical_eligibility: "rated", sources,
  } as unknown as CanonicalRoundInput;
  const elig = { canonical_round_id: id, state: "ELIGIBLE", reason_codes: [], layout_known: true, layout_key: `${course}:main` } as unknown as EligibilityResult;
  const ext: [string, ExternalMeta][] = srcs
    .filter((s) => s !== "app")
    .map((s) => [`${id}-${s}`, {
      id: `${id}-${s}`, source: s, round_format_class: s === "udisc" ? opts.cls ?? "SINGLES_MULTI_PLAYER" : null,
      event_name: s === "pdga" ? "Spring Open" : null, pdga_event_ref: s === "pdga" ? `e${day}` : null,
      division: null, round_rating: s === "pdga" ? 950 : opts.udiscRating ?? null, chainlink_rating: null,
    }]);
  return { round, elig, ext };
}
function run(items: ReturnType<typeof mk>[], opts?: { udiscRule?: boolean }) {
  const { cand, meta } = toShadowRounds(items.map((i) => i.round), items.map((i) => i.elig), new Map(items.flatMap((i) => i.ext)), opts);
  return { cand, meta, res: backtest(cand, STRICT_FLAGS) };
}
const series = (user: string, pattern: Src[][], extra: Parameters<typeof mk>[3] = {}) => pattern.map((s, i) => mk(user, i * 3, s, extra));

describe("one unified DGD model across PDGA, UDisc and DG Dashboard", () => {
  const cases: [string, Src[][]][] = [
    ["PDGA-only", Array(10).fill(["pdga"])],
    ["UDisc-only", Array(10).fill(["udisc"])],
    ["DG Dashboard-only", Array(10).fill(["app"])],
    ["PDGA + UDisc", Array.from({ length: 10 }, (_, i) => [i % 2 ? "pdga" : "udisc"])],
    ["PDGA + DG Dashboard", Array.from({ length: 10 }, (_, i) => [i % 2 ? "pdga" : "app"])],
    ["UDisc + DG Dashboard", Array.from({ length: 10 }, (_, i) => [i % 2 ? "udisc" : "app"])],
    ["all three", Array.from({ length: 12 }, (_, i) => [(["pdga", "udisc", "app"] as Src[])[i % 3]])],
  ];
  for (const [name, pattern] of cases) {
    it(`${name} player gets exactly one DGD state`, () => {
      const u = `u-${name}`;
      const { res } = run(series(u, pattern));
      expect([...res.final.keys()]).toEqual([u]);
      expect(res.predictions.filter((p) => p.player === u)).toHaveLength(pattern.length);
    });
  }

  it("a round present in all three sources counts once", () => {
    const items = [...series("u3", Array(6).fill(["pdga"])), mk("u3", 40, ["pdga", "udisc", "app"])];
    const { res, meta } = run(items);
    const id = items.at(-1)!.round.id;
    expect(res.predictions.filter((p) => p.id === id)).toHaveLength(1);
    expect(meta.get(id)!.sources).toEqual(["pdga", "udisc", "app"]);
  });

  it("last 10, Form and Confidence draw on every source", () => {
    const u = "mix";
    const items = series(u, Array.from({ length: 15 }, (_, i) => [(["pdga", "udisc", "app"] as Src[])[i % 3]]));
    const { res, meta } = run(items);
    const a = playerSourceAudit(u, [...meta.values()], res.predictions);
    expect(a.recent20_mix.pdga).toBeGreaterThan(0);
    expect(a.recent20_mix.udisc).toBeGreaterThan(0);
    expect(a.recent20_mix.app).toBeGreaterThan(0);
    const last8 = new Set(res.predictions.slice(-8).map((p) => meta.get(p.id)!.origin));
    expect(last8.size).toBe(3);
    // Every source's rounds narrow the same uncertainty (confidence).
    for (const s of ["pdga", "udisc", "app"]) expect(res.predictions.filter((p) => meta.get(p.id)!.origin === s).every((p) => p.gain > 0)).toBe(true);
  });

  it("removing a source round replays the whole timeline", () => {
    const items = series("rp", Array.from({ length: 10 }, (_, i) => [i % 2 ? "pdga" : "udisc"]), { score: 50 });
    const full = run(items).res.final.get("rp")!;
    items[0].ext[0][1].round_format_class = "SINGLES_SOLO";
    const after = run(items);
    expect(after.res.predictions).toHaveLength(9);
    expect(after.res.final.get("rp")!.mu).not.toBeCloseTo(full.mu, 6);
    expect(after.meta.get(items[0].round.id)!.reason_codes).toEqual(["SOLO_ROUND"]);
  });

  it("native PDGA and UDisc ratings stay unchanged", () => {
    const items = [...series("nr", Array(5).fill(["pdga"])), mk("nr", 30, ["pdga", "udisc"], { udiscRating: 238 })];
    const { meta } = run(items);
    const m = meta.get(items.at(-1)!.round.id)!;
    expect(m.pdga_round_rating).toBe(950);
    expect(m.udisc_round_rating).toBe(238);
  });

  it("does not use the native UDisc rating as the DGD observation", () => {
    const base = series("nt", Array(6).fill(["udisc"]));
    const a = run(base).res.final.get("nt")!.mu;
    base.forEach((b) => (b.ext[0][1].round_rating = 999));
    expect(run(base).res.final.get("nt")!.mu).toBeCloseTo(a, 9);
  });
});

describe("Phase 5A.1 diagnostics", () => {
  it("keeps legitimate same-day UDisc rounds and only lists them", () => {
    const items = [mk("sd", 1, ["udisc"], { score: 52, course: "A" }), mk("sd", 1, ["udisc"], { score: 57, course: "A" })];
    const { cand, meta } = run(items);
    expect(cand).toHaveLength(2);
    expect(sameDayUdisc([...meta.values()])).toMatchObject({ groups: 1, rounds: 2 });
  });

  it("counterfactual without the UDisc rule includes unknown-format rounds", () => {
    const items = series("cf", Array(6).fill(["udisc"]), { cls: "UNKNOWN_FORMAT" });
    expect(run(items).cand).toHaveLength(0);
    expect(run(items, { udiscRule: false }).cand).toHaveLength(6);
  });

  it("source residuals are split by context", () => {
    const items = series("rs", Array.from({ length: 10 }, (_, i) => [i % 2 ? "pdga" : "udisc"]));
    const { res, meta } = run(items);
    const t = residualTable(res.predictions, meta, new Map());
    expect(t.some((r) => r.key === "all|source:pdga")).toBe(true);
    expect(t.some((r) => r.key.startsWith("layout:") && r.key.endsWith("source:udisc"))).toBe(true);
  });

  it("effective evidence never exceeds raw rounds", () => {
    const { res } = run(series("ee", Array(12).fill(["udisc"])));
    const e = effectiveEvidence(res.predictions);
    expect(e.kish_effective).toBeLessThanOrEqual(e.raw_rounds);
  });
});
