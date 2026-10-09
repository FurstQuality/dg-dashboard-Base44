import { normalizeStateCode, stateFilterVariants } from "./us-states";

/**
 * PostgREST `or` filter for the course directory. Matches name, city and state,
 * and resolves any US state spelling ("Indiana", "Ind.", "IN") to every stored
 * form of that state so both spellings match the same search.
 */
export function searchFilter(safe: string): string {
  const parts = [`name.ilike.%${safe}%`, `city.ilike.%${safe}%`, `state.ilike.%${safe}%`];
  const code = normalizeStateCode(safe);
  if (code) {
    for (const variant of stateFilterVariants(code)) {
      parts.push(`state.ilike.${variant}`);
    }
  }
  return parts.join(",");
}
