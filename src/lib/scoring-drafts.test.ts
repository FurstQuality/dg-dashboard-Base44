import { describe, expect, it } from "vitest";
import { reconcileScoringDrafts } from "./scoring-drafts";
const score = (hole: number, strokes: number) => ({ round_player_id: "player", hole_number: hole, strokes });
describe("live scoring controls", () => {
  it("updates untouched controls when a cardmate corrects an existing cell", () => {
    expect(reconcileScoringDrafts({ "player:1": 3 }, new Set(), [score(1, 5)], ["player"], 1, 3)).toEqual({ "player:1": 5 });
  });
  it("preserves an active edit while updating other holes", () => {
    expect(reconcileScoringDrafts({ "player:1": 6, "player:2": 3 }, new Set(["player:1"]), [score(1, 4), score(2, 5)], ["player"], 1, 3)).toEqual({ "player:1": 6, "player:2": 5 });
  });
  it("seeds new cells from the layout par and removes deleted saved cells", () => {
    expect(reconcileScoringDrafts({ "player:2": 5 }, new Set(), [], ["player"], 1, 4)).toEqual({ "player:1": 4 });
  });
});
