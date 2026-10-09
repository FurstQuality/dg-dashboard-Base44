/** Strip characters that carry meaning inside a PostgREST `.or()` filter so user text stays a plain value. */
export function orFilterText(input: string): string {
  return input.replace(/[,()"'\\:*%_]/g, " ").replace(/\s+/g, " ").trim();
}

/** Accept only an ISO calendar date (YYYY-MM-DD); anything else becomes null. */
export function isoDateOrNull(input: string | null | undefined): string | null {
  return input && /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : null;
}
