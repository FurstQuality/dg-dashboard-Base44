import { describe, expect, it } from "vitest";
import { classifyUdiscRound, isUdiscRatingEligible } from "@/lib/udisc-eligibility";
import { toShadowRounds, type ExternalMeta } from "@/lib/dgd-v1/shadow-input";
import type { CanonicalRoundInput, EligibilityResult } from "@/lib/dgd-v1/engine";

const round = (id: string, sources: { source: string; row: string; rating?: number | null }[]): CanonicalRoundInput =>
  ({
    id, user_id: "u1", played_on: "2026-05-01", score: 54, par_played: 54, hole_count: 18,
    course_name: "Oak Park", layout_name: "Main", course_key: "oak", layout_mapping: "EXACT",
    duplicate_resolution: null, canonical_eligibility: "eligible",
    sources: sources.map((s) => ({ source: s.source, source_table: "external_rounds", source_row_id: s.row, source_round_rating: s.rating ?? null })),
  }) as unknown as CanonicalRoundInput;
const elig = (id: string): EligibilityResult =>
  ({ canonical_round_id: id, state: "ELIGIBLE", reason_codes: [], layout_known: true, layout_key: "oak:main" }) as unknown as EligibilityResult;
const ext = (id: string, source: string, cls: string | null, rating: number | null = null): ExternalMeta => ({
  id, source, round_format_class: cls, event_name: null, pdga_event_ref: source === "pdga" ? "123" : null,
  division: null, round_rating: rating, chainlink_rating: null,
});

describe("UDisc format classification", () => {
  it("accepts singles with other players", () => {
    const c = classifyUdiscRound({ format: "singles", cardParticipants: 3 });
    expect(c.format_class).toBe("SINGLES_MULTI_PLAYER");
    expect(c.event_context).toBe("CASUAL_MULTI_PLAYER");
    expect(c.participant_count_source).toBe("CARD_INFERRED");
    expect(isUdiscRatingEligible(c.format_class)).toBe(true);
  });
  it("accepts league and tournament singles", () => {
    expect(classifyUdiscRound({ format: "singles", cardParticipants: 4, eventName: "Tuesday League" }).event_context).toBe("LEAGUE");
    expect(classifyUdiscRound({ format: "singles", sourceParticipantCount: 60, eventName: "Spring Open" }).event_context).toBe("TOURNAMENT");
  });
  it("excludes solo, doubles, team and unknown", () => {
    expect(classifyUdiscRound({ format: "singles", cardParticipants: 1 }).exclusion_reason).toBe("SOLO_ROUND");
    expect(classifyUdiscRound({ format: "doubles", cardParticipants: 4 }).exclusion_reason).toBe("TEAM_OR_DOUBLES");
    expect(classifyUdiscRound({ format: "team", cardParticipants: 8 }).format_class).toBe("TEAM");
    const u = classifyUdiscRound({ format: "singles" });
    expect(u.format_class).toBe("UNKNOWN_FORMAT");
    expect(u.participant_count_source).toBe("UNKNOWN");
  });
});

describe("UDisc rule in the DGD shadow pipeline", () => {
  it("holds UDisc solo/unknown/doubles rounds out of DGD", () => {
    for (const [cls, code] of [["SINGLES_SOLO", "SOLO_ROUND"], ["UNKNOWN_FORMAT", "UNKNOWN_FORMAT"], ["DOUBLES", "TEAM_OR_DOUBLES"]] as const) {
      const { cand, meta } = toShadowRounds([round("r", [{ source: "udisc", row: "x" }])], [elig("r")], new Map([["x", ext("x", "udisc", cls)]]));
      expect(cand).toHaveLength(0);
      expect(meta.get("r")!.reason_codes).toEqual([code]);
    }
  });
  it("rates UDisc multiplayer singles and preserves the native UDisc rating", () => {
    const { cand, meta } = toShadowRounds([round("r", [{ source: "udisc", row: "x" }])], [elig("r")], new Map([["x", ext("x", "udisc", "SINGLES_MULTI_PLAYER", 238)]]));
    expect(cand).toHaveLength(1);
    expect(meta.get("r")!.udisc_round_rating).toBe(238);
  });
  it("links PDGA + UDisc once and keeps both source ratings", () => {
    const r = round("r", [{ source: "pdga", row: "p", rating: 951 }, { source: "udisc", row: "x" }]);
    const { cand, meta } = toShadowRounds([r], [elig("r")], new Map([["p", ext("p", "pdga", null, 951)], ["x", ext("x", "udisc", "UNKNOWN_FORMAT", 238)]]));
    expect(cand).toHaveLength(1);
    const m = meta.get("r")!;
    expect(m.pdga_round_rating).toBe(951);
    expect(m.udisc_round_rating).toBe(238);
    expect(m.sources).toEqual(["pdga", "udisc"]);
  });
});
