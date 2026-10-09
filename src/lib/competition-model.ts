/**
 * Shared vocabulary for the different kinds of disc golf competition this app
 * tracks: what a played round was, how a league's standings work, whether a
 * tournament stands alone or is one stop in a series, and how sanctioning is
 * recorded.
 *
 * One source of truth — wizards, badges, standings views and stored records
 * all read their labels and rules from here so nothing drifts.
 */

// ---------------------------------------------------------------------------
// Round context and format
// ---------------------------------------------------------------------------

export type RoundContext =
  | "casual"
  | "practice"
  | "league_night"
  | "tournament_round"
  | "side_event";

export type PlayFormat = "singles" | "doubles" | "teams";

export const ROUND_CONTEXT_OPTIONS: {
  value: RoundContext;
  label: string;
  blurb: string;
}[] = [
  { value: "casual", label: "Casual round", blurb: "A normal round with friends or solo." },
  {
    value: "practice",
    label: "Practice",
    blurb: "Field work or a practice loop; kept out of competitive splits.",
  },
  { value: "league_night", label: "League night", blurb: "One night of a recurring league." },
  { value: "tournament_round", label: "Tournament round", blurb: "A round inside a tournament." },
  {
    value: "side_event",
    label: "Side event",
    blurb: "Doubles, glow, CTP contest or another add-on event.",
  },
];

export const PLAY_FORMAT_OPTIONS: { value: PlayFormat; label: string; blurb: string }[] = [
  {
    value: "singles",
    label: "Singles",
    blurb: "Everyone plays their own disc and keeps their own score.",
  },
  { value: "doubles", label: "Doubles", blurb: "Two-player teams sharing one score per hole." },
  { value: "teams", label: "Teams", blurb: "Three or more players per team, one score per hole." },
];

/**
 * How a team decides which throw to play. "Best shot" and "worst shot" are
 * throw styles inside doubles/teams play — not formats of their own. Names
 * follow PDGA Appendix B (Doubles Play) wording.
 */
export type TeamThrowStyle =
  | "best_throw"
  | "worst_throw"
  | "alternate_throw"
  | "modified_best_throw";

export const TEAM_THROW_STYLE_OPTIONS: {
  value: TeamThrowStyle;
  label: string;
  blurb: string;
}[] = [
  {
    value: "best_throw",
    label: "Best throw",
    blurb: "Everyone throws and the team picks whichever throw it wants to play next.",
  },
  {
    value: "worst_throw",
    label: "Worst throw",
    blurb: "The team must play the most difficult lie — card consensus, not just the furthest one.",
  },
  {
    value: "alternate_throw",
    label: "Alternate throw",
    blurb:
      "One disc, strict turns: player 1 drives, player 2 throws the upshot, player 1 putts, player 2 drives next.",
  },
  {
    value: "modified_best_throw",
    label: "Modified best throw",
    blurb: "Best throw, but the same teammate's throw can't be used three holes in a row.",
  },
];

/** Teams are named by how many players are on each one. */
export const TEAM_SIZE_OPTIONS: { size: number; label: string; blurb: string }[] = [
  { size: 2, label: "Doubles", blurb: "Two players per team." },
  { size: 3, label: "Triples", blurb: "Three players per team." },
  { size: 4, label: "Quads", blurb: "Four players per team." },
];

export function teamSizeLabel(size: number): string {
  return TEAM_SIZE_OPTIONS.find((o) => o.size === size)?.label ?? `${size} per team`;
}

/** Teams of two are stored as "doubles"; larger teams as "teams". */
export function playFormatForTeamSize(size: number): PlayFormat {
  return size <= 2 ? "doubles" : "teams";
}

export type WolfSettings = {
  /** Whether the Wolf is always first or always last on the tee. */
  wolfTeeOrder: "first" | "last";
  /** Allow declaring Lone Wolf before anyone throws, for double points. */
  blindWolf: boolean;
  /** Tied holes roll their points into the next hole instead of scoring zero. */
  carryover: boolean;
  points: {
    wolfTeamWin: number;
    huntersWin: number;
    loneWolfWin: number;
    beatLoneWolf: number;
  };
};

export const DEFAULT_WOLF_SETTINGS: WolfSettings = {
  wolfTeeOrder: "last",
  blindWolf: true,
  carryover: false,
  points: { wolfTeamWin: 2, huntersWin: 3, loneWolfWin: 4, beatLoneWolf: 1 },
};

export type ImposterSettings = {
  /** Reassign the hidden role every few holes instead of once per round. */
  rotateRole: boolean;
  /** Tell the Imposter what the crew is chasing. */
  hintMode: boolean;
  /** When the card votes. */
  voteAt: "hole_9" | "end" | "any_hole";
};

export const DEFAULT_IMPOSTER_SETTINGS: ImposterSettings = {
  rotateRole: false,
  hintMode: true,
  voteAt: "end",
};

/**
 * How the card is settled once the round is in the books. Wolf and Imposter are
 * casual games: the card still records normal scores, but the round is settled
 * by that game's points rather than by strokes.
 */
export type ScoringType = "stroke_play" | "skins" | "wolf" | "imposter";

export const SCORING_TYPE_OPTIONS: {
  value: ScoringType;
  label: string;
  blurb: string;
  /** Casual, for-fun games rather than a standard settlement. */
  casual?: boolean;
  minPlayers?: number;
  maxPlayers?: number;
}[] = [
  {
    value: "stroke_play",
    label: "Stroke play",
    blurb: "Total strokes decide it. The PDGA standard and the only type that feeds ratings.",
  },
  {
    value: "skins",
    label: "Skins",
    blurb: "Lowest score wins the hole outright; ties carry the skin to the next hole.",
    minPlayers: 2,
  },
  {
    value: "wolf",
    label: "Wolf",
    blurb:
      "Casual game — a rotating Wolf picks a partner each hole or goes Lone Wolf against the field for bigger points.",
    casual: true,
    minPlayers: 3,
    maxPlayers: 5,
  },
  {
    value: "imposter",
    label: "Imposter",
    blurb:
      "Casual game — the card plays as one team while one hidden player quietly plays against it, then everyone votes.",
    casual: true,
    minPlayers: 4,
    maxPlayers: 6,
  },
];

/** True for the for-fun games (Wolf, Imposter) rather than a standard settlement. */
export function isCasualGameScoringType(value: string | null | undefined): boolean {
  return !!SCORING_TYPE_OPTIONS.find((o) => o.value === value)?.casual;
}

/** Labels for scoring values that older rounds may still carry. */
const LEGACY_SCORING_LABELS: Record<string, string> = {
  match_play: "Match play",
  points: "Points",
};

// ---------------------------------------------------------------------------
// Game modes — the one choice a player makes when starting a round
// ---------------------------------------------------------------------------

export type GameModeId =
  | "singles_stroke"
  | "singles_skins"
  | "team_stroke"
  | "team_skins"
  | "wolf"
  | "imposter";

export type GameMode = {
  id: GameModeId;
  label: string;
  tagline: string;
  /** Short "how to play" line shown right on the card. */
  how: string;
  format: PlayFormat;
  scoring: ScoringType;
  /** Team play: the card is split into teams and a throw style is chosen. */
  teams: boolean;
  minPlayers: number;
  maxPlayers?: number;
  /** Can be submitted for a DGD rating (singles stroke play only). */
  rateable: boolean;
  /** Rulebook entries that explain this mode. */
  rulebookIds: string[];
};

export const ROUND_GAME_MODES: GameMode[] = [
  {
    id: "singles_stroke",
    label: "Singles stroke play",
    tagline: "The standard round",
    how: "Everyone throws their own disc and counts their own strokes. Lowest total wins.",
    format: "singles",
    scoring: "stroke_play",
    teams: false,
    minPlayers: 1,
    rateable: true,
    rulebookIds: ["singles", "stroke_play"],
  },
  {
    id: "singles_skins",
    label: "Singles skins",
    tagline: "Hole by hole",
    how: "Win a hole outright to take the skin. Tie it and the skin carries to the next hole.",
    format: "singles",
    scoring: "skins",
    teams: false,
    minPlayers: 2,
    rateable: false,
    rulebookIds: ["singles", "skins"],
  },
  {
    id: "team_stroke",
    label: "Teams",
    tagline: "Doubles, triples or quads",
    how: "Split into teams, pick a throw style, and each team records one score per hole.",
    format: "doubles",
    scoring: "stroke_play",
    teams: true,
    minPlayers: 4,
    rateable: false,
    rulebookIds: ["doubles", "teams", "best_throw"],
  },
  {
    id: "team_skins",
    label: "Team skins",
    tagline: "Teams playing for skins",
    how: "Same teams and throw style, but each hole is a skin and ties carry over.",
    format: "doubles",
    scoring: "skins",
    teams: true,
    minPlayers: 4,
    rateable: false,
    rulebookIds: ["doubles", "skins"],
  },
  {
    id: "wolf",
    label: "Wolf",
    tagline: "3 v 1, every hole",
    how: "A rotating Wolf picks a partner off the tee or goes Lone Wolf against everyone for bigger points.",
    format: "singles",
    scoring: "wolf",
    teams: false,
    minPlayers: 3,
    maxPlayers: 5,
    rateable: false,
    rulebookIds: ["wolf"],
  },
  {
    id: "imposter",
    label: "Imposter",
    tagline: "Hidden role game",
    how: "The card plays as one team while one hidden player quietly plays against it. Vote at the end.",
    format: "singles",
    scoring: "imposter",
    teams: false,
    minPlayers: 4,
    maxPlayers: 6,
    rateable: false,
    rulebookIds: ["imposter"],
  },
];

export function gameMode(id: string | null | undefined): GameMode {
  return ROUND_GAME_MODES.find((m) => m.id === id) ?? ROUND_GAME_MODES[0]!;
}

/** Which game mode an existing round was played under. */
export function gameModeFromRound(round: {
  play_format?: string | null;
  scoring_type?: string | null;
}): GameMode {
  const teams = normalizePlayFormat(round.play_format) !== "singles";
  const scoring = normalizeScoringType(round.scoring_type);
  if (scoring === "wolf" || scoring === "imposter") return gameMode(scoring);
  if (teams) return gameMode(scoring === "skins" ? "team_skins" : "team_stroke");
  return gameMode(scoring === "skins" ? "singles_skins" : "singles_stroke");
}

/**
 * Does this card have the right number of players for the mode? Team modes also
 * need enough players to fill at least two full teams.
 */
export function gameModeFitsCard(
  mode: GameMode,
  playerCount: number,
  teamSize = 2,
): { ok: boolean; reason?: string } {
  if (playerCount < mode.minPlayers) {
    return {
      ok: false,
      reason: `${mode.label} needs at least ${mode.minPlayers} players on the card — you have ${playerCount}.`,
    };
  }
  if (mode.maxPlayers && playerCount > mode.maxPlayers) {
    return {
      ok: false,
      reason: `${mode.label} works with up to ${mode.maxPlayers} players — you have ${playerCount}.`,
    };
  }
  if (mode.teams) {
    const needed = teamSize * 2;
    if (playerCount < needed) {
      return {
        ok: false,
        reason: `${teamSizeLabel(teamSize)} needs ${needed} players for two full teams — you have ${playerCount}.`,
      };
    }
    if (playerCount % teamSize !== 0) {
      return {
        ok: true,
        reason: `${playerCount} players don't split evenly into teams of ${teamSize}. One team will play a player short.`,
      };
    }
  }
  return { ok: true };
}

/** Player-count check for a scoring type; returns a reason when it doesn't fit. */
export function scoringTypeFitsCard(
  value: string | null | undefined,
  playerCount: number,
): { ok: boolean; reason?: string } {
  const opt = SCORING_TYPE_OPTIONS.find((o) => o.value === value);
  if (!opt) return { ok: true };
  if (opt.minPlayers && playerCount < opt.minPlayers) {
    return {
      ok: false,
      reason: `${opt.label} needs at least ${opt.minPlayers} players on the card.`,
    };
  }
  if (opt.maxPlayers && playerCount > opt.maxPlayers) {
    return {
      ok: false,
      reason: `${opt.label} works best with ${opt.maxPlayers} players or fewer.`,
    };
  }
  return { ok: true };
}

export function roundContextLabel(value: string | null | undefined): string {
  return ROUND_CONTEXT_OPTIONS.find((o) => o.value === value)?.label ?? "Casual round";
}

export function playFormatLabel(value: string | null | undefined): string {
  return (
    PLAY_FORMAT_OPTIONS.find((o) => o.value === normalizePlayFormat(value))?.label ?? "Singles"
  );
}

export function teamThrowStyleLabel(value: string | null | undefined): string | null {
  return TEAM_THROW_STYLE_OPTIONS.find((o) => o.value === value)?.label ?? null;
}

export function scoringTypeLabel(value: string | null | undefined): string {
  return (
    SCORING_TYPE_OPTIONS.find((o) => o.value === value)?.label ??
    (value ? LEGACY_SCORING_LABELS[value] : undefined) ??
    "Stroke play"
  );
}

export function normalizeRoundContext(value: string | null | undefined): RoundContext {
  return ROUND_CONTEXT_OPTIONS.some((o) => o.value === value) ? (value as RoundContext) : "casual";
}

/**
 * Accepts the legacy values "best_shot"/"worst_shot", which were stored as
 * formats before throw style became its own field.
 */
export function normalizePlayFormat(value: string | null | undefined): PlayFormat {
  if (value === "best_shot" || value === "worst_shot") return "doubles";
  return PLAY_FORMAT_OPTIONS.some((o) => o.value === value) ? (value as PlayFormat) : "singles";
}

export function normalizeTeamThrowStyle(
  value: string | null | undefined,
  format: string | null | undefined,
): TeamThrowStyle | null {
  if (normalizePlayFormat(format) === "singles") return null;
  if (value === "best_shot") return "best_throw";
  if (value === "worst_shot") return "worst_throw";
  return TEAM_THROW_STYLE_OPTIONS.some((o) => o.value === value)
    ? (value as TeamThrowStyle)
    : "best_throw";
}

export function normalizeScoringType(value: string | null | undefined): ScoringType {
  return SCORING_TYPE_OPTIONS.some((o) => o.value === value)
    ? (value as ScoringType)
    : "stroke_play";
}

/** One line describing exactly how a round was played. */
export function formatRoundPlayLine(round: {
  play_format?: string | null;
  team_throw_style?: string | null;
  scoring_type?: string | null;
}): string {
  const parts = [playFormatLabel(round.play_format)];
  const style = teamThrowStyleLabel(
    normalizeTeamThrowStyle(round.team_throw_style, round.play_format),
  );
  if (style) parts.push(style);
  parts.push(scoringTypeLabel(round.scoring_type));
  return parts.join(" · ");
}

/** Rounds that belong to organised competition rather than casual play. */
export function isCompetitiveContext(value: string | null | undefined): boolean {
  const c = normalizeRoundContext(value);
  return c === "league_night" || c === "tournament_round" || c === "side_event";
}

/** Derive the context from the links a round already has. */
export function contextFromLinks(links: {
  tournament_id?: string | null;
  tournament_round_id?: string | null;
  league_event_id?: string | null;
}): RoundContext {
  if (links.tournament_id || links.tournament_round_id) return "tournament_round";
  if (links.league_event_id) return "league_night";
  return "casual";
}

// ---------------------------------------------------------------------------
// League standings
// ---------------------------------------------------------------------------

export type StandingsStyle = "independent" | "points" | "best_n" | "average";

export const STANDINGS_STYLE_OPTIONS: {
  value: StandingsStyle;
  label: string;
  blurb: string;
}[] = [
  {
    value: "independent",
    label: "Each night stands alone",
    blurb: "Every league night is its own event with its own results. No season table.",
  },
  {
    value: "points",
    label: "Season points",
    blurb: "Players earn points each night and every night counts toward one season table.",
  },
  {
    value: "best_n",
    label: "Best N nights count",
    blurb: "A season table where only a player's best nights count and the rest are dropped.",
  },
  {
    value: "average",
    label: "Season scoring average",
    blurb: "Ranked by average score across nights played, once a minimum is met.",
  },
];

export function normalizeStandingsStyle(value: string | null | undefined): StandingsStyle {
  return STANDINGS_STYLE_OPTIONS.some((o) => o.value === value)
    ? (value as StandingsStyle)
    : "independent";
}

export function standingsStyleLabel(value: string | null | undefined): string {
  return (
    STANDINGS_STYLE_OPTIONS.find((o) => o.value === normalizeStandingsStyle(value))?.label ??
    "Each night stands alone"
  );
}

/** True when this style needs a points system chosen. */
export function standingsUsesPoints(value: string | null | undefined): boolean {
  const s = normalizeStandingsStyle(value);
  return s === "points" || s === "best_n";
}

/** True when the "nights that count" number is meaningful. */
export function standingsUsesBestN(value: string | null | undefined): boolean {
  return normalizeStandingsStyle(value) === "best_n";
}

// ---------------------------------------------------------------------------
// Tournament shape and sanctioning
// ---------------------------------------------------------------------------

export type TournamentShape = "single" | "multi_round" | "series_stop";

export const TOURNAMENT_SHAPE_OPTIONS: {
  value: TournamentShape;
  label: string;
  blurb: string;
}[] = [
  { value: "single", label: "Single event", blurb: "One day, one set of rounds, one winner." },
  {
    value: "multi_round",
    label: "Multi-round event",
    blurb: "Several rounds across one or more days that combine into one result.",
  },
  {
    value: "series_stop",
    label: "One stop in a series",
    blurb: "Part of a run of separate events with combined series standings.",
  },
];

export function normalizeTournamentShape(value: string | null | undefined): TournamentShape {
  return TOURNAMENT_SHAPE_OPTIONS.some((o) => o.value === value)
    ? (value as TournamentShape)
    : "single";
}

export function tournamentShapeLabel(value: string | null | undefined): string {
  return (
    TOURNAMENT_SHAPE_OPTIONS.find((o) => o.value === normalizeTournamentShape(value))?.label ??
    "Single event"
  );
}

export type SanctionLevel = "pdga" | "unsanctioned" | "casual";

export const SANCTION_LEVEL_OPTIONS: {
  value: SanctionLevel;
  label: string;
  blurb: string;
}[] = [
  {
    value: "pdga",
    label: "PDGA sanctioned",
    blurb: "Run under PDGA rules and competition manual; results are rated.",
  },
  {
    value: "unsanctioned",
    label: "Unsanctioned competitive",
    blurb: "Competitive and scored, but not sanctioned and not PDGA rated.",
  },
  {
    value: "casual",
    label: "Casual / for fun",
    blurb: "Social play. Scores are kept but nothing rides on them.",
  },
];

export function normalizeSanctionLevel(value: string | null | undefined): SanctionLevel {
  return SANCTION_LEVEL_OPTIONS.some((o) => o.value === value)
    ? (value as SanctionLevel)
    : "unsanctioned";
}

export function sanctionLevelLabel(value: string | null | undefined): string {
  return (
    SANCTION_LEVEL_OPTIONS.find((o) => o.value === normalizeSanctionLevel(value))?.label ??
    "Unsanctioned competitive"
  );
}

/** Short badge text for a row: "PDGA A-tier", "Unsanctioned", "Casual". */
export function sanctionBadge(input: {
  sanctioned?: boolean | null;
  tier?: string | null;
  signup_type?: string | null;
  level?: string | null;
}): string {
  const level: SanctionLevel = input.level
    ? normalizeSanctionLevel(input.level)
    : input.sanctioned
      ? "pdga"
      : input.signup_type === "casual"
        ? "casual"
        : "unsanctioned";
  if (level === "pdga") return input.tier ? `PDGA ${input.tier}` : "PDGA sanctioned";
  if (level === "casual") return "Casual";
  return "Unsanctioned";
}

// ---------------------------------------------------------------------------
// Series scoring
// ---------------------------------------------------------------------------

export type SeriesPointsSystem = "standard" | "pdga_points" | "custom" | "field_size";

/** Default finish-order points, 1st place first. */
export const DEFAULT_SERIES_POINTS = [100, 90, 82, 75, 69, 64, 60, 56, 53, 50];

export interface SeriesSettings {
  points_system: SeriesPointsSystem;
  points_table: number[];
  /** How many stops count toward standings; null means every stop. */
  counting_events: number | null;
  /** How many worst results each player may drop. */
  drop_worst: number;
  /** field_size system: points = division field size + bonus - place. */
  field_size_bonus?: number;
  /** Floor for one event's points (field_size system). */
  min_event_points?: number;
  /** "separate" (default): points stay in the division earned. "carry": points follow the player to their latest division. */
  division_change?: "separate" | "carry";
  /** Finale event; its placement points are multiplied by finale_multiplier. */
  finale_event_id?: string | null;
  finale_multiplier?: number;
  /** Flat points added for every event a player finishes. */
  participation_bonus?: number;
  /** Events a player must play to qualify for season awards (0 = everyone). */
  qualify_min_events?: number;
  /** Qualified places per division that receive season awards (0 = no cut line). */
  award_places?: number;
}

export function defaultSeriesSettings(): SeriesSettings {
  return {
    points_system: "standard",
    points_table: [...DEFAULT_SERIES_POINTS],
    counting_events: null,
    drop_worst: 1,
  };
}

export interface SeriesResultInput {
  player_id: string;
  player_name: string;
  event_id: string;
  event_name: string;
  /** 1-based competition placement at that stop (ties share, next skips). */
  position: number;
  /** Division the player played in at that stop; standings group by it. */
  division?: string | null;
  /** Players in that division at that stop (field_size system). */
  field_size?: number;
  /** Total strokes at that stop, when scored in-app. */
  strokes?: number | null;
  /** Exact par of the holes played at that stop; null when any hole's par is unknown. */
  par?: number | null;
}

export interface SeriesStandingRow {
  division?: string | null;
  player_id: string;
  player_name: string;
  events_played: number;
  events_counted: number;
  dropped: number;
  points: number;
  best_finish: number | null;
  /** Played enough events for season awards. */
  qualified: boolean;
}

/** Points for a finishing position under a points table. */
export function pointsForPosition(table: number[], position: number): number {
  if (position < 1) return 0;
  if (position <= table.length) return table[position - 1]!;
  const last = table[table.length - 1] ?? 0;
  // Beyond the table, taper by one point per place with a floor of 1.
  return Math.max(1, last - (position - table.length));
}

/** Field-size placement points: field + bonus - place, never below the floor. */
export function fieldSizePoints(fieldSize: number, place: number, bonus = 5, floor = 5): number {
  if (place < 1 || fieldSize < 1) return 0;
  return Math.max(floor, fieldSize + bonus - place);
}

/** Points one result earns under the series settings. */
export function pointsForResult(r: SeriesResultInput, settings: SeriesSettings): number {
  const base = basePoints(r, settings);
  const mult =
    settings.finale_event_id && r.event_id === settings.finale_event_id ? Math.max(1, settings.finale_multiplier ?? 1) : 1;
  return Math.round(base * mult) + Math.max(0, settings.participation_bonus ?? 0);
}

function basePoints(r: SeriesResultInput, settings: SeriesSettings): number {
  if (settings.points_system === "field_size") {
    return fieldSizePoints(
      r.field_size ?? r.position,
      r.position,
      settings.field_size_bonus ?? 5,
      settings.min_event_points ?? 5,
    );
  }
  const table = settings.points_table.length ? settings.points_table : DEFAULT_SERIES_POINTS;
  return pointsForPosition(table, r.position);
}

/**
 * Series standings: award points per stop, drop each player's worst results,
 * then cap at the number of stops that count.
 */
export function seriesStandings(
  results: SeriesResultInput[],
  settings: SeriesSettings,
): SeriesStandingRow[] {
  // Standings are per division: a player who changes division gets a row in each.
  if (settings.division_change === "carry") {
    const latest = new Map<string, string | null | undefined>();
    for (const r of results) latest.set(r.player_id, r.division);
    results = results.map((r) => ({ ...r, division: latest.get(r.player_id) ?? r.division }));
  }
  const byPlayer = new Map<string, SeriesResultInput[]>();
  for (const r of results) {
    const key = `${r.division ?? ""}\u0000${r.player_id}`;
    const list = byPlayer.get(key) ?? [];
    list.push(r);
    byPlayer.set(key, list);
  }

  const dropWorst = Math.max(0, settings.drop_worst);

  const rows: SeriesStandingRow[] = [];
  for (const list of byPlayer.values()) {
    const player_id = list[0]!.player_id;
    const scored = list
      .map((r) => ({ ...r, points: pointsForResult(r, settings) }))
      .sort((a, b) => b.points - a.points);

    // Never drop a player below one counted result.
    const keepAfterDrop = Math.max(1, scored.length - dropWorst);
    const cap =
      settings.counting_events && settings.counting_events > 0
        ? Math.min(keepAfterDrop, settings.counting_events)
        : keepAfterDrop;
    const counted = scored.slice(0, cap);

    rows.push({
      division: list[0]!.division ?? null,
      player_id,
      player_name: list[0]!.player_name,
      events_played: scored.length,
      events_counted: counted.length,
      dropped: scored.length - counted.length,
      points: counted.reduce((sum, r) => sum + r.points, 0),
      best_finish: list.reduce<number | null>(
        (best, r) => (best === null || r.position < best ? r.position : best),
        null,
      ),
      qualified: scored.length >= Math.max(0, settings.qualify_min_events ?? 0),
    });
  }

  return rows.sort(
    (a, b) =>
      (a.division ?? "").localeCompare(b.division ?? "") ||
      b.points - a.points ||
      (a.best_finish ?? 999) - (b.best_finish ?? 999) ||
      a.player_name.localeCompare(b.player_name),
  );
}

/** Standings split by division with competition placement (1, 2, 3, 3, 5). */
export function groupByDivision(
  rows: SeriesStandingRow[],
  awardPlaces = 0,
): [string, (SeriesStandingRow & { place: number; award: boolean })[]][] {
  const groups = new Map<string, SeriesStandingRow[]>();
  for (const r of rows) {
    const k = r.division ?? "";
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()].map(([k, list]) => {
    let place = 0;
    // Award cut: the first `awardPlaces` qualified finishers, ties at the cut included.
    const qualified = list.filter((r) => r.qualified);
    const cutPoints = awardPlaces > 0 && qualified.length ? qualified[Math.min(awardPlaces, qualified.length) - 1]!.points : null;
    return [
      k,
      list.map((r, i) => {
        if (i === 0 || r.points !== list[i - 1]!.points) place = i + 1;
        return { ...r, place, award: cutPoints !== null && r.qualified && r.points >= cutPoints };
      }),
    ];
  });
}

/** One-line human summary of how a series is scored. */
export function summarizeSeries(settings: SeriesSettings): string {
  const parts: string[] = [];
  if (settings.points_system === "field_size") {
    parts.push(
      `Points = players in your division + ${settings.field_size_bonus ?? 5} − your place (at least ${settings.min_event_points ?? 5})`,
    );
  }
  parts.push(
    settings.counting_events && settings.counting_events > 0
      ? `Best ${settings.counting_events} stops count`
      : "Every stop counts",
  );
  parts.push(
    settings.drop_worst > 0
      ? `drop your ${settings.drop_worst === 1 ? "worst result" : `${settings.drop_worst} worst results`}`
      : "no drops",
  );
  if ((settings.finale_multiplier ?? 1) > 1 && settings.finale_event_id)
    parts.push(`finale pays ${settings.finale_multiplier}× points`);
  if ((settings.participation_bonus ?? 0) > 0) parts.push(`+${settings.participation_bonus} for every event played`);
  if ((settings.qualify_min_events ?? 0) > 0)
    parts.push(`play ${settings.qualify_min_events}+ events to qualify for awards`);
  if ((settings.award_places ?? 0) > 0) parts.push(`top ${settings.award_places} per division earn awards`);
  return parts.join(" · ");
}

export interface FinaleRaceRow {
  division: string | null;
  player_id: string;
  player_name: string;
  before: number;
  finale_place: number | null;
  finale_points: number;
  projected: number;
  projected_rank: number;
  /** Rank 1 and no one below can catch them even winning the finale. */
  clinched: boolean;
}

/**
 * Finale race per division: points before the finale, live finale points,
 * projected total and rank. Ignores drops (a simple, honest projection).
 * maxFinalePoints = what a finale win is worth for the chasing players.
 */
export function finaleRace(
  results: Array<{ player_id: string; player_name: string; event_id: string; division: string | null; position: number; points: number }>,
  finaleId: string,
  finaleDone: boolean,
  maxFinalePoints: number,
): FinaleRaceRow[] {
  const map = new Map<string, FinaleRaceRow>();
  for (const r of results) {
    const key = `${r.division ?? ""}\u0000${r.player_id}`;
    const row = map.get(key) ?? {
      division: r.division, player_id: r.player_id, player_name: r.player_name,
      before: 0, finale_place: null, finale_points: 0, projected: 0, projected_rank: 0, clinched: false,
    };
    if (r.event_id === finaleId) { row.finale_place = r.position; row.finale_points = r.points; }
    else row.before += r.points;
    map.set(key, row);
  }
  const out: FinaleRaceRow[] = [];
  const byDiv = new Map<string, FinaleRaceRow[]>();
  for (const row of map.values()) {
    row.projected = row.before + row.finale_points;
    const k = row.division ?? "";
    byDiv.set(k, [...(byDiv.get(k) ?? []), row]);
  }
  for (const [, rows] of [...byDiv.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    rows.sort((a, b) => b.projected - a.projected || a.player_name.localeCompare(b.player_name));
    rows.forEach((r, i) => { r.projected_rank = i > 0 && rows[i - 1]!.projected === r.projected ? rows[i - 1]!.projected_rank : i + 1; });
    const leader = rows[0];
    if (leader && leader.projected_rank === 1) {
      const rivals = rows.slice(1);
      leader.clinched = finaleDone
        ? rivals.every((x) => x.projected < leader.projected)
        : rivals.every((x) => x.before + maxFinalePoints < leader.before) && maxFinalePoints < leader.before; // a newcomer could still win the finale
    }
    out.push(...rows);
  }
  return out;
}
