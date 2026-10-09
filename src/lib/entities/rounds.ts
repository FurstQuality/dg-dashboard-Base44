import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RoundSummary = {
  id: string;
  started_at: string;
  status: string;
  course_id: string | null;
  course_name: string | null;
  /** Holes the player has already scored (in-progress rounds only). */
  thru?: number | null;
  /** Holes on the played layout, when known. */
  total_holes?: number | null;
};


/** Canonical read for a round record. */
export function roundQueryOptions(id: string | null | undefined) {
  return queryOptions({
    queryKey: ["round", id],
    enabled: !!id,
    staleTime: 15_000,
    queryFn: async (): Promise<RoundSummary | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("rounds")
        .select("id, started_at, status, course_id")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      let courseName: string | null = null;
      if (data.course_id) {
        const { data: c } = await supabase
          .from("courses")
          .select("name")
          .eq("id", data.course_id)
          .maybeSingle();
        courseName = c?.name ?? null;
      }
      return { ...(data as Omit<RoundSummary, "course_name">), course_name: courseName };
    },
  });
}

/** The player's currently in-progress round, if any, with resume progress. */
export function activeRoundQueryOptions(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["active-round", userId],
    enabled: !!userId,
    staleTime: 15_000,
    queryFn: async (): Promise<RoundSummary | null> => {
      if (!userId) return null;
      const { data } = await supabase
        .from("rounds")
        .select("id, started_at, status, course_id, layout_id")
        .eq("created_by", userId)
        .eq("status", "in_progress")
        .order("started_at", { ascending: false })
        .limit(1);
      const row = (data ?? [])[0] as
        | (Omit<RoundSummary, "course_name"> & { layout_id: string | null })
        | undefined;
      if (!row) return null;
      let courseName: string | null = null;
      if (row.course_id) {
        const { data: c } = await supabase
          .from("courses")
          .select("name")
          .eq("id", row.course_id)
          .maybeSingle();
        courseName = c?.name ?? null;
      }

      // Resume progress: holes this player has scored out of the layout's holes.
      let thru: number | null = null;
      let totalHoles: number | null = null;
      const { data: me } = await supabase
        .from("round_players")
        .select("id")
        .eq("round_id", row.id)
        .eq("user_id", userId)
        .maybeSingle();
      if (me?.id) {
        const { count } = await supabase
          .from("round_scores")
          .select("hole_number", { count: "exact", head: true })
          .eq("round_player_id", me.id);
        thru = count ?? 0;
      }
      if (row.layout_id) {
        const { count } = await supabase
          .from("holes")
          .select("number", { count: "exact", head: true })
          .eq("layout_id", row.layout_id);
        totalHoles = count ?? null;
      }

      const { layout_id: _layoutId, ...rest } = row;
      return { ...rest, course_name: courseName, thru, total_holes: totalHoles };
    },
  });
}


/** Count of the caller's completed rounds within the last N days (default 30). */
export function recentCompletedRoundsCountQueryOptions(
  userId: string | null | undefined,
  days = 30,
) {
  return queryOptions({
    queryKey: ["rounds-count", "recent", userId, days],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      if (!userId) return 0;
      const since = new Date(Date.now() - days * 864e5).toISOString();
      const { count } = await supabase
        .from("rounds")
        .select("id", { count: "exact", head: true })
        .eq("created_by", userId)
        .eq("status", "completed")
        .gte("started_at", since);
      return count ?? 0;
    },
  });
}

/** Count of tournaments the user owns (used to detect organizer state). */
export function hostedTournamentsCountQueryOptions(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["hosted-tournaments-count", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      if (!userId) return 0;
      const { count } = await supabase
        .from("tournaments")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId);
      return count ?? 0;
    },
  });
}
