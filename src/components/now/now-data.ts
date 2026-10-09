/** Small shared helpers for the "Right now" strips. */

/** "Today", "Tomorrow", or "Sat, Sep 20" for a date-only or ISO string. */
export function whenLabel(iso: string | null | undefined): string {
  if (!iso) return "Date not set";
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "Date not set";
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(new Date())) / 864e5);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** True when the date-only string is today. */
export function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return iso.slice(0, 10) === new Date().toLocaleDateString("en-CA");
}

/** "3 things need you" style plural helper. */
export function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : (many ?? `${one}s`)}`;
}
