import { describe, expect, it } from "vitest";
import {
  courseLabel,
  pickTeeRows,
  resolveRoundCourse,
  resolveRoundCourseLabel,
  type RoundCourseRow,
  type TeeRow,
} from "@/lib/tracker-rounds";

const round = (over: Partial<RoundCourseRow>): RoundCourseRow => ({
  event_id: "98448",
  round_number: 1,
  division: null,
  pool: null,
  course_name: null,
  course_layout: null,
  ...over,
});

describe("resolveRoundCourse", () => {
  it("prefers the player's pool over any broader row", () => {
    const rows = [
      round({ pool: "U", division: "MA3", course_name: "Lake Eureka" }),
      round({ pool: "A", division: "MPO", course_name: "Westwood" }),
      round({ course_name: "Maxwell Park" }),
    ];
    expect(resolveRoundCourse(rows, 1, "MA3", "U")).toBe("Lake Eureka");
    expect(resolveRoundCourse(rows, 1, "MPO", "A")).toBe("Westwood");
  });

  it("returns null rather than guessing when a pool-split round has no pool row", () => {
    const rows = [
      round({ pool: "A", course_name: "Westwood" }),
      round({ pool: "B", course_name: "Lake Eureka" }),
    ];
    expect(resolveRoundCourse(rows, 1, "MA3", "Z")).toBeNull();
    expect(resolveRoundCourse(rows, 1, "MA3", null)).toBeNull();
  });

  it("falls back to the division row, then the aggregate, on single-course rounds", () => {
    const rows = [
      round({ division: "MA3", course_name: "Megiddo Disc Golf Course" }),
      round({ course_name: "Megiddo Disc Golf Course" }),
    ];
    expect(resolveRoundCourse(rows, 1, "MA3", null)).toBe("Megiddo Disc Golf Course");
    expect(resolveRoundCourse(rows, 1, "FA1", null)).toBe("Megiddo Disc Golf Course");
  });

  it("treats a missing round number as round 1 and unknown rounds as TBD", () => {
    const rows = [round({ course_name: "Westwood" })];
    expect(resolveRoundCourse(rows, null, null, null)).toBe("Westwood");
    expect(resolveRoundCourse(rows, 3, null, null)).toBeNull();
  });
});

describe("courseLabel", () => {
  it("combines venue and layout when the layout adds information", () => {
    expect(courseLabel("Megiddo Disc Golf Course", "Westwood")).toBe(
      "Megiddo Disc Golf Course (Westwood)",
    );
  });

  it("does not repeat an overlapping layout name", () => {
    expect(courseLabel("Lake Eureka Disc Golf Course", "Lake Eureka")).toBe(
      "Lake Eureka Disc Golf Course",
    );
  });

  it("handles missing values", () => {
    expect(courseLabel(null, "Westwood")).toBe("Westwood");
    expect(courseLabel("Westwood", null)).toBe("Westwood");
    expect(courseLabel(null, null)).toBeNull();
  });

  it("labels a resolved round with its layout", () => {
    const rows = [
      round({ pool: "U", course_name: "Megiddo Disc Golf Course", course_layout: "Westwood" }),
    ];
    expect(resolveRoundCourseLabel(rows, 1, "MA3", "U")).toBe(
      "Megiddo Disc Golf Course (Westwood)",
    );
  });
});

describe("pickTeeRows", () => {
  const tee = (over: Partial<TeeRow>): TeeRow => ({
    id: "1",
    event_id: "98448",
    member_id: "m1",
    round_number: 1,
    pool: null,
    division: null,
    tee_time: null,
    ...over,
  });

  it("keeps the row with a tee time for the same member and round", () => {
    const out = pickTeeRows([tee({ id: "a" }), tee({ id: "b", tee_time: "07:30:00" })]);
    expect(out.map((r) => r.id)).toEqual(["b"]);
  });

  it("drops legacy round-less rows once a real round row exists", () => {
    const out = pickTeeRows([
      tee({ id: "legacy", round_number: null, tee_time: "09:00:00" }),
      tee({ id: "r1", round_number: 1, tee_time: "07:30:00" }),
      tee({ id: "r2", round_number: 2, tee_time: "14:30:00" }),
    ]);
    expect(out.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
  });

  it("keeps a round-less row when it is all the player has", () => {
    const out = pickTeeRows([tee({ id: "legacy", round_number: null })]);
    expect(out.map((r) => r.id)).toEqual(["legacy"]);
  });

  it("does not merge rows across members", () => {
    const out = pickTeeRows([
      tee({ id: "a", member_id: "m1", tee_time: "07:30:00" }),
      tee({ id: "b", member_id: "m2", tee_time: "07:40:00" }),
    ]);
    expect(out).toHaveLength(2);
  });
});
