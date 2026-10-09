/**
 * League meeting days.
 *
 * Sanctioned leagues are published as one row covering the whole season — a
 * ten-week league is a single listing from the first night to the last. Treating
 * that span as "happening now" makes the league look like it plays every day.
 * Leagues actually meet on a fixed weekday, so this works out which weekday(s)
 * a season block plays and answers whether it meets on a given date.
 *
 * The weekday is read from the listing itself: the title when it names a day
 * ("Duneland Singles League - Tuesdays"), otherwise the season's first date,
 * which is the first meeting. Nothing is guessed beyond that, and callers can
 * see which signal was used.
 */

/** A season block longer than this is a recurring league, not a single meet. */
const SEASON_SPAN_DAYS = 8;

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const WEEKDAY_PATTERNS: Array<{ day: number; pattern: RegExp }> = [
  { day: 0, pattern: /\bsun(?:day)?s?\b/i },
  { day: 1, pattern: /\bmon(?:day)?s?\b/i },
  { day: 2, pattern: /\btue(?:s(?:day)?)?s?\b/i },
  { day: 3, pattern: /\bwed(?:nesday)?s?\b/i },
  { day: 4, pattern: /\bthu(?:r(?:s(?:day)?)?)?s?\b/i },
  { day: 5, pattern: /\bfri(?:day)?s?\b/i },
  { day: 6, pattern: /\bsat(?:urday)?s?\b/i },
];

/**
 * Flex-start leagues and season-long tag rounds genuinely run on any day inside
 * their window — the player picks when to play — so they are not weekday-bound.
 */
const FLEX_PATTERN = /\bflex(?:\s*start)?\b|\bbag\s*tags?\b|\btags?\b|\bhandicap tags\b/i;

export type MeetingSchedule = {
  /** Weekdays the league plays, 0 = Sunday … 6 = Saturday. Empty for flex play. */
  weekdays: number[];
  /** Where the weekday came from. */
  basis: "single_day" | "title" | "first_meeting" | "flex_window";
  /** True for a multi-week season block rather than a one-off date. */
  recurring: boolean;
  /** Days the published block covers, inclusive. */
  spanDays: number;
};

export function weekdayName(weekday: number): string {
  return WEEKDAY_LABELS[((weekday % 7) + 7) % 7];
}

/** Weekday of an ISO date, read as a calendar day rather than an instant. */
export function isoWeekday(iso: string | null | undefined): number | null {
  if (!iso || iso.length < 10) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) ? null : date.getUTCDay();
}

/** Weekdays named in a league title, in calendar order. */
export function weekdaysInTitle(name: string | null | undefined): number[] {
  if (!name) return [];
  const found = new Set<number>();
  for (const { day, pattern } of WEEKDAY_PATTERNS) {
    if (pattern.test(name)) found.add(day);
  }
  return Array.from(found).sort((a, b) => a - b);
}

function daysBetween(startIso: string, endIso: string): number {
  const a = Date.parse(`${startIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${endIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * Works out which weekday(s) a league listing actually plays.
 * A block of a week or less is taken at face value — those are real consecutive
 * playing days (a weekend event, a short block), not a season.
 */
export function meetingSchedule(listing: {
  name?: string | null;
  start_date: string;
  end_date?: string | null;
}): MeetingSchedule {
  const start = listing.start_date.slice(0, 10);
  const end = (listing.end_date ?? start).slice(0, 10);
  const spanDays = end >= start ? daysBetween(start, end) : 1;
  const startWeekday = isoWeekday(start);

  if (spanDays <= SEASON_SPAN_DAYS) {
    return {
      weekdays: startWeekday == null ? [] : [startWeekday],
      basis: "single_day",
      recurring: false,
      spanDays,
    };
  }

  if (FLEX_PATTERN.test(listing.name ?? "")) {
    return { weekdays: [], basis: "flex_window", recurring: true, spanDays };
  }

  const titled = weekdaysInTitle(listing.name);
  if (titled.length) {
    return { weekdays: titled, basis: "title", recurring: true, spanDays };
  }

  return {
    weekdays: startWeekday == null ? [] : [startWeekday],
    basis: "first_meeting",
    recurring: true,
    spanDays,
  };
}

/**
 * True when the league actually plays on this date: inside the published season
 * block AND on one of the weekdays it meets.
 */
export function meetsOn(
  listing: { name?: string | null; start_date: string; end_date?: string | null },
  isoDate: string,
): boolean {
  const day = isoDate.slice(0, 10);
  const start = listing.start_date.slice(0, 10);
  const end = (listing.end_date ?? start).slice(0, 10);
  if (day < start || day > end) return false;

  const schedule = meetingSchedule(listing);
  if (!schedule.recurring) return true;
  // Flex windows are playable on any day they cover.
  if (schedule.basis === "flex_window") return true;
  const weekday = isoWeekday(day);
  if (weekday == null || schedule.weekdays.length === 0) return false;
  return schedule.weekdays.includes(weekday);
}

/** Next date on or after `fromIso` that the league meets, or null once it's over. */
export function nextMeeting(
  listing: { name?: string | null; start_date: string; end_date?: string | null },
  fromIso: string,
): string | null {
  const start = listing.start_date.slice(0, 10);
  const end = (listing.end_date ?? start).slice(0, 10);
  let cursor = fromIso.slice(0, 10) > start ? fromIso.slice(0, 10) : start;
  for (let i = 0; i < 400 && cursor <= end; i += 1) {
    if (meetsOn(listing, cursor)) return cursor;
    const next = new Date(`${cursor}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }
  return null;
}

/** Player-facing description of when a league plays. */
export function meetingSummary(listing: {
  name?: string | null;
  start_date: string;
  end_date?: string | null;
}): string {
  const schedule = meetingSchedule(listing);
  if (schedule.basis === "flex_window") return "Flex start — play any day";
  if (!schedule.recurring || schedule.weekdays.length === 0) return "";
  const days = schedule.weekdays.map((d) => `${weekdayName(d)}s`);
  const joined =
    days.length === 1 ? days[0] : `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}`;
  return joined;
}
