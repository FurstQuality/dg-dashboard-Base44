/**
 * PDGA ratings update on the 2nd Tuesday of each month.
 * Helpers to find that date and describe distance-from-now.
 */
export function nthWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekday: number,
  n: number,
): Date {
  // weekday: 0 = Sunday .. 6 = Saturday
  // Construct in UTC so the resulting Date is timezone-agnostic: the same
  // calendar day everywhere when formatted with { timeZone: "UTC" }. Using
  // local-time here caused Aug 11 (midnight UTC on Cloudflare workers) to
  // render as Aug 10 for users west of UTC.
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, monthIndex, 1 + offset + (n - 1) * 7));
}

/** Second Tuesday of the given month. */
export function secondTuesday(year: number, monthIndex: number): Date {
  return nthWeekdayOfMonth(year, monthIndex, 2, 2);
}

/** Next PDGA ratings update: 2nd Tuesday of this month if still ahead, else next month. */
export function nextPdgaUpdateDate(from: Date = new Date()): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  const thisMonth = secondTuesday(y, m);
  if (thisMonth.getTime() > from.getTime()) return thisMonth;
  return secondTuesday(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1);
}

/** Previous PDGA ratings update — 2nd Tuesday of this month if past, else previous month. */
export function previousPdgaUpdateDate(from: Date = new Date()): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  const thisMonth = secondTuesday(y, m);
  if (thisMonth.getTime() <= from.getTime()) return thisMonth;
  return secondTuesday(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1);
}

export function formatUpdateDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function daysUntil(d: Date, from: Date = new Date()): number {
  const ms = d.getTime() - from.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}
