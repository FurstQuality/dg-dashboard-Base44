import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildTrackerHoleInsights,
  type TrackerEventMeta,
  type TrackerScoreRow,
} from "@/lib/stats/tracker-hole-stats";

type Client = {
  from: (table: string) => any;
};

/**
 * Statboard feed for verified PDGA hole-by-hole data captured by the friend
 * tracker. Matches the signed-in player's linked PDGA number against tracker
 * live scores, then joins the tracker's published round/pool schedule so each
 * round is attributed to the correct course.
 */
export const getTrackerHoleStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as { supabase: Client; userId: string };

    const profileRes = await supabase
      .from("profiles")
      .select("pdga_number")
      .eq("id", userId)
      .maybeSingle();
    const pdgaNumber = String(profileRes?.data?.pdga_number ?? "").replace(/\D/g, "");
    if (!pdgaNumber) {
      return { linked: false as const, pdgaNumber: null, insights: null };
    }

    const scoresRes = await supabase
      .from("tracker_live_scores")
      .select(
        "id, event_id, pdga_number, round_number, division, place, round_score, round_to_par, completed, hole_scores, hole_pars, hole_lengths, hole_length_units",
      )
      .eq("pdga_number", pdgaNumber)
      .limit(1000);
    const rows = (scoresRes?.data ?? []) as TrackerScoreRow[];
    if (!rows.length) {
      return { linked: true as const, pdgaNumber, insights: null };
    }

    const eventIds = Array.from(new Set(rows.map((r) => r.event_id)));
    const [eventsRes, roundsRes, parRowsRes] = await Promise.all([
      supabase
        .from("tracker_group_events")
        .select("id, name, event_date, location, live_scoring_url, pdga_event_ref")
        .in("id", eventIds),
      supabase
        .from("tracker_event_rounds")
        .select("event_id, round_number, course_name")
        .in("event_id", eventIds),
      // Every card in a round plays the same layout, so a par set posted for
      // any tracked player fills in rounds where the player's own row predates
      // par capture.
      supabase
        .from("tracker_live_scores")
        .select("event_id, round_number, hole_pars")
        .in("event_id", eventIds)
        .not("hole_pars", "is", null)
        .limit(1000),
    ]);

    // Older imports stored scores without par/distance. Pull the layout from
    // PDGA once so verified insights can bucket holes by length.
    const hasNums = (v: unknown) => Array.isArray(v) && (v as number[]).some((n) => Number(n) > 0);
    if (rows.some((r) => hasNums(r.hole_scores) && !hasNums(r.hole_pars))) {
      const { backfillTrackerHoleMeta, pdgaTournIdFrom } =
        await import("@/lib/tracker-hole-meta.server");
      const tournIdByEvent = new Map<string, string>();
      for (const e of (eventsRes?.data ?? []) as Array<{
        id: string;
        live_scoring_url: string | null;
        pdga_event_ref: string | null;
      }>) {
        const tournId = pdgaTournIdFrom(e.live_scoring_url, e.pdga_event_ref);
        if (tournId) tournIdByEvent.set(e.id, tournId);
      }
      try {
        await backfillTrackerHoleMeta(supabase, rows as never, tournIdByEvent);
      } catch {
        // Best effort — insights still render from round totals.
      }
    }

    const events = new Map<string, TrackerEventMeta>();
    for (const e of (eventsRes?.data ?? []) as Array<{
      id: string;
      name: string | null;
      event_date: string | null;
      location: string | null;
    }>) {
      events.set(e.id, { name: e.name, date: e.event_date, location: e.location });
    }

    const parsByRound = new Map<string, Array<number | null>>();
    for (const r of (parRowsRes?.data ?? []) as Array<{
      event_id: string;
      round_number: number | null;
      hole_pars: unknown;
    }>) {
      const key = `${r.event_id}:${r.round_number ?? 0}`;
      if (parsByRound.has(key) || !Array.isArray(r.hole_pars)) continue;
      parsByRound.set(
        key,
        (r.hole_pars as unknown[]).map((v) => {
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? n : null;
        }),
      );
    }

    // Multiple pools can share a round number on different courses. Only map a
    // course when every posted pool for that round agrees, so a player is never
    // credited to a course they didn't play.
    const candidates = new Map<string, Set<string>>();
    for (const r of (roundsRes?.data ?? []) as Array<{
      event_id: string;
      round_number: number;
      course_name: string | null;
    }>) {
      if (!r.course_name) continue;
      const key = `${r.event_id}:${r.round_number}`;
      const set = candidates.get(key) ?? new Set<string>();
      set.add(r.course_name);
      candidates.set(key, set);
    }
    const courseByRound = new Map<string, string>();
    for (const [key, set] of candidates) {
      if (set.size === 1) courseByRound.set(key, Array.from(set)[0]);
    }

    return {
      linked: true as const,
      pdgaNumber,
      insights: buildTrackerHoleInsights(rows, events, courseByRound, parsByRound),
    };
  });
