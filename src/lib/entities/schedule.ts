import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ScheduleRow = {
  id: string;
  title: string;
  starts_on: string | null;
  ends_on: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  tier: string | null;
  event_url: string | null;
  source: string | null;
  external_id: string | null;
};

/**
 * Canonical read for a player's scheduled events (PDGA-sourced + user-added).
 * Consumed by Feed Upcoming, Play Up-Next, My Schedule, and Community Overview
 * so every surface reconciles from the same rows.
 */
export function scheduleQueryOptions(
  userId: string | null | undefined,
  opts: { from?: string; limit?: number } = {},
) {
  const from = opts.from ?? new Date().toISOString().slice(0, 10);
  const limit = opts.limit ?? 10;
  return queryOptions({
    queryKey: ["schedule", userId, from, limit],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<ScheduleRow[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("scheduled_events")
        .select(
          "id, title, starts_on, ends_on, location, city, state, tier, event_url, source, external_id",
        )
        .eq("user_id", userId)
        .gte("starts_on", from)
        .order("starts_on", { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as ScheduleRow[];
    },
  });
}
