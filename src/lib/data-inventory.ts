/**
 * The single source of truth for "what data does DG Dashboard hold about me".
 *
 * Every entry names a real category of stored user data, where it comes from,
 * what the app uses it for, and how the player controls who can see it.
 * `control` decides which widget the Your data page renders:
 *  - `section`  → per-section profile audience (see profile-visibility.ts)
 *  - `toggle`   → a boolean privacy preference
 *  - `choice`   → a preference with named options (messages)
 *  - `private`  → never shown to other players; no control needed
 *
 * Keep this in sync with docs/user-data-inventory.md when data use changes.
 */

import type { ProfileSectionKey } from "./profile-visibility";
import type { PrivacyPrefs } from "./platform-config";

export type DataInventoryGroup =
  | "Account & identity"
  | "Play & performance"
  | "Connected sources"
  | "Social & community"
  | "Equipment"
  | "Location"
  | "Device & app usage";

export type DataInventoryControl =
  | { kind: "section"; section: ProfileSectionKey }
  | { kind: "toggle"; pref: "showInSearch" | "allowFriendRequests" }
  | { kind: "choice"; pref: "allowMessagesFrom" }
  | { kind: "private"; note: string };

export type DataInventoryItem = {
  key: string;
  group: DataInventoryGroup;
  /** What is stored, in plain language. */
  label: string;
  /** The specific fields a player would recognise. */
  collected: string;
  /** Why the app keeps it. */
  usedFor: string;
  /** Where it came from. */
  source: "You" | "Your play in the app" | "PDGA" | "UDisc" | "Disc Golf Scene" | "Your device";
  control: DataInventoryControl;
};

export const DATA_INVENTORY: DataInventoryItem[] = [
  // Account & identity
  {
    key: "account",
    group: "Account & identity",
    label: "Sign-in details",
    collected: "Email address, sign-in method, account created date, last sign-in.",
    usedFor: "Signing you in, securing your account, and sending account emails.",
    source: "You",
    control: {
      kind: "private",
      note: "Never shown on your profile. Only you and platform staff can see it.",
    },
  },
  {
    key: "name-photo",
    group: "Account & identity",
    label: "Name, username, and photo",
    collected: "Display name, username, avatar and cover photos.",
    usedFor: "Showing who you are on posts, cards, rosters, and leaderboards.",
    source: "You",
    control: {
      kind: "private",
      note: "Always visible where you appear — posts, event rosters, and scorecards you share.",
    },
  },
  {
    key: "bio",
    group: "Account & identity",
    label: "Bio",
    collected: "Your about text.",
    usedFor: "Introducing you on your profile.",
    source: "You",
    control: { kind: "section", section: "bio" },
  },
  {
    key: "home-course",
    group: "Account & identity",
    label: "Home course",
    collected: "The course you list as home.",
    usedFor: "Local recommendations and course pages.",
    source: "You",
    control: { kind: "section", section: "homeCourse" },
  },
  {
    key: "pdga-card",
    group: "Account & identity",
    label: "PDGA membership",
    collected: "PDGA number, membership status, official rating, divisions.",
    usedFor: "Verified ratings, division eligibility, and event registration.",
    source: "PDGA",
    control: { kind: "section", section: "pdga" },
  },
  {
    key: "search",
    group: "Account & identity",
    label: "Being findable",
    collected: "Your name and PDGA number in player search.",
    usedFor: "Letting other players find and add you.",
    source: "You",
    control: { kind: "toggle", pref: "showInSearch" },
  },
  {
    key: "progress",
    group: "Account & identity",
    label: "Level, XP, and streaks",
    collected: "Level, title, experience points, play streak.",
    usedFor: "Progress tracking and achievements.",
    source: "Your play in the app",
    control: { kind: "section", section: "progress" },
  },

  // Play & performance
  {
    key: "rounds",
    group: "Play & performance",
    label: "Rounds and scorecards",
    collected: "Date, course, layout, hole-by-hole scores, cardmates, round type.",
    usedFor: "Your history, stats, ratings, and course insights.",
    source: "Your play in the app",
    control: { kind: "section", section: "rounds" },
  },
  {
    key: "ratings",
    group: "Play & performance",
    label: "Ratings",
    collected: "Published PDGA and UDisc round ratings, plus DG Dashboard estimates.",
    usedFor: "Rating trends, division checks, and comparisons.",
    source: "PDGA",
    control: { kind: "section", section: "ratings" },
  },
  {
    key: "stats",
    group: "Play & performance",
    label: "Stat totals",
    collected: "Rounds played, wins, aces, events, personal bests.",
    usedFor: "Your stat strip and DG Statboard dashboards.",
    source: "Your play in the app",
    control: { kind: "section", section: "stats" },
  },
  {
    key: "scoring",
    group: "Play & performance",
    label: "Scoring breakdown",
    collected: "Birdie, par, bogey, and worse rates by hole and distance.",
    usedFor: "Coaching insights and Ace's advice.",
    source: "Your play in the app",
    control: { kind: "section", section: "scoring" },
  },
  {
    key: "form",
    group: "Play & performance",
    label: "Recent form",
    collected: "Rolling trend line and hot or cold stretches.",
    usedFor: "Showing where your game is heading.",
    source: "Your play in the app",
    control: { kind: "section", section: "form" },
  },
  {
    key: "divisions",
    group: "Play & performance",
    label: "Division history",
    collected: "Divisions you have competed in and results.",
    usedFor: "Division eligibility and event history.",
    source: "PDGA",
    control: { kind: "section", section: "divisions" },
  },
  {
    key: "events",
    group: "Play & performance",
    label: "Events played",
    collected: "Tournaments and leagues, placements, and payouts where published.",
    usedFor: "Your results history and series standings.",
    source: "PDGA",
    control: { kind: "section", section: "events" },
  },
  {
    key: "calendar",
    group: "Play & performance",
    label: "Upcoming schedule",
    collected: "Events you registered for or chose to track, with tee times.",
    usedFor: "Your calendar, reminders, and league nights.",
    source: "Your play in the app",
    control: { kind: "section", section: "calendar" },
  },
  {
    key: "achievements",
    group: "Play & performance",
    label: "Achievements",
    collected: "Badges you have earned and when.",
    usedFor: "Your achievement wall and celebrations.",
    source: "Your play in the app",
    control: { kind: "section", section: "achievements" },
  },

  // Connected sources
  {
    key: "connections",
    group: "Connected sources",
    label: "Connected accounts",
    collected: "PDGA number, UDisc profile link, Disc Golf Scene profile link.",
    usedFor: "Pulling your rounds, ratings, and results automatically.",
    source: "You",
    control: {
      kind: "private",
      note: "Stored encrypted. Never readable by other players; disconnect any time in Data & sync.",
    },
  },
  {
    key: "imports",
    group: "Connected sources",
    label: "Imported files and history",
    collected: "UDisc CSV exports you upload, matched player names, import results.",
    usedFor: "Adding your outside rounds without duplicates.",
    source: "You",
    control: { kind: "private", note: "Only you see your import history." },
  },
  {
    key: "sync-log",
    group: "Connected sources",
    label: "Sync activity",
    collected: "When each source last synced and any errors.",
    usedFor: "Keeping your data fresh and troubleshooting failed syncs.",
    source: "Your play in the app",
    control: { kind: "private", note: "Only you and platform staff see sync logs." },
  },

  // Social & community
  {
    key: "posts",
    group: "Social & community",
    label: "Posts and comments",
    collected: "Feed posts, comments, reactions, and the audience you picked per post.",
    usedFor: "The social feed and your profile.",
    source: "You",
    control: { kind: "section", section: "posts" },
  },
  {
    key: "photos",
    group: "Social & community",
    label: "Photos",
    collected: "Images you attach to posts, rounds, and listings.",
    usedFor: "Showing your rounds and gear.",
    source: "You",
    control: { kind: "section", section: "photos" },
  },
  {
    key: "crew",
    group: "Social & community",
    label: "Crew and follows",
    collected: "Crew members, follow relationships, trackers you created.",
    usedFor: "Your feed, crew activity, and player tracking.",
    source: "You",
    control: { kind: "section", section: "friends" },
  },
  {
    key: "follow-counts",
    group: "Social & community",
    label: "Follower counts",
    collected: "Follower and following totals.",
    usedFor: "Profile summary.",
    source: "Your play in the app",
    control: { kind: "section", section: "followCounts" },
  },
  {
    key: "crew-requests",
    group: "Social & community",
    label: "Crew requests",
    collected: "Invites sent to and from you.",
    usedFor: "Building your crew.",
    source: "You",
    control: { kind: "toggle", pref: "allowFriendRequests" },
  },
  {
    key: "messages",
    group: "Social & community",
    label: "Direct messages",
    collected: "Conversations and message contents between you and other players.",
    usedFor: "Private chat with your crew, clubs, and event staff.",
    source: "You",
    control: { kind: "choice", pref: "allowMessagesFrom" },
  },
  {
    key: "clubs",
    group: "Social & community",
    label: "Clubs and memberships",
    collected: "Clubs you joined, your role, and club events you manage.",
    usedFor: "Club pages, permissions, and league management.",
    source: "You",
    control: {
      kind: "private",
      note: "Club members and club managers see your membership; nobody else does.",
    },
  },

  // Equipment
  {
    key: "bag",
    group: "Equipment",
    label: "My Bag",
    collected: "Discs you carry, molds, plastics, weights, and notes.",
    usedFor: "Bag gaps, disc recommendations, and bag comparisons.",
    source: "You",
    control: { kind: "section", section: "bag" },
  },
  {
    key: "throw-profile",
    group: "Equipment",
    label: "Throw profile",
    collected: "Throw distances, power band, shot shapes, arm speed answers.",
    usedFor: "Disc recommendations, practice plans, and Ace's coaching.",
    source: "You",
    control: { kind: "private", note: "Only you. Used to personalise advice, never published." },
  },
  {
    key: "marketplace",
    group: "Equipment",
    label: "Marketplace and Lost & Found",
    collected: "Listings, prices, disc details, and the contact info you add to a report.",
    usedFor: "Selling, trading, and returning lost discs.",
    source: "You",
    control: {
      kind: "private",
      note: "Listings you publish are public. Your phone number is released only to signed-in players who request contact.",
    },
  },

  // Location
  {
    key: "coarse-location",
    group: "Location",
    label: "City and state",
    collected: "The city and state on your profile.",
    usedFor: "Local courses, events, clubs, and crew suggestions.",
    source: "You",
    control: { kind: "section", section: "location" },
  },
  {
    key: "device-location",
    group: "Location",
    label: "Device location",
    collected: "Your coordinates at the moment you press Use current location.",
    usedFor: "Sorting nearby courses, events, and leagues by distance.",
    source: "Your device",
    control: {
      kind: "private",
      note: "Used for that search only and never stored on your profile or shared. Your browser controls the permission.",
    },
  },

  // Device & app usage
  {
    key: "preferences",
    group: "Device & app usage",
    label: "App preferences",
    collected: "Theme, text size, dashboard layout, bottom buttons, saved filters.",
    usedFor: "Keeping the app set up your way across devices.",
    source: "You",
    control: { kind: "private", note: "Only you." },
  },
  {
    key: "notifications",
    group: "Device & app usage",
    label: "Notification settings and devices",
    collected: "Push, email and quiet-hour choices, plus device push tokens.",
    usedFor: "Sending only the alerts you asked for.",
    source: "Your device",
    control: { kind: "private", note: "Only you." },
  },
  {
    key: "diagnostics",
    group: "Device & app usage",
    label: "Diagnostics and feedback",
    collected: "Error reports, beta feedback you submit, and basic page/device info.",
    usedFor: "Fixing crashes and improving the app.",
    source: "Your device",
    control: {
      kind: "private",
      note: "Only platform staff. Beta feedback shows your name to staff only.",
    },
  },
  {
    key: "ace",
    group: "Device & app usage",
    label: "Ask Ace conversations",
    collected: "Your questions to Ace and the answers, tied to your account.",
    usedFor: "Keeping context in a conversation and improving coaching answers.",
    source: "You",
    control: { kind: "private", note: "Only you. Never added to the public knowledge base." },
  },
];

export const DATA_INVENTORY_GROUPS: DataInventoryGroup[] = [
  "Account & identity",
  "Play & performance",
  "Connected sources",
  "Social & community",
  "Equipment",
  "Location",
  "Device & app usage",
];

/** Plain-language state of an item given the player's current privacy prefs. */
export function describeItemAudience(item: DataInventoryItem, prefs: PrivacyPrefs): string {
  switch (item.control.kind) {
    case "section": {
      const audience = prefs.sections[item.control.section];
      if (audience === "public") return "Everyone";
      if (audience === "friends") return "Crew only";
      return "Only me";
    }
    case "toggle":
      return prefs[item.control.pref] ? "On" : "Off";
    case "choice": {
      const value = prefs.allowMessagesFrom;
      if (value === "everyone") return "Everyone";
      if (value === "friends") return "Crew only";
      return "No one";
    }
    default:
      return "Private";
  }
}
