import { describe, expect, it } from "vitest";
import { buildDirectorList, filterDirectorList } from "./director-event-list";

const today = "2026-10-05";
const ev = (o: Partial<Parameters<typeof buildDirectorList>[0][number]>) => ({
  id: "t", name: "Open", slug: "open", status: "published", startDate: "2026-11-01", role: "owner" as const, ...o,
});
const lg = (o: Partial<Parameters<typeof buildDirectorList>[1][number]>) => ({
  id: "l", name: "Tuesday Singles", slug: "tue", status: "active", season: null, dayOfWeek: 2,
  startDate: "2026-09-01", endDate: "2026-11-30", format: "singles", eventType: "league",
  players: 12, weeks: 10, ...o,
});

describe("buildDirectorList", () => {
  it("puts live first and gives each event one next step", () => {
    const list = buildDirectorList(
      [ev({ id: "a", status: "draft" }), ev({ id: "b", status: "registration_open" })],
      [lg({})],
      today,
    );
    expect(list.map((i) => i.stage)).toEqual(["live", "draft", "upcoming"]);
    expect(list[0].next.label).toBe("Run the next night");
    expect(list[1].next.label).toBe("Finish setup and publish");
    expect(list[2].next.target).toBe("registrations");
  });
  it("marks past-dated tournaments finished and leagues without nights", () => {
    const list = buildDirectorList([ev({ startDate: "2026-01-01" })], [lg({ weeks: 0 })], today);
    expect(list.find((i) => i.kind === "tournament")?.stage).toBe("past");
    expect(list.find((i) => i.kind === "league")?.next.label).toBe("Add league nights");
  });
  it("filters by stage, type, role and name", () => {
    const list = buildDirectorList([ev({ role: "co_td" })], [lg({})], today);
    expect(filterDirectorList(list, { stage: "all", kind: "league", role: "all", term: "" })).toHaveLength(1);
    expect(filterDirectorList(list, { stage: "all", kind: "all", role: "co_td", term: "" })).toHaveLength(1);
    expect(filterDirectorList(list, { stage: "all", kind: "all", role: "all", term: "tues" })).toHaveLength(1);
  });
});
