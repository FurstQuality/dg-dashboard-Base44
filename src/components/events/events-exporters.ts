import { KIND_META, SOURCE_META, csvCell, rowToCsvRecord, type UnifiedRow } from "./events-types";

function downloadBlob(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function exportRowsToCsv(rows: UnifiedRow[]): number {
  if (rows.length === 0) return 0;
  const records = rows.map(rowToCsvRecord);
  const headers = Object.keys(records[0]);
  const body = records.map((rec) => headers.map((h) => csvCell(rec[h])).join(",")).join("\n");
  const csv = `${headers.map(csvCell).join(",")}\n${body}\n`;
  downloadBlob(csv, "text/csv", `dgd-events-${today()}.csv`);
  return rows.length;
}

export function exportRowsToJson(rows: UnifiedRow[]): number {
  if (rows.length === 0) return 0;
  const payload = rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: KIND_META[r.kind].label,
    source: SOURCE_META[r.source].label,
    sanctioning: r.bucket,
    start_date: r.start_date,
    end_date: r.end_date,
    location: r.location,
    tier: r.tier,
    divisions: r.divisions,
    status: r.status,
    crew_count: r.crew_count,
    external_url: r.external_url ?? null,
  }));
  downloadBlob(
    JSON.stringify(
      { exported_at: new Date().toISOString(), count: rows.length, events: payload },
      null,
      2,
    ),
    "application/json",
    `dgd-events-${today()}.json`,
  );
  return rows.length;
}

// ---- ICS calendar export ------------------------------------------------

function icsEscape(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function icsDate(iso: string | null, endInclusive = false): string | null {
  if (!iso) return null;
  const s = iso.length === 10 ? iso : iso.slice(0, 10);
  const d = new Date(`${s}T12:00:00Z`);
  if (isNaN(d.getTime())) return null;
  if (endInclusive) d.setUTCDate(d.getUTCDate() + 1); // DTEND is exclusive
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

function foldLine(line: string): string {
  // RFC 5545 line folding at 75 octets.
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    chunks.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) chunks.push(" " + rest);
  return chunks.join("\r\n");
}

export function exportRowsToIcs(rows: UnifiedRow[]): number {
  const withDates = rows.filter((r) => r.start_date);
  if (withDates.length === 0) return 0;
  const stamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Disc Golf Dashboard//Events Library//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape("DGD Events")}`,
  ];
  for (const r of withDates) {
    const dtStart = icsDate(r.start_date);
    const dtEnd = icsDate(r.end_date ?? r.start_date, true);
    if (!dtStart || !dtEnd) continue;
    const uid = `${r.id.replace(/[^a-zA-Z0-9-]/g, "_")}@dgdashboard`;
    const summary = `${r.title}${r.tier ? ` [${r.tier}]` : ""}`;
    const descParts = [
      `Source: ${SOURCE_META[r.source].label}`,
      `Kind: ${KIND_META[r.kind].label}`,
      `Sanctioning: ${r.bucket}`,
      r.divisions.length ? `Divisions: ${r.divisions.join(", ")}` : "",
      r.external_url ? `Link: ${r.external_url}` : "",
    ].filter(Boolean);
    lines.push(
      "BEGIN:VEVENT",
      foldLine(`UID:${uid}`),
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dtStart}`,
      `DTEND;VALUE=DATE:${dtEnd}`,
      foldLine(`SUMMARY:${icsEscape(summary)}`),
      foldLine(`DESCRIPTION:${icsEscape(descParts.join("\\n"))}`),
    );
    if (r.location) lines.push(foldLine(`LOCATION:${icsEscape(r.location)}`));
    if (r.external_url) lines.push(foldLine(`URL:${r.external_url}`));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  downloadBlob(lines.join("\r\n") + "\r\n", "text/calendar", `dgd-events-${today()}.ics`);
  return withDates.length;
}
