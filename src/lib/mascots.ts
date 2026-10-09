/**
 * Canonical DG Dashboard mascot registry.
 *
 * Every mascot rendered anywhere in the app resolves through this file.
 * Rules:
 *   - Only assets shipped under `src/assets/mascots/` are approved.
 *   - Never regenerate, redraw, or vary the mascot art.
 *   - Never embed text inside a mascot image.
 *   - Callers reference mascots by intent — never by raw filename.
 *   - `MascotIllustration`, `CoachCallout`, and `MascotEmptyState` are the
 *     only components that read raw asset URLs from this registry.
 */
import { MASCOTS, type MascotName, type MascotPose, mascotUrl } from "@/components/mascot";

/**
 * Broad intent tags — pick a mascot by domain, not by filename.
 * A page passes an intent; the registry returns the approved cast member.
 */
export type MascotIntent =
  | "coach" // Ask Ace, StatLink coach, guidance, explanations
  | "scout" // Course discovery, maps, weather, outdoors
  | "athletic" // Practice, range, generic drills
  | "range" // Driving range specifically
  | "putting" // Putting green specifically
  | "social" // Community feed, friends, meetups
  | "crew" // Smart Crew, tracker groups
  | "messages" // DMs, chat
  | "official" // Tournaments, rules, TD Console, moderation
  | "rules" // Rule callouts, integrity, safe scoring
  | "celebratory" // Achievements, aces, streaks, milestones
  | "analytics" // StatLink dashboards, ratings, projections
  | "onboarding" // First-time helpers, empty onboarding states
  | "support"; // Troubleshooting, fixes, data health, settings help

export type MascotSection =
  | "feed"
  | "play"
  | "practice"
  | "community"
  | "tracker"
  | "statlink"
  | "courses"
  | "tournaments"
  | "messages"
  | "profile"
  | "achievements"
  | "onboarding";

/** Approved display sizes (px). Anything else must round to nearest. */
export const APPROVED_SIZES = [40, 56, 72, 96, 128, 160, 200, 240] as const;
export type MascotSize = (typeof APPROVED_SIZES)[number];

export type MascotEntry = {
  /** Stable, portable identifier. */
  id: MascotIntent;
  /** Underlying character in `MASCOTS`. */
  name: MascotName;
  /** Pose to render by default. */
  pose: MascotPose;
  /** Human-readable display label used in tooltips/captions. */
  label: string;
  /** In-product role — one line. */
  role: string;
  /** Personality descriptor — for copy voice hints, never rendered as text. */
  personality: string;
  /** Sections this mascot is approved to appear in. */
  approvedSections: MascotSection[];
  /** Approved display sizes (px). Callers should pick from this list. */
  approvedSizes: readonly MascotSize[];
  /** Default alt text — callers may override with context. */
  alt: string;
  /** Fallback mascot if this one is unavailable / off-theme. */
  fallback: MascotIntent;
};

/**
 * Intent → mascot entry. Every entry maps to an existing PNG in
 * src/assets/mascots/ (bundled locally; original asset metadata is retained).
 * All PNGs are transparent, background-safe, and text-free.
 */
export const MASCOT_REGISTRY: Record<MascotIntent, MascotEntry> = {
  support: {
    id: "support",
    name: "fix-it",
    pose: "default",
    label: "Fix-It",
    role: "Troubleshooting helper · fixes and data health",
    personality: "Handy, calm, gets it sorted",
    approvedSections: ["profile", "onboarding", "statlink", "play"],
    approvedSizes: [56, 72, 96, 128, 160],
    alt: "Fix-It holding a wrench, ready to help sort things out",
    fallback: "coach",
  },
  coach: {
    id: "coach",
    name: "ace",
    pose: "default",
    label: "Ace",
    role: "AI caddy · coach voice",
    personality: "Steady, encouraging, precise",
    approvedSections: ["statlink", "play", "practice", "courses", "onboarding", "profile"],
    approvedSizes: [56, 72, 96, 128, 160],
    alt: "Ace the AI caddy giving guidance",
    fallback: "analytics",
  },
  scout: {
    id: "scout",
    name: "scout",
    pose: "action",
    label: "Scout",
    role: "Course scout · outdoors",
    personality: "Curious, adventurous, map-first",
    approvedSections: ["courses", "play"],
    approvedSizes: [72, 96, 128, 160, 200],
    alt: "Scout exploring the course",
    fallback: "coach",
  },
  athletic: {
    id: "athletic",
    name: "hyzer",
    pose: "action",
    label: "Hyzer",
    role: "Big-arm player · practice",
    personality: "Athletic, confident, form-focused",
    approvedSections: ["practice", "play"],
    approvedSizes: [72, 96, 128, 160],
    alt: "Hyzer mid-throw with a clean release",
    fallback: "range",
  },
  range: {
    id: "range",
    name: "hyzer",
    pose: "action",
    label: "Hyzer",
    role: "Driving range coach",
    personality: "Powerful, disciplined, calibrated",
    approvedSections: ["practice"],
    approvedSizes: [72, 96, 128, 160],
    alt: "Hyzer on the driving range",
    fallback: "athletic",
  },
  putting: {
    id: "putting",
    name: "putt-bot",
    pose: "default",
    label: "Putt Bot",
    role: "Putting green tutor",
    personality: "Analytical, precise, calm under pressure",
    approvedSections: ["practice", "statlink"],
    approvedSizes: [72, 96, 128, 160],
    alt: "Putt Bot lining up a putt",
    fallback: "athletic",
  },
  social: {
    id: "social",
    name: "mulley-glow",
    pose: "default",
    label: "Mulley",
    role: "Community host · good vibes",
    personality: "Warm, welcoming, celebratory",
    approvedSections: ["community", "feed", "achievements"],
    approvedSizes: [56, 72, 96, 128, 160],
    alt: "Mulley cheering with a warm glow",
    fallback: "celebratory",
  },
  crew: {
    id: "crew",
    name: "mulley",
    pose: "action",
    label: "Mulley",
    role: "Smart Crew ambassador",
    personality: "Loyal, hype, roadtrip-ready",
    approvedSections: ["community", "play"],
    approvedSizes: [72, 96, 128, 160],
    alt: "Mulley waving to a crew",
    fallback: "social",
  },
  messages: {
    id: "messages",
    name: "mulley",
    pose: "default",
    label: "Mulley",
    role: "Messages host",
    personality: "Friendly, brief, punctual",
    approvedSections: ["messages", "community"],
    approvedSizes: [56, 72, 96, 128],
    alt: "Mulley ready to chat",
    fallback: "social",
  },
  official: {
    id: "official",
    name: "safe-mode-sam",
    pose: "default",
    label: "Safe Mode Sam",
    role: "Tournament staff · integrity",
    personality: "Even-keeled, rule-aware, official",
    approvedSections: ["tournaments"],
    approvedSizes: [72, 96, 128, 160],
    alt: "Safe Mode Sam on tournament duty",
    fallback: "rules",
  },
  rules: {
    id: "rules",
    name: "safe-mode-sam",
    pose: "action",
    label: "Safe Mode Sam",
    role: "Rules & scoring integrity",
    personality: "Careful, clear, cites the rule",
    approvedSections: ["tournaments", "play"],
    approvedSizes: [72, 96, 128, 160],
    alt: "Safe Mode Sam explaining a rule",
    fallback: "official",
  },
  celebratory: {
    id: "celebratory",
    name: "scramble-fox",
    pose: "action",
    label: "Scramble Fox",
    role: "Recovery hero · celebrations",
    personality: "Playful, resilient, high-energy",
    approvedSections: ["achievements", "feed", "play"],
    approvedSizes: [72, 96, 128, 160, 200],
    alt: "Scramble Fox celebrating a save",
    fallback: "social",
  },
  analytics: {
    id: "analytics",
    name: "chain-brain",
    pose: "default",
    label: "Chain Brain",
    role: "DG Statboard analyst",
    personality: "Data-driven, insightful, sharp",
    approvedSections: ["statlink", "profile"],
    approvedSizes: [56, 72, 96, 128, 160],
    alt: "Chain Brain analyzing round data",
    fallback: "coach",
  },
  onboarding: {
    id: "onboarding",
    name: "ace",
    pose: "action",
    label: "Ace",
    role: "First-run guide",
    personality: "Patient, one-step-at-a-time",
    approvedSections: ["onboarding", "profile"],
    approvedSizes: [96, 128, 160, 200],
    alt: "Ace welcoming a new player",
    fallback: "coach",
  },
};

/**
 * Section → default mascot intent. Pages usually pass a `section`; the
 * shell resolves the mascot from here. Individual callers may override
 * by passing an explicit intent.
 */
export const SECTION_DEFAULT_INTENT: Record<MascotSection, MascotIntent> = {
  feed: "social",
  play: "athletic",
  practice: "athletic",
  community: "social",
  tracker: "crew",
  statlink: "analytics",
  courses: "scout",
  tournaments: "official",
  messages: "messages",
  profile: "coach",
  achievements: "celebratory",
  onboarding: "onboarding",
};

/** Resolve a mascot entry from an intent, with fallback protection. */
export function mascotFor(intent: MascotIntent): MascotEntry {
  return MASCOT_REGISTRY[intent] ?? MASCOT_REGISTRY.coach;
}

/** Resolve a mascot entry from a section. */
export function mascotForSection(section: MascotSection): MascotEntry {
  return mascotFor(SECTION_DEFAULT_INTENT[section]);
}

/** Resolve an image URL from an intent (or a raw name for legacy callers). */
export function mascotUrlFor(intent: MascotIntent, pose?: MascotPose): string {
  const entry = mascotFor(intent);
  return mascotUrl(entry.name, pose ?? entry.pose);
}

/** Round a requested size to the nearest approved size for that mascot. */
export function nearestApprovedSize(intent: MascotIntent, requested: number): MascotSize {
  const entry = mascotFor(intent);
  let best = entry.approvedSizes[0];
  let bestDelta = Math.abs(requested - best);
  for (const s of entry.approvedSizes) {
    const d = Math.abs(requested - s);
    if (d < bestDelta) {
      bestDelta = d;
      best = s;
    }
  }
  return best;
}

// -- backwards-compatible aliases (kept so existing imports keep working) ----

/** @deprecated use `MASCOT_REGISTRY` */
export const MASCOTS_BY_INTENT = MASCOT_REGISTRY;

// Re-export the underlying registry for advanced callers.
export { MASCOTS, mascotUrl };
export type { MascotName, MascotPose };
