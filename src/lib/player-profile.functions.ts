import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mergePrivacyPrefs, type PrivacyPrefs } from "@/lib/platform-config";
import {
  hiddenSectionsFor,
  resolveProfileViewer,
  type ProfileSectionKey,
} from "@/lib/profile-visibility";
import type { StatHighlightKey } from "@/lib/stat-highlights";
import { weightedAverage } from "@/lib/rating-projection";
import type { PlayerNowNext } from "@/lib/live/player-now.server";

export type PlayerProfileData = {
  profile: {
    id: string;
    username: string;
    display_name: string;
    bio: string | null;
    avatar_url: string | null;
    cover_url: string | null;
    home_course: string | null;
    location: string | null;
    home_state: string | null;
    pdga_number: string | null;
    pdga_rating: number | null;
    player_since: number | null;
    favorite_ace: string | null;
    preferred_division: string | null;
    reunited_count: number;
    created_at: string;
  };
  isSelf: boolean;
  viewerId: string;
  progress: { level: number; xp: number; title: string; streak_days: number } | null;
  stats: {
    total_rounds: number;
    pdga_rounds: number;
    udisc_rounds: number;
    dgd_rounds: number;
    aces: number;
    best_rating: number | null;
    avg_rating: number | null;
    /** In-app rating built from every rated round in DG Dashboard. */
    dgd_rating: number | null;
    /** How many rated rounds went into the DGD rating. */
    dgd_rating_rounds: number;
    wins: number;
    top_10s: number;
    events_played: number;
  };
  friendship: { id: string; status: string; direction: "outgoing" | "incoming" | "friends" } | null;
  followingViewer: boolean;
  viewerFollows: boolean;
  counts: { friends: number; followers: number; following: number; posts: number };
  posts: Array<{
    id: string;
    type: string;
    body: string | null;
    media: Array<{ url?: string; type?: string }>;
    course_name: string | null;
    created_at: string;
    like_count: number;
    comment_count: number;
  }>;
  photos: Array<{ post_id: string; url: string; created_at: string }>;
  friends: Array<{ id: string; username: string; display_name: string; avatar_url: string | null }>;
  recentRounds: Array<{
    id: string;
    source: string;
    course_name: string;
    layout_name: string | null;
    played_on: string;
    score: number | null;
    to_par: number | null;
    round_rating: number | null;
    mock_pdga_rating: number | null;
    event_name: string | null;
    place: number | null;
    field_size: number | null;
  }>;
  events: Array<{
    event_name: string;
    played_on: string;
    place: number | null;
    field_size: number | null;
    rounds: number;
    best_rating: number | null;
    pdga_event_ref: string | null;
  }>;
  achievements: Array<{
    key: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    tier: string;
    earned_at: string;
  }>;
  scene: {
    aces: Array<{
      played_on: string | null;
      course_name: string | null;
      hole: number | null;
      event_name: string | null;
    }>;
    achievements: Array<{ title: string; date: string | null; description: string | null }>;
    series: Array<{ name: string; url: string | null; season: string | null }>;
    friends: Array<{ name: string; profile_url: string | null; scene_id: string | null }>;
    comments: Array<{ posted_at: string | null; author: string | null; body: string }>;
    lastSyncedAt: string | null;
  };
  pdga: {
    pdga_number: string;
    name: string | null;
    current_rating: number | null;
    classification: string | null;
    player_class: string | null;
    official_status: string | null;
    official_expires: string | null;
    membership_status: string | null;
    membership_expires: string | null;
    member_since: number | null;
    career_events: number | null;
    career_wins: number | null;
    rating_delta: number | null;
    photo_url: string | null;
    location: string | null;
    rounds_used: number | null;
    std_dev: number | null;
    next_update: string | null;
    last_changed: string | null;
  } | null;
  divisions: Array<{
    division: string;
    events: number;
    wins: number;
    podiums: number;
    best_place: number | null;
    avg_rating: number | null;
    last_played: string | null;
  }>;
  scoring: {
    holes: number;
    eagles: number;
    birdies: number;
    pars: number;
    bogeys: number;
    doubles_plus: number;
    birdie_rate: number;
    par_rate: number;
    bogey_rate: number;
    avg_to_par_per_hole: number;
    byPar: Array<{ par: number; holes: number; avg_to_par: number; birdie_rate: number }>;
    source: "verified" | "imported" | "mixed";
  } | null;
  form: {
    last5_avg: number | null;
    prev5_avg: number | null;
    delta: number | null;
    trend: Array<{ played_on: string; rating: number; label: string }>;
  };
  highlights: {
    best_round: {
      rating: number;
      course_name: string;
      played_on: string;
      event_name: string | null;
      to_par: number | null;
    } | null;
    best_finish: {
      place: number;
      field_size: number | null;
      event_name: string;
      played_on: string;
      division: string | null;
    } | null;
    hottest_stretch: number | null;
    courses_played: number;
    states_played: number;
  };
  /** Live PDGA event in progress, plus the next one on the calendar. */
  nowNext: PlayerNowNext;
  upcoming: Array<{
    kind: "tournament" | "league";
    name: string;
    start_date: string | null;
    location: string | null;
    division: string | null;
    status: string | null;
    slug: string | null;
  }>;
  /** Sections the current viewer is not allowed to see (owner's privacy choices). */
  hidden: ProfileSectionKey[];
  /** StatLink highlights the owner chose to show on their profile. */
  statHighlights: StatHighlightKey[];
};

export const getPlayerProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => z.object({ username: z.string().min(1).max(80) }).parse(raw))
  .handler(async ({ data, context }): Promise<PlayerProfileData> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select(
        "id, username, display_name, bio, avatar_url, cover_url, home_course, location, home_state, pdga_number, pdga_rating, player_since, favorite_ace, preferred_division, reunited_count, created_at",
      )
      .eq("username", data.username)
      .maybeSingle();
    if (pErr) {
      console.error("[getPlayerProfile] profile lookup failed", pErr);
      throw new Error("We couldn't load this player right now. Please try again.");
    }
    if (!profile) throw new Error("Player not found");

    const pid = profile.id;
    const isSelf = pid === userId;

    // Progress: only readable for self via RLS; use admin for public level/title.
    const { data: prog } = await supabaseAdmin
      .from("user_progress")
      .select("level, xp, title, streak_days")
      .eq("user_id", pid)
      .maybeSingle();

    // Rounds stats via admin (aggregate only exposed to client).
    const { data: rounds } = await supabaseAdmin
      .from("external_rounds")
      .select(
        "id, source, course_name, layout_name, played_on, score, to_par, round_rating, mock_pdga_rating, event_name, place, field_size, pdga_event_ref, included, format, division",
      )
      .eq("user_id", pid)
      .order("played_on", { ascending: false })
      .limit(500);
    const included = (rounds ?? []).filter((r) => r.included !== false && r.format === "singles");
    const ratings = included
      .map((r) => r.round_rating)
      .filter((v): v is number => typeof v === "number");
    const stats = {
      total_rounds: included.length,
      pdga_rounds: included.filter(
        (r) => r.source === "pdga" || (r.source === "disc_golf_scene" && r.round_rating != null),
      ).length,
      udisc_rounds: included.filter((r) => r.source === "udisc").length,
      dgd_rounds: included.filter((r) => r.source === "dgd" || r.source === "manual").length,
      aces: 0, // computed below
      best_rating: ratings.length ? Math.max(...ratings) : null,
      avg_rating: ratings.length
        ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)
        : null,
      wins: included.filter((r) => r.place === 1).length,
      top_10s: included.filter((r) => (r.place ?? 999) <= 10).length,
      events_played: new Set(included.map((r) => r.pdga_event_ref).filter(Boolean)).size,
      // Filled in right below, once in-app rated rounds are loaded.
      dgd_rating: null as number | null,
      dgd_rating_rounds: 0,
    };

    // DGD Rating — the in-app number, built from every rated round DG Dashboard
    // knows about (imported PDGA/UDisc rounds plus DGD Rated rounds played here),
    // using the same weighted rolling window as the PDGA formula.
    {
      const { data: inApp } = await supabaseAdmin
        .from("round_ratings")
        .select("round_rating, created_at")
        .eq("user_id", pid)
        .not("round_rating", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);
      const pool: Array<{ played_on: string; round_rating: number }> = [
        ...included
          .filter(
            (r): r is typeof r & { round_rating: number } => typeof r.round_rating === "number",
          )
          .map((r) => ({ played_on: String(r.played_on), round_rating: r.round_rating })),
        ...((inApp ?? []) as Array<{ round_rating: number; created_at: string }>).map((r) => ({
          played_on: String(r.created_at).slice(0, 10),
          round_rating: r.round_rating,
        })),
      ];
      const cutoff = (months: number) => Date.now() - months * 30.4375 * 86_400_000;
      const inWindow = (months: number) =>
        pool.filter((r) => new Date(r.played_on).getTime() >= cutoff(months));
      const window12 = inWindow(12);
      const used = (window12.length >= 8 ? window12 : inWindow(24))
        .sort((a, b) => (a.played_on < b.played_on ? 1 : -1))
        .slice(0, 50);
      if (used.length > 0) {
        stats.dgd_rating = Math.round(weightedAverage(used));
        stats.dgd_rating_rounds = used.length;
      }
    }

    // Ace count from profile manual + aces posts.
    const { count: aceCount } = await supabaseAdmin
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("author_id", pid)
      .eq("type", "ace");
    stats.aces = aceCount ?? 0;

    // Friendship with viewer
    let friendship: PlayerProfileData["friendship"] = null;
    if (!isSelf) {
      const { data: fr } = await supabase
        .from("friendships")
        .select("id, status, requester_id, addressee_id")
        .or(
          `and(requester_id.eq.${userId},addressee_id.eq.${pid}),and(requester_id.eq.${pid},addressee_id.eq.${userId})`,
        )
        .maybeSingle();
      if (fr) {
        const dir =
          fr.status === "accepted"
            ? "friends"
            : fr.requester_id === userId
              ? "outgoing"
              : "incoming";
        friendship = { id: fr.id, status: fr.status, direction: dir };
      }
    }

    // Follows
    const [{ data: vf }, { data: fv }] = await Promise.all([
      supabaseAdmin
        .from("follows")
        .select("follower_id")
        .eq("follower_id", userId)
        .eq("followee_id", pid)
        .maybeSingle(),
      supabaseAdmin
        .from("follows")
        .select("follower_id")
        .eq("follower_id", pid)
        .eq("followee_id", userId)
        .maybeSingle(),
    ]);

    // Counts
    const [{ count: followers }, { count: following }, { count: postCount }, friendsRes] =
      await Promise.all([
        supabaseAdmin
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("followee_id", pid),
        supabaseAdmin
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("follower_id", pid),
        supabaseAdmin
          .from("posts")
          .select("*", { count: "exact", head: true })
          .eq("author_id", pid),
        supabaseAdmin
          .from("friendships")
          .select("requester_id, addressee_id")
          .eq("status", "accepted")
          .or(`requester_id.eq.${pid},addressee_id.eq.${pid}`),
      ]);
    const friendIds = (friendsRes.data ?? []).map((f) =>
      f.requester_id === pid ? f.addressee_id : f.requester_id,
    );
    const { data: friendProfiles } = friendIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", friendIds)
          .limit(24)
      : {
          data: [] as Array<{
            id: string;
            username: string;
            display_name: string;
            avatar_url: string | null;
          }>,
        };

    // Posts + photos — respect each post's own audience, not just the section toggle.
    // Strangers see public posts only; accepted friends also see friends-only posts.
    // Club-only posts stay with the author (club membership isn't resolved here).
    const isAcceptedFriend = friendship?.status === "accepted";
    const visiblePostAudiences: ReadonlyArray<"public" | "friends" | "club"> | null = isSelf
      ? null
      : isAcceptedFriend
        ? (["public", "friends"] as const)
        : (["public"] as const);
    let postsQuery = supabaseAdmin
      .from("posts")
      .select("id, type, body, media, course_name, created_at, like_count, comment_count")
      .eq("author_id", pid);
    if (visiblePostAudiences) postsQuery = postsQuery.in("visibility", visiblePostAudiences);
    const { data: posts } = await postsQuery.order("created_at", { ascending: false }).limit(30);
    const photos: PlayerProfileData["photos"] = [];
    for (const p of posts ?? []) {
      const media = Array.isArray(p.media) ? p.media : [];
      for (const m of media) {
        if (m && typeof m === "object" && typeof (m as { url?: unknown }).url === "string") {
          photos.push({ post_id: p.id, url: (m as { url: string }).url, created_at: p.created_at });
        }
      }
    }

    // Events aggregation from rounds
    const evMap = new Map<
      string,
      {
        event_name: string;
        played_on: string;
        place: number | null;
        field_size: number | null;
        rounds: number;
        best_rating: number | null;
        pdga_event_ref: string | null;
      }
    >();
    for (const r of included) {
      const key = r.pdga_event_ref ?? r.event_name;
      if (!key) continue;
      const existing = evMap.get(key);
      if (existing) {
        existing.rounds += 1;
        if (typeof r.round_rating === "number") {
          existing.best_rating = Math.max(existing.best_rating ?? 0, r.round_rating);
        }
      } else {
        evMap.set(key, {
          event_name: r.event_name ?? key,
          played_on: r.played_on,
          place: r.place ?? null,
          field_size: r.field_size ?? null,
          rounds: 1,
          best_rating: r.round_rating ?? null,
          pdga_event_ref: r.pdga_event_ref ?? null,
        });
      }
    }

    // Achievements
    const { data: earned } = await supabaseAdmin
      .from("user_achievements")
      .select("achievement_key, earned_at, achievements(name, description, icon, category, tier)")
      .eq("user_id", pid)
      .order("earned_at", { ascending: false })
      .limit(50);

    // Disc Golf Scene ingest — latest per tab
    const { data: sceneJobs } = await supabaseAdmin
      .from("data_ingest_jobs")
      .select("kind, result, created_at")
      .eq("user_id", pid)
      .like("kind", "profile_scrape:disc_golf_scene:%")
      .order("created_at", { ascending: false })
      .limit(50);

    const latestByTab = new Map<string, { items: unknown[]; created_at: string }>();
    for (const j of sceneJobs ?? []) {
      const tab = String(j.kind).split(":").pop() ?? "";
      if (!tab || latestByTab.has(tab)) continue;
      const raw = (j.result as { items?: unknown } | null)?.items;
      latestByTab.set(tab, { items: Array.isArray(raw) ? raw : [], created_at: j.created_at });
    }
    const sceneAces = (latestByTab.get("aces")?.items ?? []) as PlayerProfileData["scene"]["aces"];
    const sceneAchievements = (latestByTab.get("achievements")?.items ??
      []) as PlayerProfileData["scene"]["achievements"];
    const sceneSeries = (latestByTab.get("series")?.items ??
      []) as PlayerProfileData["scene"]["series"];
    const sceneFriends = (latestByTab.get("friends")?.items ??
      []) as PlayerProfileData["scene"]["friends"];
    const sceneComments = (latestByTab.get("comments")?.items ??
      []) as PlayerProfileData["scene"]["comments"];
    const lastSyncedAt =
      Array.from(latestByTab.values())
        .map((v) => v.created_at)
        .sort()
        .pop() ?? null;

    // Roll Scene aces into the headline aces stat.
    stats.aces = Math.max(stats.aces, sceneAces.length);

    // ---- PDGA membership card -------------------------------------------
    let pdga: PlayerProfileData["pdga"] = null;
    if (profile.pdga_number) {
      const { data: pr } = await supabaseAdmin
        .from("pdga_players")
        .select(
          "pdga_number, name, current_rating, rating_delta, classification, class, official_status, official_expires, membership_status, membership_expires, member_since, career_events, career_wins, photo_url, location, rounds_used, std_dev, next_update, last_changed",
        )
        .eq("pdga_number", String(profile.pdga_number))
        .maybeSingle();
      if (pr) {
        pdga = {
          pdga_number: pr.pdga_number,
          name: pr.name,
          current_rating: pr.current_rating,
          classification: pr.classification,
          player_class: pr.class,
          official_status: pr.official_status,
          official_expires: pr.official_expires,
          membership_status: pr.membership_status,
          membership_expires: pr.membership_expires,
          member_since: pr.member_since,
          career_events: pr.career_events,
          career_wins: pr.career_wins,
          rating_delta: pr.rating_delta,
          photo_url: pr.photo_url,
          location: pr.location,
          rounds_used: pr.rounds_used,
          std_dev: pr.std_dev,
          next_update: pr.next_update,
          last_changed: pr.last_changed,
        };
      }
    }

    // ---- Divisions played -------------------------------------------------
    type DivAgg = {
      division: string;
      events: number;
      wins: number;
      podiums: number;
      best_place: number | null;
      ratings: number[];
      last_played: string | null;
    };
    const divMap = new Map<string, DivAgg>();
    const touchDiv = (
      division: string | null,
      place: number | null,
      rating: number | null,
      played_on: string | null,
    ) => {
      const key = (division ?? "").trim();
      if (!key) return;
      const agg = divMap.get(key) ?? {
        division: key,
        events: 0,
        wins: 0,
        podiums: 0,
        best_place: null,
        ratings: [],
        last_played: null,
      };
      agg.events += 1;
      if (place === 1) agg.wins += 1;
      if (place != null && place <= 3) agg.podiums += 1;
      if (place != null)
        agg.best_place = agg.best_place == null ? place : Math.min(agg.best_place, place);
      if (typeof rating === "number") agg.ratings.push(rating);
      if (played_on && (!agg.last_played || played_on > agg.last_played))
        agg.last_played = played_on;
      divMap.set(key, agg);
    };
    // One entry per event per division from imported rounds.
    const seenEventDiv = new Set<string>();
    for (const r of included) {
      const key = `${r.pdga_event_ref ?? r.event_name ?? r.id}|${r.division ?? ""}`;
      if (seenEventDiv.has(key)) continue;
      seenEventDiv.add(key);
      touchDiv(r.division ?? null, r.place ?? null, r.round_rating ?? null, r.played_on);
    }
    if (profile.pdga_number) {
      const { data: fieldRows } = await supabaseAdmin
        .from("pdga_event_field")
        .select("division, place, rating, event_ref, synced_at")
        .eq("pdga_number", String(profile.pdga_number))
        .limit(400);
      for (const f of fieldRows ?? []) {
        const key = `${f.event_ref}|${f.division ?? ""}`;
        if (seenEventDiv.has(key)) continue;
        seenEventDiv.add(key);
        touchDiv(f.division, f.place, f.rating, evMap.get(f.event_ref)?.played_on ?? null);
      }
    }
    const divisions: PlayerProfileData["divisions"] = Array.from(divMap.values())
      .map((d) => ({
        division: d.division,
        events: d.events,
        wins: d.wins,
        podiums: d.podiums,
        best_place: d.best_place,
        avg_rating: d.ratings.length
          ? Math.round(d.ratings.reduce((a, b) => a + b, 0) / d.ratings.length)
          : null,
        last_played: d.last_played,
      }))
      .sort((a, b) => b.events - a.events)
      .slice(0, 8);

    // ---- Scoring distribution --------------------------------------------
    const buckets = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles_plus: 0 };
    const byPar = new Map<number, { holes: number; toPar: number; birdies: number }>();
    let holeCount = 0;
    let toParTotal = 0;
    let verifiedHoles = 0;
    let importedHoles = 0;
    const addHole = (par: number | null, strokes: number | null, verified: boolean) => {
      if (!par || !strokes || par <= 0 || strokes <= 0) return;
      const diff = strokes - par;
      holeCount += 1;
      toParTotal += diff;
      if (verified) verifiedHoles += 1;
      else importedHoles += 1;
      if (diff <= -2) buckets.eagles += 1;
      else if (diff === -1) buckets.birdies += 1;
      else if (diff === 0) buckets.pars += 1;
      else if (diff === 1) buckets.bogeys += 1;
      else buckets.doubles_plus += 1;
      const b = byPar.get(par) ?? { holes: 0, toPar: 0, birdies: 0 };
      b.holes += 1;
      b.toPar += diff;
      if (diff <= -1) b.birdies += 1;
      byPar.set(par, b);
    };

    const roundIds = included.slice(0, 80).map((r) => r.id);
    if (roundIds.length) {
      const { data: holeRows } = await supabaseAdmin
        .from("external_round_holes")
        .select("par, strokes")
        .in("external_round_id", roundIds)
        .limit(3000);
      for (const h of holeRows ?? []) addHole(h.par, h.strokes, false);
    }
    if (profile.pdga_number) {
      const { data: liveRows } = await supabaseAdmin
        .from("tracker_live_scores")
        .select("hole_pars, hole_scores")
        .eq("pdga_number", String(profile.pdga_number))
        .order("last_synced_at", { ascending: false })
        .limit(60);
      for (const row of liveRows ?? []) {
        const pars = Array.isArray(row.hole_pars) ? (row.hole_pars as number[]) : [];
        const scores = Array.isArray(row.hole_scores) ? (row.hole_scores as number[]) : [];
        for (let i = 0; i < Math.min(pars.length, scores.length); i++) {
          addHole(Number(pars[i]) || null, Number(scores[i]) || null, true);
        }
      }
    }
    const scoring: PlayerProfileData["scoring"] =
      holeCount >= 18
        ? {
            holes: holeCount,
            ...buckets,
            birdie_rate: (buckets.eagles + buckets.birdies) / holeCount,
            par_rate: buckets.pars / holeCount,
            bogey_rate: (buckets.bogeys + buckets.doubles_plus) / holeCount,
            avg_to_par_per_hole: toParTotal / holeCount,
            byPar: Array.from(byPar.entries())
              .filter(([par, b]) => par >= 3 && par <= 5 && b.holes >= 5)
              .sort((a, b) => a[0] - b[0])
              .map(([par, b]) => ({
                par,
                holes: b.holes,
                avg_to_par: b.toPar / b.holes,
                birdie_rate: b.birdies / b.holes,
              })),
            source:
              verifiedHoles && importedHoles ? "mixed" : verifiedHoles ? "verified" : "imported",
          }
        : null;

    // ---- Form (rating trend) ---------------------------------------------
    const ratedRounds = included.filter((r) => typeof r.round_rating === "number").slice(0, 20);
    const avgOf = (xs: number[]) =>
      xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
    const last5 = avgOf(ratedRounds.slice(0, 5).map((r) => r.round_rating as number));
    const prev5 = avgOf(ratedRounds.slice(5, 10).map((r) => r.round_rating as number));
    const form: PlayerProfileData["form"] = {
      last5_avg: last5,
      prev5_avg: prev5,
      delta: last5 != null && prev5 != null ? last5 - prev5 : null,
      trend: ratedRounds
        .slice(0, 12)
        .reverse()
        .map((r) => ({
          played_on: r.played_on,
          rating: r.round_rating as number,
          label: r.event_name ?? r.course_name,
        })),
    };

    // ---- Highlights --------------------------------------------------------
    const bestRoundRow = ratedRounds.length
      ? included
          .filter((r) => typeof r.round_rating === "number")
          .reduce((best, r) =>
            (r.round_rating as number) > (best.round_rating as number) ? r : best,
          )
      : null;
    const finishes = included.filter((r) => r.place != null);
    const bestFinishRow = finishes.length
      ? finishes.reduce((best, r) => ((r.place as number) < (best.place as number) ? r : best))
      : null;
    const highlights: PlayerProfileData["highlights"] = {
      best_round: bestRoundRow
        ? {
            rating: bestRoundRow.round_rating as number,
            course_name: bestRoundRow.course_name,
            played_on: bestRoundRow.played_on,
            event_name: bestRoundRow.event_name,
            to_par: bestRoundRow.to_par,
          }
        : null,
      best_finish: bestFinishRow
        ? {
            place: bestFinishRow.place as number,
            field_size: bestFinishRow.field_size,
            event_name: bestFinishRow.event_name ?? bestFinishRow.course_name,
            played_on: bestFinishRow.played_on,
            division: bestFinishRow.division ?? null,
          }
        : null,
      hottest_stretch: (() => {
        const xs = ratedRounds.map((r) => r.round_rating as number);
        if (xs.length < 3) return null;
        let best = -Infinity;
        for (let i = 0; i + 3 <= xs.length; i++) {
          const window = xs.slice(i, i + 3);
          best = Math.max(best, window.reduce((a, b) => a + b, 0) / 3);
        }
        return Number.isFinite(best) ? Math.round(best) : null;
      })(),
      courses_played: new Set(included.map((r) => r.course_name).filter(Boolean)).size,
      states_played: 0,
    };

    // ---- Upcoming events ---------------------------------------------------
    const today = new Date().toISOString().slice(0, 10);
    const upcoming: PlayerProfileData["upcoming"] = [];
    const [tRegs, lRegs] = await Promise.all([
      supabaseAdmin
        .from("tournament_registrations")
        .select(
          "status, tournaments(name, slug, start_date, location, status), tournament_divisions(code, name)",
        )
        .eq("user_id", pid)
        .limit(40),
      supabaseAdmin
        .from("league_registrations")
        .select("division, leagues(name, slug, start_date, end_date, status)")
        .eq("user_id", pid)
        .limit(40),
    ]);
    for (const r of tRegs.data ?? []) {
      const t = (
        r as unknown as {
          tournaments: {
            name: string;
            slug: string;
            start_date: string;
            location: string | null;
            status: string;
          } | null;
        }
      ).tournaments;
      const d = (r as unknown as { tournament_divisions: { code: string; name: string } | null })
        .tournament_divisions;
      if (!t || !t.start_date || t.start_date < today) continue;
      upcoming.push({
        kind: "tournament",
        name: t.name,
        start_date: t.start_date,
        location: t.location,
        division: d?.code ?? null,
        status: String(r.status ?? t.status ?? ""),
        slug: t.slug,
      });
    }
    for (const r of lRegs.data ?? []) {
      const l = (
        r as unknown as {
          leagues: {
            name: string;
            slug: string;
            start_date: string | null;
            end_date: string | null;
            status: string;
          } | null;
        }
      ).leagues;
      if (!l) continue;
      if (l.end_date && l.end_date < today) continue;
      upcoming.push({
        kind: "league",
        name: l.name,
        start_date: l.start_date,
        location: null,
        division: r.division ?? null,
        status: String(l.status ?? ""),
        slug: l.slug,
      });
    }
    upcoming.sort((a, b) => (a.start_date ?? "9999").localeCompare(b.start_date ?? "9999"));

    // ---- Playing now / next up (live PDGA scoring) --------------------------
    const { loadPlayerNowNext } = await import("@/lib/live/player-now.server");
    let nowNext = await loadPlayerNowNext(supabaseAdmin, {
      pdga_number: profile.pdga_number ? String(profile.pdga_number) : null,
      display_name: profile.display_name,
    }).catch(() => ({
      pdgaNumber: null,
      pdgaMatch: null,
      live: null,
      next: null,
    }) as PlayerNowNext);

    // ---- Privacy: per-section audiences chosen by the profile owner ----
    const { data: privacyRow } = await supabaseAdmin
      .from("profiles")
      .select("privacy_prefs")
      .eq("id", pid)
      .maybeSingle();
    const privacy = mergePrivacyPrefs(
      (privacyRow as { privacy_prefs?: Partial<PrivacyPrefs> | null } | null)?.privacy_prefs,
    );
    const viewer = resolveProfileViewer(isSelf, friendship?.direction === "friends");
    const hidden = hiddenSectionsFor(privacy.profileVisibility, privacy.sections, viewer);
    const isHidden = (key: ProfileSectionKey) => hidden.includes(key);

    if (isHidden("calendar")) nowNext = { ...nowNext, next: null };

    const result: PlayerProfileData = {
      nowNext,
      pdga,
      divisions,
      scoring,
      form,
      highlights,
      upcoming: upcoming.slice(0, 8),
      profile,
      isSelf,
      viewerId: userId,
      progress: prog ?? null,
      stats,
      friendship,
      followingViewer: !!fv,
      viewerFollows: !!vf,
      counts: {
        friends: friendIds.length,
        followers: followers ?? 0,
        following: following ?? 0,
        posts: postCount ?? 0,
      },
      posts: (posts ?? []).map((p) => ({
        id: p.id,
        type: String(p.type),
        body: p.body,
        media: Array.isArray(p.media) ? (p.media as Array<{ url?: string; type?: string }>) : [],
        course_name: p.course_name,
        created_at: p.created_at,
        like_count: p.like_count,
        comment_count: p.comment_count,
      })),
      photos: photos.slice(0, 24),
      friends: friendProfiles ?? [],
      recentRounds: included.slice(0, 20).map((r) => ({
        id: r.id,
        source: r.source,
        course_name: r.course_name,
        layout_name: r.layout_name,
        played_on: r.played_on,
        score: r.score,
        to_par: r.to_par,
        round_rating: r.round_rating,
        mock_pdga_rating: r.mock_pdga_rating,
        event_name: r.event_name,
        place: r.place,
        field_size: r.field_size,
      })),
      events: Array.from(evMap.values())
        .sort((a, b) => b.played_on.localeCompare(a.played_on))
        .slice(0, 20),
      achievements: (earned ?? []).map((e) => {
        const a = (
          e as unknown as {
            achievements: {
              name: string;
              description: string;
              icon: string;
              category: string;
              tier: string;
            } | null;
          }
        ).achievements;
        return {
          key: e.achievement_key,
          name: a?.name ?? e.achievement_key,
          description: a?.description ?? "",
          icon: a?.icon ?? "Trophy",
          category: a?.category ?? "misc",
          tier: a?.tier ?? "bronze",
          earned_at: e.earned_at,
        };
      }),
      scene: {
        aces: sceneAces,
        achievements: sceneAchievements,
        series: sceneSeries,
        friends: sceneFriends,
        comments: sceneComments,
        lastSyncedAt,
      },
      hidden,
      statHighlights: privacy.statHighlights,
    };

    // Strip anything the viewer isn't allowed to see before it leaves the server.
    if (isHidden("bio")) result.profile.bio = null;
    if (isHidden("location")) {
      result.profile.location = null;
      result.profile.home_state = null;
    }
    if (isHidden("homeCourse")) result.profile.home_course = null;
    if (isHidden("progress")) result.progress = null;
    if (isHidden("ratings")) {
      result.profile.pdga_rating = null;
      result.stats.avg_rating = null;
      result.stats.best_rating = null;
      result.stats.dgd_rating = null;
      result.stats.dgd_rating_rounds = 0;
      result.highlights.best_round = null;
      result.recentRounds = result.recentRounds.map((r) => ({
        ...r,
        round_rating: null,
        mock_pdga_rating: null,
      }));
    }
    if (isHidden("pdga")) {
      result.pdga = null;
      result.profile.pdga_number = null;
    }
    if (isHidden("stats")) {
      result.stats = {
        total_rounds: 0,
        pdga_rounds: 0,
        udisc_rounds: 0,
        dgd_rounds: 0,
        aces: 0,
        best_rating: null,
        avg_rating: null,
        dgd_rating: null,
        dgd_rating_rounds: 0,
        wins: 0,
        top_10s: 0,
        events_played: 0,
      };
    }
    if (isHidden("scoring")) result.scoring = null;
    if (isHidden("form")) {
      result.form = { last5_avg: null, prev5_avg: null, delta: null, trend: [] };
      result.highlights.hottest_stretch = null;
    }
    if (isHidden("divisions")) result.divisions = [];
    if (isHidden("rounds")) result.recentRounds = [];
    if (isHidden("events")) {
      result.events = [];
      result.highlights.best_finish = null;
    }
    // Round and event history is private to the signed-in owner.
    if (!isSelf) {
      result.recentRounds = [];
      result.events = [];
      result.upcoming = [];
      result.highlights.best_finish = null;
    }

    if (isHidden("achievements")) {
      result.achievements = [];
      result.scene.achievements = [];
    }
    if (isHidden("calendar")) result.upcoming = [];
    if (isHidden("posts")) result.posts = [];
    if (isHidden("photos")) result.photos = [];
    if (isHidden("friends")) {
      result.friends = [];
      result.counts.friends = 0;
      result.scene.friends = [];
    }
    if (isHidden("followCounts")) {
      result.counts.followers = 0;
      result.counts.following = 0;
    }

    return result;
  });

export const sendFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => z.object({ addressee_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.addressee_id === userId) throw new Error("Cannot friend yourself");
    const { error } = await supabase.from("friendships").insert({
      requester_id: userId,
      addressee_id: data.addressee_id,
      status: "pending",
    });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true };
  });

export const respondFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) =>
    z.object({ friendship_id: z.string().uuid(), accept: z.boolean() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.accept) {
      const { error } = await supabase
        .from("friendships")
        .update({ status: "accepted" })
        .eq("id", data.friendship_id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("friendships").delete().eq("id", data.friendship_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const removeFriend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => z.object({ friendship_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("friendships")
      .delete()
      .eq("id", data.friendship_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleFollow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) =>
    z.object({ followee_id: z.string().uuid(), follow: z.boolean() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.followee_id === userId) throw new Error("Cannot follow yourself");
    if (data.follow) {
      const { error } = await supabase
        .from("follows")
        .insert({ follower_id: userId, followee_id: data.followee_id });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", userId)
        .eq("followee_id", data.followee_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
