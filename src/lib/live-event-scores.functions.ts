/**
 * Shared live scoring for one PDGA event, week by week.
 *
 * PDGA publishes live scoring per round (`/live/event/<id>/<DIV>/scores?round=N`).
 * A weekly league is one event with a round per week, so a ten-week season keeps
 * adding rounds all season. This reads the mirrored field out of
 * `live_event_scores` and, when the mirror has gone stale, refreshes it first so
 * nobody has to press a sync button.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type LiveScoreboardRow = {
  pdga_number: string;
  player_name: string | null;
  /** Current PDGA rating, looked up through the shared rating resolver. */
  current_rating: number | null;
  division: string | null;
  round_number: number;
  place: number | null;
  round_score: number | null;
  round_to_par: number | null;
  total: number | null;
  to_par: number | null;
  thru: number | null;
  completed: boolean;
  round_started: boolean;
  tee_time: string | null;
  card_number: string | null;
};

export type LiveScoreboard = {
  eventRef: string;
  name: string | null;
  tier: string | null;
  /** True when the event is a weekly league, so rounds read as "Week 3". */
  weekly: boolean;
  /** Rounds that already have published scoring, ascending. */
  rounds: number[];
  divisions: string[];
  rows: LiveScoreboardRow[];
  lastSyncedAt: string | null;
  status: string | null;
};

/** Refresh the mirror when it's older than this, in minutes. */
const STALE_MINUTES = 4;

function isWeekly(name: string | null, tier: string | null): boolean {
  if ((tier ?? "").toUpperCase() === "L") return true;
  const s = (name ?? "").toLowerCase();
  return /\bleague\b|\bweekly\b|\bseason\b/.test(s);
}

export const getEventLiveScoreboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        eventRef: z.string().min(1).max(24),
        /** Force a refresh even when the mirror looks fresh. */
        refresh: z.boolean().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }): Promise<LiveScoreboard> => {
    const { supabase } = context;
    const eventRef = data.eventRef.trim();

    const [{ data: eventRow }, { data: registryRow }] = await Promise.all([
      supabase
        .from("pdga_tour_events")
        .select("name, tier, start_date, end_date, location")
        .eq("pdga_event_id", eventRef)
        .maybeSingle(),
      supabase
        .from("live_sync_registry")
        .select("last_synced_at, last_status, end_date")
        .eq("event_ref", eventRef)
        .maybeSingle(),
    ]);

    const name = eventRow?.name ?? null;
    const tier = eventRow?.tier ?? null;
    const today = new Date().toISOString().slice(0, 10);
    const endDate = eventRow?.end_date ?? registryRow?.end_date ?? null;
    const overRunning = !!endDate && endDate < today;

    // Keep the event on the automatic schedule and top it up when the mirror
    // has aged out. Finished events are read straight from the mirror.
    const lastSynced = registryRow?.last_synced_at ? Date.parse(registryRow.last_synced_at) : 0;
    const stale = !lastSynced || Date.now() - lastSynced > STALE_MINUTES * 60_000;
    let syncedAt = registryRow?.last_synced_at ?? null;
    let status = registryRow?.last_status ?? null;
    if (!overRunning && (data.refresh || stale)) {
      try {
        const [{ registerEventsForLiveSync }, { syncEventLiveScores }] = await Promise.all([
          import("@/lib/live/friend-live.server"),
          import("@/lib/live/pdga-live.server"),
        ]);
        await registerEventsForLiveSync([
          {
            eventRef,
            name,
            location: eventRow?.location ?? null,
            startDate: eventRow?.start_date ?? null,
            endDate,
            priority: 1,
          },
        ]);
        const outcome = await syncEventLiveScores(eventRef);
        syncedAt = new Date().toISOString();
        status = outcome.status;
      } catch {
        /* the mirror still serves whatever was stored last time */
      }
    }

    const { data: scoreRows, error } = await supabase
      .from("live_event_scores")
      .select(
        "pdga_number, player_name, division, round_number, place, running_place, round_score, round_to_par, total, to_par, thru, completed, round_started, tee_time, card_number",
      )
      .eq("event_ref", eventRef)
      .order("round_number", { ascending: true })
      .limit(4000);
    if (error) throw new Error("We couldn't load live scoring just now. Try again shortly.");

    const rows: LiveScoreboardRow[] = [];
    const rounds = new Set<number>();
    const divisions = new Set<string>();
    for (const row of scoreRows ?? []) {
      const round = Number(row.round_number ?? 0);
      if (!round) continue;
      rounds.add(round);
      if (row.division) divisions.add(String(row.division).toUpperCase());
      rows.push({
        pdga_number: String(row.pdga_number),
        player_name: row.player_name ?? null,
        current_rating: null,
        division: row.division ?? null,
        round_number: round,
        place: row.place ?? row.running_place ?? null,
        round_score: row.round_score ?? null,
        round_to_par: row.round_to_par ?? null,
        total: row.total ?? null,
        to_par: row.to_par ?? null,
        thru: row.thru ?? null,
        completed: !!row.completed,
        round_started: !!row.round_started,
        tee_time: row.tee_time ?? null,
        card_number: row.card_number ?? null,
      });
    }

    // Every player on the board shows their current rating, same source the
    // event field list uses.
    try {
      const { resolvePdgaRatings } = await import("@/lib/pdga-ratings.server");
      const ratings = await resolvePdgaRatings(
        rows.map((r) => r.pdga_number),
        { eventRef },
      );
      for (const row of rows) row.current_rating = ratings.get(row.pdga_number) ?? null;
    } catch {
      /* the board still renders without ratings */
    }

    return {
      eventRef,
      name,
      tier,
      weekly: isWeekly(name, tier),
      rounds: [...rounds].sort((a, b) => a - b),
      divisions: [...divisions].sort(),
      rows,
      lastSyncedAt: syncedAt,
      status,
    };
  });
