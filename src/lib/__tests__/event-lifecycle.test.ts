import { describe, expect, it } from "vitest";
import { eventLifecycle } from "@/lib/tracker/event-lifecycle";

const base = { eventDate: "2026-11-01", endDate: null, eventStatus: null, registrationStatus: null, roundsPlanned: 3, fieldCount: 0, scores: [] };
const sc = (r: number, started: boolean, completed: boolean) => ({ round_number: r, round_started: started, completed, tee_time: null, place: null });

describe("eventLifecycle", () => {
  it("announced event lists precise pending items, no standings", () => {
    const r = eventLifecycle(base);
    expect(r.state).toBe("ANNOUNCED");
    expect(r.pending).toEqual(["Field not published yet", "Tee times not posted", "Live scoring not started"]);
    expect(r.hasStandings).toBe(false);
  });
  it("registration open and field posted", () => {
    expect(eventLifecycle({ ...base, registrationStatus: "open" }).state).toBe("REGISTRATION_OPEN");
    expect(eventLifecycle({ ...base, fieldCount: 40 }).state).toBe("FIELD_AVAILABLE");
  });
  it("live only when scoring started, between rounds when round finished", () => {
    expect(eventLifecycle({ ...base, fieldCount: 2, scores: [sc(1, true, false), sc(1, true, true)] }).state).toBe("LIVE");
    expect(eventLifecycle({ ...base, fieldCount: 2, scores: [sc(1, true, true)] }).state).toBe("ROUND_COMPLETE");
  });
  it("complete after final planned round or explicit status", () => {
    expect(eventLifecycle({ ...base, fieldCount: 1, scores: [sc(3, true, true)] }).state).toBe("EVENT_COMPLETE");
    expect(eventLifecycle({ ...base, eventStatus: "Cancelled" }).state).toBe("CANCELLED");
  });
});
