import { publishedName } from "@/lib/tracker/placeholder-layout";
/**
 * Shared helpers for turning tracker round + tee-time rows into what a player
 * actually plays. PDGA splits a division across pools that can play different
 * courses in the same round, so a course is only accurate once you know the
 * player's pool.
 */

export type RoundCourseRow = {
  event_id: string;
  round_number: number | null;
  division: string | null;
  pool?: string | null;
  course_name: string | null;
  course_layout?: string | null;
};

export type TeeRow = {
  id: string;
  event_id: string;
  member_id: string;
  round_number: number | null;
  pool?: string | null;
  division?: string | null;
  tee_time?: string | null;
};

const norm = (v: string | null | undefined) => (v ?? "").trim().toUpperCase();

/**
 * Most specific course wins: pool match, then division match, then the
 * round-wide aggregate.
 *
 * Pool-split rounds (several courses played at once, one per pool) are the
 * dangerous case: a pool-less division or aggregate row only reflects whichever
 * pool synced last, so falling back to it reports a course the player never
 * played. When the round is pool-split and the player's pool has no row, we
 * return null ("Course TBD") instead of guessing.
 */
export function resolveRoundCourse(
  rounds: RoundCourseRow[],
  roundNumber: number | null,
  division: string | null,
  pool: string | null,
): string | null {
  return pickRoundCourseRow(rounds, roundNumber, division, pool)?.course_name ?? null;
}

/** Same resolution as resolveRoundCourse, but keeps the row so the layout is available. */
export function pickRoundCourseRow(
  rounds: RoundCourseRow[],
  roundNumber: number | null,
  division: string | null,
  pool: string | null,
): RoundCourseRow | null {
  // Legacy tee rows carry no round number; treat them as round 1 so the player
  // still sees the course instead of "TBD".
  const target = roundNumber ?? 1;
  const forRound = rounds.filter((r) => (r.round_number ?? null) === target && r.course_name);
  if (forRound.length === 0) return null;

  if (pool) {
    const byPool = forRound.find(
      (r) =>
        norm(r.pool) === norm(pool) &&
        (!r.division || !division || norm(r.division) === norm(division)),
    );
    if (byPool) return byPool;
  }

  // Does this round play more than one course? If so it is split by pool and
  // only a pool-specific row can be trusted.
  const distinctCourses = new Set(forRound.map((r) => (r.course_name ?? "").trim().toLowerCase()));
  if (distinctCourses.size > 1) return null;

  if (division) {
    const byDiv = forRound.find((r) => norm(r.division) === norm(division) && !r.pool);
    if (byDiv) return byDiv;
  }
  const aggregate = forRound.find((r) => !r.division && !r.pool);
  return aggregate ?? forRound[0] ?? null;
}

/**
 * Display label for a course. PDGA stores the venue ("Megiddo Disc Golf
 * Course") while tournaments publish the layout ("Westwood"), so showing only
 * one of them makes the same round look like two different courses across
 * screens. Show both whenever the layout adds information.
 */
export function courseLabel(
  course: string | null | undefined,
  layout: string | null | undefined,
): string | null {
  const c = publishedName(course) ?? "";
  const l = publishedName(layout) ?? "";
  if (!c) return l || null;
  if (!l) return c;
  const cn = c.toLowerCase();
  const ln = l.toLowerCase();
  if (cn.includes(ln) || ln.includes(cn)) return c;
  return `${c} (${l})`;
}

/** Course label a player sees for one round, pool-aware. */
export function resolveRoundCourseLabel(
  rounds: RoundCourseRow[],
  roundNumber: number | null,
  division: string | null,
  pool: string | null,
): string | null {
  const row = pickRoundCourseRow(rounds, roundNumber, division, pool);
  if (!row) return null;
  return courseLabel(row.course_name, row.course_layout ?? null);
}

/**
 * One tee row per member+round. A round-specific row always beats a legacy
 * row with no round number, so a stale placeholder never hides a real tee time.
 */
export function pickTeeRows<T extends TeeRow>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const key = `${r.event_id}:${r.member_id}:${r.round_number ?? "x"}`;
    const current = best.get(key);
    if (!current) {
      best.set(key, r);
      continue;
    }
    const score = (x: T) => (x.tee_time ? 2 : 0) + (x.round_number != null ? 1 : 0);
    if (score(r) > score(current)) best.set(key, r);
  }
  const out = [...best.values()];
  const hasRound = new Set<string>();
  for (const r of out) if (r.round_number != null) hasRound.add(`${r.event_id}:${r.member_id}`);
  return out.filter((r) => r.round_number != null || !hasRound.has(`${r.event_id}:${r.member_id}`));
}
