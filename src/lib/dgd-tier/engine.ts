/**
 * Phase 9 — DGD Tier engine (dgd-tier-v1). Pure and versioned.
 * Tier recognizes experience, participation, leadership and contribution.
 * It never receives DGD Rating, Form or Skill: there is no input for them.
 */

export const TIER_VERSION = "dgd-tier-v1";
export const TIERS = ["GREEN", "YELLOW", "BRONZE", "SILVER", "GOLD"] as const;
export type Tier = (typeof TIERS)[number];
export type Category = "EXPERIENCE" | "PLAYING" | "COURSES" | "EVENTS" | "SERVICE" | "CREDENTIALS";

export const CATEGORY_MAX: Record<Category, number> = { EXPERIENCE: 20, PLAYING: 20, COURSES: 15, EVENTS: 10, SERVICE: 25, CREDENTIALS: 10 };
export const CATEGORY_LABEL: Record<Category, string> = {
  EXPERIENCE: "Experience", PLAYING: "Playing history", COURSES: "Course breadth", EVENTS: "Events", SERVICE: "Leadership & service", CREDENTIALS: "Credentials",
};
export const TIER_LABEL: Record<Tier, string> = { GREEN: "Green", YELLOW: "Yellow", BRONZE: "Bronze", SILVER: "Silver", GOLD: "Gold" };
/** Score floor for each tier (0–100). */
export const TIER_THRESHOLD: Record<Tier, number> = { GREEN: 0, YELLOW: 25, BRONZE: 45, SILVER: 65, GOLD: 85 };

export type CredentialKind = "PDGA_OFFICIAL" | "TOURNAMENT_DIRECTOR" | "LEAGUE_DIRECTOR" | "COURSE_STEWARD" | "CLUB_ORGANIZER" | "COURSE_DESIGNER";

/** Verified evidence only. Every count must come from canonical/approved records. */
export type TierSignals = {
  first_activity_on: string | null; // ISO date of first verified round
  as_of: string; // ISO date
  active_years: number; // distinct calendar years with verified rounds
  active_months: number; // distinct months with verified rounds
  verified_rounds: number;
  play_days: number; // distinct days with verified rounds (blunts duplicate imports)
  unique_courses: number; // courses, not layouts
  events_played: number; // unique organized events
  events_directed: number; // completed events the player owned/managed
  leagues_organized: number;
  club_leadership: number; // clubs led (owner/admin) with real membership
  contribution_points: number; // approved/verified community contributions only
  credentials: CredentialKind[]; // verified, unexpired
  adjustments?: { category: Category; points: number }[]; // admin corrections with a recorded reason
};

export type Requirement = { key: string; label: string; met: boolean };
export type TierResult = {
  tier_version: string;
  score: number;
  categories: Record<Category, { points: number; max: number }>;
  computed_tier: Tier;
  service_dimensions: number;
  verified_dimensions: number;
  next: { tier: Tier; score_needed: number; score_reached: boolean; requirements: Requirement[] } | null;
};

const taper = (max: number, x: number, k: number) => (x <= 0 ? 0 : max * (1 - Math.exp(-x / k)));
const r1 = (x: number) => Math.round(x * 10) / 10;

export function yearsBetween(from: string | null, to: string): number {
  if (!from) return 0;
  return Math.max(0, (Date.parse(to) - Date.parse(from)) / (365.25 * 86_400_000));
}

export function scoreCategories(s: TierSignals): Record<Category, number> {
  const years = Math.min(yearsBetween(s.first_activity_on, s.as_of), s.active_years + 0.5);
  const service =
    taper(10, s.events_directed, 5) + taper(6, s.leagues_organized, 2) + (s.club_leadership > 0 ? 3 : 0) + taper(6, s.contribution_points, 200);
  const raw: Record<Category, number> = {
    EXPERIENCE: taper(20, years, 3),
    PLAYING: taper(20, s.play_days, 60),
    COURSES: taper(15, s.unique_courses, 25),
    EVENTS: taper(10, s.events_played, 15),
    SERVICE: service,
    CREDENTIALS: new Set(s.credentials).size * 4,
  };
  for (const a of s.adjustments ?? []) raw[a.category] += a.points;
  const out = {} as Record<Category, number>;
  for (const c of Object.keys(CATEGORY_MAX) as Category[]) out[c] = r1(Math.max(0, Math.min(CATEGORY_MAX[c], raw[c])));
  return out;
}

export function serviceDimensions(s: TierSignals): number {
  return [s.events_directed > 0, s.leagues_organized > 0, s.club_leadership > 0, s.contribution_points >= 50].filter(Boolean).length;
}

/** Hard prerequisites per tier. A high score never bypasses them. */
export function requirementsFor(t: Tier, s: TierSignals, cats: Record<Category, number>): Requirement[] {
  const years = yearsBetween(s.first_activity_on, s.as_of);
  const sd = serviceDimensions(s);
  const vd = sd + new Set(s.credentials).size;
  switch (t) {
    case "GREEN": return [];
    case "YELLOW": return [
      { key: "months", label: "3+ months of verified play", met: s.active_months >= 3 },
      { key: "rounds", label: "10+ verified rounds", met: s.verified_rounds >= 10 },
      { key: "courses", label: "3+ courses", met: s.unique_courses >= 3 },
    ];
    case "BRONZE": return [
      { key: "years", label: "1+ year of verified play", met: years >= 1 },
      { key: "rounds", label: "50+ verified rounds", met: s.verified_rounds >= 50 },
      { key: "courses", label: "8+ courses", met: s.unique_courses >= 8 },
      { key: "events", label: "3+ organized events", met: s.events_played >= 3 },
    ];
    case "SILVER": return [
      { key: "years", label: "2+ years of verified play", met: years >= 2 },
      { key: "rounds", label: "120+ verified rounds", met: s.verified_rounds >= 120 },
      { key: "courses", label: "15+ courses", met: s.unique_courses >= 15 },
      { key: "events", label: "8+ organized events", met: s.events_played >= 8 },
      { key: "service", label: "Verified leadership or service", met: sd >= 1 },
    ];
    case "GOLD": return [
      { key: "years", label: "5+ years of verified play", met: years >= 5 },
      { key: "rounds", label: "250+ verified rounds", met: s.verified_rounds >= 250 },
      { key: "courses", label: "30+ courses", met: s.unique_courses >= 30 },
      { key: "events", label: "20+ organized events", met: s.events_played >= 20 },
      { key: "service", label: "Significant leadership (15+ service points)", met: cats.SERVICE >= 15 },
      { key: "dimensions", label: "3+ verified contribution or credential areas", met: vd >= 3 },
    ];
  }
}

export function computeTier(s: TierSignals): TierResult {
  const cats = scoreCategories(s);
  const score = r1(Object.values(cats).reduce((a, b) => a + b, 0));
  // Tiers are earned in order: each tier needs its score floor and every requirement up to it.
  let computed: Tier = "GREEN";
  for (const t of TIERS) {
    if (score < TIER_THRESHOLD[t] || !requirementsFor(t, s, cats).every((r) => r.met)) break;
    computed = t;
  }
  const idx = TIERS.indexOf(computed);
  const nextTier = idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
  const categories = {} as TierResult["categories"];
  for (const c of Object.keys(CATEGORY_MAX) as Category[]) categories[c] = { points: cats[c], max: CATEGORY_MAX[c] };
  return {
    tier_version: TIER_VERSION, score, categories, computed_tier: computed,
    service_dimensions: serviceDimensions(s), verified_dimensions: serviceDimensions(s) + new Set(s.credentials).size,
    next: nextTier ? { tier: nextTier, score_needed: TIER_THRESHOLD[nextTier], score_reached: score >= TIER_THRESHOLD[nextTier], requirements: requirementsFor(nextTier, s, cats) } : null,
  };
}

/**
 * Tier permanence: normal recalculation never lowers a tier. Only corrections
 * (source correction, fraud, duplicates, revoked verification, admin review) may.
 */
export function resolveTier(previous: Tier | null, computed: Tier, correction: boolean): Tier {
  if (!previous || correction) return computed;
  return TIERS.indexOf(computed) > TIERS.indexOf(previous) ? computed : previous;
}
export const CORRECTION_REASONS = new Set(["correction", "fraud", "duplicate", "revoked", "admin_review"]);
