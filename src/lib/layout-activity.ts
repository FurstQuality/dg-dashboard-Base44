/**
 * Ranks a course's layouts by real play activity so the app opens the layout
 * players actually use today instead of whichever one was created first.
 */
import { supabase } from "@/integrations/supabase/client";

export type LayoutActivity = {
  /** ISO timestamp of the most recent round played on the layout. */
  lastPlayed: string | null;
  /** Rounds played on the layout inside the sampled window. */
  rounds: number;
};

/** How many recent rounds to sample per course. Plenty for ranking layouts. */
const SAMPLE_SIZE = 500;

/** Reads recent rounds for a course and tallies them per layout. */
export async function fetchLayoutActivity(courseId: string): Promise<Map<string, LayoutActivity>> {
  const activity = new Map<string, LayoutActivity>();
  const { data } = await supabase
    .from("rounds")
    .select("layout_id, started_at")
    .eq("course_id", courseId)
    .order("started_at", { ascending: false })
    .limit(SAMPLE_SIZE);

  for (const row of data ?? []) {
    const id = row.layout_id;
    if (!id) continue;
    const prev = activity.get(id);
    if (prev) {
      prev.rounds += 1;
      if (!prev.lastPlayed || (row.started_at && row.started_at > prev.lastPlayed)) {
        prev.lastPlayed = row.started_at;
      }
    } else {
      activity.set(id, { lastPlayed: row.started_at ?? null, rounds: 1 });
    }
  }
  return activity;
}

type RankableLayout = { id: string; is_default?: boolean | null; name?: string | null };

/**
 * Most recently played first, then most played, then the marked default, then
 * name. Layouts nobody has played yet fall to the bottom.
 */
export function sortLayoutsByActivity<T extends RankableLayout>(
  layouts: T[],
  activity: Map<string, LayoutActivity>,
): T[] {
  return [...layouts].sort((a, b) => {
    const ma = activity.get(a.id);
    const mb = activity.get(b.id);
    const la = ma?.lastPlayed ?? "";
    const lb = mb?.lastPlayed ?? "";
    if (la !== lb) return lb.localeCompare(la);
    const ra = ma?.rounds ?? 0;
    const rb = mb?.rounds ?? 0;
    if (ra !== rb) return rb - ra;
    const da = a.is_default ? 1 : 0;
    const db = b.is_default ? 1 : 0;
    if (da !== db) return db - da;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
}

/** Picks the layout the course builder should open by default. */
export async function pickActiveLayoutId(
  courseId: string,
  layouts: RankableLayout[],
): Promise<string | undefined> {
  if (layouts.length === 0) return undefined;
  if (layouts.length === 1) return layouts[0].id;
  const activity = await fetchLayoutActivity(courseId);
  return sortLayoutsByActivity(layouts, activity)[0]?.id;
}

/**
 * The layout this player most recently played at the course, counting rounds
 * they were a card player on, not just ones they created. Null when they have
 * never played here.
 */
export async function fetchPlayerLastLayoutId(
  courseId: string,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("round_players")
    .select("round:rounds!round_players_round_id_fkey!inner(layout_id, started_at, course_id)")
    .eq("user_id", userId)
    .eq("round.course_id", courseId)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as unknown as Array<{
    round: { layout_id: string | null; started_at: string | null } | null;
  }>;
  let bestId: string | null = null;
  let bestAt = "";
  for (const row of rows) {
    const id = row.round?.layout_id;
    if (!id) continue;
    const at = row.round?.started_at ?? "";
    if (!bestId || at > bestAt) {
      bestId = id;
      bestAt = at;
    }
  }
  return bestId;
}

/**
 * Ranks layouts for one player: the layout they last played here first, then
 * whatever the course as a whole is playing now.
 */
export async function loadPlayerLayoutOrder<T extends RankableLayout>(
  courseId: string,
  layouts: T[],
  userId?: string | null,
): Promise<T[]> {
  if (layouts.length <= 1) return layouts;
  const [activity, mine] = await Promise.all([
    fetchLayoutActivity(courseId),
    userId ? fetchPlayerLastLayoutId(courseId, userId) : Promise.resolve(null),
  ]);
  const ranked = sortLayoutsByActivity(layouts, activity);
  if (!mine) return ranked;
  const own = ranked.find((l) => l.id === mine);
  return own ? [own, ...ranked.filter((l) => l.id !== mine)] : ranked;
}
