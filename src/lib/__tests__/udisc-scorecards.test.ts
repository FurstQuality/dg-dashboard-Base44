import { describe, expect, it } from "vitest";
import { parseUdiscScorecards, summarizeScorecards } from "../udisc-scorecards";

const csv = [
  "PlayerName,CourseName,LayoutName,StartDate,EndDate,Total,+/-,RoundRating,Hole1",
  "Par,A,L,2026-01-01 0900-0500,,54,,,3",
  "Furst,A,L,2026-01-01 0900-0500,,46,-8,171,2",
  "Cheryl Furst,A,L,2026-01-01 0900-0500,,60,+6,,3",
  "Par,B,L,2026-01-02 0900-0500,,54,,,3",
  "Michael Furst + Sam Z,B,L,2026-01-02 0900-0500,,50,-4,220,3",
  "Par,C,L,2026-01-03 0900-0500,,54,,,3",
  "Michael Furst,C,L,2026-01-03 0900-0500,,55,+1,,3",
].join("\n");

describe("parseUdiscScorecards", () => {
  it("groups rows by Par block and classifies each card", () => {
    const cards = parseUdiscScorecards(csv, ["Michael Furst", "Furst"]);
    expect(cards.map((c) => c.classification)).toEqual([
      "SINGLES_MULTI_PLAYER",
      "TEAM_OR_DOUBLES",
      "SINGLES_SOLO",
    ]);
    expect(cards[0]!.me?.rating).toBe(171);
    expect(cards[0]!.participants.find((p) => p.name === "Cheryl Furst")?.isMe).toBe(false);
  });

  it("keeps blank ratings null and never borrows a cardmate's", () => {
    const s = summarizeScorecards(parseUdiscScorecards(csv, ["Michael Furst", "Furst"]));
    expect(s).toMatchObject({ total: 3, multi: 1, solo: 1, team: 1, rated: 1, unrated: 0 });
  });
});
