import { describe, expect, it } from "vitest";
import { parseEventPage, parsePlayerSummary, parseRatingHistory } from "@/lib/pdga-intel/parsers";
import { officialRatingAt, ratingHistoryAnalytics, resolveRound } from "@/lib/pdga-intel/derive";
import { createPoliteFetcher } from "@/lib/pdga-intel/fetcher";
import type { PdgaDetailRound } from "@/lib/dgd-v1/pdga-details";

const summaryHtml = `<title>Jane Doe #1234 | PDGA</title><ul>
<li class="location"><strong>Location:</strong> <a href="#">Town, State</a><li class="classification"><strong>Classification: </strong> Amateur</li>
<li class="current-rating"><strong>Current Rating:</strong> 901 +3 (as of 08-Sep-2026)</li>
<li class="career-events disclaimer" title="x"><strong>Career Events:</strong> 12</li>
<li class="career-wins disclaimer"><strong>Career Wins:</strong> <a href="#">2</a></li></ul>`;

const historyHtml = `<table><thead><tr><th class="date">Effective Date</th><th>Rating</th><th>Rounds Used</th></tr></thead><tbody>
<tr><td>8-Sep-2026</td><td>930</td><td>61</td></tr><tr><td>9-May-2023</td><td>819</td><td>2</td></tr></tbody></table>`;

const pool = (id: string, name: string) =>
  `<div><a href="/node/${id}">${name}</a> - Main; 18 holes; Par 58; 6,000 ft.</div>`;
const eventHtml = (
  layoutRd1: string,
) => `<title>Test Open | PDGA</title><li class="tournament-date"><strong>Date</strong>: 04-Oct-2026</li>
<h3 class="division" id="MA1">MA1</h3>
<div id="layout-details-1-MA1-round-1">${layoutRd1}</div></div>
<table class="results"><thead><tr><th class="place">Place</th><th class="name">Name</th><th class="pdga-number">PDGA#</th><th class="player-rating">Rating</th><th class="round tooltip">Rd1</th><th class="round-rating"></th><th class="total">Total</th></tr></thead><tbody>
<tr><td class="place">1</td><td class="player">Jane</td><td class="pdga-number">1234</td><td class="player-rating">900</td><td class="round">50</td><td class="round-rating">950</td><td class="total">50</td></tr>
<tr><td class="place">2</td><td class="player">Bob</td><td class="pdga-number">5</td><td class="player-rating">880</td><td class="round">54</td><td class="round-rating">900</td><td class="total">54</td></tr>
<tr><td class="place">3</td><td class="player">Cy</td><td class="pdga-number">6</td><td class="player-rating">920</td><td class="round">56</td><td class="round-rating">880</td><td class="total">56</td></tr>
</tbody></table>`;

const round = (pools: PdgaDetailRound["pools"], score = 50): PdgaDetailRound => ({
  pdga_event_id: "1",
  event_name: "Test Open",
  tier: "C",
  division: "MA1",
  round_number: 1,
  played_on: "2026-10-04",
  score,
  round_rating: 950,
  evaluated: true,
  included: true,
  pools,
  dedupe_key: "k",
});
const history = parseRatingHistory(historyHtml).entries;

describe("PDGA intel parsers", () => {
  it("reads the summary even with unclosed list items", () => {
    const s = parsePlayerSummary(summaryHtml, "1234");
    expect(s).toMatchObject({
      location: "Town, State",
      classification: "Amateur",
      current_rating: 901,
      rating_effective_date: "2026-09-08",
      career_events: 12,
      career_wins: 2,
    });
  });
  it("reads rating history by header and sorts oldest first", () => {
    expect(history).toEqual([
      { effective_date: "2023-05-09", rating: 819, rounds_used: 2 },
      { effective_date: "2026-09-08", rating: 930, rounds_used: 61 },
    ]);
  });
  it("reports malformed rows instead of shifting columns", () => {
    const bad = historyHtml.replace("<td>61</td>", "");
    const r = parseRatingHistory(bad);
    expect(r.entries).toHaveLength(1);
    expect(r.issues[0].problem).toMatch(/cells/);
  });
  it("reads event field rows and per-round layouts", () => {
    const e = parseEventPage(eventHtml(pool("9", "Park - Main")), "1");
    expect(e.layouts).toHaveLength(1);
    expect(
      e.field.map((f) => [f.place, f.pdga_number, f.rounds[0].score, f.rounds[0].round_rating]),
    ).toEqual([
      [1, "1234", 50, 950],
      [2, "5", 54, 900],
      [3, "6", 56, 880],
    ]);
  });
});

describe("PDGA intel derivations", () => {
  it("uses the official rating effective on or before the round date", () => {
    expect(officialRatingAt(history, "2026-09-07")).toBe(819);
    expect(officialRatingAt(history, "2026-09-08")).toBe(930);
    expect(officialRatingAt(history, "2023-01-01")).toBeNull();
  });
  it("only reports milestones that happened", () => {
    const a = ratingHistoryAnalytics(history, "2026-10-05")!;
    expect(a.milestones.map((m) => m!.milestone)).toEqual([850, 875, 900, 925]);
    expect(a.career_change).toBe(111);
  });
  it("exact single-pool event layout with leave-one-out field", () => {
    const ev = parseEventPage(eventHtml(pool("9", "Park - Main")), "1");
    const r = resolveRound(round([]), "1234", history, ev);
    expect(r.layout_state).toBe("EXACT_LAYOUT");
    expect(r.field?.field_size).toBe(2); // the player is excluded
    expect(r.field?.median_score).toBe(55);
    expect(r.rating_delta).toBe(950 - 930);
  });
  it("never picks the first pool of a multi-pool event", () => {
    const ev = parseEventPage(eventHtml(pool("9", "A") + pool("10", "B")), "1");
    const r = resolveRound(round([]), "1234", history, ev);
    expect(r.layout_state).toBe("MULTIPLE_POSSIBLE_LAYOUTS");
    expect(r.layout).toBeNull();
  });
  it("confirms a multi-pool layout only when the detail page names one listed pool", () => {
    const ev = parseEventPage(eventHtml(pool("9", "A") + pool("10", "B")), "1");
    const r = resolveRound(
      round([{ node_id: "10", name: "B - Main", holes: 18, par: 58, distance_ft: 6000 }]),
      "1234",
      history,
      ev,
    );
    expect(r.layout_state).toBe("CONFIRMED_SCORE_MATCH");
  });
  it("flags score disagreement between pages as SOURCE_CONFLICT", () => {
    const ev = parseEventPage(eventHtml(pool("9", "Park - Main")), "1");
    const r = resolveRound(round([], 51), "1234", history, ev);
    expect(r.layout_state).toBe("SOURCE_CONFLICT");
    expect(r.conflicts[0]).toMatchObject({ field: "score", detail_value: "51", event_value: "50" });
  });
  it("leaves unknown layouts unknown", () => {
    const r = resolveRound(round([]), "1234", history, null);
    expect(r.layout_state).toBe("UNRESOLVED");
    expect(r.layout).toBeNull();
    expect(r.quality).toBe("PARTIAL");
  });
});

describe("polite fetcher", () => {
  it("backs off on 429, honours Retry-After, then succeeds", async () => {
    const sleeps: number[] = [];
    let n = 0;
    const f = createPoliteFetcher({
      minGapMs: 0,
      jitterMs: 0,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      fetchImpl: (async () =>
        ++n === 1
          ? new Response("", { status: 429, headers: { "retry-after": "3" } })
          : new Response("ok")) as unknown as typeof fetch,
    });
    const r = await f.get("https://www.pdga.com/x");
    expect(r.ok).toBe(true);
    expect(r.log.attempts).toBe(2);
    expect(sleeps).toContain(3000);
  });
  it("gives up after max attempts and reports the error", async () => {
    const f = createPoliteFetcher({
      minGapMs: 0,
      jitterMs: 0,
      maxAttempts: 2,
      sleep: async () => {},
      fetchImpl: (async () => new Response("", { status: 503 })) as unknown as typeof fetch,
    });
    const r = await f.get("https://www.pdga.com/y");
    expect(r.ok).toBe(false);
    expect(r.log.error).toBe("http 503");
  });
});
