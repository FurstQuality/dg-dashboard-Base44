/**
 * Smart routing: one source of truth for how the app points at itself.
 *
 * Three jobs live here so no page invents its own answer:
 *  1. `entityHref` — the canonical URL for a thing that gets mentioned in copy
 *     (player, course, club, event, tournament, league, round, post, listing).
 *  2. `PAGE_REGISTRY` — every page/tool a person can reach, with the words they
 *     would search for. Powers global search and the sitemap.
 *  3. `relatedFor` — the small set of destinations that genuinely pair with the
 *     page you're on, so a page needs at most one compact row of links instead
 *     of a wall of buttons.
 */
import type { SectionKey } from "./section-nav";
import { sectionFor } from "./section-nav";

/* ------------------------------------------------------------------ */
/* 1. Entity links                                                     */
/* ------------------------------------------------------------------ */

export type EntityKind =
  | "player"
  | "course"
  | "club"
  | "communityEvent"
  | "pdgaEvent"
  | "directoryEvent"
  | "tournament"
  | "league"
  | "series"
  | "round"
  | "post"
  | "tag"
  | "listing"
  | "trackerGroup"
  | "courseBookEntry";

/** An entity reference as it appears in data: an id/slug plus its kind. */
export interface EntityRef {
  kind: EntityKind;
  /** Slug, username, uuid or numeric ref — whatever that route takes. */
  id: string;
}

const ENTITY_PATTERNS: Record<EntityKind, string> = {
  player: "/u/:id",
  course: "/courses/:id",
  club: "/clubs/:id",
  communityEvent: "/community/:id",
  pdgaEvent: "/events/pdga/:id",
  directoryEvent: "/e/:id",
  tournament: "/tournaments/:id",
  league: "/leagues/:id",
  series: "/series/:id",
  round: "/play/:id",
  post: "/p/:id",
  tag: "/tag/:id",
  listing: "/marketplace/:id",
  trackerGroup: "/tracker/:id",
  courseBookEntry: "/course-book/:id",
};

/**
 * Canonical in-app URL for an entity, or null when there is nothing to link to
 * (missing id). Callers render plain text when this returns null — a dead link
 * is worse than no link.
 */
export function entityHref(ref: Partial<EntityRef> | null | undefined): string | null {
  if (!ref?.kind || !ref.id) return null;
  const pattern = ENTITY_PATTERNS[ref.kind];
  if (!pattern) return null;
  const id = String(ref.id).trim();
  if (!id) return null;
  return pattern.replace(":id", encodeURIComponent(id));
}

/* ------------------------------------------------------------------ */
/* 2. Page registry                                                    */
/* ------------------------------------------------------------------ */

export interface PageEntry {
  /** Destination path. */
  href: string;
  /** Short label as it appears in navigation. */
  label: string;
  /** One line explaining what the page is for. */
  description: string;
  /** Extra words people might type when looking for it. */
  keywords?: string[];
  /** True for pages reachable without signing in (used by the sitemap). */
  publicPage?: boolean;
}

export const PAGE_REGISTRY: readonly PageEntry[] = [
  // Public
  {
    href: "/",
    label: "DG Dashboard",
    description: "What the app does and how to start.",
    publicPage: true,
    keywords: ["landing", "home page"],
  },
  {
    href: "/preview",
    label: "Player preview",
    description: "Look up a PDGA player without an account.",
    publicPage: true,
    keywords: ["pdga", "lookup"],
  },
  {
    href: "/auth",
    label: "Sign in",
    description: "Sign in or create your account.",
    publicPage: true,
    keywords: ["login", "sign up", "register"],
  },
  {
    href: "/pricing",
    label: "Plans and pricing",
    description: "Compare what each plan includes.",
    keywords: ["subscription", "upgrade", "billing"],
  },

  // Feed
  {
    href: "/home",
    label: "Home",
    description: "Your dashboard of rounds, friends and what's next.",
    keywords: ["dashboard", "overview"],
  },
  {
    href: "/feed",
    label: "Social feed",
    description: "Posts, aces and round cards from people you follow.",
    keywords: ["posts", "social", "timeline"],
  },
  {
    href: "/studio",
    label: "Creator Studio",
    description: "Plan, draft and schedule your disc golf content.",
    keywords: ["content", "posts", "creator", "drafts"],
  },

  // Play
  {
    href: "/play",
    label: "Play",
    description: "Start a round, pick a course and see what's on your schedule.",
    keywords: ["round", "scorecard", "start"],
  },
  {
    href: "/play/new",
    label: "Start a round",
    description: "Set up a new round and scorecard.",
    keywords: ["new round", "score", "scorecard"],
  },
  {
    href: "/play/rounds",
    label: "My rounds",
    description: "Every round you've scored, with filters.",
    keywords: ["history", "scorecards"],
  },
  {
    href: "/play/courses",
    label: "Courses",
    description: "Find, compare and build courses near you.",
    keywords: ["course directory", "map", "layouts"],
  },
  {
    href: "/courses?add=1",
    label: "Add a course",
    description: "Build a course with holes, tees and baskets.",
    keywords: ["build course", "create course"],
  },
  {
    href: "/rulebook",
    label: "Game rulebook",
    description: "Rules for every format, throw style, scoring type and side game.",
    keywords: ["rules", "wolf", "skins", "doubles", "best shot", "imposter", "alternate shot"],
  },
  {
    href: "/play/practice",
    label: "Practice",
    description: "Putting and field work sessions with tracked results.",
    keywords: ["putting", "field work", "range", "drills"],
  },
  {
    href: "/putting",
    label: "Putting practice",
    description: "Log putting sets by distance and see make rates.",
    keywords: ["putts", "circle 1", "circle 2"],
  },
  {
    href: "/range",
    label: "Field work",
    description: "Log throws with disc, shape and distance.",
    keywords: ["throws", "distance", "drives"],
  },
  {
    href: "/play/schedule",
    label: "My schedule",
    description: "Planned rounds and events in list or calendar view.",
    keywords: ["calendar", "planned", "upcoming"],
  },
  {
    href: "/play/compete",
    label: "Compete",
    description: "Tournaments, leagues and leaderboards you can enter.",
    keywords: ["tournaments", "leagues", "register"],
  },
  {
    href: "/series",
    label: "Series",
    description: "League and tournament series with season standings and finales.",
    keywords: ["series", "standings", "points", "season", "tour"],
  },
  {
    href: "/events",
    label: "Events",
    description: "Every event near you from PDGA, Disc Golf Scene, UDisc and this app.",
    keywords: ["tournaments", "directory", "register", "nearby"],
  },
  {
    href: "/td-kit",
    label: "Free event director kit",
    description: "Plan and run a tournament or league night — checklist, running order, payouts and roster. No account needed.",
    keywords: ["director", "td", "checklist", "payout", "run an event", "free"],
  },
  {
    href: "/tournaments",
    label: "Tournaments",
    description: "Tournaments running in the app.",
    keywords: ["compete", "register"],
  },
  {
    href: "/leagues",
    label: "Leagues",
    description: "Weekly leagues, standings and check-in.",
    keywords: ["weekly", "standings"],
  },
  {
    href: "/course-book",
    label: "Course book",
    description: "Your notes, lines and photos per hole.",
    keywords: ["notes", "hole notes", "book"],
  },

  // Director
  {
    href: "/director",
    label: "Director",
    description: "Run your tournaments, leagues and series.",
    keywords: ["td", "organizer", "host"],
  },
  {
    href: "/director/tournaments/new",
    label: "Create a tournament",
    description: "Set up divisions, rounds, fees and registration.",
    keywords: ["host", "new tournament"],
  },
  {
    href: "/director/leagues/new",
    label: "Create a league",
    description: "Set up a weekly league with divisions and scoring.",
    keywords: ["host", "new league"],
  },
  {
    href: "/director/registrations",
    label: "Registrations",
    description: "Review entries, payments and waitlists.",
    keywords: ["entries", "waitlist", "payments"],
  },
  {
    href: "/director/check-in",
    label: "Check-in",
    description: "Check players in and assign cards on event day.",
    keywords: ["kiosk", "event day"],
  },
  {
    href: "/director/kiosk",
    label: "Event kiosk",
    description: "Self-serve check-in screen for the event table.",
    keywords: ["check-in", "tablet"],
  },
  {
    href: "/director/series",
    label: "Series",
    description: "Link events into a series with standings.",
    keywords: ["standings", "points"],
  },
  {
    href: "/director/ops",
    label: "Event operations",
    description: "Day-of checklists, staff and alerts.",
    keywords: ["checklist", "staff", "run"],
  },

  // Community
  {
    href: "/community",
    label: "Community",
    description: "Friends, clubs, trackers, events and messages.",
    keywords: ["social", "people"],
  },
  {
    href: "/friends",
    label: "Friends",
    description: "Your friends, requests and who wants to play.",
    keywords: ["requests", "add friend", "play"],
  },
  {
    href: "/clubs",
    label: "Clubs",
    description: "Find clubs near you and manage the ones you're in.",
    keywords: ["club", "join"],
  },
  {
    href: "/community/trackers",
    label: "Live trackers",
    description: "Follow friends' events and live scoring.",
    keywords: ["live", "tracker", "follow"],
  },
  {
    href: "/tracker",
    label: "Trackers",
    description: "Live scoring for the events and players you follow.",
    keywords: ["live scoring", "follow"],
  },
  {
    href: "/community/events",
    label: "Community events",
    description: "Cleanups, group rounds, clinics and meetups.",
    keywords: ["meetup", "cleanup", "group round"],
  },
  {
    href: "/dgim",
    label: "Messages",
    description: "Direct, group, club and event chats.",
    keywords: ["chat", "messenger", "dm", "group chat"],
  },
  {
    href: "/marketplace",
    label: "Marketplace",
    description: "Buy, sell and reunite discs.",
    keywords: ["sell", "buy", "lost disc", "found"],
  },
  {
    href: "/lost-found",
    label: "Lost and found",
    description: "Report a lost disc or one you've found.",
    keywords: ["lost disc", "found disc", "reunite"],
  },
  {
    href: "/arena",
    label: "Arena",
    description: "Head-to-head duels against friends.",
    keywords: ["duel", "face off", "challenge"],
  },

  // DG Statboard
  {
    href: "/statlink",
    label: "DG Statboard",
    description: "Your scoring, ratings and course performance.",
    keywords: ["statlink", "stats", "analytics"],
  },
  {
    href: "/stats",
    label: "Stats",
    description: "Round database, scoring splits and goals.",
    keywords: ["scoring", "goals", "database"],
  },
  {
    href: "/rating-studio",
    label: "Ratings Lab",
    description: "How your DGD Rating moves and what would change it.",
    keywords: ["rating", "dgd rating", "projection", "what if"],
  },
  {
    href: "/game-plan",
    label: "Game plan",
    description: "Course-by-course plan built from your own numbers.",
    keywords: ["plan", "strategy", "course tracker"],
  },
  {
    href: "/compare",
    label: "Compare players",
    description: "Put your numbers next to another player's.",
    keywords: ["head to head", "player lookup", "versus"],
  },
  {
    href: "/insights",
    label: "Coach insights",
    description: "What to work on next, from your rounds.",
    keywords: ["coach", "improve", "ace"],
  },
  {
    href: "/season-planner",
    label: "Season planner",
    description: "Map your season around events and rating targets.",
    keywords: ["season", "plan", "targets"],
  },

  // Personal
  {
    href: "/me",
    label: "My profile",
    description: "Your profile as other players see it.",
    keywords: ["profile", "me"],
  },
  {
    href: "/me/bag",
    label: "My bag",
    description: "The discs you carry and how each performs.",
    keywords: ["discs", "bag", "molds"],
  },
  {
    href: "/achievements",
    label: "Achievements",
    description: "Badges, trophies and progress toward the next tier.",
    keywords: ["trophy", "badges", "progress", "xp"],
  },
  {
    href: "/challenges",
    label: "Challenges",
    description: "Daily and seasonal challenges.",
    keywords: ["daily", "weekly", "goals"],
  },
  {
    href: "/ace",
    label: "Ask Ace",
    description: "Your AI caddy for lines, clubbing and practice.",
    keywords: ["caddy", "ai", "ace", "help"],
  },
  {
    href: "/notifications",
    label: "Notifications",
    description: "Everything that happened while you were away.",
    keywords: ["alerts"],
  },
  {
    href: "/settings",
    label: "Settings",
    description: "Profile, notifications, privacy, imports and personalization.",
    keywords: ["preferences", "account"],
  },
  {
    href: "/settings/personalization",
    label: "Personalization",
    description: "Theme, density and what shows on your dashboards.",
    keywords: ["theme", "layout", "density"],
  },
  {
    href: "/settings/notifications",
    label: "Notification settings",
    description: "Choose what you're told about, and how.",
    keywords: ["alerts", "email", "push"],
  },
  {
    href: "/settings/imports",
    label: "Imports",
    description: "Bring in rounds and courses from other apps.",
    keywords: ["udisc", "csv", "import"],
  },
  {
    href: "/billing",
    label: "Billing",
    description: "Your plan, invoices and payment method.",
    keywords: ["subscription", "invoice", "plan"],
  },
];

/** Pages the sitemap should list (public, crawlable). */
export function publicPages(): PageEntry[] {
  return PAGE_REGISTRY.filter((p) => p.publicPage);
}

/** Fuzzy-ish match of a typed term against label, description and keywords. */
export function searchPages(term: string, limit = 6): PageEntry[] {
  const q = term.trim().toLowerCase();
  if (q.length < 2) return [];
  const scored: Array<{ page: PageEntry; score: number }> = [];
  for (const page of PAGE_REGISTRY) {
    const label = page.label.toLowerCase();
    let score = 0;
    if (label === q) score = 100;
    else if (label.startsWith(q)) score = 80;
    else if (label.includes(q)) score = 60;
    else if (page.keywords?.some((k) => k.toLowerCase().includes(q))) score = 40;
    else if (page.description.toLowerCase().includes(q)) score = 20;
    if (score > 0) scored.push({ page, score });
  }
  scored.sort((a, b) => b.score - a.score || a.page.label.localeCompare(b.page.label));
  return scored.slice(0, limit).map((s) => s.page);
}

/* ------------------------------------------------------------------ */
/* 3. Related pathways                                                 */
/* ------------------------------------------------------------------ */

export interface RelatedLink {
  href: string;
  label: string;
  /** Why you'd go there, shown as the link's title/tooltip. */
  description: string;
}

/**
 * Curated pairings, keyed by path prefix. Longest matching prefix wins, so a
 * detail page can override its section. Keep each list to three or four — this
 * is a shortcut row, not a menu.
 */
const RELATED: Array<{ prefix: string; hrefs: string[] }> = [
  { prefix: "/home", hrefs: ["/play/new", "/events", "/statlink", "/friends"] },
  { prefix: "/feed", hrefs: ["/friends", "/studio", "/clubs"] },
  { prefix: "/studio", hrefs: ["/feed", "/achievements"] },

  { prefix: "/play/new", hrefs: ["/play/courses", "/course-book", "/me/bag"] },
  { prefix: "/play/rounds", hrefs: ["/stats", "/rating-studio", "/play/new"] },
  { prefix: "/play/courses", hrefs: ["/game-plan", "/courses?add=1", "/course-book"] },
  { prefix: "/play/practice", hrefs: ["/putting", "/range", "/insights"] },
  { prefix: "/play/schedule", hrefs: ["/events", "/season-planner", "/play/compete"] },
  { prefix: "/play/compete", hrefs: ["/events", "/tournaments", "/leagues", "/series", "/director"] },
  { prefix: "/play", hrefs: ["/play/new", "/play/rounds", "/play/courses", "/play/schedule"] },
  { prefix: "/courses?add=1", hrefs: ["/play/courses", "/course-book"] },
  { prefix: "/courses", hrefs: ["/play/new", "/game-plan", "/course-book"] },
  { prefix: "/course-book", hrefs: ["/play/courses", "/game-plan"] },
  { prefix: "/putting", hrefs: ["/play/practice", "/range", "/stats"] },
  { prefix: "/range", hrefs: ["/play/practice", "/me/bag", "/stats"] },
  { prefix: "/events", hrefs: ["/play/schedule", "/tracker", "/director"] },
  { prefix: "/tournaments", hrefs: ["/events", "/play/compete", "/director/tournaments/new"] },
  { prefix: "/leagues", hrefs: ["/events", "/play/compete", "/director/leagues/new"] },
  { prefix: "/series", hrefs: ["/events", "/leagues", "/tournaments"] },

  { prefix: "/director/registrations", hrefs: ["/director/check-in", "/director/ops"] },
  { prefix: "/director/check-in", hrefs: ["/director/kiosk", "/director/registrations"] },
  { prefix: "/director/series", hrefs: ["/director/tournaments/new", "/director/leagues/new"] },
  {
    prefix: "/director",
    hrefs: [
      "/director/tournaments/new",
      "/director/leagues/new",
      "/director/registrations",
      "/director/ops",
    ],
  },

  { prefix: "/friends", hrefs: ["/tracker", "/arena", "/dgim"] },
  { prefix: "/clubs", hrefs: ["/community/events", "/dgim", "/friends"] },
  { prefix: "/community/trackers", hrefs: ["/tracker", "/events", "/friends"] },
  { prefix: "/community/events", hrefs: ["/clubs", "/play/schedule", "/friends"] },
  { prefix: "/community", hrefs: ["/friends", "/clubs", "/tracker", "/dgim"] },
  { prefix: "/tracker", hrefs: ["/events", "/friends", "/statlink"] },
  { prefix: "/dgim", hrefs: ["/friends", "/clubs"] },
  { prefix: "/marketplace", hrefs: ["/me/bag", "/lost-found"] },
  { prefix: "/arena", hrefs: ["/friends", "/statlink"] },

  { prefix: "/statlink", hrefs: ["/stats", "/rating-studio", "/game-plan", "/insights"] },
  { prefix: "/stats", hrefs: ["/rating-studio", "/play/rounds", "/insights"] },
  { prefix: "/rating-studio", hrefs: ["/stats", "/season-planner", "/events"] },
  { prefix: "/game-plan", hrefs: ["/course-book", "/play/courses", "/insights"] },
  { prefix: "/compare", hrefs: ["/statlink", "/friends"] },
  { prefix: "/insights", hrefs: ["/action-items", "/play/practice", "/ace"] },
  { prefix: "/season-planner", hrefs: ["/play/schedule", "/events", "/rating-studio"] },
  { prefix: "/action-items", hrefs: ["/insights", "/play/practice"] },

  { prefix: "/me/bag", hrefs: ["/range", "/marketplace", "/statlink"] },
  { prefix: "/me", hrefs: ["/me/bag", "/achievements", "/statlink"] },
  { prefix: "/achievements", hrefs: ["/challenges", "/statlink", "/me"] },
  { prefix: "/challenges", hrefs: ["/achievements", "/play/new"] },
  { prefix: "/ace", hrefs: ["/insights", "/game-plan", "/play/practice"] },
  {
    prefix: "/settings",
    hrefs: [
      "/settings/personalization",
      "/settings/notifications",
      "/settings/imports",
      "/billing",
    ],
  },
  { prefix: "/billing", hrefs: ["/pricing", "/settings"] },
];

const BY_HREF = new Map(PAGE_REGISTRY.map((p) => [p.href, p]));

/** The page registry entry for an exact path, if it is registered. */
export function pageFor(href: string): PageEntry | null {
  return BY_HREF.get(href) ?? null;
}

/**
 * Up to `limit` destinations that pair with `pathname`, never including the
 * page you're already on. Returns an empty array for pages with no curated
 * pairing — callers render nothing rather than guessing.
 */
export function relatedFor(pathname: string, limit = 4): RelatedLink[] {
  let hrefs: string[] = [];
  let bestLength = 0;
  for (const entry of RELATED) {
    if (
      (pathname === entry.prefix || pathname.startsWith(entry.prefix + "/")) &&
      entry.prefix.length > bestLength
    ) {
      hrefs = entry.hrefs;
      bestLength = entry.prefix.length;
    }
  }
  const out: RelatedLink[] = [];
  for (const href of hrefs) {
    if (href === pathname || out.some((o) => o.href === href)) continue;
    const page = BY_HREF.get(href);
    if (!page) continue;
    out.push({ href, label: page.label, description: page.description });
    if (out.length >= limit) break;
  }
  return out;
}

/** The section that owns a path — re-exported so callers need one import. */
export function sectionOf(pathname: string): SectionKey | null {
  return sectionFor(pathname);
}
