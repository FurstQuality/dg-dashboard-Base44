import { describe, it, expect } from "vitest";
import { finaleRace } from "./competition-model";
const r = (p: string, e: string, pos: number, pts: number) => ({ player_id: p, player_name: p, event_id: e, division: "MA3", position: pos, points: pts });
describe("finaleRace", () => {
  it("projects totals and ranks", () => {
    const rows = finaleRace([r("a", "e1", 1, 21), r("b", "e1", 2, 20), r("b", "f", 1, 21), r("a", "f", 2, 20)], "f", false, 21);
    expect(rows.map((x) => [x.player_id, x.projected, x.projected_rank])).toEqual([["a", 41, 1], ["b", 41, 1]]);
  });
  it("clinches only when out of reach", () => {
    const rows = finaleRace([r("a", "e1", 1, 60), r("b", "e1", 2, 30)], "f", false, 21);
    expect(rows[0]!.clinched).toBe(true);
    const close = finaleRace([r("a", "e1", 1, 40), r("b", "e1", 2, 30)], "f", false, 21);
    expect(close[0]!.clinched).toBe(false);
  });
});
import { seriesStandings } from "./competition-model";
describe("division change policy", () => {
  const res = [
    { player_id: "a", player_name: "A", event_id: "e1", event_name: "E1", position: 1, division: "MA3" },
    { player_id: "a", player_name: "A", event_id: "e2", event_name: "E2", position: 1, division: "MA2" },
  ];
  const base = { points_system: "standard" as const, points_table: [10, 8], counting_events: null, drop_worst: 0 };
  it("separate keeps two rows", () => expect(seriesStandings(res, base)).toHaveLength(2));
  it("carry merges into latest division", () => {
    const rows = seriesStandings(res, { ...base, division_change: "carry" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.division).toBe("MA2");
    expect(rows[0]!.points).toBe(20);
  });
});
