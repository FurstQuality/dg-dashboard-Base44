import type { UnifiedRow } from "./events-types";
import { normalizeStateCode } from "@/lib/us-states";

/**
 * Extract a US state abbreviation from a free-text location, e.g.
 * "Emporia, KS" -> "KS", "Charlotte, NC 28226" -> "NC".
 * Returns null when no plausible state is found.
 */
export function extractState(location: string | null): string | null {
  // Accepts "Emporia, KS", "Carmel, Indiana 46032", or a bare state name/code.
  return normalizeStateCode(location);
}

export function collectStates(rows: UnifiedRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const st = extractState(r.location);
    if (st) set.add(st);
  }
  return Array.from(set).sort();
}
