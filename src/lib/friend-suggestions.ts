/**
 * Shared, browser-safe shape and copy for location-aware friend suggestions.
 * Ranking leads with the closest community: shared local clubs, same city,
 * same home course, friends in common, then same state.
 */
export type SuggestionRow = {
  user_id: string;
  mutual_count: number;
  shared_clubs: number;
  same_city: boolean;
  same_home_course: boolean;
  same_state: boolean;
  score: number;
};

/** Plain-language reason a player is being suggested, closest signal first. */
export function suggestionReason(row: {
  shared_clubs?: number | null;
  same_city?: boolean | null;
  same_home_course?: boolean | null;
  same_state?: boolean | null;
  mutual_count?: number | null;
}): string | null {
  const clubs = row.shared_clubs ?? 0;
  if (clubs > 0) return clubs === 1 ? "In your club" : `In ${clubs} of your clubs`;
  if (row.same_city) return "Plays in your area";
  if (row.same_home_course) return "Same home course";
  const mutual = row.mutual_count ?? 0;
  if (mutual > 0) return `${mutual} friend${mutual === 1 ? "" : "s"} in common`;
  if (row.same_state) return "Plays in your state";
  return null;
}
