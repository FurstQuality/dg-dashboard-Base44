/**
 * Tournament & PDGA scheduling knowledge base.
 *
 * Used by the Player Tracker (and any other schedule-aware surface) to reason
 * about whether two events on the same date actually overlap in wall-clock
 * time, or if they're spaced far enough apart to be reasonably playable.
 *
 * Sources / rationale:
 * - PDGA Competition Manual (event tiers, sanctioning basics)
 * - PDGA Tour structure (Majors, Elite Series, Silver Series, DGPT)
 * - UDisc / Disc Golf Scene event flow (flex start, singles league, etc.)
 * - Common field experience: 18 holes ≈ 2.0h solo / 2.5h pairs / 3.0-3.5h
 *   full card of 4-5 with a full field pushing 4h on hard courses.
 *
 * Numbers are heuristics, not guarantees — the tracker uses them to filter
 * out false-positive "double booked" alerts, not to promise a schedule.
 */

// ---------------------------------------------------------------------------
// Round timing baselines
// ---------------------------------------------------------------------------

/** Typical wall-clock time for a single 18-hole round, in hours. */
export const ROUND_HOURS = {
  fast: 2.0, // solo or 2-player card, open course
  typical: 3.0, // 3-4 player card, tournament pace
  slow: 4.0, // full 5-card, tight/wooded course, big field
} as const;

/** Default assumed duration when we don't know card size or course density. */
export const DEFAULT_ROUND_HOURS = 3.0;

/** Lunch break between rounds at a standard 2-round tournament. */
export const LUNCH_BREAK_HOURS = 1.0;

/** Awards ceremony tacked onto the end of the final round. */
export const AWARDS_CEREMONY_HOURS = 0.5;

/**
 * Minimum gap between the END of one round and the START of the next before
 * the tracker will call two same-day events a scheduling conflict.
 *
 * A round takes 2-4h; if two events finish and start >= this many hours
 * apart, the player has time to travel/rest and it is not a conflict.
 */
export const CONFLICT_MIN_GAP_HOURS = 3.0;

// ---------------------------------------------------------------------------
// PDGA / event format knowledge
// ---------------------------------------------------------------------------

export type EventFormat =
  | "flex_start" // rolling tee times, 1 round, ~4h window
  | "singles_league" // weekly league, 1 round, evening
  | "one_round" // single-round event (mini, monthly, one-day C-tier)
  | "two_round_day" // classic 2-round-in-a-day tournament
  | "two_day" // 2 days, typically 1 round/day (some 3+ round variants)
  | "three_day" // A-tier / NT / Major style
  | "match_play" // bracket, variable
  | "doubles" // doubles, usually 1-2 rounds
  | "unknown";

/**
 * PDGA sanctioning tiers. Ordered roughly by prestige/field size.
 * See PDGA Competition Manual §1.03 and the current Tour structure.
 */
export type PdgaTier =
  | "XA" // Major (World Championships, USDGC, EPC, Masters Worlds, Champions Cup)
  | "M" // Legacy "Major" label — treated as XA
  | "A" // A-tier (National Tour caliber, 3+ rounds typical)
  | "B" // B-tier (2 rounds/day common, 2-day format)
  | "C" // C-tier (single or 2-round one-day events)
  | "L" // League (weekly, ongoing)
  | "XM" // Elite Series / DGPT Silver / DGPT Elite
  | "XE" // Elite+ / DGPT Elite+
  | "XC" // X-Tier / non-rating (doubles, glow, alt formats) — PDGA-listed but does NOT count toward PDGA rating
  | "unsanctioned"
  | "unknown";

export interface TierInfo {
  tier: PdgaTier;
  label: string;
  typicalRounds: number;
  typicalDays: number;
  /** True when the round is a rolling flex start (no shotgun/tee-time wave). */
  flex: boolean;
  /** Notes surfaced in the UI knowledge popover. */
  notes: string;
}

export const TIER_INFO: Record<PdgaTier, TierInfo> = {
  XA: {
    tier: "XA",
    label: "Major",
    typicalRounds: 4,
    typicalDays: 4,
    flex: false,
    notes:
      "PDGA Major (Worlds, USDGC, Champions Cup, EPC). 4+ rounds, shotgun or tee waves, multi-day.",
  },
  M: {
    tier: "M",
    label: "Major (legacy)",
    typicalRounds: 4,
    typicalDays: 4,
    flex: false,
    notes: "Legacy Major designation — treat as XA.",
  },
  A: {
    tier: "A",
    label: "A-Tier",
    typicalRounds: 3,
    typicalDays: 3,
    flex: false,
    notes: "A-Tier: 3 rounds typical (Fri/Sat/Sun), assigned tee times, PDGA rating counts.",
  },
  B: {
    tier: "B",
    label: "B-Tier",
    typicalRounds: 3,
    typicalDays: 2,
    flex: false,
    notes: "B-Tier: usually 2 rounds Saturday (AM + PM with lunch) + 1 round Sunday.",
  },
  C: {
    tier: "C",
    label: "C-Tier",
    typicalRounds: 2,
    typicalDays: 1,
    flex: false,
    notes: "C-Tier: often a one-day 2-round event (~6h with lunch) or a single-round flex.",
  },
  L: {
    tier: "L",
    label: "League",
    typicalRounds: 1,
    typicalDays: 1,
    flex: true,
    notes: "PDGA-sanctioned league. Weekly, evening, ~2-3h; ratings pool over the season.",
  },
  XM: {
    tier: "XM",
    label: "Elite Series",
    typicalRounds: 4,
    typicalDays: 4,
    flex: false,
    notes: "DGPT Silver / Elite Series. Multi-day, 4 rounds, tee times set by pool.",
  },
  XE: {
    tier: "XE",
    label: "Elite+",
    typicalRounds: 4,
    typicalDays: 4,
    flex: false,
    notes: "DGPT Elite+. Highest DGPT stop tier. Multi-day, 4 rounds.",
  },
  XC: {
    tier: "XC",
    label: "X-Tier (non-rating)",
    typicalRounds: 1,
    typicalDays: 1,
    flex: true,
    notes: "PDGA-listed but does NOT count toward PDGA rating (doubles, glow, alt formats).",
  },
  unsanctioned: {
    tier: "unsanctioned",
    label: "Unsanctioned",
    typicalRounds: 1,
    typicalDays: 1,
    flex: true,
    notes: "Not PDGA-sanctioned. Format varies — treat as a single round unless noted.",
  },

  unknown: {
    tier: "unknown",
    label: "Unknown",
    typicalRounds: 1,
    typicalDays: 1,
    flex: false,
    notes: "Format unknown — assume 1 round of ~3h until you sync more detail.",
  },
};

/** Parse a free-text tier string into a canonical PdgaTier. */
export function normalizeTier(raw: string | null | undefined): PdgaTier {
  if (!raw) return "unknown";
  const s = raw.trim().toUpperCase();
  if (s === "XA" || s === "MAJOR" || s === "MAJORS") return "XA";
  if (s === "M") return "M";
  if (s === "A" || s === "A-TIER" || s === "ATIER") return "A";
  if (s === "B" || s === "B-TIER" || s === "BTIER") return "B";
  if (s === "C" || s === "C-TIER" || s === "CTIER") return "C";
  if (s === "L" || s === "LEAGUE") return "L";
  if (s === "XM" || s.includes("SILVER") || s.includes("ELITE SERIES")) return "XM";
  if (s === "XE" || s.includes("ELITE+") || s === "ELITE PLUS") return "XE";
  if (s === "XC" || s === "X-TIER" || s === "XTIER" || s === "X") return "XC";
  if (s.includes("UNSANCT")) return "unsanctioned";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Sanctioning classification (single source of truth)
// ---------------------------------------------------------------------------

/**
 * PDGA-rating-eligible tiers. Doubles events at any of these tiers are still
 * excluded — the doubles check happens in `isPdgaSanctioned`.
 */
export const SANCTIONED_TIERS: ReadonlySet<PdgaTier> = new Set([
  "XA",
  "M",
  "A",
  "B",
  "C",
  "L",
  "XM",
  "XE",
]);

export type EventSource = "chainlink" | "pdga" | "udisc" | "scene" | "community";

/**
 * Canonical rule: a round only updates a PDGA rating when the event is
 * PDGA-sanctioned. Sanctioned = PDGA source (real PDGA row, or DGD tournament
 * with `pdga_sanctioned === true`), tier ∈ SANCTIONED_TIERS, and the event is
 * not a doubles format.
 */
export function isPdgaSanctioned(input: {
  source: EventSource;
  tier?: string | null;
  format?: string | null;
  title?: string | null;
  /** Only meaningful for DGD-hosted tournaments — the `tournaments.pdga_sanctioned` flag. */
  pdga_sanctioned?: boolean | null;
}): boolean {
  const isPdgaSource =
    input.source === "pdga" || (input.source === "chainlink" && !!input.pdga_sanctioned);
  if (!isPdgaSource) return false;

  const tier = normalizeTier(input.tier);
  if (!SANCTIONED_TIERS.has(tier)) return false;

  const fmt = (input.format ?? "").toLowerCase();
  if (fmt === "doubles" || /doubles?/i.test(fmt)) return false;

  const name = `${input.title ?? ""} ${input.tier ?? ""}`;
  if (/doubles?/i.test(name)) return false;

  return true;
}

export type EventBucket = "sanctioned" | "unsanctioned" | "casual";

/**
 * Bucket an event into `sanctioned | unsanctioned | casual`.
 * - Casual = DGD-native casual rounds and community events (cleanups, meetups,
 *   group rounds, clinics).
 * - Sanctioned = passes `isPdgaSanctioned`.
 * - Everything else competitive resolves to unsanctioned.
 */
export function classifyEvent(input: {
  source: EventSource;
  kind: "tournament" | "league" | "casual";
  tier?: string | null;
  format?: string | null;
  title?: string | null;
  pdga_sanctioned?: boolean | null;
}): EventBucket {
  if (input.kind === "casual" || input.source === "community") return "casual";
  return isPdgaSanctioned(input) ? "sanctioned" : "unsanctioned";
}

// ---------------------------------------------------------------------------
// Event format inference
// ---------------------------------------------------------------------------

/**
 * Best-effort inference of event format from the name, tier, and round count.
 * Prefers explicit signals ("flex", "league", round count) over defaults.
 */
export function inferFormat(input: {
  name?: string | null;
  tier?: string | null;
  roundsOnDate?: number; // number of rounds scheduled on this specific date
  totalRounds?: number; // total rounds across the event
}): EventFormat {
  const name = (input.name ?? "").toLowerCase();
  const tier = normalizeTier(input.tier);

  if (/\bflex\b/.test(name)) return "flex_start";
  if (/\bleague\b/.test(name) || tier === "L") return "singles_league";
  if (/\bmatch\s*play\b/.test(name)) return "match_play";
  if (/\bdoubles?\b/.test(name)) return "doubles";

  if (input.roundsOnDate && input.roundsOnDate >= 2) return "two_round_day";

  if (tier === "XA" || tier === "M" || tier === "XE" || tier === "XM") return "three_day";
  if (tier === "A") return "three_day";
  if (tier === "B") return "two_day";
  if (tier === "C") {
    return (input.totalRounds ?? 2) >= 2 ? "two_round_day" : "one_round";
  }

  return "one_round";
}

// ---------------------------------------------------------------------------
// Wall-clock window estimation
// ---------------------------------------------------------------------------

export interface TimeWindow {
  /** Milliseconds since epoch. */
  startMs: number;
  endMs: number;
  /** Assumed duration in hours (endMs - startMs). */
  hours: number;
  /** True when we had to guess the start time (no tee_time known). */
  startAssumed: boolean;
}

/** Parse `"HH:MM"` / `"H:MM AM"` / ISO strings into a Date on `dateISO`. */
function parseTeeTime(dateISO: string, teeTime: string | null | undefined): Date | null {
  if (!dateISO) return null;
  const base = new Date(`${dateISO}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;

  if (!teeTime) return null;
  const trimmed = teeTime.trim();

  // Full ISO timestamp
  if (/T\d{2}:\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // "9:30 AM" / "13:45" / "1:45 PM" / canonical stored "13:45:00"
  const m = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|A|P)?\.?$/i);
  if (!m) return null;

  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3]?.toUpperCase();
  if (ampm?.startsWith("P") && h < 12) h += 12;
  if (ampm?.startsWith("A") && h === 12) h = 0;

  const d = new Date(base);
  d.setHours(h, min, 0, 0);
  return d;
}

/**
 * Estimate the wall-clock window a player will be at a given event on a given
 * date. Uses tee_time when present, otherwise falls back to format defaults.
 *
 * - Flex start: window is round length + 4h flex window
 * - Two-round day: round + lunch + round (~6h)
 * - League: evening, ~2.5h
 * - Everything else: single ~3h round
 */
export function estimateEventWindow(input: {
  dateISO: string;
  teeTime?: string | null;
  format: EventFormat;
  roundsOnDate?: number;
}): TimeWindow | null {
  const roundsToday = Math.max(1, input.roundsOnDate ?? (input.format === "two_round_day" ? 2 : 1));

  const roundHours = DEFAULT_ROUND_HOURS;
  const playHours =
    input.format === "two_round_day"
      ? roundHours * 2 + LUNCH_BREAK_HOURS + AWARDS_CEREMONY_HOURS
      : input.format === "singles_league"
        ? 2.5
        : roundsToday >= 2
          ? roundHours * roundsToday + LUNCH_BREAK_HOURS * (roundsToday - 1) + AWARDS_CEREMONY_HOURS
          : roundHours;

  const parsed = parseTeeTime(input.dateISO, input.teeTime);
  let start: Date;
  let startAssumed = false;

  if (parsed) {
    start = parsed;
  } else {
    // Default start-of-play by format when no tee_time is known.
    const base = new Date(`${input.dateISO}T00:00:00`);
    if (Number.isNaN(base.getTime())) return null;
    let defaultHour = 9; // most tournaments start 8-10 AM
    if (input.format === "flex_start") defaultHour = 8; // flex opens early
    if (input.format === "singles_league") defaultHour = 17; // league is evening
    if (input.format === "two_round_day") defaultHour = 8;
    if (input.format === "three_day") defaultHour = 9;
    base.setHours(defaultHour, 0, 0, 0);
    start = base;
    startAssumed = true;
  }

  // Flex format: the player picks a start inside a ~4h flex window, but they
  // still only occupy `playHours`. For conflict detection we treat the flex
  // window as an extended "busy" window because we don't know when they'll go.
  const busyHours = input.format === "flex_start" && startAssumed ? playHours + 4 : playHours;

  const startMs = start.getTime();
  const endMs = startMs + busyHours * 60 * 60 * 1000;
  return { startMs, endMs, hours: busyHours, startAssumed };
}

// ---------------------------------------------------------------------------
// Conflict evaluation
// ---------------------------------------------------------------------------

export type ConflictSeverity = "error" | "warning" | "ok";

export interface ConflictEvaluation {
  severity: ConflictSeverity;
  /** Human-readable, non-technical explanation of the schedule math. */
  reason: string;
  /** Gap in hours between the two windows (negative when they overlap). */
  gapHours: number;
}

/**
 * Decide whether two events on the same date are a real conflict.
 *
 * Rules:
 * - Windows overlap → hard conflict (error).
 * - Gap between them < CONFLICT_MIN_GAP_HOURS → warning (tight).
 * - Gap >= CONFLICT_MIN_GAP_HOURS → not a conflict (ok).
 * - If both windows had assumed start times (no tee_time), we degrade a hard
 *   overlap to a warning so we don't cry wolf on unknown schedules.
 */
export function evaluateSameDayConflict(a: TimeWindow, b: TimeWindow): ConflictEvaluation {
  const [first, second] = a.startMs <= b.startMs ? [a, b] : [b, a];
  const gapMs = second.startMs - first.endMs;
  const gapHours = gapMs / (60 * 60 * 1000);

  const bothAssumed = first.startAssumed && second.startAssumed;

  if (gapHours < 0) {
    return {
      severity: bothAssumed ? "warning" : "error",
      gapHours,
      reason: bothAssumed
        ? `Both events lack a set tee time — assumed windows overlap by ~${Math.abs(gapHours).toFixed(1)}h. Confirm tee times.`
        : `Rounds overlap by ~${Math.abs(gapHours).toFixed(1)}h. Player can't play both.`,
    };
  }

  if (gapHours < CONFLICT_MIN_GAP_HOURS) {
    return {
      severity: "warning",
      gapHours,
      reason: `Only ~${gapHours.toFixed(1)}h between rounds. A round takes 2-4h — this is tight.`,
    };
  }

  return {
    severity: "ok",
    gapHours,
    reason: `~${gapHours.toFixed(1)}h between rounds — plenty of buffer (a round takes 2-4h).`,
  };
}

// ---------------------------------------------------------------------------
// Knowledge summary (for UI display)
// ---------------------------------------------------------------------------

export interface FormatSummary {
  key: EventFormat;
  label: string;
  duration: string;
  detail: string;
}

export const FORMAT_SUMMARIES: FormatSummary[] = [
  {
    key: "flex_start",
    label: "Flex start",
    duration: "~3h round in a 4-6h flex window",
    detail:
      "Rolling tee times. Players pick a start inside the window. 1 round, PDGA rating-eligible if sanctioned.",
  },
  {
    key: "singles_league",
    label: "Singles league",
    duration: "~2.5h, weekday evening",
    detail: "PDGA L-tier. Weekly league, ratings pool over the season, casual social format.",
  },
  {
    key: "one_round",
    label: "One-round tournament",
    duration: "~3h + check-in/awards",
    detail: "Common for C-tier one-day events and monthlies. Single tee time, one round.",
  },
  {
    key: "two_round_day",
    label: "Two-round day",
    duration: "~6h with a 1h lunch",
    detail: "Standard C/B-tier Saturday: AM round → lunch → PM round. Early start (8-9 AM).",
  },
  {
    key: "two_day",
    label: "Two-day tournament",
    duration: "1-2 rounds/day, 2 days",
    detail: "Typical B-tier: 2 rounds Sat + 1 round Sun. Assigned tee times each round.",
  },
  {
    key: "three_day",
    label: "Three-day / A-tier+",
    duration: "1 round/day × 3-4 days",
    detail: "A-tier, Elite Series, and Majors. Full field, pool splits, PDGA rating counts.",
  },
  {
    key: "match_play",
    label: "Match play",
    duration: "Variable (bracket rounds)",
    detail: "Head-to-head brackets. Duration depends on advancement.",
  },
  {
    key: "doubles",
    label: "Doubles",
    duration: "~2-3h per round",
    detail: "Two-player teams. Best shot / alt shot / worst shot variants.",
  },
  {
    key: "unknown",
    label: "Unknown format",
    duration: "Assume ~3h",
    detail: "Format not detected — treat as a single round until sync fills in details.",
  },
];
