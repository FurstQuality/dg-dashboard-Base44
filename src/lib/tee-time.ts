/**
 * Tee time helpers shared across the tracker.
 *
 * Tee times are stored canonically as 24-hour "HH:MM:SS" strings (that's what
 * PDGA publishes). Manual entry allows friendlier input like "8:05 am", so
 * everything written to the database goes through `canonicalTeeTime` first and
 * everything rendered goes through `formatTeeTime`. That keeps display, sorting
 * and conflict detection consistent no matter where a time came from.
 */

/** Parse any supported tee-time string into minutes from midnight, or null. */
function parseMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|a|p)?\.?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (min > 59) return null;
  const ap = (m[4] ?? "").toLowerCase();
  if (ap.startsWith("p")) {
    if (h < 12) h += 12;
  } else if (ap.startsWith("a")) {
    if (h === 12) h = 0;
  }
  if (h > 23) return null;
  return h * 60 + min;
}

/** Normalize user or feed input to the stored "HH:MM:SS" form; unparseable text passes through trimmed. */
export function canonicalTeeTime(t: string | null | undefined): string | null {
  if (!t) return null;
  const raw = t.trim();
  if (!raw) return null;
  const mins = parseMinutes(raw);
  if (mins == null) return raw;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/** Render a stored tee time as a readable 12-hour time; passes through free text. */
export function formatTeeTime(t: string | null | undefined): string {
  if (!t) return "";
  const raw = t.trim();
  const mins = parseMinutes(raw);
  if (mins == null) return raw;
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Minutes-from-midnight sort key; unknown times sort last. */
export function teeTimeSortKey(t: string | null | undefined): number {
  if (!t) return 99_999;
  const mins = parseMinutes(t);
  return mins == null ? 99_998 : mins;
}

/** Sort key combining an event date and tee time so mixed formats order correctly. */
export function dayTeeSortKey(
  dateISO: string | null | undefined,
  tee: string | null | undefined,
): string {
  return `${dateISO ?? "9999-12-31"}T${String(teeTimeSortKey(tee)).padStart(5, "0")}`;
}
