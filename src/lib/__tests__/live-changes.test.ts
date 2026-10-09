import { describe, expect, it } from "vitest";
import { diffLiveRow, type LiveRowLike } from "@/lib/tracker/live-changes";

const row = (p: Partial<LiveRowLike> = {}): LiveRowLike => ({ round_number: 1, division: "MA1", tee_time: null, round_started: false, completed: false, running_place: null, round_score: null, ...p });

describe("diffLiveRow", () => {
  it("same snapshot twice yields nothing", () => {
    const r = row({ tee_time: "9:00", round_started: true, completed: true, round_score: 54, running_place: 3 });
    expect(diffLiveRow(r, r)).toEqual([]);
  });
  it("tee time posted vs changed", () => {
    expect(diffLiveRow(row(), row({ tee_time: "9:00" }))[0]).toMatchObject({ field: "tee_time", severity: "info" });
    expect(diffLiveRow(row({ tee_time: "9:00" }), row({ tee_time: "9:10" }))[0]).toMatchObject({ severity: "warning", from_value: "R1 9:00" });
  });
  it("round finished posts score; position only moves on finished rounds", () => {
    const f = diffLiveRow(row({ round_started: true, running_place: 5 }), row({ round_started: true, completed: true, round_score: 52, running_place: 2 })).map((c) => c.field);
    expect(f).toEqual(["round_status", "round_score", "position"]);
    expect(diffLiveRow(row({ round_started: true, running_place: 5 }), row({ round_started: true, running_place: 2 }))).toEqual([]);
  });
  it("division change only when known before", () => {
    expect(diffLiveRow(null, row())).toEqual([]);
    expect(diffLiveRow(row(), row({ division: "MPO" }))[0]?.field).toBe("division");
  });
});
