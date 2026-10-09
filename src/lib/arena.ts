/**
 * Arena — friend games, duels, and the King of the Hill board.
 *
 * The catalog below is the single source of truth for every game friends can
 * challenge each other in. On-course games are played during a round; off-course
 * games are backyard / parking-lot / field-work style. Each game declares how it
 * is scored and whether video proof is required, so the duel flow and the proof
 * review UI stay consistent.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ArenaKind = "on_course" | "off_course";
/** Whether the higher or the lower score wins the duel. */
export type ScoreDirection = "high_wins" | "low_wins";

export type ArenaGame = {
  key: string;
  title: string;
  arena: ArenaKind;
  blurb: string;
  rules: string;
  /** What the number a player submits actually measures. */
  metric: string;
  direction: ScoreDirection;
  requiresVideo: boolean;
  defaultStake: number;
  /** Rough time to complete, shown on the card. */
  duration: string;
};

export const ARENA_GAMES: ArenaGame[] = [
  {
    key: "circle2_gauntlet",
    title: "Circle 2 Gauntlet",
    arena: "off_course",
    blurb: "Twenty-five putts from 40 feet. Nothing but nerve.",
    rules:
      "Set a basket at 40 feet. Throw 25 putts, one at a time, from the same marked spot. Count only putts that stay in the basket. Film the basket and your feet in the same frame for the full set.",
    metric: "Putts made out of 25",
    direction: "high_wins",
    requiresVideo: true,
    defaultStake: 30,
    duration: "15 min",
  },
  {
    key: "putting_ladder",
    title: "Putting Ladder",
    arena: "off_course",
    blurb: "Climb 10 → 15 → 20 → 25 → 30 feet. Miss and you fall a rung.",
    rules:
      "Start at 10 feet. Make a putt to move back 5 feet, miss and move up 5 feet. Ten minutes on the clock — your score is the longest distance you made a putt from, in feet.",
    metric: "Longest rung made (feet)",
    direction: "high_wins",
    requiresVideo: true,
    defaultStake: 25,
    duration: "10 min",
  },
  {
    key: "distance_derby",
    title: "Distance Derby",
    arena: "off_course",
    blurb: "Three throws in an open field. Longest legal bomb wins.",
    rules:
      "Open field, flat lie, no more than a three-step run-up. Three throws. Measure your longest with a rangefinder or GPS and film the throw plus the measurement.",
    metric: "Longest throw (feet)",
    direction: "high_wins",
    requiresVideo: true,
    defaultStake: 30,
    duration: "20 min",
  },
  {
    key: "trick_shot",
    title: "Trick Shot Throwdown",
    arena: "off_course",
    blurb: "One shot, all style. Your opponent scores it 1–10.",
    rules:
      "Land any trick shot you can dream up — rollers through legs, tree flicks, behind-the-back putts. One continuous clip, no cuts. Your opponent rates the shot 1–10 and that rating is your score.",
    metric: "Style rating (1–10)",
    direction: "high_wins",
    requiresVideo: true,
    defaultStake: 20,
    duration: "10 min",
  },
  {
    key: "form_check",
    title: "Form Check Duel",
    arena: "off_course",
    blurb: "Film five reps of the same shot. Cleanest mechanics wins.",
    rules:
      "Film five reps of one shot shape from behind and from the side. Your opponent scores mechanics 1–10 — reach back, weight shift, follow-through. Highest score wins.",
    metric: "Form rating (1–10)",
    direction: "high_wins",
    requiresVideo: true,
    defaultStake: 20,
    duration: "15 min",
  },
  {
    key: "ace_race",
    title: "Ace Race",
    arena: "on_course",
    blurb: "One disc, every hole, count the metal.",
    rules:
      "Play a full layout with a single disc. Score one point per basket hit from the tee (chains count, ace counts double). Film every tee shot that hits metal.",
    metric: "Metal points",
    direction: "high_wins",
    requiresVideo: true,
    defaultStake: 35,
    duration: "1 round",
  },
  {
    key: "closest_to_pin",
    title: "Closest to the Pin",
    arena: "on_course",
    blurb: "Pick a hole. One tee shot. Tape measure settles it.",
    rules:
      "Agree on a hole before you throw. One tee shot each. Measure from the basket to your lie in feet and film both the throw and the measurement.",
    metric: "Distance to basket (feet)",
    direction: "low_wins",
    requiresVideo: true,
    defaultStake: 25,
    duration: "10 min",
  },
  {
    key: "birdie_battle",
    title: "Birdie Battle",
    arena: "on_course",
    blurb: "Whoever stacks the most birdies in one round takes it.",
    rules:
      "Play the same layout — together or apart on the same day. Count birdies only; pars and bogeys are worth nothing. Post your scorecard photo or a clip of your final card.",
    metric: "Birdies in the round",
    direction: "high_wins",
    requiresVideo: false,
    defaultStake: 30,
    duration: "1 round",
  },
  {
    key: "scramble_par",
    title: "Beat the Par Line",
    arena: "on_course",
    blurb: "Course versus you. Lowest score to par wins the duel.",
    rules:
      "Play the same layout on the same day. Score is your total relative to par (−3 beats +1). Verified DG Dashboard rounds count automatically; otherwise post your card.",
    metric: "Score to par",
    direction: "low_wins",
    requiresVideo: false,
    defaultStake: 25,
    duration: "1 round",
  },
  {
    key: "safari_18",
    title: "Safari 18",
    arena: "on_course",
    blurb: "Invent 18 holes at your local. Same made-up layout, lowest total.",
    rules:
      "Agree on 18 improvised tee-to-basket combinations and a par for each. Play the same set. Lowest total strokes wins. Film any hole your opponent calls for.",
    metric: "Total strokes",
    direction: "low_wins",
    requiresVideo: false,
    defaultStake: 30,
    duration: "1 round",
  },
];

export function gameByKey(key: string): ArenaGame | undefined {
  return ARENA_GAMES.find((g) => g.key === key);
}

/* ───────────────────────────── King of the Hill ───────────────────────────── */

export type ArenaLeader = {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  pdga_rating: number | null;
  xp: number;
  level: number;
  title: string;
  streak_days: number;
  achievements: number;
  duel_wins: number;
  duels_played: number;
  is_self: boolean;
};

export type RankedLeader = ArenaLeader & { crownScore: number; rank: number };

/**
 * Crown score — the single number that decides the "top dog".
 *
 * Blends verified skill (PDGA/DGD rating) with in-app progress so a lower-rated
 * player who grinds badges and wins duels can still climb. Rating is normalised
 * around 800 so it never swamps the other signals.
 */
export function crownScore(l: ArenaLeader): number {
  const ratingPart = l.pdga_rating ? Math.max(0, l.pdga_rating - 600) * 0.6 : 0;
  const xpPart = Math.sqrt(Math.max(0, l.xp)) * 4;
  const badgePart = l.achievements * 12;
  const duelPart = l.duel_wins * 25;
  const streakPart = Math.min(l.streak_days, 30) * 3;
  return Math.round(ratingPart + xpPart + badgePart + duelPart + streakPart);
}

export function rankLeaders(rows: ArenaLeader[]): RankedLeader[] {
  return rows
    .map((l) => ({ ...l, crownScore: crownScore(l), rank: 0 }))
    .sort((a, b) => b.crownScore - a.crownScore || a.display_name.localeCompare(b.display_name))
    .map((l, i) => ({ ...l, rank: i + 1 }));
}

export function arenaLeaderboardQueryOptions(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["arena-leaderboard", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<RankedLeader[]> => {
      const { data, error } = await supabase.rpc("friend_leaderboard");
      if (error) throw error;
      return rankLeaders((data ?? []) as ArenaLeader[]);
    },
  });
}

/* ─────────────────────────────────── Duels ─────────────────────────────────── */

export type DuelStatus = "pending" | "active" | "awaiting_review" | "completed" | "declined";

export type DuelRow = {
  id: string;
  game_key: string;
  title: string;
  arena: string;
  rules: string | null;
  target_metric: string | null;
  requires_video: boolean;
  wager_xp: number;
  status: string;
  created_by: string;
  winner_id: string | null;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type DuelParticipantRow = {
  id: string;
  duel_id: string;
  user_id: string;
  role: string;
  invite_status: string;
  score: number | null;
};

export type DuelSubmissionRow = {
  id: string;
  duel_id: string;
  user_id: string;
  score: number | null;
  notes: string | null;
  video_path: string | null;
  video_url: string | null;
  status: string;
  verified_by: string | null;
  verified_at: string | null;
  dispute_reason: string | null;
  created_at: string;
};

export type ArenaDuel = {
  duel: DuelRow;
  participants: DuelParticipantRow[];
  submissions: DuelSubmissionRow[];
};

export function duelsQueryOptions(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["arena-duels", userId],
    enabled: !!userId,
    staleTime: 15_000,
    queryFn: async (): Promise<ArenaDuel[]> => {
      const { data: duels, error } = await supabase
        .from("game_duels")
        .select(
          "id, game_key, title, arena, rules, target_metric, requires_video, wager_xp, status, created_by, winner_id, due_at, completed_at, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      const rows = (duels ?? []) as DuelRow[];
      if (!rows.length) return [];
      const ids = rows.map((d) => d.id);
      const [{ data: parts }, { data: subs }] = await Promise.all([
        supabase
          .from("duel_participants")
          .select("id, duel_id, user_id, role, invite_status, score")
          .in("duel_id", ids),
        supabase
          .from("duel_submissions")
          .select(
            "id, duel_id, user_id, score, notes, video_path, video_url, status, verified_by, verified_at, dispute_reason, created_at",
          )
          .in("duel_id", ids)
          .order("created_at", { ascending: false }),
      ]);
      const partsBy = new Map<string, DuelParticipantRow[]>();
      ((parts ?? []) as DuelParticipantRow[]).forEach((p) => {
        const list = partsBy.get(p.duel_id) ?? [];
        list.push(p);
        partsBy.set(p.duel_id, list);
      });
      const subsBy = new Map<string, DuelSubmissionRow[]>();
      ((subs ?? []) as DuelSubmissionRow[]).forEach((s) => {
        const list = subsBy.get(s.duel_id) ?? [];
        list.push(s);
        subsBy.set(s.duel_id, list);
      });
      return rows.map((duel) => ({
        duel,
        participants: partsBy.get(duel.id) ?? [],
        submissions: subsBy.get(duel.id) ?? [],
      }));
    },
  });
}

/** Create a duel and invite one or more friends. */
export async function createDuel(input: {
  game: ArenaGame;
  createdBy: string;
  opponentIds: string[];
  stake: number;
  dueAt: string | null;
}): Promise<string> {
  const { game, createdBy, opponentIds, stake, dueAt } = input;
  const { data, error } = await supabase
    .from("game_duels")
    .insert({
      game_key: game.key,
      title: game.title,
      arena: game.arena,
      rules: game.rules,
      target_metric: game.metric,
      requires_video: game.requiresVideo,
      wager_xp: stake,
      status: "pending",
      created_by: createdBy,
      due_at: dueAt,
    })
    .select("id")
    .single();
  if (error) throw error;
  const duelId = (data as { id: string }).id;

  const roster = [
    { duel_id: duelId, user_id: createdBy, role: "challenger", invite_status: "accepted" },
    ...opponentIds.map((id) => ({
      duel_id: duelId,
      user_id: id,
      role: "opponent",
      invite_status: "invited",
    })),
  ];
  const { error: rosterError } = await supabase.from("duel_participants").insert(roster);
  if (rosterError) throw rosterError;
  return duelId;
}

export async function respondToDuel(duelId: string, userId: string, accept: boolean) {
  const { error } = await supabase
    .from("duel_participants")
    .update({ invite_status: accept ? "accepted" : "declined" })
    .eq("duel_id", duelId)
    .eq("user_id", userId);
  if (error) throw error;
  const { error: duelError } = await supabase
    .from("game_duels")
    .update({ status: accept ? "active" : "declined" })
    .eq("id", duelId);
  if (duelError) throw duelError;
}

/** Upload a proof clip to private storage and return its object path. */
export async function uploadProofVideo(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp4";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("duel-proof").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "video/mp4",
  });
  if (error) throw error;
  return path;
}

export async function proofVideoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from("duel-proof").createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function submitProof(input: {
  duelId: string;
  userId: string;
  score: number | null;
  notes: string;
  videoPath: string | null;
  videoUrl: string | null;
}) {
  const { error } = await supabase.from("duel_submissions").insert({
    duel_id: input.duelId,
    user_id: input.userId,
    score: input.score,
    notes: input.notes || null,
    video_path: input.videoPath,
    video_url: input.videoUrl,
    status: "pending",
  });
  if (error) throw error;
  await supabase
    .from("duel_participants")
    .update({ score: input.score })
    .eq("duel_id", input.duelId)
    .eq("user_id", input.userId);
  await supabase.from("game_duels").update({ status: "awaiting_review" }).eq("id", input.duelId);
}

export async function reviewProof(input: {
  submissionId: string;
  reviewerId: string;
  verified: boolean;
  reason?: string;
}) {
  const { error } = await supabase
    .from("duel_submissions")
    .update({
      status: input.verified ? "verified" : "disputed",
      verified_by: input.reviewerId,
      verified_at: new Date().toISOString(),
      dispute_reason: input.verified ? null : (input.reason ?? "Score questioned by opponent"),
    })
    .eq("id", input.submissionId);
  if (error) throw error;
}

export async function settleDuel(duelId: string, winnerId: string) {
  const { error } = await supabase.rpc("resolve_duel", { _duel: duelId, _winner: winnerId });
  if (error) throw error;
}

/** Who is leading a duel right now, based on verified-or-pending scores. */
export function duelStandings(
  entry: ArenaDuel,
): Array<{ userId: string; score: number | null; verified: boolean }> {
  const game = gameByKey(entry.duel.game_key);
  const dir: ScoreDirection = game?.direction ?? "high_wins";
  const rows = entry.participants
    .filter((p) => p.invite_status !== "declined")
    .map((p) => {
      const sub = entry.submissions.find((s) => s.user_id === p.user_id);
      return {
        userId: p.user_id,
        score: sub?.score ?? p.score ?? null,
        verified: sub?.status === "verified",
      };
    });
  return rows.sort((a, b) => {
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return dir === "low_wins" ? a.score - b.score : b.score - a.score;
  });
}
