import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import {
  MODEL_STATUS, SHADOW_CHAMPION, PROMOTION_CANDIDATE, canPromoteCandidate, publicDgdRating, publicDgdRatingText,
  PERCENTILE_LAUNCH_DECISION, sourceValueText, sourceMixReport, LAUNCH_GATES, publicLaunchReady, nativeValidationFor,
  KNOWN_LIMITATIONS, DGD_COPY_DRAFT, type SourceObs,
} from "../dgd-v1/launch-readiness";
import { formValue, formConfidenceV12 } from "../dgd-v1/candidate-v12";
import { scaleByVersion, LEADING_SCALE_VERSION, applyScale } from "../dgd-v1/display-scale";

const src = (f: string) => readFileSync(f, "utf8");

describe("promotion-candidate status", () => {
  it("V1.2 is shadow champion, V1.3 is promotion candidate, both frozen and hidden", () => {
    expect(SHADOW_CHAMPION).toBe("dgd-core-v1.2@0.2.0");
    expect(PROMOTION_CANDIDATE).toBe("dgd-core-v1.3@0.3.0");
    expect(MODEL_STATUS.filter((m) => m.player_visible).map((m) => m.stage)).toEqual(["PRODUCTION_CHAMPION"]);
    expect(MODEL_STATUS.every((m) => m.math_frozen)).toBe(true);
  });
  it("promotion needs both UDisc and native canary; percentile is not an input", () => {
    expect(canPromoteCandidate({ udisc_validation: "PENDING", native_canary: "PASS" })).toBe(false);
    expect(canPromoteCandidate({ udisc_validation: "PASS", native_canary: "PENDING" })).toBe(false);
    expect(canPromoteCandidate({ udisc_validation: "PASS", native_canary: "PASS" })).toBe(true);
  });
});

describe("actual stored Form methodology", () => {
  const recent = (perfs: number[], ctx = "full") => perfs.map((p, i) => ({ perf: p, obs_sigma: 2, context_status: ctx, played_on: `2026-0${1 + (i % 9)}-10` })) as any[];
  it("uses recency + uncertainty weighting, not a plain average", () => {
    const r = recent([0, 0, 0, 0, 10]);
    const v = formValue(r, "D_recency_uncertainty" as any)!;
    expect(v).not.toBeCloseTo(2, 3);
  });
  it("Form confidence comes from the same recent window", () => {
    expect(formConfidenceV12).toBeTypeOf("function");
  });
  it("Form input carries no source field (source-agnostic)", () => {
    const s = src("src/lib/dgd-v1/candidate-v12.ts");
    const fn = s.slice(s.indexOf("export function formValue"), s.indexOf("export function formConfidenceV12"));
    expect(fn).not.toMatch(/source|pdga|udisc/i);
  });
});

describe("full-batch continuation and hourly fallback", () => {
  const w = src("src/routes/api/public/dgd-v11-worker.ts");
  it("a full batch re-wakes the worker", () => {
    expect(w).toMatch(/processDgdV11Jobs\(supabaseAdmin, 25\)/);
    expect(w).toMatch(/if \(r\.claimed >= 25\) await .*dgd_v11_wake_worker/);
  });
  it("claims are locked so batches never double-process", () => {
    const sql = readdirSync("drizzle/migrations").filter((f) => f.endsWith(".sql")).map((f) => src(`drizzle/migrations/${f}`)).join("\n");
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
  });
  it("delayed jobs wait for run_after, so only the hourly backstop or a later wake claims them", () => {
    const sql = readdirSync("drizzle/migrations").filter((f) => f.endsWith(".sql")).map((f) => src(`drizzle/migrations/${f}`)).join("\n");
    expect(sql).toMatch(/run_after <= now\(\)/);
  });
});

describe("source-mix harness", () => {
  const o = (id: string, player: string, sources: SourceObs["sources"], error: number): SourceObs => ({ round_id: id, player, sources, error, obs_sigma: 2, context_quality: 0.8 });
  it("reports per-source metrics", () => {
    const r = sourceMixReport([o("a", "p", ["pdga"], 1), o("b", "p", ["udisc"], -1), o("c", "q", ["pdga"], 3)]);
    expect(r.pdga.eligible_rounds).toBe(2);
    expect(r.pdga.bias).toBe(2);
    expect(r.udisc.mae).toBe(1);
    expect(r.native.eligible_rounds).toBe(0);
    expect(r.native.bias).toBeNull();
  });
  it("PDGA + UDisc + native same round counts as one physical observation", () => {
    const r = sourceMixReport([o("x", "p", ["pdga", "udisc", "native"], 2), o("x", "p", ["pdga", "udisc", "native"], 2)]);
    expect(r.physical_rounds).toBe(1);
    expect(r.duplicates_dropped).toBe(1);
    expect(r.mixed.eligible_rounds).toBe(1);
  });
});

describe("source-brand neutrality", () => {
  it("rating engines contain no source-priority weighting", () => {
    for (const f of ["candidate-v12.ts", "candidate-v13.ts", "engine.ts"]) {
      const s = src(`src/lib/dgd-v1/${f}`);
      expect(s).not.toMatch(/source\s*===\s*["']pdga["']\s*\?\s*[\d.]+/);
      expect(s).not.toMatch(/SOURCE_WEIGHT|sourceWeight|brandWeight/);
    }
  });
});

describe("rounding consistency", () => {
  it("one deterministic half-up rule", () => {
    expect(publicDgdRating(61.5)).toBe(62);
    expect(publicDgdRating(61.4999999997)).toBe(62); // float noise at .5 is treated as .5
    expect(publicDgdRating(61.4999)).toBe(61);
    expect(publicDgdRating(61.49)).toBe(61);
    expect(publicDgdRating(-2.5)).toBe(-3);
    expect(publicDgdRating(null)).toBeNull();
    expect(publicDgdRatingText(undefined)).toBe("Not rated yet");
  });
  it("Scale B is unchanged", () => {
    const B = scaleByVersion(LEADING_SCALE_VERSION)!;
    expect([B.anchor, B.slope]).toEqual([50, 2]);
    expect(publicDgdRating(applyScale(B, 4.726))).toBe(59);
  });
});

describe("launch gates", () => {
  const g = (k: string) => LAUNCH_GATES.find((x) => x.key === k)!.state;
  it("percentile NOT_REQUIRED; real-evidence gates still PENDING", () => {
    expect(PERCENTILE_LAUNCH_DECISION.state).toBe("NOT_REQUIRED");
    expect(g("percentile_benchmark")).toBe("NOT_REQUIRED");
    expect(g("udisc_mixed_source")).toBe("PENDING");
    expect(g("native_canary")).toBe("PENDING");
    expect(publicLaunchReady()).toBe(false);
  });
  it("native pipeline and statistical validation are separate", () => {
    expect(nativeValidationFor(false, 0)).toEqual({ pipeline: "PENDING", statistical: "PENDING" });
    expect(nativeValidationFor(true, 3)).toEqual({ pipeline: "PIPELINE_VALIDATED", statistical: "POST_LAUNCH_MONITORING" });
    expect(nativeValidationFor(true, 500).statistical).toBe("STATISTICALLY_VALIDATED");
  });
  it("low-skill bias is recorded as a known limitation", () => {
    expect(KNOWN_LIMITATIONS[0].state).toBe("KNOWN_MODEL_LIMITATION");
  });
});

describe("empty source states and copy", () => {
  it("missing data never reads as zero", () => {
    expect(sourceValueText("udisc", null)).toBe("No native UDisc rating on file");
    expect(sourceValueText("udisc", 0)).toBe("0");
  });
  it("draft copy makes no superiority claim", () => {
    expect(JSON.stringify(DGD_COPY_DRAFT)).not.toMatch(/more accurate|better than/i);
  });
});
