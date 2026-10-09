import { describe, expect, it } from "vitest";
import { fieldSizePoints, groupByDivision, seriesStandings, type SeriesSettings } from "./competition-model";

const rr: SeriesSettings = {
  points_system: "field_size", points_table: [], counting_events: null, drop_worst: 0,
  field_size_bonus: 5, min_event_points: 5,
};

describe("field-size placement points (Region Rumble)", () => {
  it("matches observed values", () => {
    expect(fieldSizePoints(17, 1)).toBe(21);
    expect(fieldSizePoints(17, 2)).toBe(20);
    expect(fieldSizePoints(17, 17)).toBe(5);
    expect(fieldSizePoints(8, 1)).toBe(12);
    expect(fieldSizePoints(8, 8)).toBe(5);
    expect(fieldSizePoints(1, 1)).toBe(5);
  });
  it("ties share the tied place's points, cumulative, per division", () => {
    const res = [
      { player_id: "a", player_name: "A", event_id: "e1", event_name: "", position: 3, division: "MA1", field_size: 5 },
      { player_id: "b", player_name: "B", event_id: "e1", event_name: "", position: 3, division: "MA1", field_size: 5 },
      { player_id: "a", player_name: "A", event_id: "e2", event_name: "", position: 1, division: "MA1", field_size: 8 },
      { player_id: "a", player_name: "A", event_id: "e3", event_name: "", position: 1, division: "MA40", field_size: 1 },
    ];
    const st = seriesStandings(res, rr);
    const ma1 = st.filter((r) => r.division === "MA1");
    expect(ma1.find((r) => r.player_id === "a")!.points).toBe(7 + 12);
    expect(ma1.find((r) => r.player_id === "b")!.points).toBe(7);
    expect(st.find((r) => r.division === "MA40")!.points).toBe(5);
    expect(groupByDivision(st).map(([d]) => d)).toEqual(["MA1", "MA40"]);
  });
});

import { pointsForResult as pfr, seriesStandings as ss, groupByDivision as gbd } from "@/lib/competition-model";
describe("series extras", () => {
  const base = { points_system: "field_size" as const, points_table: [], counting_events: null, drop_worst: 0, field_size_bonus: 5, min_event_points: 5 };
  it("finale multiplier and participation bonus", () => {
    const s = { ...base, finale_event_id: "F", finale_multiplier: 2, participation_bonus: 3 };
    const r = { player_id: "a", player_name: "A", event_id: "F", event_name: "F", position: 1, field_size: 10 };
    expect(pfr(r, s)).toBe(14 * 2 + 3);
    expect(pfr({ ...r, event_id: "X" }, s)).toBe(17);
  });
  it("qualification and award cut", () => {
    const s = { ...base, qualify_min_events: 2, award_places: 1 };
    const rows = ss([
      { player_id: "a", player_name: "A", event_id: "1", event_name: "1", position: 1, field_size: 3 },
      { player_id: "b", player_name: "B", event_id: "1", event_name: "1", position: 2, field_size: 3 },
      { player_id: "b", player_name: "B", event_id: "2", event_name: "2", position: 2, field_size: 3 },
    ], s);
    const [[, g]] = gbd(rows, 1);
    expect(g.find((r) => r.player_id === "a")!.qualified).toBe(false);
    expect(g.find((r) => r.player_id === "b")!.award).toBe(true);
  });
});
