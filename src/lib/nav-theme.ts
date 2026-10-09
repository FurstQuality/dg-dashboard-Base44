/**
 * Navigation theming — one source of truth for the color + mascot emblem used
 * by every navigation surface (top hub nav, section nav cards, mobile tab bar).
 *
 * Each destination gets a stable accent color and an approved mascot emblem so
 * users learn the app by color and character, not by reading labels.
 */
import { mascotFor, type MascotIntent } from "@/lib/mascots";
import { mascotUrl, type MascotName, type MascotPose } from "@/components/mascot";

export type NavTheme = {
  /** CSS color value used for icon tiles, borders, glow, and active state. */
  accent: string;
  /** Mascot emblem shown alongside the icon. */
  intent: MascotIntent;
};

/** Accent palette — bright, distinct, and drawn from the design tokens. */
const ACCENTS = {
  lime: "var(--community-green)",
  cyan: "var(--brand-cyan)",
  teal: "var(--brand-teal)",
  gold: "var(--competitive-gold)",
  violet: "var(--coaching-violet)",
  pink: "#ff6ec7",
  sky: "var(--info)",
  emerald: "var(--success)",
} as const;

type Rule = { prefixes: string[]; theme: NavTheme };

/** Order matters — the most specific prefixes come first. */
const RULES: Rule[] = [
  // StatLink views + tools. In-page tabs pass a virtual path (/stats/<tab>)
  // so each view gets its own color and a mascot that matches what it does.
  { prefixes: ["/stats/overview"], theme: { accent: ACCENTS.violet, intent: "analytics" } },
  { prefixes: ["/stats/history"], theme: { accent: ACCENTS.sky, intent: "coach" } },
  { prefixes: ["/stats/scoring"], theme: { accent: ACCENTS.gold, intent: "rules" } },
  { prefixes: ["/stats/courses"], theme: { accent: ACCENTS.emerald, intent: "scout" } },
  { prefixes: ["/stats/goals"], theme: { accent: ACCENTS.pink, intent: "celebratory" } },
  { prefixes: ["/stats/lookup"], theme: { accent: ACCENTS.cyan, intent: "crew" } },
  { prefixes: ["/game-plan"], theme: { accent: ACCENTS.teal, intent: "coach" } },
  { prefixes: ["/compare"], theme: { accent: ACCENTS.gold, intent: "official" } },
  { prefixes: ["/what-if"], theme: { accent: ACCENTS.violet, intent: "analytics" } },
  { prefixes: ["/rating-impact"], theme: { accent: ACCENTS.sky, intent: "rules" } },

  // Tournament Tracker views (virtual paths from the in-page tabs).
  { prefixes: ["/tracker/overview"], theme: { accent: ACCENTS.gold, intent: "analytics" } },
  { prefixes: ["/tracker/tracking"], theme: { accent: ACCENTS.sky, intent: "official" } },
  { prefixes: ["/tracker/friends"], theme: { accent: ACCENTS.cyan, intent: "social" } },
  { prefixes: ["/tracker/discover"], theme: { accent: ACCENTS.emerald, intent: "scout" } },
  { prefixes: ["/tracker/crews"], theme: { accent: ACCENTS.violet, intent: "crew" } },
  { prefixes: ["/tracker/readiness"], theme: { accent: ACCENTS.teal, intent: "coach" } },

  // Marketplace destinations — each view gets its own color + emblem.
  { prefixes: ["/lost-found"], theme: { accent: ACCENTS.sky, intent: "scout" } },
  { prefixes: ["/marketplace/sell"], theme: { accent: ACCENTS.lime, intent: "athletic" } },
  { prefixes: ["/marketplace/mine"], theme: { accent: ACCENTS.teal, intent: "coach" } },
  { prefixes: ["/marketplace/alerts"], theme: { accent: ACCENTS.gold, intent: "official" } },
  { prefixes: ["/marketplace"], theme: { accent: ACCENTS.emerald, intent: "social" } },

  // Community destinations that need their own identity.
  { prefixes: ["/community/events"], theme: { accent: ACCENTS.gold, intent: "official" } },
  { prefixes: ["/clubs"], theme: { accent: ACCENTS.emerald, intent: "social" } },

  // Event Director desks — each console gets its own color + emblem so
  // organizers recognize destinations by character, not by reading labels.
  { prefixes: ["/director/registrations"], theme: { accent: ACCENTS.cyan, intent: "crew" } },
  { prefixes: ["/director/check-in"], theme: { accent: ACCENTS.emerald, intent: "official" } },
  { prefixes: ["/director/kit"], theme: { accent: ACCENTS.sky, intent: "rules" } },
  { prefixes: ["/director/ops"], theme: { accent: ACCENTS.teal, intent: "onboarding" } },
  { prefixes: ["/director/tournaments"], theme: { accent: ACCENTS.gold, intent: "official" } },
  { prefixes: ["/director/leagues"], theme: { accent: ACCENTS.lime, intent: "celebratory" } },
  { prefixes: ["/director/clubs"], theme: { accent: ACCENTS.emerald, intent: "social" } },
  { prefixes: ["/director/profile"], theme: { accent: ACCENTS.violet, intent: "coach" } },
  { prefixes: ["/home", "/feed"], theme: { accent: ACCENTS.cyan, intent: "social" } },
  { prefixes: ["/studio"], theme: { accent: ACCENTS.pink, intent: "celebratory" } },
  { prefixes: ["/courses"], theme: { accent: ACCENTS.emerald, intent: "scout" } },

  {
    prefixes: ["/practice", "/range", "/putting"],
    theme: { accent: ACCENTS.teal, intent: "putting" },
  },
  { prefixes: ["/schedule"], theme: { accent: ACCENTS.sky, intent: "onboarding" } },
  {
    prefixes: ["/events", "/tournaments", "/leagues", "/compete", "/leaderboards", "/director"],
    theme: { accent: ACCENTS.gold, intent: "official" },
  },
  { prefixes: ["/tracker"], theme: { accent: ACCENTS.gold, intent: "crew" } },
  { prefixes: ["/arena"], theme: { accent: ACCENTS.gold, intent: "celebratory" } },
  { prefixes: ["/dgim", "/messages"], theme: { accent: ACCENTS.pink, intent: "messages" } },
  { prefixes: ["/friends", "/clubs"], theme: { accent: ACCENTS.cyan, intent: "crew" } },
  { prefixes: ["/community"], theme: { accent: ACCENTS.lime, intent: "social" } },
  { prefixes: ["/stats", "/statlink"], theme: { accent: ACCENTS.violet, intent: "analytics" } },
  { prefixes: ["/ace", "/caddy"], theme: { accent: ACCENTS.violet, intent: "coach" } },
  { prefixes: ["/achievements", "/progress"], theme: { accent: ACCENTS.gold, intent: "celebratory" } },
  { prefixes: ["/play", "/rounds"], theme: { accent: ACCENTS.lime, intent: "athletic" } },
];

const FALLBACK: NavTheme = { accent: ACCENTS.lime, intent: "onboarding" };

/** Resolve the accent + mascot emblem for a route path. */
export function navThemeFor(path: string): NavTheme {
  const rule = RULES.find((r) =>
    r.prefixes.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?")),
  );
  return rule?.theme ?? FALLBACK;
}

/** Resolve the mascot emblem image URL for a route path. */
export function navMascotFor(path: string): { url: string; name: MascotName; pose: MascotPose } {
  const entry = mascotFor(navThemeFor(path).intent);
  return { url: mascotUrl(entry.name, entry.pose), name: entry.name, pose: entry.pose };
}

/**
 * resolveNavAccent — applies the user's navigation color preference to a
 * section accent. "section" keeps each area's own color, "accent" makes the
 * whole app follow the chosen accent color, "mono" removes color coding.
 */
export function resolveNavAccent(accent: string, mode: "section" | "accent" | "mono"): string {
  if (mode === "accent") return "var(--primary)";
  if (mode === "mono") return "var(--muted-foreground)";
  return accent;
}
