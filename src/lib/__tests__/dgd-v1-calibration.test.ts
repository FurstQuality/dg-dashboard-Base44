import { describe, expect, it } from "vitest";
import { parsePdgaDetailPage } from "../dgd-v1/pdga-details";
import { subjectKey, toCalibrationInput, observationInfluence } from "../dgd-v1/calibration";

const row = (o: string, layout: string) => `
<tr class="${o} odd"><td class="tournament"><a href="/tour/event/97344">Big Open</a></td><td class="tier">M</td><td class="date" data-text="1787716800">26-Aug to 30-Aug-2026</td><td class="division">MPO</td><td class="round tooltip" data-tooltip-content="#layout-details-97344-MPO-round-1">1</td><td class="score">59</td><td class="round-rating">1058</td><td class="evaluated">Yes</td><td class="included">Yes</td></tr></table>
<div id="layout-details-97344-MPO-round-1"><div>${layout}</div></div>`;

describe("PDGA details parser", () => {
  it("reads class-labelled columns, never shifted", () => {
    const html = `<table id="player-results-details">${row("evaluated included", 'Pool A: <a href="/node/246501">Kensington - Green</a> - Black; 18 holes; Par 65; 10,859 ft.')}`;
    const r = parsePdgaDetailPage(html, "75412").rounds;
    expect(r).toHaveLength(1);
    expect(r[0].score).toBe(59);
    expect(r[0].round_rating).toBe(1058);
    expect(r[0].division).toBe("MPO");
    expect(r[0].pools[0]).toMatchObject({ node_id: "246501", holes: 18, par: 65 });
  });
});

describe("calibration identity", () => {
  const base = { id: "x", subject_id: "s1", pdga_event_id: "1", event_name: "Open", division: "MPO", round_number: 1, played_on: "2026-01-01", score: 54, round_rating: 950, evaluated: true, included: true, layout_name: null, hole_count: 18, par: 54 };
  it("uses a prefixed key that can never be an auth user id", () => {
    expect(toCalibrationInput({ ...base, layout_node_ids: ["9"] }).user_id).toBe(subjectKey("s1"));
    expect(subjectKey("s1").startsWith("cal:")).toBe(true);
  });
  it("only single-pool rounds are exact layouts", () => {
    expect(toCalibrationInput({ ...base, layout_node_ids: ["9"] }).layout_mapping).toBe("EXACT");
    expect(toCalibrationInput({ ...base, layout_node_ids: ["9", "10"] }).layout_mapping).toBe("POSSIBLE");
    expect(toCalibrationInput({ ...base, layout_node_ids: [] }).layout_mapping).toBe("UNMAPPED");
  });
  it("influence weights sum to at most 1", () => {
    const ev: any[] = [{ sigma_before_drifted: 3, sigma_after: 2 }, { sigma_before_drifted: 2, sigma_after: 1.5 }];
    const w = observationInfluence(ev);
    expect(w.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1);
  });
});
