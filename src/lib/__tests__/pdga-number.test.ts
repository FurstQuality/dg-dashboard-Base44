import { describe, expect, it } from "vitest";
import {
  formatPdgaNumber,
  normalizePdgaNumber,
  pdgaNumberQueryValues,
  pdgaNumberVariants,
} from "@/lib/pdga-number";

describe("normalizePdgaNumber", () => {
  it("strips decoration and leading zeros", () => {
    expect(normalizePdgaNumber("#249285")).toBe("249285");
    expect(normalizePdgaNumber(" PDGA 249285 ")).toBe("249285");
    expect(normalizePdgaNumber("0249285")).toBe("249285");
    expect(normalizePdgaNumber(249285)).toBe("249285");
  });

  it("returns null when there is no number", () => {
    expect(normalizePdgaNumber(null)).toBeNull();
    expect(normalizePdgaNumber(undefined)).toBeNull();
    expect(normalizePdgaNumber("")).toBeNull();
    expect(normalizePdgaNumber("not a number")).toBeNull();
    expect(normalizePdgaNumber("0")).toBeNull();
  });

  it("matches differently formatted values to each other", () => {
    expect(normalizePdgaNumber("#12345")).toBe(normalizePdgaNumber("12345"));
  });
});

describe("pdga number query values", () => {
  it("covers the stored spellings", () => {
    expect(pdgaNumberVariants("12345")).toEqual(["12345", "#12345", "PDGA 12345"]);
  });

  it("deduplicates across several numbers", () => {
    const values = pdgaNumberQueryValues(["12345", "12345", "999"]);
    expect(values).toContain("12345");
    expect(values).toContain("#999");
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("formatPdgaNumber", () => {
  it("formats for display and stays null when absent", () => {
    expect(formatPdgaNumber("249285")).toBe("#249285");
    expect(formatPdgaNumber(null)).toBeNull();
  });
});
