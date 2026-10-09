import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { backtest, type CandRound } from "@/lib/dgd-v1/candidate";
import { buildPreview, roundStatus, trendFrom } from "@/lib/dgd-v1/preview";
import { changeWording, courseDayWording, explainChange, formWording, resolveModelView, SOURCE_BADGES, strokesVsExpectation } from "@/lib/dgd-v1/preview-format";
import type { CalRow } from "@/lib/dgd-v1/candidate-report";
import { toCandRounds } from "@/lib/dgd-v1/candidate-report";

const STRICT = { robust: true, coldStart: true, trend: false, volatility: true, strictPreRound: true, contextUpdate: true };
let n = 0;
const cal = (o: Partial<CalRow>): CalRow => ({ id: `c${n++}`, subject_id: "s1", pdga_event_id: "e1", event_name: "Open", division: "MA1", round_number: 1, played_on: "2024-01-01", score: 60, round_rating: 900, layout_node_ids: ["n1"], layout_name: "Park Blue", hole_count: 18, par: 60, distance_ft: 6000, ...o });
const cohort = () => {
  const rows: CalRow[] = [];
  for (let k = 0; k < 30; k++) for (const s of ["s1", "s2", "s3", "s4"]) rows.push(cal({ subject_id: s, pdga_event_id: `e${k}`, played_on: `2024-${String(1 + (k % 12)).padStart(2, "0")}-${String(1 + Math.floor(k / 12)).padStart(2, "0")}`, score: 58 + ((k + s.charCodeAt(1)) % 5), layout_node_ids: [`n${k % 3}`] }));
  rows.push(cal({ subject_id: "s1", event_name: "Doubles Bash", pdga_event_id: "d1" }), cal({ subject_id: "s1", score: null, pdga_event_id: "x1" }));
  return rows;
};

describe("phase 4 preview read model", () => {
  const rows = cohort();
  const subjects = [{ id: "s1", linked_user_id: "u1" }, { id: "s2", linked_user_id: null }];
  const out = buildPreview(backtest(toCandRounds(rows), STRICT), rows, subjects, "2025-06-01");
  it("only builds data for linked players", () => {
    expect(out.states.map((s) => s.user_id)).toEqual(["u1"]);
    expect(out.rounds.every((r) => r.user_id === "u1")).toBe(true);
  });
  it("keeps non-rated rounds visible with a reason instead of hiding them", () => {
    const ex = out.rounds.filter((r) => r.status === "excluded");
    expect(ex.map((r) => r.status_reason).sort()).toEqual(["Doubles or team round", "Incomplete score"]);
  });
  it("stores pre-round expectation separately from contextual performance", () => {
    const r = out.rounds.find((x) => x.status === "rated" && x.ctx_expected != null)!;
    expect(r.pre_expected).not.toBeNull();
    expect(r.pre_strokes_vs_expectation).toBeCloseTo((r.pre_expected as number) - (r.score as number), 9);
    expect(r.ctx_strokes_vs_expectation).toBeCloseTo((r.ctx_expected as number) - (r.score as number), 9);
  });
  it("supplies display values and marks them uncalibrated", () => {
    expect(out.states[0].display_status).toBe("UNCALIBRATED");
    expect(typeof out.states[0].display_rating).toBe("number");
  });
  it("produces likely ranges that contain the expectation", () => {
    for (const l of out.layouts) expect((l.likely_low as number) < (l.expected as number) && (l.expected as number) < (l.likely_high as number)).toBe(true);
  });
});

describe("phase 4 wording and eligibility", () => {
  it("round eligibility reasons", () => {
    expect(roundStatus({ score: 60, round_rating: null, event_name: "Open", division: "MA1" }).status).toBe("not_rated");
    expect(roundStatus({ score: 60, round_rating: 900, event_name: "Open", division: "MA1" }).status).toBe("rated");
    expect(roundStatus({ score: 200, round_rating: 900, event_name: "Open", division: "MA1" }).reason).toMatch(/range/);
  });
  it("does not overstate tiny movements or single rounds", () => {
    expect(trendFrom(0.4)).toBe("stable");
    expect(trendFrom(null)).toBe("insufficient");
    expect(changeWording(0.2)).toBe("Steady");
    expect(formWording(3, 2).value).toBeNull();
  });
  it("strokes vs expectation wording", () => {
    expect(strokesVsExpectation(2.7)).toBe("2.7 better than expected");
    expect(strokesVsExpectation(-1.3)).toBe("1.3 worse than expected");
    expect(courseDayWording(2.1)).toBe("2.1 strokes harder than usual");
  });
  it("rating explanation uses stored audit values", () => {
    const e = explainChange({ pre_expected: 61.7, score: 59, pre_strokes_vs_expectation: 2.7, round_performance_display: 70, display_before: 65, display_after: 66.2, confidence_before: 90, layout_knowledge: "Established", status: "rated", status_reason: null });
    expect(e.lines.find((l) => l.label === "Change")?.value).toBe("+1.2");
    expect(e.lines.find((l) => l.label === "Round performance")?.value).toMatch(/stronger/);
    expect(explainChange({ ...({} as any), status: "excluded", status_reason: "Doubles or team round", score: 50 }).lines).toHaveLength(0);
  });
});

describe("phase 4 access and isolation", () => {
  it("preview view requires authorization and data", () => {
    expect(resolveModelView("preview", false, true)).toBe("production");
    expect(resolveModelView("preview", true, false)).toBe("production");
    expect(resolveModelView("preview", true, true)).toBe("preview");
    expect(resolveModelView(null, true, true)).toBe("production");
  });
  it("three distinct source badges", () => {
    expect(new Set(Object.values(SOURCE_BADGES).map((b) => b.label)).size).toBe(3);
  });
  it("UI never recreates the display transform", () => {
    const src = readFileSync("src/components/stats/dgd-preview-panel.tsx", "utf8");
    expect(src).not.toMatch(/2\.5\s*\*|toDisplay|skill_latent/);
  });
  it("read functions are gated by preview access and own user id", () => {
    const sql = readFileSync("drizzle/migrations/0004_dgd_phase4_preview_read_layer.sql", "utf8");
    expect(sql).toMatch(/IF NOT public\.dgd_preview_allowed\(\)/);
    expect(sql).toMatch(/r\.user_id = auth\.uid\(\)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_my_dgd_preview_summary\(\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/LEAST\(GREATEST\(_limit, 1\), 100\)/);
  });
});
