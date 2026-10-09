/**
 * Extra detail for the People directory rows.
 *
 * Ratings, achievements and goals live in owner-only tables, so a directory
 * row can't read them directly. This resolves them with the service client and
 * then applies each player's own profile-visibility choices before anything
 * leaves the worker.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mergePrivacyPrefs, type PrivacyPrefs } from "@/lib/platform-config";
import {
  canViewAudience,
  effectiveSectionVisibility,
  resolveProfileViewer,
} from "@/lib/profile-visibility";

export type PersonHighlight = {
  userId: string;
  /** Official PDGA number, when the player shows their PDGA card. */
  pdgaNumber: string | null;
  pdgaRating: number | null;
  /** In-app rating calculated from rated rounds. */
  dgdRating: number | null;
  ratedRounds: number | null;
  division: string | null;
  achievements: number | null;
  latestAchievement: string | null;
  activeGoals: number | null;
  goalTitle: string | null;
  goalProgress: number | null;
  goalTarget: number | null;
};

type CardRow = {
  user_id: string;
  dgd_rating: number | null;
  rated_rounds: number | null;
  achievements: number | null;
  active_goals: number | null;
  goal_title: string | null;
  goal_progress: number | null;
  goal_target: number | null;
  latest_achievement: string | null;
};

export const listPeopleHighlights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ userIds: z.array(z.string().uuid()).max(60) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<PersonHighlight[]> => {
    const ids = Array.from(new Set(data.userIds));
    if (ids.length === 0) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const viewerId = context.userId;

    const [profilesRes, cardsRes, friendsRes] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, pdga_number, pdga_rating, preferred_division, privacy_prefs")
        .in("id", ids),
      (
        supabaseAdmin as unknown as {
          rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: CardRow[] | null }>;
        }
      ).rpc("people_directory_cards", { _ids: ids }),
      supabaseAdmin
        .from("friendships")
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${viewerId},addressee_id.eq.${viewerId}`),
    ]);

    const friendIds = new Set<string>();
    for (const row of (friendsRes.data ?? []) as Array<{
      requester_id: string;
      addressee_id: string;
    }>) {
      friendIds.add(row.requester_id === viewerId ? row.addressee_id : row.requester_id);
    }

    const cards = new Map<string, CardRow>();
    for (const row of (cardsRes.data ?? []) as CardRow[]) cards.set(row.user_id, row);

    const profiles = (profilesRes.data ?? []) as Array<{
      id: string;
      pdga_number: string | null;
      pdga_rating: number | null;
      preferred_division: string | null;
      privacy_prefs?: Partial<PrivacyPrefs> | null;
    }>;

    return profiles.map((profile) => {
      const privacy = mergePrivacyPrefs(profile.privacy_prefs);
      const viewer = resolveProfileViewer(profile.id === viewerId, friendIds.has(profile.id));
      const sections = effectiveSectionVisibility(privacy.profileVisibility, privacy.sections);
      const can = (key: keyof typeof sections) => canViewAudience(sections[key], viewer);
      const card = cards.get(profile.id);

      const showPdga = can("pdga");
      const showRatings = can("ratings");
      const showAchievements = can("achievements");
      const showProgress = can("progress");

      return {
        userId: profile.id,
        pdgaNumber: showPdga ? profile.pdga_number : null,
        pdgaRating: showPdga || showRatings ? profile.pdga_rating : null,
        dgdRating: showRatings ? (card?.dgd_rating ?? null) : null,
        ratedRounds: showRatings ? (card?.rated_rounds ?? null) : null,
        division: can("divisions") ? profile.preferred_division : null,
        achievements: showAchievements ? (card?.achievements ?? 0) : null,
        latestAchievement: showAchievements ? (card?.latest_achievement ?? null) : null,
        activeGoals: showProgress ? (card?.active_goals ?? 0) : null,
        goalTitle: showProgress ? (card?.goal_title ?? null) : null,
        goalProgress: showProgress ? (card?.goal_progress ?? null) : null,
        goalTarget: showProgress ? (card?.goal_target ?? null) : null,
      };
    });
  });
