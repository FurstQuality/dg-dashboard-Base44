import { describe, expect, it } from "vitest";
import {
  clubDraft,
  eventOddsDraft,
  eventResultsDraft,
  coursePrDraft,
  crewDraft,
  hillDraft,
  practiceDraft,
  scoringMilestoneDraft,
} from "@/lib/share-to-feed";

describe("practiceDraft", () => {
  it("describes a range session with reps and location", () => {
    const draft = practiceDraft({ kind: "range", reps: 42, location: "Detweiller Park" });
    expect(draft.type).toBe("text");
    expect(draft.body).toBe("Practice session logged: 42 throws on the range at Detweiller Park.");
    expect(draft.location).toBe("Detweiller Park");
  });

  it("includes make percentage for putting sessions", () => {
    const draft = practiceDraft({ kind: "putting", reps: 60, makePct: 73 });
    expect(draft.body).toBe("Practice session logged: 60 putts on the green at 73% made.");
    expect(draft.scoreData).toMatchObject({ practice_kind: "putting", reps: 60, make_pct: 73 });
  });

  it("omits make percentage when it is unknown", () => {
    const draft = practiceDraft({ kind: "putting", reps: 10, makePct: null });
    expect(draft.body).toBe("Practice session logged: 10 putts on the green.");
  });
});

describe("clubDraft", () => {
  it("posts club updates to the club with the club attached", () => {
    const d = clubDraft({
      kind: "update",
      clubId: "c1",
      clubName: "Peoria DGC",
      location: "Peoria, IL",
      memberCount: 42,
    });
    expect(d.clubId).toBe("c1");
    expect(d.visibility).toBe("club");
    expect(d.body).toContain("Peoria DGC");
  });

  it("posts a join publicly without attaching the club feed", () => {
    const d = clubDraft({ kind: "joined", clubId: "c1", clubName: "Peoria DGC" });
    expect(d.clubId).toBeNull();
    expect(d.visibility).toBe("public");
  });
});

describe("crewDraft", () => {
  it("names the newest friend when provided", () => {
    expect(crewDraft({ friendCount: 5, newestFriend: "Mario Guzman" }).body).toContain(
      "Mario Guzman",
    );
  });

  it("handles an empty crew without a broken count", () => {
    expect(crewDraft({ friendCount: 0 }).body).not.toContain("0 player");
  });
});

describe("hillDraft", () => {
  it("celebrates the crown when the sharer leads", () => {
    const d = hillDraft({ rank: 1, fieldSize: 8, crownScore: 1420, isLeader: true });
    expect(d.body).toContain("Top dog");
    expect(d.scoreData as Record<string, unknown>).toMatchObject({ is_leader: true, rank: 1 });
  });

  it("uses the right ordinal and names the leader when climbing", () => {
    const d = hillDraft({
      rank: 3,
      fieldSize: 12,
      crownScore: 900,
      leaderName: "Ana",
      isLeader: false,
    });
    expect(d.body).toContain("3rd of 12");
    expect(d.body).toContain("Ana");
  });

  it("handles teen ordinals", () => {
    expect(hillDraft({ rank: 11, fieldSize: 20, crownScore: 500, isLeader: false }).body).toContain(
      "11th",
    );
  });
});

describe("coursePrDraft", () => {
  it("writes a course best with score, par, and rating", () => {
    const d = coursePrDraft({
      courseName: "Northwood Black",
      bestScore: 58,
      bestToPar: -4,
      bestRating: 975,
      rounds: 12,
    });
    expect(d.type).toBe("roundcard");
    expect(d.body).toBe(
      "Course best at Northwood Black: 58 (-4) · 975 rated across 12 rounds there.",
    );
    expect(d.courseName).toBe("Northwood Black");
    expect(d.scoreData).toMatchObject({ course_pr: true, total: 58, to_par: -4, rating: 975 });
  });

  it("still reads cleanly when only to-par is known", () => {
    const d = coursePrDraft({ courseName: "Sunset Hills", bestToPar: 0 });
    expect(d.body).toBe("Course best at Sunset Hills: even.");
  });

  it("handles a missing course name and missing scores", () => {
    const d = coursePrDraft({ courseName: null });
    expect(d.body).toBe("Course best at the course.");
  });
});

describe("scoringMilestoneDraft", () => {
  it("summarizes hole outcomes and rated rounds", () => {
    const d = scoringMilestoneDraft({
      birdiePct: 31,
      parPct: 55,
      bogeyPlusPct: 14,
      holesTracked: 540,
      ratedRounds: 30,
      avgRoundRating: 948,
      bestRoundRating: 1002,
    });
    expect(d.type).toBe("text");
    expect(d.body).toContain("31% birdie or better");
    expect(d.body).toContain("over 540 tracked holes");
    expect(d.body).toContain("30 rated rounds averaging 948, best 1002");
    expect(d.scoreData).toMatchObject({ scoring_milestone: true, rated_rounds: 30 });
  });

  it("drops the rated-round sentence when there are none", () => {
    const d = scoringMilestoneDraft({ birdiePct: 20, holesTracked: 90, ratedRounds: 0 });
    expect(d.body).toBe("Scoring check-in: 20% birdie or better over 90 tracked holes.");
  });
});

describe("eventOddsDraft", () => {
  it("states the projection numbers and rating basis", () => {
    const draft = eventOddsDraft({
      eventName: "Ledgestone Open",
      divisionCode: "MA1",
      myRating: 935,
      opponents: 84,
      winPct: 4,
      top3Pct: 12,
      cashPct: 41,
    });
    expect(draft.body).toContain("Ledgestone Open MA1");
    expect(draft.body).toContain("4% win");
    expect(draft.body).toContain("935 rating");
    expect(draft.scoreData).toMatchObject({ event_odds: true, opponents: 84 });
  });

  it("says unrated when no rating is linked", () => {
    const draft = eventOddsDraft({
      eventName: "Fall Flex",
      myRating: null,
      opponents: 10,
      winPct: 1,
      top3Pct: 2,
      cashPct: 3,
    });
    expect(draft.body).toContain("unrated");
  });
});

describe("eventResultsDraft", () => {
  it("lists the top three finishers only", () => {
    const draft = eventResultsDraft({
      eventName: "City Championship",
      divisionCode: "MP40",
      standings: [
        { position: 1, name: "Alex Vode", total: "-12" },
        { position: 2, name: "Mario Guzman", total: "-9" },
        { position: 3, name: "Steve Stedman", total: "E" },
        { position: 4, name: "Someone Else", total: "+2" },
      ],
    });
    expect(draft.body).toContain("1. Alex Vode (-12)");
    expect(draft.body).not.toContain("Someone Else");
    expect(draft.type).toBe("tournament");
  });

  it("still posts when standings have no totals", () => {
    const draft = eventResultsDraft({
      eventName: "Doubles Night",
      standings: [{ position: 1, name: "Card A", total: null }],
    });
    expect(draft.body).toContain("1. Card A");
  });
});
