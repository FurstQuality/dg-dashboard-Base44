import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  hiddenSectionsFor,
  resolveProfileViewer,
  type ProfileSectionKey,
} from "@/lib/profile-visibility";
import { mergePrivacyPrefs, type PrivacyPrefs } from "@/lib/platform-config";

export type ProgressBadge = {
  key: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  tier: string;
  xp_reward: number;
  sort_order: number;
  earned_at: string | null;
};

export type ProgressTrophy = {
  event_name: string;
  event_ref: string | null;
  event_date: string | null;
  division: string | null;
  tier: string | null;
  place: number | null;
  field_size: number | null;
  url: string | null;
};

export type ProgressHubData = {
  userId: string;
  isSelf: boolean;
  /** Owner hid their achievements/level from this viewer. */
  hiddenSections: ProfileSectionKey[];
  progress: {
    xp: number;
    level: number;
    title: string;
    coins: number;
    streak_days: number;
    longest_streak: number;
  } | null;
  counts: {
    badgesEarned: number;
    badgesTotal: number;
    questsActive: number;
    questsDone: number;
    rounds: number;
    wins: number;
  };
  badges: ProgressBadge[];
  trophies: ProgressTrophy[];
  pdgaLinked: boolean;
};

/**
 * Progress, badges, and trophy shelf for any player's profile.
 *
 * `user_progress`, `user_achievements`, and `user_challenge_progress` are
 * owner-only under RLS, so this reads them with the admin client and applies
 * the profile owner's per-section privacy choices before returning anything.
 */
export const getProgressHub = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ username: z.string().min(1).max(80) }).parse(raw),
  )
  .handler(async ({ data, context }): Promise<ProgressHubData> => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, pdga_number, privacy_prefs")
      .eq("username", data.username)
      .maybeSingle();
    if (!profile) throw new Error("Player not found");

    const pid = profile.id;
    const isSelf = pid === userId;

    let isFriend = false;
    if (!isSelf) {
      const { data: fr } = await supabaseAdmin
        .from("friendships")
        .select("id")
        .eq("status", "accepted")
        .or(
          `and(requester_id.eq.${userId},addressee_id.eq.${pid}),and(requester_id.eq.${pid},addressee_id.eq.${userId})`,
        )
        .maybeSingle();
      isFriend = !!fr;
    }

    const privacy = mergePrivacyPrefs(
      (profile as { privacy_prefs?: Partial<PrivacyPrefs> | null }).privacy_prefs,
    );
    const viewer = resolveProfileViewer(isSelf, isFriend);
    const hiddenSections = hiddenSectionsFor(privacy.profileVisibility, privacy.sections, viewer);
    const hides = (key: ProfileSectionKey) => hiddenSections.includes(key);

    const empty: ProgressHubData = {
      userId: pid,
      isSelf,
      hiddenSections,
      progress: null,
      counts: {
        badgesEarned: 0,
        badgesTotal: 0,
        questsActive: 0,
        questsDone: 0,
        rounds: 0,
        wins: 0,
      },
      badges: [],
      trophies: [],
      pdgaLinked: false,
    };

    const [catalogRes, progRes, earnedRes, questActiveRes, questDoneRes, roundsRes] =
      await Promise.all([
        supabaseAdmin
          .from("achievements")
          .select("key, name, description, icon, category, tier, xp_reward, sort_order")
          .order("sort_order"),
        supabaseAdmin
          .from("user_progress")
          .select("xp, level, title, coins, streak_days, longest_streak")
          .eq("user_id", pid)
          .maybeSingle(),
        supabaseAdmin
          .from("user_achievements")
          .select("achievement_key, earned_at")
          .eq("user_id", pid),
        supabaseAdmin
          .from("challenges")
          .select("id", { count: "exact", head: true })
          .eq("active", true),
        supabaseAdmin
          .from("user_challenge_progress")
          .select("challenge_id", { count: "exact", head: true })
          .eq("user_id", pid)
          .not("completed_at", "is", null),
        supabaseAdmin
          .from("rounds")
          .select("id", { count: "exact", head: true })
          .eq("created_by", pid),
      ]);

    const earnedMap = new Map<string, string>(
      (earnedRes.data ?? []).map((r) => [r.achievement_key, r.earned_at as string]),
    );

    const catalog = (catalogRes.data ?? []) as Array<Omit<ProgressBadge, "earned_at">>;
    const badges: ProgressBadge[] = catalog.map((a) => ({
      ...a,
      earned_at: earnedMap.get(a.key) ?? null,
    }));

    const pdgaNumber = hides("pdga") ? null : ((profile.pdga_number as string | null) ?? null);
    let trophies: ProgressTrophy[] = [];
    if (pdgaNumber) {
      const { data: rows } = await supabaseAdmin
        .from("pdga_events")
        .select("event_name, event_ref, event_date, division, tier, place, field_size, url")
        .eq("pdga_number", pdgaNumber)
        .not("place", "is", null)
        .lte("place", 3)
        .order("event_date", { ascending: false })
        .limit(200);
      trophies = (rows ?? []) as ProgressTrophy[];
    }

    const result: ProgressHubData = {
      ...empty,
      progress: progRes.data
        ? {
            xp: progRes.data.xp ?? 0,
            level: progRes.data.level ?? 0,
            title: progRes.data.title ?? "",
            coins: progRes.data.coins ?? 0,
            streak_days: progRes.data.streak_days ?? 0,
            longest_streak: progRes.data.longest_streak ?? 0,
          }
        : { xp: 0, level: 0, title: "Rookie", coins: 0, streak_days: 0, longest_streak: 0 },
      counts: {
        badgesEarned: earnedMap.size,
        badgesTotal: badges.length,
        questsActive: questActiveRes.count ?? 0,
        questsDone: questDoneRes.count ?? 0,
        rounds: roundsRes.count ?? 0,
        wins: trophies.filter((t) => t.place === 1).length,
      },
      badges,
      trophies,
      pdgaLinked: !!pdgaNumber,
    };

    if (hides("progress")) result.progress = null;
    if (hides("achievements")) {
      result.badges = [];
      result.counts.badgesEarned = 0;
      result.counts.badgesTotal = 0;
    }
    if (hides("stats")) result.counts.rounds = 0;
    if (hides("events")) {
      result.trophies = [];
      result.counts.wins = 0;
    }

    return result;
  });
