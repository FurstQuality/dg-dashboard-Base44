/**
 * Field analysis for a tracked event.
 *
 * The event sync stores a row per player for every division in the event, so
 * these helpers turn those raw live-scoring rows into:
 *   - a leaderboard per division covering the whole field
 *   - where one player sits against that field (rank, strokes back, percentile)
 *   - a simple win / podium projection for the rounds still to play
 *   - which division that player's rating actually fits, per PDGA caps
 *
 * All maths is pure and deterministic (seeded RNG), so the same event always
 * produces the same projection.
 */
import {
  PDGA_DIVISIONS,
  PDGA_DIVISION_BY_CODE,
  checkDivisionEligibility,
  divisionRatingLabel,
  type DivisionEligibilityInput,
} from "@/lib/pdga-data";

/* --------------------------------- Types -------------------------------- */

export type FieldPlayer = {
  pdgaNumber: string;
  name: string;
  division: string;
  /** Cumulative strokes, when published. */
  total: number | null;
  /** Cumulative strokes to par, when published. */
  toPar: number | null;
  place: number | null;
  thru: number | null;
  /** Latest round with any published score; `thru` belongs to this round. */
  currentRound?: number | null;
  rating: number | null;
  roundsPlayed: number;
  isCrew: boolean;
  isYou: boolean;
};

export type DivisionField = {
  division: string;
  /** Sorted best score first; players without a score come last. */
  players: FieldPlayer[];
  size: number;
  ratingAvg: number | null;
  ratingMin: number | null;
  ratingMax: number | null;
};

export type FieldSnapshot = {
  divisions: DivisionField[];
  /** Round numbers that have any posted score. */
  rounds: number[];
  totalPlayers: number;
};

export type StandingInsight = {
  division: string;
  fieldSize: number;
  /** 1-based position among players with a score (ties share a position). */
  position: number | null;
  tied: boolean;
  scoredCount: number;
  /** Percentile of the field the player is ahead of (0-100). */
  percentile: number | null;
  strokesBackOfLead: number | null;
  strokesToPodium: number | null;
  ratingRank: number | null;
  ratingAvg: number | null;
  roundsPlayed: number;
  roundsRemaining: number;
  /** 0-1 chance of winning the division, projected across remaining rounds. */
  winChance: number | null;
  top3Chance: number | null;
  /** True once every round is in and the projection is just the result. */
  final: boolean;
};

export type DivisionFitVerdict = "recommended" | "eligible" | "stretch" | "not_allowed";

export type DivisionFit = {
  code: string;
  name: string;
  requirement: string;
  verdict: DivisionFitVerdict;
  note: string;
  /** Field size in this event, when the division is being played here. */
  fieldCount: number;
  ratingAvg: number | null;
  /** Player rating minus the division's average rating in this event. */
  ratingDelta: number | null;
};

/* -------------------------------- Helpers ------------------------------- */

const ROUND_SD = 3.6; // typical round-to-round scoring spread, in strokes
const STROKES_PER_RATING_POINT = 10; // ~10 rating points ≈ 1 stroke over 18
const SIMS = 3000;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller normal draw from a uniform generator. */
function normal(rand: () => number): number {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function scoreOf(p: FieldPlayer): number | null {
  if (p.toPar != null) return p.toPar;
  if (p.total != null) return p.total;
  return null;
}

/* --------------------------- Snapshot building -------------------------- */

type ScoreLike = {
  pdga_number: string;
  member_id: string | null;
  division: string | null;
  round_number: number | null;
  place: number | null;
  running_place: number | null;
  total: number | null;
  to_par: number | null;
  thru: number | null;
  player_name: string | null;
  round_score: number | null;
  round_to_par: number | null;
};

type MemberLike = {
  id: string;
  pdga_number: string;
  display_name: string | null;
  is_you?: boolean;
};

/**
 * Fold live-scoring rows (one per player per round) into a per-division
 * leaderboard for the whole field.
 */
export function buildFieldSnapshot(input: {
  scores: ScoreLike[];
  members: MemberLike[];
  ratings?: Record<string, number | null>;
  myPdga?: string | null;
}): FieldSnapshot {
  const { scores, members, ratings, myPdga } = input;
  const crewByNum = new Map(members.map((m) => [String(m.pdga_number), m] as const));
  const rounds = new Set<number>();
  const byPlayer = new Map<string, FieldPlayer>();

  for (const s of scores) {
    const num = String(s.pdga_number);
    if (s.round_number != null) rounds.add(s.round_number);
    const crew = crewByNum.get(num);
    const cur =
      byPlayer.get(num) ??
      ({
        pdgaNumber: num,
        name: crew?.display_name || s.player_name || `#${num}`,
        division: (s.division ?? "—").toUpperCase(),
        total: null,
        toPar: null,
        place: null,
        thru: null,
        rating: ratings?.[num] ?? null,
        roundsPlayed: 0,
        isCrew: !!crew,
        isYou: !!crew?.is_you || (!!myPdga && myPdga === num),
      } satisfies FieldPlayer);
    if (s.division) cur.division = s.division.toUpperCase();
    // PDGA lists unstarted players with 0 total / 0 thru; that is "not started", not a score.
    const started = (s.thru ?? 0) > 0 || s.round_score != null || (s.total ?? 0) > 0;
    if (started && s.total != null) cur.total = s.total;
    if (started && s.to_par != null) cur.toPar = s.to_par;
    if (s.running_place != null) cur.place = s.running_place;
    else if (s.place != null && cur.place == null) cur.place = s.place;
    const rn = s.round_number ?? null;
    if (rn != null && (cur.currentRound == null || rn >= cur.currentRound)) {
      cur.currentRound = rn;
      cur.thru = started ? (s.thru ?? null) : null;
    } else if (rn == null && started && s.thru != null) cur.thru = s.thru;
    if (s.round_score != null || s.round_to_par != null) cur.roundsPlayed += 1;
    byPlayer.set(num, cur);
  }

  const byDivision = new Map<string, FieldPlayer[]>();
  for (const p of byPlayer.values()) {
    const arr = byDivision.get(p.division) ?? [];
    arr.push(p);
    byDivision.set(p.division, arr);
  }

  const divisions: DivisionField[] = Array.from(byDivision.entries())
    .map(([division, players]) => {
      players.sort((a, b) => {
        const as = scoreOf(a);
        const bs = scoreOf(b);
        if (as == null && bs == null) return a.name.localeCompare(b.name);
        if (as == null) return 1;
        if (bs == null) return -1;
        return as - bs;
      });
      const rated = players.map((p) => p.rating).filter((n): n is number => typeof n === "number");
      return {
        division,
        players,
        size: players.length,
        ratingAvg: rated.length ? Math.round(avg(rated) as number) : null,
        ratingMin: rated.length ? Math.min(...rated) : null,
        ratingMax: rated.length ? Math.max(...rated) : null,
      } satisfies DivisionField;
    })
    .sort((a, b) => b.size - a.size || a.division.localeCompare(b.division));

  return {
    divisions,
    rounds: Array.from(rounds).sort((a, b) => a - b),
    totalPlayers: byPlayer.size,
  };
}

/* ------------------------------ Standing ------------------------------- */

/**
 * Where one player sits in their division, plus a projection for the rounds
 * still to play. `plannedRounds` is the event's round count (usually the
 * highest round number with posted scores).
 */
export function analyzeStanding(
  field: DivisionField,
  pdgaNumber: string,
  plannedRounds: number,
): StandingInsight | null {
  const me = field.players.find((p) => p.pdgaNumber === pdgaNumber);
  if (!me) return null;

  const scored = field.players.filter((p) => scoreOf(p) != null);
  const myScore = scoreOf(me);
  // Tie-aware: position = 1 + players strictly ahead; tied tells the UI to show "T".
  const position = myScore == null ? null : scored.filter((p) => (scoreOf(p) as number) < myScore).length + 1;
  const tied = myScore != null && scored.filter((p) => scoreOf(p) === myScore).length > 1;
  const lead = scored.length ? scoreOf(scored[0]!) : null;
  const third = scored.length >= 3 ? scoreOf(scored[2]!) : null;

  const ratedSorted = field.players
    .filter((p) => typeof p.rating === "number")
    .sort((a, b) => (b.rating as number) - (a.rating as number));
  const ratingRank =
    me.rating == null ? null : ratedSorted.findIndex((p) => p.pdgaNumber === pdgaNumber) + 1;

  const roundsRemaining = Math.max(0, plannedRounds - me.roundsPlayed);
  let winChance: number | null = null;
  let top3Chance: number | null = null;

  if (myScore != null && scored.length > 1) {
    if (roundsRemaining === 0) {
      winChance = position === 1 ? 1 : 0;
      top3Chance = position != null && position <= 3 ? 1 : 0;
    } else {
      const rand = mulberry32(
        scored.length * 7919 + Math.round((myScore + 100) * 31) + plannedRounds * 104729,
      );
      const contenders = scored.map((p) => ({
        score: scoreOf(p) as number,
        // Expected per-round edge relative to the division's average rating.
        edge:
          p.rating == null || field.ratingAvg == null
            ? 0
            : (field.ratingAvg - p.rating) / STROKES_PER_RATING_POINT,
        remaining: Math.max(0, plannedRounds - p.roundsPlayed),
        isMe: p.pdgaNumber === pdgaNumber,
      }));
      let wins = 0;
      let top3 = 0;
      for (let i = 0; i < SIMS; i += 1) {
        let mine = 0;
        let better = 0;
        const finals: number[] = [];
        for (const c of contenders) {
          let f = c.score;
          for (let r = 0; r < c.remaining; r += 1) f += c.edge + normal(rand) * ROUND_SD;
          finals.push(f);
          if (c.isMe) mine = f;
        }
        for (const f of finals) if (f < mine) better += 1;
        if (better === 0) wins += 1;
        if (better < 3) top3 += 1;
      }
      winChance = wins / SIMS;
      top3Chance = top3 / SIMS;
    }
  }

  return {
    division: field.division,
    fieldSize: field.size,
    position,
    tied,
    scoredCount: scored.length,
    percentile:
      position == null || scored.length < 2
        ? null
        : Math.round(((scored.length - position) / (scored.length - 1)) * 100),
    strokesBackOfLead: myScore == null || lead == null ? null : myScore - lead,
    strokesToPodium:
      myScore == null || third == null || (position != null && position <= 3)
        ? null
        : myScore - third,
    ratingRank,
    ratingAvg: field.ratingAvg,
    roundsPlayed: me.roundsPlayed,
    roundsRemaining,
    winChance,
    top3Chance,
    final: roundsRemaining === 0,
  };
}

/* ---------------------------- Division fit ----------------------------- */

const FIT_LADDER = [
  "MPO",
  "FPO",
  "MA1",
  "MA2",
  "MA3",
  "MA4",
  "FA1",
  "FA2",
  "FA3",
  "FA4",
] as const;

/**
 * Which divisions a rating actually fits, ranked most-recommended first. When
 * the division is also being played in this event, the field's average rating
 * is included so the player can see how they stack up there.
 */
export function divisionFits(
  rating: number | null,
  snapshot: FieldSnapshot,
  player: DivisionEligibilityInput = {},
  opts: { gender?: "M" | "F" } = {},
): DivisionFit[] {
  const gender = opts.gender ?? "M";
  const byDivision = new Map(snapshot.divisions.map((d) => [d.division, d] as const));
  const codes = FIT_LADDER.filter((code) => {
    const d = PDGA_DIVISION_BY_CODE[code];
    if (!d) return false;
    if (gender === "M" && d.gender === "F") return false;
    if (gender === "F" && code.startsWith("M") && code !== "MPO") return false;
    return true;
  });
  // Include any division actually present in this event, even off-ladder ones.
  for (const d of snapshot.divisions) {
    if (PDGA_DIVISION_BY_CODE[d.division] && !codes.includes(d.division as never)) {
      (codes as string[]).push(d.division);
    }
  }

  const fits: DivisionFit[] = [];
  for (const code of codes) {
    const d = PDGA_DIVISION_BY_CODE[code];
    if (!d) continue;
    const here = byDivision.get(code) ?? null;
    const check = checkDivisionEligibility(d, { ...player, rating });
    const delta = rating != null && here?.ratingAvg != null ? rating - here.ratingAvg : null;

    let verdict: DivisionFitVerdict;
    let note: string;
    if (!check.eligible) {
      verdict = "not_allowed";
      note = check.reason ?? "Your rating is above this division's cap.";
    } else if (d.category === "pro" && rating != null && d.min_rating && rating < d.min_rating) {
      verdict = "stretch";
      note = `PDGA suggests ${d.min_rating}+ for ${code}. You can still enter, but expect to be outside the pace.`;
    } else if (delta != null && delta >= 15) {
      verdict = "recommended";
      note = `You're about ${Math.round(delta)} points above this field's average — a strong spot to compete for the win.`;
    } else if (delta != null && delta <= -25) {
      verdict = "stretch";
      note = `This field averages ${Math.abs(Math.round(delta))} points above you. Good experience, tough to place.`;
    } else if (delta != null) {
      verdict = "eligible";
      note = `You're right around this field's average (${here?.ratingAvg}). Expect a close fight.`;
    } else {
      verdict = "eligible";
      note = rating == null ? "Add your rating for a sharper read." : "You meet the requirements.";
    }

    fits.push({
      code,
      name: d.name,
      requirement: divisionRatingLabel(d),
      verdict,
      note,
      fieldCount: here?.size ?? 0,
      ratingAvg: here?.ratingAvg ?? null,
      ratingDelta: delta,
    });
  }

  const order: Record<DivisionFitVerdict, number> = {
    recommended: 0,
    eligible: 1,
    stretch: 2,
    not_allowed: 3,
  };
  return fits.sort(
    (a, b) => order[a.verdict] - order[b.verdict] || b.fieldCount - a.fieldCount ||
      a.code.localeCompare(b.code),
  );
}

/** The division a player is entered in for this event, if any. */
export function myDivision(snapshot: FieldSnapshot, pdgaNumber: string | null): string | null {
  if (!pdgaNumber) return null;
  for (const d of snapshot.divisions) {
    if (d.players.some((p) => p.pdgaNumber === pdgaNumber)) return d.division;
  }
  return null;
}

export const ALL_PDGA_DIVISION_CODES = PDGA_DIVISIONS.map((d) => d.code);
