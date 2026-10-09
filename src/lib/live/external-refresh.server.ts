/**
 * Background refresh of every outside data source: PDGA, Disc Golf Scene and
 * UDisc. Runs on a timer from the database scheduler so nobody in the app ever
 * has to press a sync button.
 */

import { registerEventsForLiveSync } from "@/lib/live/friend-live.server";

export type ExternalRefreshResult = {
  ranAt: string;
  directory: Array<{ source: string; ok: boolean; found: number; upserted: number }>;
  liveRegistered: number;
  playerRatings: { examined: number; rated: number };
  errors: string[];
};

/** Events starting within this many days are worth live-score tracking. */
const LIVE_WINDOW_DAYS = 2;

function dayOffset(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * One full pass: sweep the three event sources into the shared mirror, then keep
 * the live-scoring schedule stocked with the events that are in play.
 */
export async function runExternalDataRefresh(): Promise<ExternalRefreshResult> {
  const errors: string[] = [];
  let directory: ExternalRefreshResult["directory"] = [];

  try {
    const { runDirectorySweep } = await import("@/lib/event-directory.server");
    const results = await runDirectorySweep({
      sources: ["pdga", "disc_golf_scene", "udisc"],
      states: [],
      pdgaMaxPages: 4,
    });
    directory = results.map((r) => ({
      source: r.source,
      ok: r.ok,
      found: r.found,
      upserted: r.upserted,
    }));
    for (const failed of results.filter((r) => !r.ok)) {
      errors.push(`${failed.source}: sweep failed`);
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Directory sweep failed");
  }

  let liveRegistered = 0;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = dayOffset(0);
    const { data } = await supabaseAdmin
      .from("event_directory")
      .select("pdga_event_ref, name, city, state, start_date, end_date")
      .eq("source", "pdga")
      .not("pdga_event_ref", "is", null)
      .gte("end_date", today)
      .lte("start_date", dayOffset(LIVE_WINDOW_DAYS))
      .limit(200);

    const events = ((data ?? []) as Array<{
      pdga_event_ref: string | null;
      name: string | null;
      city: string | null;
      state: string | null;
      start_date: string | null;
      end_date: string | null;
    }>)
      .filter((row): row is typeof row & { pdga_event_ref: string } => !!row.pdga_event_ref)
      .map((row) => ({
        eventRef: row.pdga_event_ref,
        name: row.name,
        location: [row.city, row.state].filter(Boolean).join(", ") || null,
        startDate: row.start_date,
        endDate: row.end_date,
        priority: 1,
      }));

    if (events.length) liveRegistered = await registerEventsForLiveSync(events);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Live schedule update failed");
  }

  // Verified ratings matter more than any estimate we could show, so each pass
  // also tops up players we have on file without one.
  let playerRatings = { examined: 0, rated: 0 };
  try {
    const { backfillStoredPlayerRatings } = await import("@/lib/pdga-ratings.server");
    playerRatings = await backfillStoredPlayerRatings(40);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Player rating refresh failed");
  }

  return { ranAt: new Date().toISOString(), directory, liveRegistered, playerRatings, errors };
}
