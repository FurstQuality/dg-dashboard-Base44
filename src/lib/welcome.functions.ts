/**
 * Welcome tour progress — live counts that tell a brand-new player which
 * features they've already tried, so the welcome page can celebrate real
 * activity instead of a static checklist.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WelcomeProgress = {
  clubs: number;
  rounds: number;
  importedRounds: number;
  friends: number;
  trackedEvents: number;
  bagDiscs: number;
  pdgaLinked: boolean;
  hasThrowProfile: boolean;
};

export const getWelcomeProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WelcomeProgress> => {
    const { supabase, userId } = context;
    const head = { count: "exact" as const, head: true };

    const [clubs, rounds, imported, friends, events, discs, profile, throwProfile] =
      await Promise.all([
        supabase.from("club_members").select("club_id", head).eq("user_id", userId),
        supabase.from("rounds").select("id", head).eq("created_by", userId),
        supabase.from("external_rounds").select("id", head).eq("user_id", userId),
        supabase
          .from("friendships")
          .select("id", head)
          .eq("status", "accepted")
          .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
        supabase.from("scheduled_events").select("id", head).eq("user_id", userId),
        supabase.from("user_discs").select("id", head).eq("user_id", userId).is("retired_at", null),
        supabase.from("profiles").select("pdga_number").eq("id", userId).maybeSingle(),
        supabase.from("throwing_profiles").select("user_id").eq("user_id", userId).maybeSingle(),
      ]);

    return {
      clubs: clubs.count ?? 0,
      rounds: rounds.count ?? 0,
      importedRounds: imported.count ?? 0,
      friends: friends.count ?? 0,
      trackedEvents: events.count ?? 0,
      bagDiscs: discs.count ?? 0,
      pdgaLinked: !!profile.data?.pdga_number,
      hasThrowProfile: !!throwProfile.data,
    };
  });
