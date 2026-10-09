import type { SupabaseClient } from "@supabase/supabase-js";
import { ledgestonePoolRounds, normalizePool } from "@/lib/ledgestone-2026-schedule";

/**
 * Fill in the Ledgestone Open pool rotation for rounds PDGA live scoring has
 * not published yet.
 *
 * Each pool plays a different course every day, so without this a tracked
 * player shows "Course TBD" for every round that has not started. Live data
 * always wins: a (round, pool) pair that already has a course from PDGA is
 * never touched, and the published-schedule rows are only inserted where
 * nothing exists.
 *
 * Returns the number of scheduled rounds added.
 */
export async function seedLedgestonePoolRounds(
  supabase: SupabaseClient,
  eventId: string,
): Promise<number> {
  const { data: existing, error } = await supabase
    .from("tracker_event_rounds")
    .select("id, round_number, division, pool, course_name, round_date")
    .eq("event_id", eventId);
  if (error) return 0;

  const covered = new Set<string>();
  for (const r of existing ?? []) {
    const row = r as {
      round_number: number | null;
      pool: string | null;
      course_name: string | null;
    };
    const pool = normalizePool(row.pool);
    if (pool && row.course_name && row.round_number != null)
      covered.add(`${row.round_number}:${pool}`);
  }

  const inserts = ledgestonePoolRounds()
    .filter((r) => !covered.has(`${r.round_number}:${r.pool}`))
    .map((r) => ({
      event_id: eventId,
      round_number: r.round_number,
      division: null as string | null,
      pool: r.pool,
      course_name: r.course_name,
      round_date: r.round_date,
    }));

  if (inserts.length === 0) return 0;
  const { error: insErr } = await supabase.from("tracker_event_rounds").insert(inserts);
  if (insErr) return 0;
  return inserts.length;
}
