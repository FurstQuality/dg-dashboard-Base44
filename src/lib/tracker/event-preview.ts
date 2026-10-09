/**
 * Pure math behind the tracker event preview: field strength summaries and the
 * rating-only odds simulation. No I/O here so it stays unit-testable and safe
 * to import from either the server functions or the client components.
 */

export type FieldRow = {
  pdgaNumber: string;
  name: string;
  division: string | null;
  rating: number | null;
  place: number | null;
  totalToPar: number | null;
};

export type FieldStrength = {
  /** Registrants counted for this summary. */
  players: number;
  /** How many of those registrants have a published rating. */
  rated: number;
  /** Percentage of the field with a published rating, 0-100. */
  ratedPct: number;
  averageRating: number | null;
  medianRating: number | null;
  /** Average of the ten highest rated players, the usual "top of the field" read. */
  top10Average: number | null;
  highestRating: number | null;
  lowestRating: number | null;
  /** Highest minus lowest rating; null when fewer than two rated players. */
  spread: number | null;
};

const median = (sorted: number[]): number | null => {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

/** Summarise a set of field rows. Rows without ratings still count as players. */
export function fieldStrength(rows: FieldRow[]): FieldStrength {
  const ratings = rows
    .map((r) => r.rating)
    .filter((r): r is number => typeof r === "number" && Number.isFinite(r) && r > 0)
    .sort((a, b) => a - b);
  const players = rows.length;
  const rated = ratings.length;
  const avg = rated ? Math.round(ratings.reduce((s, r) => s + r, 0) / rated) : null;
  const desc = [...ratings].reverse();
  const top10 = desc.slice(0, 10);
  return {
    players,
    rated,
    ratedPct: players ? Math.round((rated / players) * 100) : 0,
    averageRating: avg,
    medianRating: median(ratings),
    top10Average: top10.length ? Math.round(top10.reduce((s, r) => s + r, 0) / top10.length) : null,
    highestRating: desc[0] ?? null,
    lowestRating: ratings[0] ?? null,
    spread: rated > 1 ? desc[0] - ratings[0] : null,
  };
}

export type DivisionField = {
  division: string;
  players: FieldRow[];
  strength: FieldStrength;
};

/**
 * Group field rows by division, strongest division first (by top-10 average).
 * Rows with no published division land in an "Unlisted" bucket rather than
 * being silently dropped.
 */
export function groupFieldByDivision(rows: FieldRow[]): DivisionField[] {
  const buckets = new Map<string, FieldRow[]>();
  for (const row of rows) {
    const key = row.division?.trim() || "Unlisted";
    const list = buckets.get(key);
    if (list) list.push(row);
    else buckets.set(key, [row]);
  }
  return [...buckets.entries()]
    .map(([division, players]) => ({
      division,
      players: [...players].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1)),
      strength: fieldStrength(players),
    }))
    .sort((a, b) => (b.strength.top10Average ?? -1) - (a.strength.top10Average ?? -1));
}

export type SimulatedOdds = { winPct: number; top3Pct: number; cashPct: number; sims: number };

/**
 * Deterministic Monte Carlo placement simulation from ratings alone, mirroring
 * the Game Plan model (90-point Elo scale, 45-point per-round noise) so the
 * preview and Game Plan never disagree for the same field.
 */
export function simulateOdds(
  meRating: number,
  opponents: number[],
  cashLine: number,
  sims = 400,
): SimulatedOdds {
  const field = opponents.filter((r) => Number.isFinite(r) && r > 0);
  if (!field.length) return { winPct: 0, top3Pct: 0, cashPct: 0, sims: 0 };
  let seed = (meRating || 900) * 9301 + field.length * 49297;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const noise = 45;
  const gauss = () => {
    const u = Math.max(1e-9, Math.min(1 - 1e-9, rand()));
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  let wins = 0;
  let top3 = 0;
  let cash = 0;
  const line = Math.max(1, Math.round(cashLine));
  for (let s = 0; s < sims; s++) {
    const mine = meRating + gauss() * noise;
    let rank = 1;
    for (const r of field) if (r + gauss() * noise > mine) rank += 1;
    if (rank === 1) wins += 1;
    if (rank <= 3) top3 += 1;
    if (rank <= line) cash += 1;
  }
  return {
    winPct: Math.round((wins / sims) * 100),
    top3Pct: Math.round((top3 / sims) * 100),
    cashPct: Math.round((cash / sims) * 100),
    sims,
  };
}

/** PDGA pays roughly the top 40% of a division; used as the cash line default. */
export function cashLineFor(playersInDivision: number): number {
  return Math.max(1, Math.round(playersInDivision * 0.4));
}
