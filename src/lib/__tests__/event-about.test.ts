import { describe, expect, it } from "vitest";
import { extractAboutText } from "@/lib/event-about";

describe("extractAboutText", () => {
  it("pulls the About section body over a share blurb", () => {
    const html = `
      <meta name="description" content="See up to date scores for NWI High Flyers here." />
      <h2>About</h2>
      <p>NWI High Flyers Friday Night Glow runs every Friday at Lemon Lake.</p>
      <p>Check-in closes at 7:30pm, $10 entry, glow discs required.</p>
      <h2>Divisions</h2>
      <p>MPO, MA1</p>`;
    const text = extractAboutText(html);
    expect(text).toContain("Friday Night Glow runs every Friday");
    expect(text).toContain("Check-in closes at 7:30pm");
    expect(text).not.toContain("MPO");
  });

  it("returns null when the page has no About copy", () => {
    expect(extractAboutText("<h2>About</h2><p>Short.</p>")).toBeNull();
    expect(extractAboutText("<p>No headings here at all.</p>")).toBeNull();
  });
});
