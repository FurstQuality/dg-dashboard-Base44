/**
 * Single source of truth for which URLs belong to which app section.
 *
 * The header/mobile primary navigation (app-shell) and the sticky section tab
 * strips (Play, Community, ...) all read from this map, so a page can never be
 * highlighted in one section while showing another section's tab strip — the
 * bug that put the Community tabs on top of Trackers and Leaderboards.
 */
export type SectionKey =
  | "feed"
  | "play"
  | "events"
  | "courses"
  | "director"
  | "community"
  | "tracker"
  | "statlink";

export const SECTION_PATHS: Record<SectionKey, string[]> = {
  // The Feed now lives under Community; Play is home.
  feed: [],
  play: [
    "/play",
    "/rounds",
    "/range",
    "/putting",
    "/practice",
    "/rulebook",
    "/compete",
    "/leaderboards",
  ],
  events: ["/events", "/tournaments", "/leagues", "/schedule"],
  courses: ["/courses", "/course-book"],
  director: ["/director", "/td"],
  community: [
    "/community",
    "/home",
    "/feed",
    "/studio",
    "/people",
    "/friends",
    "/arena",
    "/clubs",
    "/marketplace",
    "/lost-found",
    "/messages",
    "/dgim",
  ],
  tracker: ["/tracker"],
  statlink: [
    "/stats",
    "/insights",
    "/rating-studio",
    "/game-plan",
    "/compare",
    "/season-planner",
    "/action-items",
    "/statlink",
    "/data-review",
  ],
};

/** True when `pathname` is one of `paths` or nested beneath it. */
export function matchesPaths(pathname: string, paths: readonly string[]): boolean {
  const path = pathname.split(/[?#]/, 1)[0];
  return paths.some((p) => path === p || path.startsWith(p + "/"));
}

/**
 * The section that owns `pathname`, or null when the page stands on its own
 * (profile, settings, admin, standalone tools). The longest matching prefix
 * wins so nested paths cannot be claimed by two sections.
 */
export function sectionFor(pathname: string): SectionKey | null {
  const path = pathname.split(/[?#]/, 1)[0];
  let best: SectionKey | null = null;
  let bestLength = 0;
  for (const key of Object.keys(SECTION_PATHS) as SectionKey[]) {
    for (const p of SECTION_PATHS[key]) {
      if ((path === p || path.startsWith(p + "/")) && p.length > bestLength) {
        best = key;
        bestLength = p.length;
      }
    }
  }
  return best;
}
