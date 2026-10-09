/**
 * Minimal ICS builder for a single community outreach event, so players can add
 * a cleanup or clinic to whatever calendar they already use.
 */

export type IcsEvent = {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  starts_at: string;
  ends_at?: string | null;
};

function stamp(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function escape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildEventIcs(event: IcsEvent): string {
  const end =
    event.ends_at ?? new Date(new Date(event.starts_at).getTime() + 2 * 3600_000).toISOString();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DG Dashboard//Community Outreach//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:outreach-${event.id}@dgdashboard`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(event.starts_at)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(event.title)}`,
  ];
  if (event.location) lines.push(`LOCATION:${escape(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${escape(event.description)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

/** Browser-only: triggers a download of the event as a .ics file. */
export function downloadEventIcs(event: IcsEvent): void {
  const blob = new Blob([buildEventIcs(event)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "outreach-event"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
