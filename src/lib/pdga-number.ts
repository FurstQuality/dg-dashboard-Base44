/**
 * Single source of truth for PDGA number handling. PDGA numbers arrive from
 * scraped pages, user input, and imports, so they can carry "#", spaces, or
 * stray punctuation. Everything that matches players across tables normalizes
 * through here instead of trusting stored formatting.
 */
export function normalizePdgaNumber(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/\D/g, "").replace(/^0+/, "");
  return digits.length ? digits : null;
}

/**
 * Stored spellings a normalized number could plausibly match, for use with
 * `.in(...)` filters against columns that may hold legacy formats.
 */
export function pdgaNumberVariants(normalized: string): string[] {
  return [normalized, `#${normalized}`, `PDGA ${normalized}`];
}

/** Expands a set of normalized numbers into every stored spelling to query. */
export function pdgaNumberQueryValues(numbers: string[]): string[] {
  return Array.from(new Set(numbers.flatMap(pdgaNumberVariants)));
}

/** Formats a PDGA number for display; returns null when there is none. */
export function formatPdgaNumber(value: string | number | null | undefined): string | null {
  const normalized = normalizePdgaNumber(value);
  return normalized ? `#${normalized}` : null;
}
