import { describe, it, expect } from "vitest";
import {
  buildTextMatch,
  buildWindowFilters,
  escapeLikeValue,
  isOpenWindow,
  resolveEventWindow,
  serverSearchTerm,
} from "@/lib/events-library";

const TODAY = new Date(2026, 7, 30); // 2026-08-30, local time

describe("resolveEventWindow", () => {
  it("leaves the window open for 'any'", () => {
    const w = resolveEventWindow({ when: "any", today: TODAY });
    expect(w).toEqual({ startFrom: null, startTo: null });
    expect(isOpenWindow(w)).toBe(true);
  });

  it("bounds upcoming events below today", () => {
    expect(resolveEventWindow({ when: "upcoming", today: TODAY })).toEqual({
      startFrom: "2026-08-30",
      startTo: null,
    });
  });

  it("bounds past events above today", () => {
    expect(resolveEventWindow({ when: "past", today: TODAY })).toEqual({
      startFrom: null,
      startTo: "2026-08-30",
    });
  });

  it("uses 7/30/365-day presets", () => {
    expect(resolveEventWindow({ when: "week", today: TODAY }).startTo).toBe("2026-09-06");
    expect(resolveEventWindow({ when: "month", today: TODAY }).startTo).toBe("2026-09-29");
    expect(resolveEventWindow({ when: "year", today: TODAY }).startTo).toBe("2027-08-30");
  });

  it("lets a custom range override the preset", () => {
    expect(
      resolveEventWindow({ when: "upcoming", from: "2026-05-01", to: "2026-05-31", today: TODAY }),
    ).toEqual({ startFrom: "2026-05-01", startTo: "2026-05-31" });
  });

  it("treats blank custom bounds as absent", () => {
    expect(resolveEventWindow({ when: "past", from: "  ", to: "", today: TODAY })).toEqual({
      startFrom: null,
      startTo: "2026-08-30",
    });
  });
});

describe("serverSearchTerm", () => {
  it("ignores fragments shorter than three characters", () => {
    expect(serverSearchTerm("le")).toBeNull();
    expect(serverSearchTerm("")).toBeNull();
    expect(serverSearchTerm(null)).toBeNull();
  });

  it("keeps selective queries", () => {
    expect(serverSearchTerm("Ledgestone")).toBe("Ledgestone");
  });

  it("strips PostgREST wildcards and separators", () => {
    expect(escapeLikeValue("100%_open,(pro)")).toBe("100  open  pro");
  });
});

describe("buildTextMatch", () => {
  it("returns null with no term or no columns", () => {
    expect(buildTextMatch(null, ["name"])).toBeNull();
    expect(buildTextMatch("open", [])).toBeNull();
  });

  it("matches the term against every column", () => {
    expect(buildTextMatch("open", ["name", "location"])).toBe(
      "name.ilike.%open%,location.ilike.%open%",
    );
  });
});

describe("buildWindowFilters", () => {
  it("returns nothing to apply for an open window", () => {
    expect(buildWindowFilters({ startFrom: null, startTo: null }, { start: "start_date" })).toEqual({
      orExpr: null,
      startTo: null,
    });
  });

  it("keeps rows still running, undated rows, and rows with no end date", () => {
    const { orExpr } = buildWindowFilters(
      { startFrom: "2026-08-30", startTo: null },
      { start: "start_date", end: "end_date" },
    );
    expect(orExpr).toBe(
      "end_date.gte.2026-08-30,and(end_date.is.null,start_date.gte.2026-08-30),start_date.is.null",
    );
  });

  it("falls back to the start column when there is no end column", () => {
    const { orExpr } = buildWindowFilters(
      { startFrom: "2026-08-30", startTo: null },
      { start: "starts_on" },
    );
    expect(orExpr).toBe("starts_on.gte.2026-08-30,starts_on.is.null");
  });

  it("passes the upper bound through for the caller to apply", () => {
    expect(
      buildWindowFilters({ startFrom: null, startTo: "2026-09-30" }, { start: "start_date" })
        .startTo,
    ).toBe("2026-09-30");
  });
});
