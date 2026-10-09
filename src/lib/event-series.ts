/**
 * League series expansion.
 *
 * Sources publish a league season as one long row — a ten-week Friday night
 * league arrives as a single listing from the first night to the last. Shown as
 * is, it reads as one event that is somehow happening every day. Players think
 * in nights: "Friday the 17th", not "the season". So a season row is split into
 * the nights it actually plays, and every night carries a pointer back to the
 * series it belongs to.
 */
import { meetingSchedule, meetsOn } from "@/lib/league-recurrence";

export type SeriesInfo = {
  /** Groups the nights of one league together. */
  key: string;
  /** Series name, shown on the "part of a series" line. */
  label: string;
  /** 1-based position of this night inside the published season. */
  index: number;
  /** Nights published for the season. */
  total: number;
  /** In-app series page, when the league lives in Disc Golf Dashboard. */
  to?: string;
  params?: Record<string, string>;
  /** The source's own series page, for mirrored listings. */
  url?: string | null;
};

/** Nights beyond this are dropped so one season can't flood the directory. */
const MAX_NIGHTS = 40;

function addDay(iso: string): string {
  const next = new Date(`${iso}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/**
 * Dates a published season block actually plays. Empty when the block isn't a
 * recurring season (a one-off night, a weekend block) or when players pick their
 * own day inside a flex window — those stay a single row.
 */
export function seasonNightDates(listing: {
  name?: string | null;
  start_date: string;
  end_date?: string | null;
}): string[] {
  const schedule = meetingSchedule(listing);
  if (!schedule.recurring || schedule.basis === "flex_window") return [];
  const start = listing.start_date.slice(0, 10);
  const end = (listing.end_date ?? start).slice(0, 10);
  const dates: string[] = [];
  let cursor = start;
  for (let i = 0; i < 400 && cursor <= end && dates.length < MAX_NIGHTS; i += 1) {
    if (meetsOn(listing, cursor)) dates.push(cursor);
    cursor = addDay(cursor);
  }
  return dates.length > 1 ? dates : [];
}

type SeriesRow = {
  id: string;
  kind: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  series?: SeriesInfo | null;
  linkTo?: { to: string; params?: Record<string, string> };
  external_url?: string | null;
};

/**
 * Splits one league season row into a row per night. Anything that isn't a
 * dated recurring league season comes back untouched.
 */
export function expandLeagueSeries<T extends SeriesRow>(row: T): T[] {
  // Any multi-week block is a series of nights, whatever the source calls it
  // (PDGA lists weekly "Sanctioned Singles" sessions as tournaments).
  if (!row.start_date || row.series) return [row];
  const dates = seasonNightDates({
    name: row.title,
    start_date: row.start_date,
    end_date: row.end_date,
  });
  if (dates.length === 0) return [row];

  return dates.map((date, i) => ({
    ...row,
    id: `${row.id}@${date}`,
    start_date: date,
    end_date: date,
    series: {
      key: row.id,
      label: row.title,
      index: i + 1,
      total: dates.length,
      ...(row.linkTo ? { to: row.linkTo.to, params: row.linkTo.params } : {}),
      url: row.external_url ?? null,
    },
  }));
}
