import { describe, expect, it } from "vitest";
import { restoreHistoricalPdga, type ExternalMeta } from "@/lib/dgd-v1/shadow-input";
import type { CanonicalRoundInput } from "@/lib/dgd-v1/engine";

const round = (id: string, elig: string, rows: string[], format = "singles") =>
  ({ id, canonical_eligibility: elig, format, sources: rows.map((r) => ({ source: r.split(":")[0], source_table: "external_rounds", source_row_id: r })) }) as unknown as CanonicalRoundInput;
const ext = new Map<string, ExternalMeta>([
  ["pdga:old", { id: "pdga:old", source: "pdga", included: false, format: "singles" } as ExternalMeta],
  ["pdga:cur", { id: "pdga:cur", source: "pdga", included: true, format: "singles" } as ExternalMeta],
  ["pdga:dbl", { id: "pdga:dbl", source: "pdga", included: false, format: "doubles" } as ExternalMeta],
  ["udisc:x", { id: "udisc:x", source: "udisc", included: null } as ExternalMeta],
]);

describe("historical PDGA rounds (outside PDGA's rating window)", () => {
  it("are restored for DGD without changing the PDGA flag", () => {
    const { rounds, restored } = restoreHistoricalPdga([round("a", "ineligible", ["pdga:old"])], ext);
    expect(rounds[0].canonical_eligibility).toBe("rated");
    expect([...restored]).toEqual(["a"]);
    expect(ext.get("pdga:old")!.included).toBe(false);
  });
  it("leave doubles, non-PDGA and unknown-source exclusions alone", () => {
    const { restored } = restoreHistoricalPdga(
      [round("b", "ineligible", ["pdga:dbl"]), round("c", "ineligible", ["udisc:x"]), round("d", "ineligible", ["pdga:missing"]), round("e", "ineligible", ["pdga:old"], "doubles")],
      ext,
    );
    expect(restored.size).toBe(0);
  });
  it("never applies an age cutoff and leaves already-rated rounds untouched", () => {
    const r = round("f", "rated", ["pdga:cur"]);
    expect(restoreHistoricalPdga([r], ext).rounds[0]).toBe(r);
  });
});
