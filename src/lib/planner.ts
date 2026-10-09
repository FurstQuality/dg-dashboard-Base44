/**
 * Planner engine — shared, pure helpers for the local league/event planner.
 *
 * A "planner occurrence" is one thing happening on one date: a tournament day,
 * a community round, or a single league night. Recurring league nights are
 * expanded from the league's weekday + season range rather than stored, so a
 * league published today immediately lands on the right weeknights.
 */

export type PlannerKind = "league" | "tournament" | "casual";
export type PlannerSource = "chainlink" | "pdga" | "udisc" | "scene";

export interface PlannerOccurrence {
  /** Unique per occurrence (event id + date). */
  id: string;
  /** Stable id of the parent event, shared by every occurrence of a league. */
  eventId: string;
  kind: PlannerKind;
  source: PlannerSource;
  sanctioned: boolean;
  title: string;
  /** ISO date (YYYY-MM-DD) this occurrence plays. */
  date: string;
  /** Last date for a multi-day event; equals `date` for single-day play. */
  endDate: string;
  /** 0 = Sunday … 6 = Saturday. */
  dow: number;
  /** "18:30" when known. */
  startTime: string | null;
  recurring: boolean;
  location: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  courseName: string | null;
  hostName: string | null;
  tier: string | null;
  status: string | null;
  format: string | null;
  scoring: string | null;
  entryFeeCents: number | null;
  externalUrl: string | null;
  /** Slug (leagues/tournaments) or id (community/PDGA) used to build the route. */
  slug: string | null;
  /** Filled in client-side when an origin point is known. */
  distanceMiles?: number | null;
}

export const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DOW_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const RADIUS_OPTIONS = [10, 25, 50, 100, 250] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string | null | undefined): value is string {
  return !!value && ISO_DATE.test(value);
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Parses an ISO date as local noon so day-of-week math never slips a day. */
export function parseISODate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00`);
}

export function dayOfWeek(iso: string): number {
  return parseISODate(iso).getDay();
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Sunday-start week containing `iso`. */
export function startOfWeek(iso: string): string {
  return addDays(iso, -dayOfWeek(iso));
}

export function formatTime(time: string | null): string | null {
  if (!time) return null;
  const [hRaw, mRaw] = time.split(":");
  const h = Number(hRaw);
  if (!Number.isFinite(h)) return null;
  const m = mRaw ?? "00";
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === "00" ? `${hour12} ${suffix}` : `${hour12}:${m} ${suffix}`;
}

export function formatOccurrenceDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Great-circle distance in statute miles. */
export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 3958.7613;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Degrees of latitude/longitude that cover `miles` at a given latitude. */
export function boundingBox(center: { lat: number; lng: number }, miles: number) {
  const latDelta = miles / 69;
  const lngDelta = miles / Math.max(1, 69 * Math.cos((center.lat * Math.PI) / 180));
  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  };
}

export type PlannerWindow = { from: string; to: string };

/**
 * Expands a weekly recurrence into the dates inside a window.
 * `seasonStart` / `seasonEnd` clamp the series; `maxCount` guards runaway loops.
 */
export function expandWeekly(input: {
  dow: number;
  seasonStart: string | null;
  seasonEnd: string | null;
  window: PlannerWindow;
  maxCount?: number;
}): string[] {
  const { dow, window: w } = input;
  if (dow < 0 || dow > 6) return [];
  const from = input.seasonStart && input.seasonStart > w.from ? input.seasonStart : w.from;
  const to = input.seasonEnd && input.seasonEnd < w.to ? input.seasonEnd : w.to;
  if (from > to) return [];

  const out: string[] = [];
  const max = input.maxCount ?? 60;
  let cursor = addDays(from, (dow - dayOfWeek(from) + 7) % 7);
  while (cursor <= to && out.length < max) {
    out.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return out;
}

export function groupByDow(list: PlannerOccurrence[]): Map<number, PlannerOccurrence[]> {
  const map = new Map<number, PlannerOccurrence[]>();
  for (let d = 0; d < 7; d++) map.set(d, []);
  for (const occ of list) map.get(occ.dow)?.push(occ);
  for (const [, rows] of map) {
    rows.sort((a, b) => (a.startTime ?? "99").localeCompare(b.startTime ?? "99"));
  }
  return map;
}

/** Occurrences for the seven days starting at `weekStart`, keyed by ISO date. */
export function groupByWeekDays(
  list: PlannerOccurrence[],
  weekStart: string,
): Array<{ iso: string; dow: number; rows: PlannerOccurrence[] }> {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return days.map((iso) => ({
    iso,
    dow: dayOfWeek(iso),
    rows: list
      .filter((o) => o.date <= iso && o.endDate >= iso)
      .sort(
        (a, b) =>
          (a.startTime ?? "99").localeCompare(b.startTime ?? "99") ||
          a.title.localeCompare(b.title),
      ),
  }));
}

/** Unique parent events behind a set of occurrences. */
export function uniqueEvents(list: PlannerOccurrence[]): PlannerOccurrence[] {
  const seen = new Set<string>();
  const out: PlannerOccurrence[] = [];
  for (const occ of list) {
    if (seen.has(occ.eventId)) continue;
    seen.add(occ.eventId);
    out.push(occ);
  }
  return out;
}

/** Plain-language summary line for a league night or event card. */
export function occurrenceSubtitle(occ: PlannerOccurrence): string {
  const bits: string[] = [];
  if (occ.recurring) bits.push(`${DOW_LONG[occ.dow]}s`);
  const time = formatTime(occ.startTime);
  if (time) bits.push(time);
  const place = occ.courseName ?? occ.location ?? [occ.city, occ.state].filter(Boolean).join(", ");
  if (place) bits.push(place);
  return bits.join(" · ");
}

export const KIND_PIN_COLOR: Record<PlannerKind, string> = {
  league: "#8b5cf6",
  tournament: "#22d3ee",
  casual: "#34d399",
};

export const KIND_LABEL: Record<PlannerKind, string> = {
  league: "League",
  tournament: "Tournament",
  casual: "Community",
};
