import { describe, expect, it } from "vitest";
import { buildEventIcs } from "../community-ics";

describe("buildEventIcs", () => {
  const base = {
    id: "abc",
    title: "Fall Cleanup, Round 2",
    starts_at: "2026-09-12T15:00:00.000Z",
  };

  it("wraps the event in a valid calendar envelope", () => {
    const ics = buildEventIcs(base);
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("UID:outreach-abc@dgdashboard");
    expect(ics).toContain("DTSTART:20260912T150000Z");
  });

  it("escapes commas in text fields", () => {
    expect(buildEventIcs(base)).toContain("SUMMARY:Fall Cleanup\\, Round 2");
  });

  it("defaults to a two hour window when no end time is published", () => {
    expect(buildEventIcs(base)).toContain("DTEND:20260912T170000Z");
  });

  it("includes location and description only when present", () => {
    const ics = buildEventIcs({ ...base, location: "Peoria, IL", description: "Bring gloves" });
    expect(ics).toContain("LOCATION:Peoria\\, IL");
    expect(ics).toContain("DESCRIPTION:Bring gloves");
    expect(buildEventIcs(base)).not.toContain("LOCATION:");
  });
});
