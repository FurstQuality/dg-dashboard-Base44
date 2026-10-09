import { describe, expect, it } from "vitest";
import {
  DEFAULT_SERIES_POINTS,
  defaultSeriesSettings,
  pointsForPosition,
  seriesStandings,
  type SeriesResultInput,
} from "@/lib/competition-model";

function result(player: string, event: string, position: number): SeriesResultInput {
  return {
    player_id: player,
    player_name: player,
    event_id: event,
    event_name: event,
    position,
  };
}

describe("pointsForPosition", () => {
  it("awards the table value for positions inside the table", () => {
    expect(pointsForPosition(DEFAULT_SERIES_POINTS, 1)).toBe(100);
    expect(pointsForPosition(DEFAULT_SERIES_POINTS, 3)).toBe(82);
  });

  it("tapers past the end of the table without going below one point", () => {
    const last = DEFAULT_SERIES_POINTS[DEFAULT_SERIES_POINTS.length - 1]!;
    expect(pointsForPosition(DEFAULT_SERIES_POINTS, DEFAULT_SERIES_POINTS.length + 1)).toBe(
      last - 1,
    );
    expect(pointsForPosition(DEFAULT_SERIES_POINTS, 500)).toBe(1);
  });

  it("ignores invalid positions", () => {
    expect(pointsForPosition(DEFAULT_SERIES_POINTS, 0)).toBe(0);
  });
});

describe("seriesStandings", () => {
  it("sums every stop when nothing is dropped", () => {
    const rows = seriesStandings(
      [result("a", "e1", 1), result("a", "e2", 3), result("b", "e1", 2), result("b", "e2", 2)],
      { ...defaultSeriesSettings(), drop_worst: 0 },
    );
    expect(rows.map((r) => r.player_id)).toEqual(["a", "b"]);
    expect(rows[0]!.points).toBe(100 + 82);
    expect(rows[0]!.dropped).toBe(0);
    expect(rows[1]!.points).toBe(90 + 90);
  });


  it("drops each player's worst stop", () => {
    const rows = seriesStandings(
      [result("a", "e1", 1), result("a", "e2", 1), result("a", "e3", 40)],
      { ...defaultSeriesSettings(), drop_worst: 1 },
    );
    expect(rows[0]!.points).toBe(200);
    expect(rows[0]!.events_played).toBe(3);
    expect(rows[0]!.events_counted).toBe(2);
    expect(rows[0]!.dropped).toBe(1);
  });

  it("never drops a player's only result", () => {
    const rows = seriesStandings([result("a", "e1", 5)], {
      ...defaultSeriesSettings(),
      drop_worst: 3,
    });
    expect(rows[0]!.events_counted).toBe(1);
    expect(rows[0]!.points).toBe(69);
  });

  it("caps counted stops at counting_events", () => {
    const rows = seriesStandings(
      [result("a", "e1", 1), result("a", "e2", 2), result("a", "e3", 3)],
      { ...defaultSeriesSettings(), counting_events: 2 },
    );
    expect(rows[0]!.events_counted).toBe(2);
    expect(rows[0]!.points).toBe(190);
  });

  it("tracks best finish", () => {
    const rows = seriesStandings([result("a", "e1", 7), result("a", "e2", 2)], defaultSeriesSettings());
    expect(rows[0]!.best_finish).toBe(2);
  });
});
