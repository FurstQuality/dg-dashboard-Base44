/**
 * Spreadsheet-safe CSV helpers shared by every export in the app.
 *
 * Values that begin with =, +, -, @, tab, or carriage return are prefixed with
 * an apostrophe so a spreadsheet treats them as text instead of a formula
 * (CSV injection). Quotes are doubled and every cell is quoted.
 */

export function csvCell(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Builds a CSV document from a header row and body rows. */
export function toCsv(
  header: readonly (string | number)[],
  rows: readonly (string | number | null | undefined)[][],
): string {
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return lines.join("\n");
}

/** Triggers a browser download for CSV text. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
