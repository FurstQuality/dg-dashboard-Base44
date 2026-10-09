/**
 * Shared event-setup contract for tournaments and leagues.
 *
 * One source of truth for the questions a TD answers when standing up an
 * event: play format, sign-up, scoring, rules of play, and the optional
 * extras players filter on. Both wizards and both advanced edit screens
 * import from here so the unions never drift.
 */

import type { StandingsStyle } from "@/lib/competition-model";
import type { EventFees } from "@/lib/event-fees";
import { DEFAULT_HANDICAP_CONFIG, type HandicapConfig } from "@/lib/handicap";

export type FormatFamily = "singles" | "doubles" | "teams";
export type PairingMethod = "chosen" | "random_draw" | "blind_draw" | "individual";
export type PlayStyle =
  | "best_shot"
  | "worst_shot"
  | "alternate_shot"
  | "modified"
  | "scramble"
  | "own_shot";
/**
 * How players get into an event.
 * - `casual`: walk-ups only, no pre-registration.
 * - `hybrid`: pre-registration plus walk-ups at check-in.
 * - `formal`: pre-registration only; the field locks at the closing time.
 */
export type SignupType = "casual" | "hybrid" | "formal";

export const SIGNUP_TYPE_OPTIONS: {
  value: SignupType;
  label: string;
  blurb: string;
}[] = [
  {
    value: "casual",
    label: "Walk-ups only",
    blurb: "No sign-up list. Players show up and check in on site.",
  },
  {
    value: "hybrid",
    label: "Pre-registration and walk-ups",
    blurb: "Players can register ahead of time, and you still take walk-ups at check-in.",
  },
  {
    value: "formal",
    label: "Pre-registration only",
    blurb: "The field locks at your closing time. No walk-ups on event day.",
  },
];

/** Human label for a stored `signup_type` value, tolerant of legacy rows. */
export function signupModeLabel(value: string | null | undefined): string {
  return (
    SIGNUP_TYPE_OPTIONS.find((o) => o.value === normalizeSignupType(value))?.label ??
    "Pre-registration and walk-ups"
  );
}

/**
 * Legacy rows stored only `casual` or `formal`. A stored `formal` without a
 * closing time keeps taking walk-ups (reads as `hybrid`) so existing events
 * don't start turning players away.
 */
export function normalizeSignupType(
  value: string | null | undefined,
  opts?: { registrationCloses?: string | null },
): SignupType {
  if (value === "casual") return "casual";
  if (value === "hybrid") return "hybrid";
  if (value === "formal") {
    if (opts && !opts.registrationCloses) return "hybrid";
    return "formal";
  }
  return "hybrid";
}

/** Does this event accept players who aren't pre-registered? */
export function allowsWalkUps(
  value: string | null | undefined,
  opts?: { registrationCloses?: string | null },
): boolean {
  return normalizeSignupType(value, opts) !== "formal";
}

/** Does this event collect pre-registrations at all? */
export function allowsPreRegistration(value: string | null | undefined): boolean {
  return normalizeSignupType(value) !== "casual";
}

/** Pre-registration-only events must publish a closing date/time. */
export function requiresPreRegClose(value: string | null | undefined): boolean {
  return value === "formal";
}
export type Visibility = "public" | "private";
export type ScoringMode = "stroke_play" | "points" | "match_play";
export type CardCreation = "players_and_admin" | "admin_only";
export type StatsMode = "standard" | "off";
export type Tiebreaker = "playoff" | "sudden_death" | "card_off" | "count_back" | "shared";
export type StartFormat = "shotgun" | "tee_times" | "flex_start";
export type EventTemplate = "casual" | "formal" | "casual_multi_day" | "advanced";

export interface EventExtra {
  enabled: boolean;
  notes: string;
}

/** Rules-of-play answers stored inside the `setup` jsonb column. */
export interface EventRules {
  rules_edition: string;
  ob_notes: string;
  mando_notes: string;
  mulligans: string;
  pace_of_play: string;
  carts: string;
  pets: string;
  alcohol: string;
  weather_policy: string;
}

export type ExtraKey =
  | "ace_pool"
  | "bag_tags"
  | "beginner_friendly"
  | "charity"
  | "drinking_water"
  | "women_friendly"
  | "glow"
  | "junior_friendly"
  | "parking"
  | "restrooms"
  | "ctp"
  | "longest_drive"
  | "skins"
  | "raffle";

export interface EventSetupState {
  event_template: EventTemplate;
  format_family: FormatFamily;
  team_size: number | null;
  pairing_method: PairingMethod;
  play_style: PlayStyle;
  signup_type: SignupType;
  visibility: Visibility;
  scoring_mode: ScoringMode;
  card_creation: CardCreation;
  stats_mode: StatsMode;
  handicap_enabled: boolean;
  /** How the handicap is calculated when handicap_enabled is on. */
  handicap: HandicapConfig;
  tiebreaker: Tiebreaker;
  card_selection_required: boolean;
  reentry_allowed: boolean;
  scorecard_message: string;
  /**
   * Multi-course events: scorecard notes for one course, keyed by course id.
   * Shown on that course's cards in addition to scorecard_message.
   */
  course_notes: Record<string, string>;
  rules: EventRules;
  extras: Record<ExtraKey, EventExtra>;
}

export const EXTRA_FIELDS: {
  key: ExtraKey;
  label: string;
  question: string;
  notesLabel?: string;
}[] = [
  {
    key: "ace_pool",
    label: "Ace pool",
    question: "Is there a public ace pot players can buy into?",
    notesLabel: "Buy-in and carry-over rules",
  },
  {
    key: "ctp",
    label: "Closest to the pin",
    question: "Are you running CTPs?",
    notesLabel: "Which holes, and what the prize is",
  },
  {
    key: "longest_drive",
    label: "Longest drive",
    question: "Is there a longest-drive contest?",
    notesLabel: "Hole and division rules",
  },
  {
    key: "skins",
    label: "Skins",
    question: "Are players competing for skins?",
    notesLabel: "Buy-in and carry rules",
  },
  {
    key: "raffle",
    label: "Raffle",
    question: "Will there be a raffle?",
    notesLabel: "Ticket price and prizes",
  },
  {
    key: "bag_tags",
    label: "Bag tags",
    question: "Do players compete for numbered tags?",
    notesLabel: "Tag rules",
  },
  {
    key: "beginner_friendly",
    label: "Beginner friendly",
    question: "Are there recreational or junior divisions on a forgiving layout?",
  },
  {
    key: "charity",
    label: "For charity",
    question: "Are profits being donated?",
    notesLabel: "Who benefits",
  },
  {
    key: "drinking_water",
    label: "Drinking water",
    question: "Is drinking water provided or available on site?",
  },
  {
    key: "women_friendly",
    label: "Women/girl friendly",
    question: "Prizes for women's divisions, modified pars, restrooms on course?",
  },
  {
    key: "junior_friendly",
    label: "Junior friendly",
    question: "Prizes for junior divisions, modified pars or holes?",
  },
  { key: "glow", label: "Glow", question: "Will any round be played after dark?" },
  {
    key: "parking",
    label: "Parking",
    question: "Anything players need to know about parking or directions?",
    notesLabel: "Where to park",
  },
  {
    key: "restrooms",
    label: "Restrooms",
    question: "Are restrooms nearby, and where?",
    notesLabel: "Where to find them",
  },
];

export const FORMAT_FAMILY_OPTIONS: { value: FormatFamily; label: string; blurb: string }[] = [
  { value: "singles", label: "Singles", blurb: "Every player keeps their own score." },
  { value: "doubles", label: "Doubles", blurb: "Two players share one score." },
  { value: "teams", label: "Teams", blurb: "Three or more players share one score." },
];

export const PAIRING_OPTIONS: { value: PairingMethod; label: string; blurb: string }[] = [
  {
    value: "chosen",
    label: "Players pick their partners",
    blurb: "Sign-ups coordinate who is on their team.",
  },
  {
    value: "random_draw",
    label: "Random draw",
    blurb: "Everyone registers alone; you draw teams at check-in.",
  },
  {
    value: "blind_draw",
    label: "Blind draw",
    blurb: "Partners are drawn without regard to rating or division.",
  },
  { value: "individual", label: "Individual sign-up", blurb: "No teams — everyone plays alone." },
];

export const PLAY_STYLE_OPTIONS: { value: PlayStyle; label: string; blurb: string }[] = [
  { value: "own_shot", label: "Own shot", blurb: "Each player plays their own disc all the way in." },
  { value: "best_shot", label: "Best shot", blurb: "Team throws from the better lie every shot." },
  { value: "worst_shot", label: "Worst shot", blurb: "Team plays from the worse lie every shot." },
  {
    value: "alternate_shot",
    label: "Alternate shot",
    blurb: "Partners take turns throwing one disc.",
  },
  {
    value: "modified",
    label: "Modified (tee off, then best shot)",
    blurb: "Both throw from the tee, then play best shot in.",
  },
  { value: "scramble", label: "Tournament scramble", blurb: "Best shot with a per-player minimum." },
];

export const SCORING_MODE_OPTIONS: { value: ScoringMode; label: string; blurb: string }[] = [
  { value: "stroke_play", label: "Stroke play", blurb: "Total throws decide the standings." },
  { value: "points", label: "Points", blurb: "Finish position earns season points." },
  { value: "match_play", label: "Match play", blurb: "Head-to-head, hole by hole." },
];

export const START_FORMAT_OPTIONS: { value: StartFormat; label: string; blurb: string }[] = [
  { value: "shotgun", label: "Shotgun start", blurb: "Everyone starts at once from a spread hole." },
  { value: "tee_times", label: "Tee times", blurb: "Each card gets an assigned start time." },
  {
    value: "flex_start",
    label: "Flex start",
    blurb: "Players tee off any time inside the window.",
  },
];

export const TIEBREAKER_OPTIONS: { value: Tiebreaker; label: string; blurb: string }[] = [
  { value: "playoff", label: "Playoff holes", blurb: "Tied players play a set playoff sequence." },
  { value: "sudden_death", label: "Sudden death", blurb: "First player to win a hole takes it." },
  { value: "card_off", label: "Card-off / putt-off", blurb: "Settled with a putting contest." },
  { value: "count_back", label: "Count back", blurb: "Best final-round score wins the tie." },
  { value: "shared", label: "Share the position", blurb: "Ties stand; prizes are split." },
];

export const CARD_CREATION_OPTIONS: { value: CardCreation; label: string; blurb: string }[] = [
  {
    value: "players_and_admin",
    label: "Players and event staff",
    blurb: "Players build their own cards at check-in.",
  },
  {
    value: "admin_only",
    label: "Event staff only",
    blurb: "You build every card; players keep score but can't change cardmates.",
  },
];

export const TEMPLATE_OPTIONS: {
  value: EventTemplate;
  label: string;
  bullets: string[];
}[] = [
  {
    value: "casual",
    label: "Casual sign-up",
    bullets: ["Players check in and build their own cards", "One day, one layout", "Fastest setup"],
  },
  {
    value: "formal",
    label: "Formal sign-up",
    bullets: ["Players pre-register", "You build the cards", "Supports tee times and card picks"],
  },
  {
    value: "casual_multi_day",
    label: "Casual multi-day",
    bullets: ["Players check in each day", "Several rounds across days", "No recurrence"],
  },
  {
    value: "advanced",
    label: "Advanced event",
    bullets: ["Multiple rounds, layouts, and pools", "Private events", "Full division control"],
  },
];

function emptyExtras(): Record<ExtraKey, EventExtra> {
  const out = {} as Record<ExtraKey, EventExtra>;
  for (const f of EXTRA_FIELDS) out[f.key] = { enabled: false, notes: "" };
  return out;
}

export function defaultEventSetup(kind: "tournament" | "league"): EventSetupState {
  return {
    event_template: kind === "league" ? "casual" : "formal",
    format_family: "singles",
    team_size: null,
    pairing_method: "individual",
    play_style: "own_shot",
    signup_type: kind === "league" ? "casual" : "hybrid",
    visibility: "public",
    scoring_mode: kind === "league" ? "points" : "stroke_play",
    card_creation: kind === "league" ? "players_and_admin" : "admin_only",
    stats_mode: "standard",
    handicap_enabled: false,
    handicap: { ...DEFAULT_HANDICAP_CONFIG },
    tiebreaker: kind === "league" ? "shared" : "playoff",
    card_selection_required: false,
    reentry_allowed: false,
    scorecard_message: "",
    course_notes: {},
    rules: {
      rules_edition: "PDGA Official Rules of Disc Golf",
      ob_notes: "",
      mando_notes: "",
      mulligans: "",
      pace_of_play: "",
      carts: "",
      pets: "",
      alcohol: "",
      weather_policy: "",
    },
    extras: emptyExtras(),
  };
}

/** Defaults a chosen template implies. Anything the TD changes afterward wins. */
export function applyTemplate(state: EventSetupState, template: EventTemplate): EventSetupState {
  const next: EventSetupState = { ...state, event_template: template };
  if (template === "casual" || template === "casual_multi_day") {
    next.signup_type = "casual";
    next.card_creation = "players_and_admin";
    next.card_selection_required = false;
  }
  if (template === "formal") {
    next.signup_type = "hybrid";
    next.card_creation = "admin_only";
  }
  if (template === "advanced") {
    next.signup_type = "formal";
    next.card_creation = "admin_only";
    next.handicap_enabled = false;
  }
  return next;
}

/** Team play forces a shared score, so stats and handicaps come off. */
export function normalizeSetup(state: EventSetupState): EventSetupState {
  const next = { ...state };
  if (next.format_family === "singles") {
    next.team_size = null;
    next.pairing_method = "individual";
    next.play_style = "own_shot";
  } else {
    if (next.pairing_method === "individual") next.pairing_method = "random_draw";
    if (next.play_style === "own_shot") next.play_style = "best_shot";
    next.team_size = next.format_family === "doubles" ? 2 : Math.max(3, next.team_size ?? 3);
    next.handicap_enabled = false;
    next.stats_mode = "off";
  }
  if (next.signup_type === "casual") next.card_selection_required = false;
  if (!next.course_notes || typeof next.course_notes !== "object") next.course_notes = {};
  return next;
}

/** Flat column values for the tournaments/leagues row. */
export function setupToColumns(
  state: EventSetupState,
  extra?: { schedule?: LeagueSchedule; fees?: EventFees },
) {
  const s = normalizeSetup(state);
  return {
    event_template: s.event_template,
    format_family: s.format_family,
    team_size: s.team_size,
    pairing_method: s.pairing_method,
    play_style: s.play_style,
    signup_type: s.signup_type,
    visibility: s.visibility,
    scoring_mode: s.scoring_mode,
    card_creation: s.card_creation,
    stats_mode: s.stats_mode,
    handicap_enabled: s.handicap_enabled,
    tiebreaker: s.tiebreaker,
    card_selection_required: s.card_selection_required,
    reentry_allowed: s.reentry_allowed,
    scorecard_message: s.scorecard_message || null,
    setup: JSON.parse(
      JSON.stringify({
        rules: s.rules,
        extras: s.extras,
        handicap: s.handicap,
        course_notes: s.course_notes,
        ...(extra?.schedule ? { schedule: serializeSchedule(extra.schedule) } : {}),
        ...(extra?.fees ? { fees: extra.fees } : {}),
      }),
    ) as never,
  };
}


/**
 * The format and rules in force when a league night or tournament round is
 * created. Stored on the night/round so later setup edits don't rewrite the
 * history of play that already happened.
 */
export function rulesSnapshot(state: EventSetupState) {
  const s = normalizeSetup(state);
  return JSON.parse(
    JSON.stringify({
      captured_at: new Date().toISOString(),
      format_family: s.format_family,
      pairing_method: s.pairing_method,
      play_style: s.play_style,
      team_size: s.team_size,
      scoring_mode: s.scoring_mode,
      tiebreaker: s.tiebreaker,
      handicap_enabled: s.handicap_enabled,
      handicap: s.handicap_enabled ? s.handicap : null,
      reentry_allowed: s.reentry_allowed,
      stats_mode: s.stats_mode,
      rules: s.rules,
      course_notes: s.course_notes,
    }),
  ) as never;
}

/** Legacy `format` column value so older screens keep reading something sane. */
export function legacyFormat(
  state: EventSetupState,
): "stroke_play" | "match_play" | "best_shot" | "doubles" {
  const s = normalizeSetup(state);
  if (s.scoring_mode === "match_play") return "match_play";
  if (s.format_family === "doubles" || s.format_family === "teams") {
    return s.play_style === "best_shot" || s.play_style === "scramble" ? "best_shot" : "doubles";
  }
  return "stroke_play";
}

export interface SetupCheck {
  label: string;
  pass: boolean;
}

/** Publish-readiness checks for the setup answers alone. */
export function setupChecks(state: EventSetupState): SetupCheck[] {
  const s = normalizeSetup(state);
  return [
    {
      label: "Play format chosen",
      pass: s.format_family === "singles" || (!!s.team_size && s.team_size >= 2),
    },
    {
      label: "Team formation set for team play",
      pass: s.format_family === "singles" || s.pairing_method !== "individual",
    },
    { label: "Scoring method and tie-breaker set", pass: !!s.scoring_mode && !!s.tiebreaker },
    { label: "Rules of play named", pass: s.rules.rules_edition.trim().length > 0 },
  ];
}

export function summarizeSetup(state: EventSetupState): string {
  const s = normalizeSetup(state);
  const family = FORMAT_FAMILY_OPTIONS.find((o) => o.value === s.format_family)?.label ?? "Singles";
  const style = PLAY_STYLE_OPTIONS.find((o) => o.value === s.play_style)?.label ?? "";
  const scoring = SCORING_MODE_OPTIONS.find((o) => o.value === s.scoring_mode)?.label ?? "";
  const parts = [family];
  if (s.format_family !== "singles") parts.push(style.toLowerCase());
  if (s.team_size) parts.push(`teams of ${s.team_size}`);
  parts.push(scoring.toLowerCase());
  parts.push(signupModeLabel(s.signup_type).toLowerCase());
  parts.push(s.visibility === "public" ? "public" : "private");
  if (s.handicap_enabled) parts.push("handicapped");
  return `${parts.join(" · ")}.`;
}

/* ------------------------------------------------------------------ *
 * League schedule: one home course, or a weekly course rotation.
 * ------------------------------------------------------------------ */

export type VenueMode = "single" | "rotate";
export type RotationOrder = "listed" | "repeat";

/** One course in a league's rotation. */
export interface RotationStop {
  course_id: string;
  course_name: string;
  layout_id: string | null;
  layout_name: string | null;
  /** Holes in the chosen layout. Drives how many holes a night plays. */
  layout_holes: number | null;
}

/** A single planned league night. */
export interface PlannedWeek {
  date: string;
  course_id: string | null;
  course_name: string | null;
  layout_id: string | null;
  layout_name: string | null;
  /** Holes in the layout played that night. */
  layout_holes: number | null;
  /** Times through the layout that night: 1 or 2 rounds. */
  rounds: number;
  /** Holes played that night. Falls back to the league default when null. */
  holes_played: number | null;
  skipped: boolean;
  /** True once a director picks this night's course by hand, so replanning keeps it. */
  venue_locked?: boolean;
}


export interface LeagueSchedule {
  day_of_week: number;
  start_time: string;
  start_date: string;
  end_date: string;
  weeks_planned: number;
  /** How the season is ranked, if at all. */
  standings_style: StandingsStyle;
  /** Points system used by the point-based standings styles. */
  points_system: LeaguePointsSystem;
  /** Only meaningful when standings_style is "best_n". */
  best_n_weeks: number;
  /** Only meaningful when standings_style is "average". */
  min_nights_for_average: number;
  holes_played: number;
  create_events: boolean;
  venue_mode: VenueMode;
  rotation_order: RotationOrder;
  rotation: RotationStop[];
  weeks: PlannedWeek[];
}

export type LeaguePointsSystem = "standard" | "pdga_points" | "custom";

export const LEAGUE_POINTS_SYSTEM_OPTIONS: { value: LeaguePointsSystem; label: string }[] = [
  { value: "standard", label: "Standard (finish order)" },
  { value: "pdga_points", label: "PDGA points" },
  { value: "custom", label: "Custom" },
];


export const VENUE_MODE_OPTIONS: { value: VenueMode; label: string; blurb: string }[] = [
  {
    value: "single",
    label: "Same course every week",
    blurb: "A home-course league. Every night is played at the course you picked.",
  },
  {
    value: "rotate",
    label: "Rotate between courses",
    blurb: "A travelling league that moves to a different local course each week.",
  },
];

export const ROTATION_ORDER_OPTIONS: { value: RotationOrder; label: string; blurb: string }[] = [
  {
    value: "repeat",
    label: "Repeat the list all season",
    blurb: "Cycle through the courses in order and start over until the season ends.",
  },
  {
    value: "listed",
    label: "Play the list once",
    blurb: "Use each course once in the order listed; later weeks are left open.",
  },
];

export function defaultLeagueSchedule(): LeagueSchedule {
  return {
    day_of_week: 2,
    start_time: "17:30",
    start_date: "",
    end_date: "",
    weeks_planned: 12,
    standings_style: "independent",
    points_system: "standard",
    best_n_weeks: 8,
    min_nights_for_average: 3,

    holes_played: 18,
    create_events: true,
    venue_mode: "single",
    rotation_order: "repeat",
    rotation: [],
    weeks: [],
  };
}

/**
 * Weekly dates on the chosen day between start and end.
 * `cap` is optional and only used by legacy callers; the wizard uses the full range.
 */
export function weeklyDates(start: string, end: string, dow: number, cap?: number): string[] {
  if (!start || !end) return [];
  const out: string[] = [];
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return [];
  const limit = cap && cap > 0 ? cap : 520;
  while (s.getDay() !== dow && s <= e) s.setDate(s.getDate() + 1);
  while (s <= e && out.length < limit) {
    out.push(
      `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`,
    );
    s.setDate(s.getDate() + 7);
  }
  return out;
}

/** How many league nights the chosen dates and day of week produce. */
export function scheduledWeekCount(schedule: LeagueSchedule): number {
  return weeklyDates(schedule.start_date, schedule.end_date, schedule.day_of_week).length;
}


/**
 * Build the week-by-week plan from the slot settings, home course and rotation.
 * Manual edits from a previous plan are kept when the date still lines up.
 */
export function buildPlannedWeeks(
  schedule: LeagueSchedule,
  home: {
    course_id: string | null;
    course_name: string | null;
    layout_id: string | null;
    layout_name: string | null;
    layout_holes?: number | null;
  },
): PlannedWeek[] {
  const dates = weeklyDates(schedule.start_date, schedule.end_date, schedule.day_of_week);

  const previous = new Map(schedule.weeks.map((w) => [w.date, w]));
  return dates.map((date, i) => {
    const kept = previous.get(date);
    const stop =
      schedule.venue_mode === "rotate"
        ? schedule.rotation_order === "repeat"
          ? schedule.rotation.length
            ? schedule.rotation[i % schedule.rotation.length]
            : undefined
          : schedule.rotation[i]
        : undefined;
    const base: PlannedWeek =
      schedule.venue_mode === "rotate"
        ? {
            date,
            course_id: stop?.course_id ?? null,
            course_name: stop?.course_name ?? null,
            layout_id: stop?.layout_id ?? null,
            layout_name: stop?.layout_name ?? null,
            layout_holes: stop?.layout_holes ?? null,
            rounds: 1,
            holes_played: null,
            skipped: false,
          }
        : {
            date,
            course_id: home.course_id,
            course_name: home.course_name,
            layout_id: home.layout_id,
            layout_name: home.layout_name,
            layout_holes: home.layout_holes ?? null,
            rounds: 1,
            holes_played: null,
            skipped: false,
          };
    const rounds = kept?.rounds && kept.rounds > 0 ? kept.rounds : base.rounds;
    // A night the director pointed at a specific course keeps that course even
    // when the rotation or home course changes later.
    const venue = kept?.venue_locked
      ? {
          course_id: kept.course_id,
          course_name: kept.course_name,
          layout_id: kept.layout_id,
          layout_name: kept.layout_name,
          layout_holes: kept.layout_holes,
          venue_locked: true,
        }
      : {};
    const merged: PlannedWeek = {
      ...base,
      ...venue,
      rounds,
      skipped: kept?.skipped ?? base.skipped,
    };
    return { ...merged, holes_played: weekHoles(merged, schedule.holes_played) };
  });
}

/**
 * Holes a night plays: the layout's hole count (or the league default when the
 * layout has none) multiplied by the number of rounds.
 */
export function weekHoles(
  week: Pick<PlannedWeek, "layout_holes" | "rounds">,
  fallbackHoles: number,
): number {
  const perRound = week.layout_holes && week.layout_holes > 0 ? week.layout_holes : fallbackHoles;
  const rounds = week.rounds && week.rounds > 0 ? week.rounds : 1;
  return perRound * rounds;
}


/** Weeks that will actually be created, renumbered after any skips. */
export function activeWeeks(schedule: LeagueSchedule): PlannedWeek[] {
  return schedule.weeks.filter((w) => !w.skipped);
}

export function scheduleChecks(schedule: LeagueSchedule): SetupCheck[] {
  const active = activeWeeks(schedule);
  return [
    { label: "Start & end dates set", pass: !!schedule.start_date && !!schedule.end_date },
    { label: "At least one league night scheduled", pass: active.length > 0 },
    {
      label: "Rotation has two or more courses",
      pass: schedule.venue_mode === "single" || schedule.rotation.length >= 2,
    },
  ];
}

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function dayLabel(dow: number): string {
  return DAY_LABELS[dow] ?? "Tuesday";
}

export function summarizeSchedule(schedule: LeagueSchedule, homeCourseName?: string | null): string {
  const active = activeWeeks(schedule);
  const where =
    schedule.venue_mode === "rotate"
      ? `rotating between ${schedule.rotation.length} courses`
      : `at ${homeCourseName ?? "your home course"}`;
  return `${dayLabel(schedule.day_of_week)}s at ${schedule.start_time}, ${active.length} nights ${where}. ${summarizeStandings(schedule)}`;
}

/** How this league's results are ranked, in one sentence. */
export function summarizeStandings(schedule: LeagueSchedule): string {
  const active = activeWeeks(schedule).length;
  switch (schedule.standings_style) {
    case "points":
      return "Every night adds to one season points table.";
    case "best_n":
      return `Season points with your best ${Math.min(schedule.best_n_weeks, Math.max(active, 1))} nights counting.`;
    case "average":
      return `Ranked by scoring average after at least ${schedule.min_nights_for_average} nights.`;
    default:
      return "Each night stands alone — no season table.";
  }
}

/** Only the durable answers go in the jsonb column; dates live in league_events. */
export function serializeSchedule(schedule: LeagueSchedule) {
  return {
    venue_mode: schedule.venue_mode,
    rotation_order: schedule.rotation_order,
    standings_style: schedule.standings_style,
    points_system: schedule.points_system,
    min_nights_for_average: schedule.min_nights_for_average,
    rotation: schedule.rotation.map((r) => ({
      course_id: r.course_id,
      course_name: r.course_name,
      layout_id: r.layout_id,
      layout_name: r.layout_name,
      layout_holes: r.layout_holes ?? null,
    })),
    // The night-by-night plan is saved too, so reopening setup shows the same
    // season instead of rebuilding it from the slot settings.
    weeks: schedule.weeks.map((w) => ({
      date: w.date,
      course_id: w.course_id,
      course_name: w.course_name,
      layout_id: w.layout_id,
      layout_name: w.layout_name,
      layout_holes: w.layout_holes ?? null,
      rounds: w.rounds && w.rounds > 0 ? w.rounds : 1,
      holes_played: w.holes_played ?? null,
      skipped: !!w.skipped,
      venue_locked: !!w.venue_locked,
    })),
  };
}

/** Standings-related flat columns for the leagues row. */
export function standingsToColumns(schedule: LeagueSchedule) {
  return {
    standings_style: schedule.standings_style,
    points_system: schedule.points_system,
    min_nights_for_average: Math.max(1, schedule.min_nights_for_average),
    best_n_weeks: schedule.standings_style === "best_n" ? schedule.best_n_weeks : null,
  };
}

