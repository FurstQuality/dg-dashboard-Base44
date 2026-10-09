// PDGA-derived reference data used by the tournament & league builders.
// Divisions, rating requirements and points factors are transcribed from PDGA
// Tour Standards "Table 5: PDGA Tour Player Divisions, Ratings & Points
// Factors" (revision 2025-11-21). Amateur rating requirements are exclusive
// ("< 900"), so they are stored as `rating_below`.

export type PdgaPointsFactors = {
  majors: number;
  a_tier: number; // Elite & A tier
  b_tier: number;
  c_tier: number;
  league_per_week: number;
};

export type PdgaDivision = {
  code: string; // PDGA code (MPO, FPO, MA1 …)
  name: string; // Official division name
  gender: "M" | "F" | "X"; // X = mixed / any
  age_min?: number;
  age_max?: number;
  /** Suggested minimum rating (professional divisions only). */
  min_rating?: number;
  /** Highest rating allowed, inclusive. Derived from `rating_below`. */
  max_rating?: number;
  /** Amateur rating requirement: player rating must be strictly below this. */
  rating_below?: number;
  /** At or above this rating the player must enter this division (MA1 / FA1). */
  required_at_or_above?: number;
  /** Cap for a player who has accepted cash (pro) and is playing this am division. */
  pro_rating_below?: number;
  category:
    | "pro"
    | "amateur"
    | "age_protected"
    | "junior"
    | "collegiate"
    | "scholastic"
    | "ratings_event";
  points: PdgaPointsFactors;
};

const pts = (
  majors: number,
  a_tier: number,
  b_tier: number,
  c_tier: number,
  league_per_week: number,
): PdgaPointsFactors => ({ majors, a_tier, b_tier, c_tier, league_per_week });

export const PDGA_DIVISIONS: PdgaDivision[] = [
  // ---------------- Professional class (suggested minimum ratings) ----------
  { code: "MPO", name: "Mixed Pro Open", gender: "X", min_rating: 970, category: "pro", points: pts(15, 10, 7.5, 5, 2.5) },
  { code: "MP40", name: "Mixed Pro 40+", gender: "X", age_min: 40, min_rating: 920, category: "age_protected", points: pts(12, 8, 6, 4, 2) },
  { code: "MP50", name: "Mixed Pro 50+", gender: "X", age_min: 50, min_rating: 910, category: "age_protected", points: pts(9, 6, 4.5, 3, 1.5) },
  { code: "MP55", name: "Mixed Pro 55+", gender: "X", age_min: 55, min_rating: 905, category: "age_protected", points: pts(9, 6, 4.5, 3, 1.5) },
  { code: "MP60", name: "Mixed Pro 60+", gender: "X", age_min: 60, min_rating: 900, category: "age_protected", points: pts(6, 4, 3, 2, 1) },
  { code: "MP65", name: "Mixed Pro 65+", gender: "X", age_min: 65, min_rating: 885, category: "age_protected", points: pts(6, 4, 3, 2, 1) },
  { code: "MP70", name: "Mixed Pro 70+", gender: "X", age_min: 70, min_rating: 860, category: "age_protected", points: pts(4.5, 3, 2.25, 1.5, 0.75) },
  { code: "MP75", name: "Mixed Pro 75+", gender: "X", age_min: 75, min_rating: 840, category: "age_protected", points: pts(4.5, 3, 2.25, 1.5, 0.75) },
  { code: "MP80", name: "Mixed Pro 80+", gender: "X", age_min: 80, min_rating: 840, category: "age_protected", points: pts(4.5, 3, 2.25, 1.5, 0.75) },
  { code: "FPO", name: "Women's Pro Open", gender: "F", min_rating: 875, category: "pro", points: pts(9, 6, 4.5, 3, 1.5) },
  { code: "FP40", name: "Women's Pro 40+", gender: "F", age_min: 40, min_rating: 820, category: "age_protected", points: pts(6, 4, 3, 2, 1) },
  { code: "FP50", name: "Women's Pro 50+", gender: "F", age_min: 50, min_rating: 805, category: "age_protected", points: pts(4.5, 3, 2.25, 1.5, 0.75) },
  { code: "FP55", name: "Women's Pro 55+", gender: "F", age_min: 55, min_rating: 795, category: "age_protected", points: pts(4.5, 3, 2.25, 1.5, 0.75) },
  { code: "FP60", name: "Women's Pro 60+", gender: "F", age_min: 60, min_rating: 790, category: "age_protected", points: pts(3, 2, 1.5, 1, 0.5) },
  { code: "FP65", name: "Women's Pro 65+", gender: "F", age_min: 65, min_rating: 785, category: "age_protected", points: pts(3, 2, 1.5, 1, 0.5) },
  { code: "FP70", name: "Women's Pro 70+", gender: "F", age_min: 70, min_rating: 740, category: "age_protected", points: pts(3, 2, 1.5, 1, 0.5) },
  { code: "FP75", name: "Women's Pro 75+", gender: "F", age_min: 75, min_rating: 720, category: "age_protected", points: pts(3, 2, 1.5, 1, 0.5) },
  { code: "FP80", name: "Women's Pro 80+", gender: "F", age_min: 80, min_rating: 720, category: "age_protected", points: pts(3, 2, 1.5, 1, 0.5) },

  // ---------------- Mixed amateur ------------------------------------------
  // MA1 has no rating cap: any rating may play it, and it is required at 935+.
  // A player who has accepted cash may only play MA1 below 970.
  { code: "MA1", name: "Mixed Amateur 1", gender: "X", required_at_or_above: 935, pro_rating_below: 970, category: "amateur", points: pts(15, 10, 7.5, 5, 2.5) },
  { code: "MA2", name: "Mixed Amateur 2", gender: "X", rating_below: 935, max_rating: 934, pro_rating_below: 935, category: "amateur", points: pts(12, 8, 6, 4, 2) },
  { code: "MA3", name: "Mixed Amateur 3", gender: "X", rating_below: 900, max_rating: 899, pro_rating_below: 900, category: "amateur", points: pts(9, 6, 4.5, 3, 1.5) },
  { code: "MA4", name: "Mixed Amateur 4", gender: "X", rating_below: 850, max_rating: 849, pro_rating_below: 850, category: "amateur", points: pts(6, 4, 3, 2, 1) },
  { code: "MA40", name: "Mixed Amateur 40+", gender: "X", age_min: 40, pro_rating_below: 920, category: "age_protected", points: pts(12, 8, 6, 4, 2) },
  { code: "MA50", name: "Mixed Amateur 50+", gender: "X", age_min: 50, pro_rating_below: 910, category: "age_protected", points: pts(9, 6, 4.5, 3, 1.5) },
  { code: "MA55", name: "Mixed Amateur 55+", gender: "X", age_min: 55, pro_rating_below: 905, category: "age_protected", points: pts(9, 6, 4.5, 3, 1.5) },
  { code: "MA60", name: "Mixed Amateur 60+", gender: "X", age_min: 60, pro_rating_below: 900, category: "age_protected", points: pts(6, 4, 3, 2, 1) },
  { code: "MA65", name: "Mixed Amateur 65+", gender: "X", age_min: 65, pro_rating_below: 885, category: "age_protected", points: pts(6, 4, 3, 2, 1) },
  { code: "MA70", name: "Mixed Amateur 70+", gender: "X", age_min: 70, pro_rating_below: 860, category: "age_protected", points: pts(4.5, 3, 2.25, 1.5, 0.75) },
  { code: "MA75", name: "Mixed Amateur 75+", gender: "X", age_min: 75, pro_rating_below: 840, category: "age_protected", points: pts(4.5, 3, 2.25, 1.5, 0.75) },
  { code: "MA80", name: "Mixed Amateur 80+", gender: "X", age_min: 80, pro_rating_below: 840, category: "age_protected", points: pts(4.5, 3, 2.25, 1.5, 0.75) },

  // ---------------- Women-only amateur -------------------------------------
  { code: "FA1", name: "Women's Amateur 1", gender: "F", required_at_or_above: 825, pro_rating_below: 875, category: "amateur", points: pts(9, 6, 4.5, 3, 1.5) },
  { code: "FA2", name: "Women's Amateur 2", gender: "F", rating_below: 825, max_rating: 824, pro_rating_below: 825, category: "amateur", points: pts(6, 4, 3, 2, 1) },
  { code: "FA3", name: "Women's Amateur 3", gender: "F", rating_below: 775, max_rating: 774, pro_rating_below: 775, category: "amateur", points: pts(4.5, 3, 2.25, 1.5, 0.75) },
  { code: "FA4", name: "Women's Amateur 4", gender: "F", rating_below: 725, max_rating: 724, pro_rating_below: 725, category: "amateur", points: pts(3, 2, 1.5, 1, 0.5) },
  { code: "FA40", name: "Women's Amateur 40+", gender: "F", age_min: 40, pro_rating_below: 820, category: "age_protected", points: pts(6, 4, 3, 2, 1) },
  { code: "FA50", name: "Women's Amateur 50+", gender: "F", age_min: 50, pro_rating_below: 805, category: "age_protected", points: pts(4.5, 3, 2.25, 1.5, 0.75) },
  { code: "FA55", name: "Women's Amateur 55+", gender: "F", age_min: 55, pro_rating_below: 795, category: "age_protected", points: pts(4.5, 3, 2.25, 1.5, 0.75) },
  { code: "FA60", name: "Women's Amateur 60+", gender: "F", age_min: 60, pro_rating_below: 790, category: "age_protected", points: pts(3, 2, 1.5, 1, 0.5) },
  { code: "FA65", name: "Women's Amateur 65+", gender: "F", age_min: 65, pro_rating_below: 785, category: "age_protected", points: pts(3, 2, 1.5, 1, 0.5) },
  { code: "FA70", name: "Women's Amateur 70+", gender: "F", age_min: 70, pro_rating_below: 740, category: "age_protected", points: pts(1.5, 1, 0.75, 0.5, 0.5) },
  { code: "FA75", name: "Women's Amateur 75+", gender: "F", age_min: 75, pro_rating_below: 720, category: "age_protected", points: pts(1.5, 1, 0.75, 0.5, 0.5) },
  { code: "FA80", name: "Women's Amateur 80+", gender: "F", age_min: 80, pro_rating_below: 720, category: "age_protected", points: pts(1.5, 1, 0.75, 0.5, 0.5) },

  // ---------------- Juniors (amateur only) ---------------------------------
  { code: "MJ18", name: "Mixed Junior ≤18", gender: "X", age_max: 18, category: "junior", points: pts(6, 4, 3, 2, 1) },
  { code: "MJ15", name: "Mixed Junior ≤15", gender: "X", age_max: 15, category: "junior", points: pts(4.5, 3, 2.25, 1.5, 0.75) },
  { code: "MJ12", name: "Mixed Junior ≤12", gender: "X", age_max: 12, category: "junior", points: pts(3, 2, 1.5, 1, 0.5) },
  { code: "MJ10", name: "Mixed Junior ≤10", gender: "X", age_max: 10, category: "junior", points: pts(1.5, 1, 0.75, 0.5, 0.25) },
  { code: "MJ08", name: "Mixed Junior ≤8", gender: "X", age_max: 8, category: "junior", points: pts(1.5, 1, 0.75, 0.5, 0.25) },
  { code: "MJ06", name: "Mixed Junior ≤6", gender: "X", age_max: 6, category: "junior", points: pts(1.5, 1, 0.75, 0.5, 0.25) },
  { code: "FJ18", name: "Girls' Junior ≤18", gender: "F", age_max: 18, category: "junior", points: pts(6, 4, 3, 2, 1) },
  { code: "FJ15", name: "Girls' Junior ≤15", gender: "F", age_max: 15, category: "junior", points: pts(4.5, 3, 2.25, 1.5, 0.75) },
  { code: "FJ12", name: "Girls' Junior ≤12", gender: "F", age_max: 12, category: "junior", points: pts(3, 2, 1.5, 1, 0.5) },
  { code: "FJ10", name: "Girls' Junior ≤10", gender: "F", age_max: 10, category: "junior", points: pts(1.5, 1, 0.75, 0.5, 0.25) },
  { code: "FJ08", name: "Girls' Junior ≤8", gender: "F", age_max: 8, category: "junior", points: pts(1.5, 1, 0.75, 0.5, 0.25) },
  { code: "FJ06", name: "Girls' Junior ≤6", gender: "F", age_max: 6, category: "junior", points: pts(1.5, 1, 0.75, 0.5, 0.25) },

  // ---------------- Collegiate & scholastic --------------------------------
  { code: "MC1", name: "Mixed Collegiate Division 1", gender: "X", category: "collegiate", points: pts(15, 10, 7.5, 5, 2.5) },
  { code: "MC2", name: "Mixed Collegiate Division 2", gender: "X", category: "collegiate", points: pts(12, 8, 6, 4, 2) },
  { code: "MC3", name: "Mixed Collegiate Division 3", gender: "X", category: "collegiate", points: pts(9, 6, 4.5, 3, 1.5) },
  { code: "FC1", name: "Women's Collegiate Division 1", gender: "F", category: "collegiate", points: pts(9, 6, 4.5, 3, 1.5) },
  { code: "FC2", name: "Women's Collegiate Division 2", gender: "F", category: "collegiate", points: pts(6, 4, 3, 2, 1) },
  { code: "FC3", name: "Women's Collegiate Division 3", gender: "F", category: "collegiate", points: pts(4.5, 3, 2.25, 1.5, 0.75) },
  { code: "MSV", name: "Mixed Scholastic Varsity", gender: "X", category: "scholastic", points: pts(6, 4, 3, 2, 1) },
  { code: "MSJV", name: "Mixed Scholastic Junior Varsity", gender: "X", category: "scholastic", points: pts(4.5, 3, 2.25, 1.5, 0.75) },
  { code: "FSV", name: "Girls' Scholastic Varsity", gender: "F", category: "scholastic", points: pts(6, 4, 3, 2, 1) },
  { code: "FSJV", name: "Girls' Scholastic Junior Varsity", gender: "F", category: "scholastic", points: pts(4.5, 3, 2.25, 1.5, 0.75) },

  // ---------------- Ratings events (flight colors) -------------------------
  { code: "RPA", name: "Gold (Professional division)", gender: "X", required_at_or_above: 970, category: "ratings_event", points: pts(15, 10, 7.5, 5, 2.5) },
  { code: "RAH", name: "Blue", gender: "X", rating_below: 970, max_rating: 969, category: "ratings_event", points: pts(15, 10, 7.5, 5, 2.5) },
  { code: "RAD", name: "White", gender: "X", rating_below: 935, max_rating: 934, category: "ratings_event", points: pts(12, 8, 6, 4, 2) },
  { code: "RAE", name: "Red", gender: "X", rating_below: 900, max_rating: 899, category: "ratings_event", points: pts(9, 6, 4.5, 3, 1.5) },
  { code: "RAF", name: "Green", gender: "X", rating_below: 850, max_rating: 849, category: "ratings_event", points: pts(6, 4, 3, 2, 1) },
  { code: "RAG", name: "Purple", gender: "X", rating_below: 800, max_rating: 799, category: "ratings_event", points: pts(3, 2, 1.5, 1, 0.5) },
];

export const PDGA_DIVISION_BY_CODE: Record<string, PdgaDivision> = Object.fromEntries(
  PDGA_DIVISIONS.map((d) => [d.code, d]),
);

/** Short, player-facing rating requirement for a division. */
export function divisionRatingLabel(d: PdgaDivision): string {
  if (d.category === "pro") return d.min_rating ? `Suggested ${d.min_rating}+` : "Any rating";
  if (d.rating_below) return `Under ${d.rating_below}`;
  if (d.required_at_or_above) return `Any rating — required at ${d.required_at_or_above}+`;
  return "Any rating";
}

export type DivisionEligibilityInput = {
  rating?: number | null;
  /** True once the player has accepted a cash payout (PDGA pro status). */
  hasAcceptedCash?: boolean | null;
  age?: number | null;
};

export type DivisionEligibility = {
  eligible: boolean;
  /** Player-facing explanation when not eligible. */
  reason: string | null;
};

/**
 * Check a player against a division's PDGA requirements.
 *
 * Amateur caps are exclusive: MA3 is under 900, MA2 under 935, MA4 under 850.
 * MA1 has no cap — any rating may play it — but it is required at 935+, and a
 * player who has accepted cash must be under 970 to play MA1.
 */
export function checkDivisionEligibility(
  d: PdgaDivision,
  player: DivisionEligibilityInput,
): DivisionEligibility {
  const rating = typeof player.rating === "number" ? player.rating : null;
  const cash = player.hasAcceptedCash === true;
  const age = typeof player.age === "number" ? player.age : null;

  if (d.age_min && age !== null && age < d.age_min) {
    return { eligible: false, reason: `${d.code} is for players ${d.age_min}+.` };
  }
  if (d.age_max && age !== null && age > d.age_max) {
    return { eligible: false, reason: `${d.code} is for players ${d.age_max} and under.` };
  }
  if (d.category === "junior" && cash) {
    return { eligible: false, reason: "Junior divisions are amateur only." };
  }

  const isAmateurEntry =
    d.category === "amateur" || d.category === "age_protected" || d.category === "ratings_event";

  if (rating !== null && d.rating_below && rating >= d.rating_below) {
    return {
      eligible: false,
      reason: `${d.code} is capped under ${d.rating_below}. At ${rating} you must play up.`,
    };
  }
  if (rating !== null && cash && isAmateurEntry && d.pro_rating_below && rating >= d.pro_rating_below) {
    return {
      eligible: false,
      reason: `You've accepted cash, so ${d.code} requires a rating under ${d.pro_rating_below}.`,
    };
  }
  if (d.category === "pro" && rating !== null && d.min_rating && rating < d.min_rating) {
    return { eligible: true, reason: null }; // suggested minimum only — not enforced
  }
  return { eligible: true, reason: null };
}

/**
 * Lowest amateur division a player qualifies for, given the PDGA caps.
 * Returns null when no listed division fits.
 */
export function suggestedAmateurDivision(
  player: DivisionEligibilityInput,
  gender: "M" | "F" = "M",
): PdgaDivision | null {
  const ladder =
    gender === "F" ? ["FA4", "FA3", "FA2", "FA1"] : ["MA4", "MA3", "MA2", "MA1"];
  for (const code of ladder) {
    const d = PDGA_DIVISION_BY_CODE[code];
    if (d && checkDivisionEligibility(d, player).eligible) return d;
  }
  return null;
}

export const PDGA_TIERS = [
  { code: "XA", label: "XA — Major", player_fee_cents: 1500 },
  { code: "A", label: "A tier", player_fee_cents: 1000 },
  { code: "B", label: "B tier", player_fee_cents: 500 },
  { code: "C", label: "C tier", player_fee_cents: 300 },
  { code: "M", label: "M — Amateur Major", player_fee_cents: 500 },
  { code: "L", label: "L — League sanctioning", player_fee_cents: 200 },
] as const;

// PDGA payout ratios per Tour Standards §3.05.
// Fraction of the division field paid out. Pro / Am uses different defaults.
export const PDGA_PAYOUT_RATIOS = {
  pro: { min: 0.4, standard: 0.45, generous: 0.5 },
  amateur: { min: 0.4, standard: 0.45, generous: 0.5 },
};

// PDGA payout distribution (fraction of division purse per finishing place).
// Approximated from the PDGA payout table for a 40% payout of a 20-player field.
export function pdgaPayoutSlots(fieldSize: number, payoutRatio = 0.45): number[] {
  const paidCount = Math.max(1, Math.round(fieldSize * payoutRatio));
  // Weight function: 1 / (place^0.65) then normalized. Approximates PDGA's curve.
  const weights = Array.from({ length: paidCount }, (_, i) => 1 / Math.pow(i + 1, 0.65));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => w / sum);
}

export const TD_CHECKLIST_TEMPLATE: { phase: "pre" | "day_of" | "post"; label: string }[] = [
  // Pre-event
  { phase: "pre", label: "Reserve course & required parking with land manager" },
  { phase: "pre", label: "Confirm PDGA sanctioning approval and event number" },
  { phase: "pre", label: "Purchase / arrange event insurance (COI on file)" },
  { phase: "pre", label: "Order players' packs, discs, and CTP prizes" },
  { phase: "pre", label: "Recruit certified officials (at least one per event)" },
  { phase: "pre", label: "Publish event page with rules, tee times, & policies" },
  { phase: "pre", label: "Open online registration & waitlist" },
  { phase: "pre", label: "Print scorecards / cardboards & pin sheets" },
  { phase: "pre", label: "Confirm scoring tablets / phones charged & synced" },
  { phase: "pre", label: "Send pre-event email with schedule, parking, and layout" },
  { phase: "pre", label: "Post OB, mando, and drop-zone markings on course" },
  // Day of
  { phase: "day_of", label: "Set up TD table, check-in stations, and signage" },
  { phase: "day_of", label: "Player check-in & PDGA number verification" },
  { phase: "day_of", label: "Collect signed liability waivers" },
  { phase: "day_of", label: "Hold players' meeting: rules, OB, safety, timing" },
  { phase: "day_of", label: "Distribute players' packs and cards" },
  { phase: "day_of", label: "Shotgun / first tee time on schedule" },
  { phase: "day_of", label: "Monitor pace of play & respond to rules calls" },
  { phase: "day_of", label: "Collect & verify scorecards after each round" },
  { phase: "day_of", label: "Post round scores to leaderboard within 30 min" },
  { phase: "day_of", label: "Announce final results and hand out payouts" },
  // Post
  { phase: "post", label: "Submit results & ratings report to PDGA within 5 days" },
  { phase: "post", label: "Reconcile entry fees, sanctioning fees, and payouts" },
  { phase: "post", label: "Send thank-you email with survey & photos" },
  { phase: "post", label: "Return course to pre-event condition (remove markings)" },
  { phase: "post", label: "Archive scorecards & waivers for one calendar year" },
];

export const TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
