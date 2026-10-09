import { describe, expect, it } from "vitest";
import { matchUdiscRecord, enrichmentPatch } from "@/lib/udisc-enrichment";
import { classifyUdiscRound, isUdiscRatingEligible } from "@/lib/udisc-eligibility";

const base = { id: "a", played_on: "2026-05-01", course_name: "Oak Park", layout_name: "Main", score: 54, round_format_class: "UNKNOWN_FORMAT", round_rating: null };

describe("UDisc enrichment matching", () => {
  it("exact match on date, course, layout and score", () => {
    expect(matchUdiscRecord({ ...base }, [base]).confidence).toBe("EXACT");
  });
  it("high confidence when layout is missing on one side", () => {
    expect(matchUdiscRecord({ ...base, layout_name: null }, [base]).confidence).toBe("HIGH_CONFIDENCE");
  });
  it("same day and course with a different score is a different round", () => {
    expect(matchUdiscRecord({ ...base, score: 57 }, [base])).toEqual({ confidence: "UNMATCHED", match: null });
  });
  it("two identical candidates are never auto-merged", () => {
    expect(matchUdiscRecord(base, [base, { ...base, id: "b" }]).confidence).toBe("POSSIBLE");
  });
  it("new course or date is unmatched", () => {
    expect(matchUdiscRecord({ ...base, played_on: "2026-05-02" }, [base]).confidence).toBe("UNMATCHED");
  });
});

describe("UDisc enrichment patch", () => {
  const multi = classifyUdiscRound({ format: "singles", cardParticipants: 3 });
  it("adds player count and reclassifies to multiplayer singles", () => {
    const p = enrichmentPatch(base, { ...multi, round_format_class: multi.format_class });
    expect(p.round_format_class).toBe("SINGLES_MULTI_PLAYER");
    expect(p.participant_count).toBe(3);
    expect(isUdiscRatingEligible(p.round_format_class as string)).toBe(true);
  });
  it("solo and doubles stay excluded", () => {
    expect(isUdiscRatingEligible(classifyUdiscRound({ format: "singles", cardParticipants: 1 }).format_class)).toBe(false);
    expect(isUdiscRatingEligible(classifyUdiscRound({ format: "doubles", cardParticipants: 4 }).format_class)).toBe(false);
  });
  it("stores a native UDisc rating exactly and never overwrites one", () => {
    expect(enrichmentPatch(base, { round_rating: 241 }).round_rating).toBe(241);
    expect(enrichmentPatch({ ...base, round_rating: 230 }, { round_rating: 241 })).not.toHaveProperty("round_rating");
  });
  it("never downgrades a known format to unknown", () => {
    expect(enrichmentPatch({ ...base, round_format_class: "DOUBLES" }, { round_format_class: "UNKNOWN_FORMAT" })).toEqual({});
  });
});
