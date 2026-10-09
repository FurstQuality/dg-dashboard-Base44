import { describe, expect, it } from "vitest";
import { DGD_V1_DEFAULT_CONFIG, replayPlayer, fitLayoutDifficulty, type Observation } from "@/lib/dgd-v1/engine";
import {
  EXPERIENCE_DEFAULTS as cfg,
  classifyLayout,
  decayWeight,
  familiarityAsOf,
  playerExperienceDiagnostics,
  residualsFromEvents,
  shrinkResiduals,
  experienceHoldoutAtCutoff,
} from "@/lib/dgd-v1/experience";

const c = DGD_V1_DEFAULT_CONFIG;
const ob = (id: string, u: string, d: string, layout: string, score: number): Observation => ({
  round: { id, user_id: u, played_on: d, course_key: layout, course_name: layout, layout_name: layout, score, to_par: null, hole_count: 18, canonical_eligibility: "rated", has_possible_duplicate: false, sources: [] },
  layout_key: layout,
  layout_known: true,
  score,
});
const date = (i: number) => new Date(Date.UTC(2025, 0, 1 + i * 3)).toISOString().slice(0, 10);

describe("DGD experience", () => {
  it("shrinks one or two exceptional rounds toward zero", () => {
    const one = shrinkResiduals([{ r: 8, w: 1 }], cfg.familiarity_prior_sigma, cfg.residual_sigma);
    expect(Math.abs(one.mu)).toBeLessThan(2);
    const many = shrinkResiduals(Array.from({ length: 40 }, () => ({ r: 3, w: 1 })), cfg.familiarity_prior_sigma, cfg.residual_sigma);
    expect(many.mu).toBeGreaterThan(2);
    expect(many.sigma).toBeLessThan(one.sigma);
  });

  it("decays familiarity weight with time", () => {
    expect(decayWeight(0, cfg)).toBe(1);
    expect(decayWeight(cfg.familiarity_half_life_days, cfg)).toBeCloseTo(0.5);
  });

  it("never classifies missing metadata", () => {
    expect(classifyLayout(null).archetype).toBe("UNKNOWN");
    expect(classifyLayout({ hole_count: 18, distance_total: 4000, ob_area_count: null, ob_line_feet: null, water_hole_count: null }).length).toBe("short");
  });

  it("uses only rounds before the as-of date (no leakage)", () => {
    const obs = Array.from({ length: 10 }, (_, i) => ob(`r${i}`, "u", date(i), i % 2 ? "A" : "B", 54));
    const fit = fitLayoutDifficulty(obs, c);
    const { events } = replayPlayer(obs, fit.layouts, c, date(20));
    const rs = residualsFromEvents(events, fit.layouts);
    expect(familiarityAsOf(rs, date(0), cfg).size).toBe(0);
    expect(rs[0].prior_layout_rounds).toBe(0);
    expect(rs.filter((x) => x.layout_key === "A")[2].prior_layout_rounds).toBe(2);
  });

  it("centers familiarity per player so it is not double counted", () => {
    const obs = Array.from({ length: 30 }, (_, i) => ob(`r${i}`, "u", date(i), ["A", "B", "C"][i % 3], 50));
    const fit = fitLayoutDifficulty(obs, c);
    const { events } = replayPlayer(obs, fit.layouts, c, date(40));
    const fam = familiarityAsOf(residualsFromEvents(events, fit.layouts), date(40), cfg);
    const sum = [...fam.values()].reduce((s, f) => s + f.mu * f.effective_n, 0);
    expect(Math.abs(sum)).toBeLessThan(1);
  });

  it("does not inflate breadth from one round on many layouts", () => {
    const wide = Array.from({ length: 10 }, (_, i) => ob(`w${i}`, "u", date(i), `L${i}`, 54));
    const deep = Array.from({ length: 30 }, (_, i) => ob(`d${i}`, "u", date(i), `L${i % 10}`, 54));
    const run = (o: Observation[]) => {
      const fit = fitLayoutDifficulty(o, c);
      return playerExperienceDiagnostics(replayPlayer(o, fit.layouts, c, date(40)).events, fit.layouts, new Map(), date(40), cfg);
    };
    expect(run(wide).effective_layout_count).toBeLessThan(run(deep).effective_layout_count);
    expect(run(wide).adaptability.status).toBe("computed");
  });

  it("requires enough independent layouts for adaptability", () => {
    const obs = Array.from({ length: 20 }, (_, i) => ob(`r${i}`, "u", date(i), "HOME", 54));
    const fit = fitLayoutDifficulty(obs, c);
    const d = playerExperienceDiagnostics(replayPlayer(obs, fit.layouts, c, date(30)).events, fit.layouts, new Map(), date(30), cfg);
    expect(d.adaptability.status).toBe("insufficient_layouts");
    expect(d.primary_layout?.share).toBe(1);
  });

  it("holdout trains strictly before cutoff", () => {
    const obs = Array.from({ length: 40 }, (_, i) => ob(`r${i}`, i % 2 ? "u" : "v", date(i), ["A", "B"][i % 2 ? 0 : 1], 50 + (i % 5)));
    const h = experienceHoldoutAtCutoff(obs, c, date(30), new Map(), cfg)!;
    expect(h.train_rounds).toBe(30);
    expect(h.test_rounds).toBe(10);
  });
});
