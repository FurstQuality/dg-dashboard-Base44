import { stateFilterVariants } from "@/lib/us-states";

/**
 * Shared filter application for the course directory, so the paged list and the
 * map pin set always resolve the exact same result set.
 */

export type DirectoryFilterInput = {
  q?: string;
  state?: string;
  holes?: string;
  minRating?: number;
  difficulty?: string;
  minYear?: number;
};

/** Minimal PostgREST builder surface used by the directory filters. */
type FilterableQuery = {
  or(filter: string): FilterableQuery;
  eq(column: string, value: unknown): FilterableQuery;
  gte(column: string, value: unknown): FilterableQuery;
  lte(column: string, value: unknown): FilterableQuery;
};

export function applyDirectoryFilters<Q extends FilterableQuery>(
  query: Q,
  data: DirectoryFilterInput,
  searchFilter: (term: string) => string,
): Q {
  let next = query as FilterableQuery;

  const q = data.q?.trim();
  if (q) {
    const safe = q.replace(/[%,()]/g, " ").trim();
    if (safe) next = next.or(searchFilter(safe));
  }
  if (data.state && data.state !== "all") {
    // Rows may store either the postal code ("IN") or the full name
    // ("Indiana"). Match every stored spelling of the same state.
    const variants = stateFilterVariants(data.state).map(
      (v) => `state.ilike.${v.replace(/[%,()]/g, " ")}`,
    );
    next = next.or(variants.join(","));
  }
  if (data.holes === "9") next = next.lte("hole_count", 9);
  else if (data.holes === "18") next = next.gte("hole_count", 10).lte("hole_count", 18);
  else if (data.holes === "24+") next = next.gte("hole_count", 19);
  if (typeof data.minRating === "number" && data.minRating > 0)
    next = next.gte("pdga_rating", data.minRating);
  if (data.difficulty && data.difficulty !== "any") next = next.eq("difficulty", data.difficulty);
  if (typeof data.minYear === "number" && data.minYear > 0)
    next = next.gte("year_established", data.minYear);

  return next as Q;
}
