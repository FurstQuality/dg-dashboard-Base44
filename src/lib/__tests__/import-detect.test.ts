import { describe, expect, it } from "vitest";
import { detectFile, detectInput } from "../import-detect";

describe("detectInput", () => {
  it("guides the user when nothing is pasted", () => {
    const r = detectInput("   ");
    expect(r.kind).toBe("unknown");
    expect(r.route).toEqual({ type: "none" });
  });

  it("reads a bare PDGA number with or without a hash", () => {
    for (const raw of ["249285", "#249285"]) {
      const r = detectInput(raw);
      expect(r.kind).toBe("pdga_number");
      expect(r.pdgaNumber).toBe("249285");
      expect(r.route).toEqual({ type: "pdga-friend", number: "249285" });
    }
  });

  it("reads a PDGA player page and extracts the number", () => {
    const r = detectInput("https://www.pdga.com/player/249285");
    expect(r.kind).toBe("pdga_player_url");
    expect(r.route).toEqual({ type: "pdga-friend", number: "249285" });
  });

  it("recognises PDGA event and tour pages", () => {
    expect(detectInput("https://www.pdga.com/tour/event/98448").kind).toBe("pdga_event_url");
    expect(detectInput("https://www.pdga.com/apps/tournament/live/event?eventId=98448").kind).toBe(
      "pdga_event_url",
    );
  });

  it("recognises the supported third-party hosts", () => {
    expect(detectInput("https://udisc.com/courses/maple-hill").kind).toBe("udisc_url");
    expect(detectInput("https://www.discgolfscene.com/tournaments/x").kind).toBe("dgscene_url");
    expect(detectInput("https://facebook.com/somepage").kind).toBe("facebook_url");
  });

  it("treats a host without a scheme as a URL", () => {
    const r = detectInput("dgcoursereview.com/course/1234");
    expect(r.kind).toBe("generic_url");
    expect(r.normalized.startsWith("https://")).toBe(true);
    expect(r.route).toEqual({ type: "drop-link", url: r.normalized });
  });

  it("rejects free text that is neither a number nor a link", () => {
    const r = detectInput("add mario to my crew please");
    expect(r.kind).toBe("unknown");
    expect(r.route).toEqual({ type: "none" });
  });
});

describe("detectFile", () => {
  it("routes CSV uploads to the UDisc parser", () => {
    const file = new File(["a,b"], "UDisc-scorecards.CSV", { type: "text/csv" });
    expect(detectFile(file).route).toEqual({ type: "udisc-csv" });
  });

  it("explains that other file types are unsupported", () => {
    const file = new File([""], "rounds.xlsx");
    expect(detectFile(file).route).toEqual({ type: "none" });
    expect(detectFile(file).summary).toMatch(/Only CSV files/);
  });
});
