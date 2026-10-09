/**
 * Shared bounds and server-side filter helpers for the event library (/events).
 *
 * The library merges heterogeneous sources (DG Dashboard tournaments and
 * leagues, community events, imported UDisc / Disc Golf Scene schedules, and
 * PDGA-linked tracker events). Facet counts, grouping, and column selection
 * still happen in the browser, so the goal here is to keep the number of rows
 * that reach the browser bounded and relevant: the coarse date window and the
 * text query are pushed down to Postgres, and every source read is capped.
 */

export const EVENT_LIBRARY_LIMITS = {
  /** DG Dashboard tournaments. */
  tournaments: 300,
  /** DG Dashboard leagues (season containers, low volume). */
  leagues: 200,
  /** Community / outreach events. */
  community: 500,
  /** Imported UDisc + Disc Golf Scene schedules. */
  scheduled: 500,
} as const;

export type EventWhen = "any" | "upcoming" | "week" | "month" | "year" | "past";

/**
 * An inclusive date window in `YYYY-MM-DD` form. `startFrom` is the earliest
 * date an event may still be running on; `startTo` is the latest date an event
 * may begin on. Either side may be null (unbounded).
 */
export type EventWindow = {
  startFrom: string | null;
  startTo: string | null;
};

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Translate the library's quick date preset plus optional custom range into a
 * window. A custom `from`/`to` always wins over the preset, matching the
 * client-side predicate the table applies afterwards.
 */
export function resolveEventWindow(input: {
  when: EventWhen;
  from?: string | null;
  to?: string | null;
  today?: Date;
}): EventWindow {
  const from = input.from?.trim() || null;
  const to = input.to?.trim() || null;
  if (from || to) return { startFrom: from, startTo: to };

  const now = input.today ?? new Date();
  const today = isoDay(now);

  switch (input.when) {
    case "upcoming":
      return { startFrom: today, startTo: null };
    case "past":
      return { startFrom: null, startTo: today };
    case "week":
      return { startFrom: today, startTo: isoDay(shiftDays(now, 7)) };
    case "month":
      return { startFrom: today, startTo: isoDay(shiftDays(now, 30)) };
    case "year": {
      const inYear = new Date(now);
      inYear.setFullYear(inYear.getFullYear() + 1);
      return { startFrom: today, startTo: isoDay(inYear) };
    }
    default:
      return { startFrom: null, startTo: null };
  }
}

/** True when the window would not narrow anything. */
export function isOpenWindow(w: EventWindow): boolean {
  return !w.startFrom && !w.startTo;
}

/** Escape PostgREST `ilike` wildcards and separators in user input. */
export function escapeLikeValue(raw: string): string {
  return raw.replace(/[%_,()]/g, " ").trim();
}

/**
 * Minimum query length before the text filter is pushed to the server. Shorter
 * fragments match too much to be worth a round trip, and the browser-side
 * omnisearch still handles them.
 */
export const MIN_SERVER_SEARCH_LENGTH = 3;

/** The `q` value worth sending to Postgres, or null when it should stay local. */
export function serverSearchTerm(q: string | null | undefined): string | null {
  const cleaned = escapeLikeValue(q ?? "");
  return cleaned.length >= MIN_SERVER_SEARCH_LENGTH ? cleaned : null;
}

/**
 * Build a PostgREST `or(...)` expression matching a term against several
 * text columns. Returns null when there is nothing to match.
 */
export function buildTextMatch(term: string | null, columns: string[]): string | null {
  if (!term || columns.length === 0) return null;
  return columns.map((c) => `${c}.ilike.%${term}%`).join(",");
}

/**
 * A row is inside the window when it has not finished before `startFrom` and
 * did not begin after `startTo`. Rows with no end date fall back to their start
 * date, and rows with no start date are always kept (the browser shows them as
 * "date TBD" rather than hiding them).
 */
export function buildWindowFilters(
  window: EventWindow,
  cols: { start: string; end?: string | null },
): { orExpr: string | null; startTo: string | null } {
  let orExpr: string | null = null;
  if (window.startFrom) {
    const endCol = cols.end;
    orExpr = endCol
      ? `${endCol}.gte.${window.startFrom},and(${endCol}.is.null,${cols.start}.gte.${window.startFrom}),${cols.start}.is.null`
      : `${cols.start}.gte.${window.startFrom},${cols.start}.is.null`;
  }
  return { orExpr, startTo: window.startTo };
}
