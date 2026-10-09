/**
 * Official pool rotation for the 2026 Discraft Ledgestone Open.
 *
 * Source: https://ledgestoneopen.com/event/2026/course-schedule.aspx
 * Every pool plays a different course each day, in a different order than the
 * other pools, so a player's pool — not their division — decides the course.
 *
 * This is a published-schedule fallback only. Anything PDGA live scoring
 * reports for a pool always wins, because that reflects what was actually
 * played (the event site notes the schedule is subject to change).
 */

/** Days of the main event, in play order. */
export const LEDGESTONE_2026_DAYS = [
  "2026-07-30",
  "2026-07-31",
  "2026-08-01",
  "2026-08-02",
] as const;

export type LedgestoneDay = (typeof LEDGESTONE_2026_DAYS)[number];

/**
 * Pool letter → course played on each date. Pools A and B (the pro pools)
 * start Thursday and play four rounds; every other pool plays Friday–Sunday.
 */
export const LEDGESTONE_2026_POOL_SCHEDULE: Record<
  string,
  Partial<Record<LedgestoneDay, string>>
> = {
  A: {
    "2026-07-30": "Eureka Temp",
    "2026-07-31": "Northwood Black Long",
    "2026-08-01": "Northwood Black Long",
    "2026-08-02": "Eureka Temp",
  },
  B: {
    "2026-07-30": "Northwood Black Shorts",
    "2026-07-31": "Sunset Hills",
    "2026-08-01": "Sunset Hills",
    "2026-08-02": "Northwood Black Shorts",
  },
  C: { "2026-07-31": "Northwood Blue", "2026-08-01": "Sunset Hills", "2026-08-02": "Kennel Lake" },
  D: { "2026-07-31": "Bradley Park", "2026-08-01": "Sunset Hills", "2026-08-02": "Kennel Lake" },
  E: {
    "2026-07-31": "McNaughton Park",
    "2026-08-01": "Wildlife Prairie Park",
    "2026-08-02": "Sunset Hills",
  },
  F: {
    "2026-07-31": "Bradley Park",
    "2026-08-01": "Brady Park",
    "2026-08-02": "Northwood Black Shorts",
  },
  G: { "2026-07-31": "Sunset Hills", "2026-08-01": "Brady Park", "2026-08-02": "Kennel Lake" },
  H: { "2026-07-31": "Northwood Blue", "2026-08-01": "Washington Park", "2026-08-02": "ICC" },
  I: {
    "2026-07-31": "Northwood Blue",
    "2026-08-01": "Three Sisters Park",
    "2026-08-02": "Washington Park",
  },
  J: {
    "2026-07-31": "Bradley Park",
    "2026-08-01": "Three Sisters Park",
    "2026-08-02": "Washington Park",
  },
  K: {
    "2026-07-31": "Sunset Hills",
    "2026-08-01": "Three Sisters Park",
    "2026-08-02": "Kennel Lake",
  },
  L: { "2026-07-31": "Washington Park", "2026-08-01": "Sunset Hills", "2026-08-02": "ICC" },
  M: { "2026-07-31": "Washington Park", "2026-08-01": "Three Sisters Park", "2026-08-02": "ICC" },
  N: { "2026-07-31": "Three Sisters Park", "2026-08-01": "ICC", "2026-08-02": "Bradley Park" },
  O: { "2026-07-31": "ICC", "2026-08-01": "Bradley Park", "2026-08-02": "Three Sisters Park" },
  P: {
    "2026-07-31": "Eureka Temp",
    "2026-08-01": "McNaughton Park",
    "2026-08-02": "Wildlife Prairie Park",
  },
  Q: {
    "2026-07-31": "Wildlife Prairie Park",
    "2026-08-01": "Eureka Temp",
    "2026-08-02": "McNaughton Park",
  },
  R: { "2026-07-31": "Kennel Lake", "2026-08-01": "Northwood Blue", "2026-08-02": "Brady Park" },
  S: { "2026-07-31": "Brady Park", "2026-08-01": "Kennel Lake", "2026-08-02": "Northwood Blue" },
  T: {
    "2026-07-31": "Maxwell Park Disc Golf Course",
    "2026-08-01": "Lake Eureka Disc Golf Course",
    "2026-08-02": "Westwood",
  },
  U: {
    "2026-07-31": "Lake Eureka Disc Golf Course",
    "2026-08-01": "Westwood",
    "2026-08-02": "Maxwell Park Disc Golf Course",
  },
  V: {
    "2026-07-31": "Westwood",
    "2026-08-01": "Maxwell Park Disc Golf Course",
    "2026-08-02": "Lake Eureka Disc Golf Course",
  },
  W: { "2026-07-31": "Northwood Blue", "2026-08-01": "Washington Park", "2026-08-02": "ICC" },
  X: {
    "2026-07-31": "Sunset Hills",
    "2026-08-01": "Brady Park",
    "2026-08-02": "Northwood Black Shorts",
  },
  Y: { "2026-07-31": "Sunset Hills", "2026-08-01": "Brady Park", "2026-08-02": "Washington Park" },
};

/** Pools that tee off on Thursday, so their Friday round is round 2. */
const THURSDAY_POOLS = new Set(["A", "B"]);

/** PDGA event ID for the 2026 Discraft Ledgestone Open. */
export const LEDGESTONE_2026_PDGA_EVENT = "98448";

export function isLedgestone2026(name: string | null | undefined, pdgaRef?: string | null) {
  if (pdgaRef && String(pdgaRef).trim() === LEDGESTONE_2026_PDGA_EVENT) return true;
  const n = (name ?? "").toLowerCase();
  return n.includes("ledgestone open");
}

export function normalizePool(pool: string | null | undefined): string | null {
  const p = (pool ?? "").trim().toUpperCase();
  if (!p) return null;
  // "Pool C" / "MPO - C" / "C" all mean pool C.
  const letter = p.match(/([A-Z])\s*$/)?.[1];
  return letter ?? null;
}

/** Round number a pool plays on a given date (1-based, per that pool). */
export function ledgestoneRoundNumber(pool: string, day: LedgestoneDay): number {
  const offset = THURSDAY_POOLS.has(pool) ? 0 : 1;
  return LEDGESTONE_2026_DAYS.indexOf(day) + 1 - offset;
}

export type LedgestonePoolRound = {
  pool: string;
  round_number: number;
  round_date: LedgestoneDay;
  course_name: string;
};

/** Flat list of every scheduled pool round: pool, round number, date, course. */
export function ledgestonePoolRounds(): LedgestonePoolRound[] {
  const out: LedgestonePoolRound[] = [];
  for (const [pool, byDay] of Object.entries(LEDGESTONE_2026_POOL_SCHEDULE)) {
    for (const day of LEDGESTONE_2026_DAYS) {
      const course = byDay[day];
      if (!course) continue;
      out.push({
        pool,
        round_number: ledgestoneRoundNumber(pool, day),
        round_date: day,
        course_name: course,
      });
    }
  }
  return out;
}

/** The three (or four) courses a pool plays, in order. */
export function ledgestoneRotation(pool: string | null | undefined): LedgestonePoolRound[] {
  const key = normalizePool(pool);
  if (!key || !LEDGESTONE_2026_POOL_SCHEDULE[key]) return [];
  return ledgestonePoolRounds()
    .filter((r) => r.pool === key)
    .sort((a, b) => a.round_number - b.round_number);
}

/** Course a pool plays in a given round of the main event. */
export function ledgestoneCourseFor(
  pool: string | null | undefined,
  roundNumber: number | null,
): string | null {
  const key = normalizePool(pool);
  if (!key || roundNumber == null) return null;
  return ledgestoneRotation(key).find((r) => r.round_number === roundNumber)?.course_name ?? null;
}
