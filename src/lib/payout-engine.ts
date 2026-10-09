/**
 * The one payout engine for leagues, tournaments, doubles and team events.
 * Pure and deterministic so the same inputs always produce the same schedule.
 *
 * Rules: every paid place gets at least the director's minimum (as low as $1),
 * higher places never get less than lower ones, the pool is never exceeded,
 * and anything that cannot be paid out cleanly is reported as a remainder.
 *
 * Player value protection: rounding and minimums only shape a schedule before
 * it is locked. Once amounts are owed (locked schedule, tie splits, side pots)
 * convenience may add value but never remove it — see protectRounding().
 */

/** Lowest minimum a director can choose ($1). The recommended default stays $5. */
export const SYSTEM_MIN_PLAYER_PAYOUT_CENTS = 100;
export const RECOMMENDED_MIN_PLAYER_PAYOUT_CENTS = 500;
export const PAYOUT_CURVE_VERSION = "pdga-2024@3";

/**
 * PDGA Payout Calculator (2024) curves: PctPay = C · (paid × place)^b.
 * C cancels once shares are normalized, so only the exponent matters.
 */
export const PAYOUT_CURVES = [
  { value: "flat_am", label: "Flat (Am)", b: -0.357727 },
  { value: "mid_am", label: "Mid (Am)", b: -0.477 },
  { value: "steep_am", label: "Steep (Am)", b: -0.5356333 },
  { value: "flat_pro", label: "Flat (Pro)", b: -0.5356333 },
  { value: "midflat_pro", label: "Mid-flat (Pro)", b: -0.5937 },
  { value: "mid_pro", label: "Mid (Pro)", b: -0.6633693 },
  { value: "midsteep_pro", label: "Mid-steep (Pro)", b: -0.7338341 },
  { value: "steep_pro", label: "Steep (Pro)", b: -0.8613875 },
] as const;
export type PayoutCurve = (typeof PAYOUT_CURVES)[number]["value"];
export const DEFAULT_PAYOUT_CURVE: PayoutCurve = "steep_pro";

export interface PayoutInput {
  pool_cents: number;
  /** Players per entry: 1 singles, 2 doubles, 3+ teams. */
  team_size: number;
  /** Places the director asked for (before the minimum trims them). */
  requested_places: number;
  /** Per player; clamped up to SYSTEM_MIN_PLAYER_PAYOUT_CENTS. */
  min_player_cents: number;
  /** Per-player rounding step in cents (500 = nearest $5). 0 = exact distribution. */
  round_player_cents: number;
  /** PDGA curve; defaults to Steep (Pro). */
  curve?: PayoutCurve;
  /** Exponent from an installed curve set; overrides `curve` when set. */
  curve_b?: number;
  /** Version label stored with the schedule when curve_b comes from a curve set. */
  curve_version?: string;
  /** "first" (default) adds odd money to 1st; "hold" reports it as a remainder for the director to route. */
  remainder_to?: "first" | "hold";
}

export interface PayoutPlace {
  place: number;
  /** Paid to the whole entry (team). Equals per_player_cents for singles. */
  cents: number;
  per_player_cents: number;
}

export interface PayoutSchedule {
  places: PayoutPlace[];
  pool_cents: number;
  total_paid_cents: number;
  remainder_cents: number;
  team_size: number;
  min_player_cents: number;
  min_team_cents: number;
  /** Most places the pool can pay at the minimum. */
  max_places: number;
  requested_places: number;
  /** Set when the requested depth was reduced to honour the minimum. */
  depth_note: string | null;
  curve_version: string;
}

const dollars = (c: number) => {
  const v = c / 100;
  return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
};

/** Target share per place from the PDGA curve, normalized to the pool. */
function curve(n: number, key: PayoutCurve = DEFAULT_PAYOUT_CURVE, override?: number): number[] {
  if (n <= 1) return [1];
  const b = Number.isFinite(override) ? (override as number) : (PAYOUT_CURVES.find((c) => c.value === key) ?? PAYOUT_CURVES.find((c) => c.value === DEFAULT_PAYOUT_CURVE)!).b;
  const w = Array.from({ length: n }, (_, i) => Math.pow(n * (i + 1), b));
  const sum = w.reduce((s, x) => s + x, 0);
  return w.map((x) => x / sum);
}

export function computePayoutSchedule(input: PayoutInput): PayoutSchedule {
  const team = Math.max(1, Math.min(8, Math.round(input.team_size || 1)));
  const pool = Math.max(0, Math.round(input.pool_cents || 0));
  const minPlayer = Math.max(SYSTEM_MIN_PLAYER_PAYOUT_CENTS, Math.round(input.min_player_cents || 0));
  const roundPlayer = Math.max(0, Math.round(input.round_player_cents || 0));
  const unit = roundPlayer > 0 ? roundPlayer * team : 0;
  // Minimum team payout, lifted to a clean multiple of the rounding unit.
  let minTeam = minPlayer * team;
  if (unit > 0) minTeam = Math.ceil(minTeam / unit) * unit;
  const requested = Math.max(0, Math.round(input.requested_places || 0));
  const maxPlaces = minTeam > 0 ? Math.floor(pool / minTeam) : 0;
  const n = Math.min(requested, maxPlaces);

  const base: Omit<PayoutSchedule, "places" | "total_paid_cents" | "remainder_cents"> = {
    pool_cents: pool,
    team_size: team,
    min_player_cents: minPlayer,
    min_team_cents: minTeam,
    max_places: maxPlaces,
    requested_places: requested,
    depth_note: null,
    curve_version: input.curve_version ?? PAYOUT_CURVE_VERSION,
  };
  const who = team > 1 ? "teams" : "places";
  if (requested > maxPlaces) {
    base.depth_note =
      maxPlaces === 0
        ? `With a ${dollars(minPlayer)}/player minimum, this pool is too small to pay anyone.`
        : `With a ${dollars(minPlayer)}/player minimum, this pool can pay a maximum of ${maxPlaces} ${maxPlaces === 1 ? (team > 1 ? "team" : "place") : who}.`;
  }
  if (n === 0) {
    return { ...base, places: [], total_paid_cents: 0, remainder_cents: pool };
  }

  const hold = input.remainder_to === "hold";
  const targets = curve(n, input.curve, input.curve_b).map((w) => w * pool);
  const out = Array.from({ length: n }, () => minTeam);
  let left = pool - minTeam * n;

  if (unit === 0) {
    // Exact: share what's above the minimums on the curve, to the cent.
    const extra = targets.map((t) => Math.max(0, t - minTeam));
    const sum = extra.reduce((s, x) => s + x, 0) || 1;
    const add = extra.map((x) => Math.floor((left * x) / sum));
    add.forEach((a, i) => (out[i]! += a));
    left -= add.reduce((s, x) => s + x, 0);
    if (!hold) {
      out[0]! += left;
      left = 0;
    }
  } else {
    // Cash-friendly: hand out one clean step at a time to whichever place is
    // furthest below its target, never letting a place pass the one above it.
    while (left >= unit) {
      let best = -1;
      let bestGap = -Infinity;
      for (let i = 0; i < n; i++) {
        if (i > 0 && out[i]! + unit > out[i - 1]!) continue;
        const gap = targets[i]! - out[i]!;
        if (gap > bestGap) {
          bestGap = gap;
          best = i;
        }
      }
      if (best < 0) break;
      out[best]! += unit;
      left -= unit;
    }
    // Whatever can't be paid in clean steps goes to 1st place unless the director routes it elsewhere.
    if (!hold) {
      out[0]! += left;
      left = 0;
    }
  }

  const places = out.map((c, i) => ({
    place: i + 1,
    cents: c,
    per_player_cents: Math.floor(c / team),
  }));
  const total = out.reduce((s, c) => s + c, 0);
  return { ...base, places, total_paid_cents: total, remainder_cents: pool - total };
}

/** Places a style implies for a given number of entries (teams or players). */
export function requestedPlaces(
  style: "top_percent" | "top_count",
  entries: number,
  value: number,
): number {
  if (entries <= 0) return 0;
  if (style === "top_percent") return Math.max(1, Math.ceil((entries * Math.max(0, value)) / 100));
  return Math.min(entries, Math.max(1, Math.round(value)));
}

/**
 * Splits payouts when entries tie: tied entries pool the money for the places
 * they cover and share it evenly to the cent (never rounded down to a cash step;
 * only indivisible cents go to the remainder). `ranks` is each entry's finishing place, e.g. [1, 2, 2, 4].
 */
export function splitTies(
  schedule: PayoutSchedule,
  ranks: number[],
  round_player_cents = 0,
): { rank: number; cents: number; per_player_cents: number }[] & { remainder_cents?: number } {
  const team = schedule.team_size;
  const step = round_player_cents > 0 ? round_player_cents * team : 1;
  const byPlace = new Map(schedule.places.map((p) => [p.place, p.cents]));
  const counts = new Map<number, number>();
  ranks.forEach((r) => counts.set(r, (counts.get(r) ?? 0) + 1));
  let remainder = 0;
  const share = new Map<number, number>();
  for (const [rank, n] of counts) {
    let total = 0;
    for (let i = 0; i < n; i++) total += byPlace.get(rank + i) ?? 0;
    // Tied entries share exactly; a clean step is used only when it divides evenly,
    // so a tie never shaves money off a player. Only indivisible cents remain.
    void step;
    const each = Math.floor(total / n);
    remainder += total - each * n;
    share.set(rank, each);
  }
  const out = ranks.map((rank) => {
    const cents = share.get(rank) ?? 0;
    return { rank, cents, per_player_cents: Math.floor(cents / team) };
  }) as ReturnType<typeof splitTies>;
  out.remainder_cents = remainder;
  return out;
}

export type RoundingResult = {
  /** Amounts owed before rounding, for audit. */
  raw_cents: number[];
  /** Amounts after protected rounding — each is >= its raw amount. */
  final_cents: number[];
  /** Extra money needed to pay the rounded amounts (0 when exact). */
  extra_required_cents: number;
  /** True when rounding can be paid from the available funds. */
  funded: boolean;
};

/**
 * Player value protection for amounts that are already owed. Rounding goes UP
 * to the step (per player, so team amounts move in step × team_size), never
 * down. If the available money can't cover the rounded total, nothing is taken
 * from another recipient — the caller must add funds, pay exact, or pick a
 * smaller step.
 */
export function protectRounding(rawCents: number[], stepPerPlayerCents: number, teamSize = 1, availableCents?: number): RoundingResult {
  const raw = rawCents.map((c) => Math.max(0, Math.round(c)));
  const team = Math.max(1, Math.round(teamSize));
  const unit = Math.max(0, Math.round(stepPerPlayerCents)) * team;
  const final = unit > 0 ? raw.map((c) => Math.ceil(c / unit) * unit) : [...raw];
  const rawTotal = raw.reduce((s, c) => s + c, 0);
  const finalTotal = final.reduce((s, c) => s + c, 0);
  const available = availableCents ?? rawTotal;
  const extra = Math.max(0, finalTotal - available);
  return { raw_cents: raw, final_cents: final, extra_required_cents: extra, funded: extra === 0 };
}
