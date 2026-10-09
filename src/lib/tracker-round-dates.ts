/**
 * Round dates for tracked events.
 *
 * PDGA publishes a round-by-round schedule (course + layout per round) but no
 * date per round, so every round shows "Date TBD" even when the date is
 * obvious from the event itself. This derives the dates:
 *
 * - Event with a published date range: rounds are spread evenly across it
 *   (a three-day A-tier with three rounds is one round per day).
 * - League-style event with a single start date: weekly cadence from the
 *   start, which keeps every night on the same weekday (starts Sunday 9/13 →
 *   9/20, 9/27, 10/4 …).
 * - Ordinary event with a single date: consecutive days.
 *
 * Derived dates are expectations, not published facts — surfaces should label
 * them (see `ROUND_DATE_EXPECTED_NOTE`) so a player can tell them apart from a
 * date the event actually posted.
 */

export const ROUND_DATE_EXPECTED_NOTE = "expected";

export type RoundDateInput = {
  /** Event start date, `YYYY-MM-DD`. */
  startDate: string | null;
  /** Event end date when published, `YYYY-MM-DD`. */
  endDate?: string | null;
  /** Sanctioning tier or classification text, e.g. "Pro/Am League". */
  tier?: string | null;
  /** Event name, used as a fallback league signal. */
  name?: string | null;
  /** Distinct round numbers on the event, in any order. */
  rounds: number[];
};

const DAY_MS = 86_400_000;

function toUtc(d: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
}

function isoFrom(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** True when the event runs as a recurring league rather than a single weekend. */
export function isLeagueStyleEvent(tier?: string | null, name?: string | null): boolean {
  const hay = `${tier ?? ""} ${name ?? ""}`.toLowerCase();
  return /\bleague\b|\bweekly\b|\bseries\b|\bnight\b/.test(hay);
}

/**
 * Map each round number to the date it is expected to be played, or null when
 * there is nothing to derive from.
 */
export function deriveRoundDates(input: RoundDateInput): Record<number, string | null> {
  const out: Record<number, string | null> = {};
  const rounds = Array.from(new Set(input.rounds.filter((n) => Number.isFinite(n)))).sort(
    (a, b) => a - b,
  );
  if (rounds.length === 0) return out;
  const start = input.startDate ? toUtc(input.startDate) : null;
  if (start == null) {
    for (const n of rounds) out[n] = null;
    return out;
  }
  const end = input.endDate ? toUtc(input.endDate) : null;
  const spanDays = end != null && end > start ? Math.round((end - start) / DAY_MS) : 0;

  // Step between rounds, in days.
  let step: number;
  if (spanDays > 0 && rounds.length > 1) {
    step = Math.max(1, Math.round(spanDays / (rounds.length - 1)));
  } else if (isLeagueStyleEvent(input.tier, input.name)) {
    step = 7;
  } else {
    step = 1;
  }

  const first = rounds[0];
  for (const n of rounds) {
    let ms = start + (n - first) * step * DAY_MS;
    // Never push a round past a published end date.
    if (end != null && end > start && ms > end) ms = end;
    out[n] = isoFrom(ms);
  }
  return out;
}
