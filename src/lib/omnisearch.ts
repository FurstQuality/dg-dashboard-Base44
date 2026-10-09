/**
 * Omnisearch — token-based fuzzy match across every field of a record.
 *
 * Splits the query into whitespace-separated tokens (AND semantics),
 * recursively walks the row (objects + arrays), stringifies every primitive,
 * and returns true iff EVERY token appears somewhere in the flattened text.
 *
 * Case-insensitive. Numbers, booleans, and dates are stringified. Nulls skipped.
 * Depth-limited to avoid pathological cycles.
 */

const MAX_DEPTH = 6;

function flatten(value: unknown, depth: number, out: string[]): void {
  if (value == null || depth > MAX_DEPTH) return;
  const t = typeof value;
  if (t === "string") {
    if (value) out.push(value as string);
    return;
  }
  if (t === "number" || t === "boolean" || t === "bigint") {
    out.push(String(value));
    return;
  }
  if (value instanceof Date) {
    out.push(value.toISOString());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) flatten(item, depth + 1, out);
    return;
  }
  if (t === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out.push(key);
      flatten((value as Record<string, unknown>)[key], depth + 1, out);
    }
  }
}

export function buildSearchHaystack(row: unknown, extra?: unknown[]): string {
  const buf: string[] = [];
  flatten(row, 0, buf);
  if (extra) for (const e of extra) flatten(e, 0, buf);
  return buf.join(" \u2022 ").toLowerCase();
}

export function tokenize(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/u)
    .filter((t) => t.length > 0);
}

/**
 * True iff every token in `query` is a substring of the row's flattened text.
 * Empty/whitespace query returns true (no filter).
 */
export function matchesOmnisearch(row: unknown, query: string, extra?: unknown[]): boolean {
  const tokens = tokenize(query);
  if (tokens.length === 0) return true;
  const hay = buildSearchHaystack(row, extra);
  for (const t of tokens) if (!hay.includes(t)) return false;
  return true;
}

/** Precompute a haystack once per row; use `matchesHaystack` for the loop. */
export function matchesHaystack(haystack: string, query: string): boolean {
  const tokens = tokenize(query);
  if (tokens.length === 0) return true;
  for (const t of tokens) if (!haystack.includes(t)) return false;
  return true;
}
