import { describe, expect, it } from "vitest";
import { compactScoreLine, formatToPar, relativeToPar } from "./score-display";

describe("score display standard", () => {
  it.each([[54, 54, "E"], [53, 54, "-1"], [55, 54, "+1"], [48, 60, "-12"]])("%i on par %i → %s", (s, p, out) => {
    expect(formatToPar(relativeToPar(s, p))).toBe(out);
  });
  it("same course, different layout pars", () => {
    expect(formatToPar(relativeToPar(74, 78))).toBe("-4");
    expect(formatToPar(relativeToPar(74, 56))).toBe("+18");
  });
  it("historical par stays with the round", () => {
    expect(compactScoreLine({ score: 52, par: 54 })).toBe("52 (-2) · Par 54");
  });
  it("unknown par is never zero", () => {
    expect(relativeToPar(58, null)).toBeNull();
    expect(relativeToPar(58, 0)).toBeNull();
    expect(formatToPar(null)).toBe("—");
    expect(compactScoreLine({ score: 58, par: null })).toBe("58 · Par unknown");
  });
  it("labels projected vs official ratings", () => {
    expect(compactScoreLine({ score: 58, par: 54, rating: 917, ratingSource: "DGD_PROJECTED" })).toBe("58 (+4) · Par 54 · Projected DGD 917");
    expect(compactScoreLine({ score: 58, par: 54, rating: 917 })).toBe("58 (+4) · Par 54 · DGD 917");
  });
});

import { projectedRoundRating } from "./score-display";
describe("projected DGD round rating", () => {
  it("uses layout calibration", () => {
    expect(projectedRoundRating({ projectedToPar: -7, scratchRating: 1000, strokeValue: 8 })).toBe(1056);
  });
  it("is unavailable without layout calibration", () => {
    expect(projectedRoundRating({ projectedToPar: -7, scratchRating: null, strokeValue: 8 })).toBeNull();
  });
});
