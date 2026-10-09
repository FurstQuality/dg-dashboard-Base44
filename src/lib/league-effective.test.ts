import { describe, expect, it } from "vitest";
import { nightReadiness, previewDefaultChange, resolveNight, venueSummary } from "./league-effective";

const league = { entry_fee_cents: 1000, start_time: "18:00:00", holes_played: 18 };
const night = (o: Record<string, unknown> = {}) => ({
  entry_fee_cents: null, start_time: null, holes_played: null, course_id: "c1", layout_id: "l1", status: "scheduled", ...o,
});

describe("league effective config", () => {
  it("inherits league defaults and keeps night overrides", () => {
    expect(resolveNight(league, night()).entryFeeCents).toEqual({ value: 1000, source: "series" });
    expect(resolveNight(league, night({ entry_fee_cents: 1500 })).entryFeeCents).toEqual({ value: 1500, source: "event" });
    expect(resolveNight({ ...league, entry_fee_cents: 1200 }, night()).entryFeeCents.value).toBe(1200);
  });
  it("never inherits course", () => {
    expect(resolveNight(league, night({ course_id: null })).courseId).toBeNull();
    expect(nightReadiness(night({ course_id: null }))).toBe("needs_course");
    expect(nightReadiness(night({ layout_id: null }))).toBe("needs_layout");
  });
  it("previews a default change: 6 inherit, 2 overrides stay, completed untouched", () => {
    const nights = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, ...night() })),
      { id: "o1", ...night({ entry_fee_cents: 1500 }) },
      { id: "o2", ...night({ entry_fee_cents: 1500 }) },
      { id: "done", ...night({ status: "completed" }) },
    ];
    const p = previewDefaultChange(nights, "entry_fee_cents");
    expect(p).toEqual({ future: 8, willUpdate: 6, keepOverride: ["o1", "o2"] });
  });
  it("summarizes multi-course leagues", () => {
    expect(venueSummary([night(), night({ course_id: "c2" })]).kind).toBe("multiple");
    expect(venueSummary([night(), night()]).kind).toBe("single");
  });
});

import { nightTitle } from "./league-effective";
describe("nightTitle", () => {
  it("inherits league name + week when blank", () => {
    expect(nightTitle("Tuesday Singles", { name: " ", week_number: 3 })).toEqual({ value: "Tuesday Singles · Week 3", source: "series" });
    expect(nightTitle("X", { name: "Glow night", week_number: 3 }).value).toBe("Glow night");
  });
});
