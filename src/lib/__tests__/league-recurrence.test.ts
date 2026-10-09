import { describe, expect, it } from "vitest";
import {
  meetingSchedule,
  meetingSummary,
  meetsOn,
  nextMeeting,
  weekdaysInTitle,
} from "@/lib/league-recurrence";

// 2026-09-08 is a Tuesday; 2026-09-09 a Wednesday.
const tenWeekTuesday = {
  name: "Duneland Singles League",
  start_date: "2026-09-08",
  end_date: "2026-11-10",
};

describe("league recurrence", () => {
  it("treats a multi-week block as weekly on its first meeting weekday", () => {
    const schedule = meetingSchedule(tenWeekTuesday);
    expect(schedule.recurring).toBe(true);
    expect(schedule.weekdays).toEqual([2]);
    expect(schedule.basis).toBe("first_meeting");
  });

  it("only counts the league as playing on its weekday", () => {
    expect(meetsOn(tenWeekTuesday, "2026-09-08")).toBe(true);
    expect(meetsOn(tenWeekTuesday, "2026-09-15")).toBe(true);
    expect(meetsOn(tenWeekTuesday, "2026-09-09")).toBe(false);
    expect(meetsOn(tenWeekTuesday, "2026-11-17")).toBe(false);
  });

  it("prefers a weekday named in the title", () => {
    const league = {
      name: "Thursday Night Doubles League",
      start_date: "2026-09-08",
      end_date: "2026-11-10",
    };
    expect(meetingSchedule(league).weekdays).toEqual([4]);
    expect(meetsOn(league, "2026-09-10")).toBe(true);
    expect(meetsOn(league, "2026-09-08")).toBe(false);
  });

  it("keeps short blocks as consecutive playing days", () => {
    const weekend = { name: "Fall Ice Bowl", start_date: "2026-09-12", end_date: "2026-09-13" };
    expect(meetingSchedule(weekend).recurring).toBe(false);
    expect(meetsOn(weekend, "2026-09-13")).toBe(true);
  });

  it("leaves flex-start and tag leagues playable any day in the window", () => {
    const flex = {
      name: "GDG Sanctioned League Summer 2026 (Flex Start)",
      start_date: "2026-07-21",
      end_date: "2026-09-22",
    };
    expect(meetingSchedule(flex).basis).toBe("flex_window");
    expect(meetsOn(flex, "2026-09-12")).toBe(true);
    expect(meetsOn(flex, "2026-09-13")).toBe(true);
    expect(meetsOn(flex, "2026-09-23")).toBe(false);
    expect(meetingSummary(flex)).toBe("Flex start — play any day");

    const tags = { name: "2026 LDGA Bag Tags", start_date: "2026-02-01", end_date: "2026-12-31" };
    expect(meetsOn(tags, "2026-09-12")).toBe(true);
  });

  it("finds the next meeting date", () => {
    expect(nextMeeting(tenWeekTuesday, "2026-09-09")).toBe("2026-09-15");
    expect(nextMeeting(tenWeekTuesday, "2026-12-01")).toBeNull();
  });

  it("reads weekdays out of titles and summarizes them", () => {
    expect(weekdaysInTitle("Mon/Wed Singles")).toEqual([1, 3]);
    expect(meetingSummary(tenWeekTuesday)).toBe("Tuesdays");
    expect(
      meetingSummary({ name: "Mon & Thurs League", start_date: "2026-09-07", end_date: "2026-11-09" }),
    ).toBe("Mondays and Thursdays");
  });
});
