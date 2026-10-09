/**
 * StatLink highlight stats shown on a player's profile.
 *
 * The owner picks which highlights other players see; the selection is stored
 * with the rest of their privacy preferences (`privacy_prefs.statHighlights`).
 * Per-section profile privacy still applies on top — a highlight sourced from a
 * hidden section (ratings, scoring, stats, events) simply has no value to show.
 */

export type StatHighlightKey =
  | "currentRating"
  | "avgRating"
  | "bestRound"
  | "ratingTrend"
  | "roundsPlayed"
  | "ratedRounds"
  | "birdieRate"
  | "parRate"
  | "bogeyRate"
  | "scoringAvg"
  | "aces"
  | "eventsPlayed"
  | "wins"
  | "top10s"
  | "bestFinish"
  | "hottestStretch"
  | "coursesPlayed"
  | "statesPlayed";

export type StatHighlightGroup = "Rating" | "Scoring" | "Competition" | "Travel";

export const STAT_HIGHLIGHTS: Array<{
  key: StatHighlightKey;
  label: string;
  hint: string;
  group: StatHighlightGroup;
}> = [
  {
    key: "currentRating",
    label: "Current rating",
    hint: "Your latest official PDGA rating, or your DGD average when unrated.",
    group: "Rating",
  },
  {
    key: "avgRating",
    label: "Average round rating",
    hint: "Average across your rated rounds.",
    group: "Rating",
  },
  {
    key: "bestRound",
    label: "Best round",
    hint: "Your highest rated round, with the course.",
    group: "Rating",
  },
  {
    key: "ratingTrend",
    label: "Recent form",
    hint: "Last five rated rounds against the five before them.",
    group: "Rating",
  },
  {
    key: "ratedRounds",
    label: "Rated rounds",
    hint: "How many of your rounds carry a rating.",
    group: "Rating",
  },
  {
    key: "roundsPlayed",
    label: "Rounds played",
    hint: "Every round across PDGA, UDisc, and DG Dashboard.",
    group: "Scoring",
  },
  {
    key: "birdieRate",
    label: "Birdie rate",
    hint: "Share of holes played under par.",
    group: "Scoring",
  },
  { key: "parRate", label: "Par rate", hint: "Share of holes played at par.", group: "Scoring" },
  {
    key: "bogeyRate",
    label: "Bogey rate",
    hint: "Share of holes played over par.",
    group: "Scoring",
  },
  {
    key: "scoringAvg",
    label: "Strokes per hole",
    hint: "Average score to par on every hole.",
    group: "Scoring",
  },
  { key: "aces", label: "Aces", hint: "Career hole-in-ones on record.", group: "Scoring" },
  {
    key: "eventsPlayed",
    label: "Events played",
    hint: "Tournaments and leagues on your record.",
    group: "Competition",
  },
  { key: "wins", label: "Wins", hint: "First-place finishes.", group: "Competition" },
  { key: "top10s", label: "Top 10s", hint: "Finishes inside the top ten.", group: "Competition" },
  {
    key: "bestFinish",
    label: "Best finish",
    hint: "Your highest placement and the event.",
    group: "Competition",
  },
  {
    key: "hottestStretch",
    label: "Hottest stretch",
    hint: "Best run of rated rounds in a row.",
    group: "Competition",
  },
  {
    key: "coursesPlayed",
    label: "Courses played",
    hint: "Different courses you've logged.",
    group: "Travel",
  },
  {
    key: "statesPlayed",
    label: "States played",
    hint: "States you've logged a round in.",
    group: "Travel",
  },
];

export const STAT_HIGHLIGHT_KEYS: StatHighlightKey[] = STAT_HIGHLIGHTS.map((s) => s.key);

/** A tight, meaningful default so a new profile still reads well. */
export const STAT_HIGHLIGHT_DEFAULTS: StatHighlightKey[] = [
  "currentRating",
  "avgRating",
  "bestRound",
  "ratingTrend",
  "roundsPlayed",
  "birdieRate",
  "eventsPlayed",
  "wins",
];

/** Max highlights a profile can display, so the strip stays scannable. */
export const STAT_HIGHLIGHT_LIMIT = 10;

export function normalizeStatHighlights(value: unknown): StatHighlightKey[] {
  if (!Array.isArray(value)) return [...STAT_HIGHLIGHT_DEFAULTS];
  const allowed = new Set<string>(STAT_HIGHLIGHT_KEYS);
  const out: StatHighlightKey[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && allowed.has(entry) && !out.includes(entry as StatHighlightKey))
      out.push(entry as StatHighlightKey);
  }
  return out.slice(0, STAT_HIGHLIGHT_LIMIT);
}
