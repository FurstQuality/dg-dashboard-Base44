/**
 * Shared, dependency-free helper for reading a PDGA event id out of an event
 * ref or a pasted live-scoring URL. Kept in its own module so both the crew
 * tracker and the app-wide live sync can use it without importing each other.
 */
export function extractPdgaTournId(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  const patterns: RegExp[] = [
    /TournID=(\d+)/i,
    /eventid=(\d+)/i,
    /\/tour\/event\/(\d+)/i,
    /pdga:(\d+)/i,
    /^(\d{3,7})$/,
  ];
  for (const re of patterns) {
    const m = re.exec(raw);
    if (m) return m[1];
  }
  return null;
}
