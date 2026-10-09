import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { STATS_LIMITS } from "@/lib/stats-queries";

/**
 * One true round-reading path.
 *
 * `/stats` and `/rounds` both read a player's round history through this
 * authenticated, bounded server function instead of querying the database
 * from the browser. Rows keep a stable normalized shape across the three
 * sources: native DG Dashboard rounds, PDGA imports, and UDisc imports.
 */

/* Supabase's generated client type isn't available to this loose builder
 * chain; the shape is intentionally permissive and every call is still
 * scoped by user_id and bounded by an explicit limit. */

type Client = { from: (table: string) => any };

export type NativeRoundRow = {
  id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  course_id: string;
  layout_id: string;
  course: { name: string; city: string | null; state: string | null } | null;
  total: number | null;
  toPar: number | null;
  /** Layout played, plus how many holes it has, so a card can show progress. */
  layout_name: string | null;
  holes_total: number | null;
  holes_scored: number;
  /** Everyone else on the card, in tee order. */
  cardmates: Array<{ name: string; username: string | null }>;
  /** How the round was set up (casual/league, singles/teams, scoring game). */
  round_context: string | null;
  play_format: string | null;
  scoring_type: string | null;
  team_size: number | null;
  is_rated: boolean | null;
};

export type ExternalRoundRow = {
  id: string;
  source: string;
  course_name: string | null;
  layout_name: string | null;
  event_name: string | null;
  played_on: string;
  score: number | null;
  to_par: number | null;
  round_rating: number | null;
  chainlink_rating: number | null;
  mock_pdga_rating: number | null;
  mock_pdga_source: string | null;
  format: string | null;
  division: string | null;
  included: boolean | null;
  place: number | null;
  points: number | null;
};

export type FriendActiveRoundRow = {
  id: string;
  started_at: string;
  created_by: string;
  course_name: string | null;
  city: string | null;
  state: string | null;
  player_name: string;
  player_username: string | null;
};

export type PlannedEventRow = {
  id: string;
  title: string;
  starts_on: string | null;
  starts_at: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  event_url: string | null;
  source: string;
  status: string;
};

export type RoundHistoryResult = {
  native: NativeRoundRow[];
  pdga: ExternalRoundRow[];
  udisc: ExternalRoundRow[];
  friendsActive: FriendActiveRoundRow[];
  planned: PlannedEventRow[];
};

const EXTERNAL_COLUMNS =
  "id, source, course_name, layout_name, event_name, played_on, score, to_par, round_rating, chainlink_rating, mock_pdga_rating, mock_pdga_source, format, division, included, place, points";

async function loadNative(
  supabase: Client,
  userId: string,
  limit: number,
): Promise<NativeRoundRow[]> {
  // A player sees every round they're on, not just the ones they created —
  // being added to a card is enough to have that round waiting in the app.
  const { data: myCards } = await supabase
    .from("round_players")
    .select("round_id")
    .eq("user_id", userId)
    .limit(limit * 2);
  const invitedIds = [
    ...new Set(
      ((myCards ?? []) as Array<{ round_id: string }>).map((r) => r.round_id).filter(Boolean),
    ),
  ];

  const [{ data: mine }, { data: invited }] = await Promise.all([
    supabase
      .from("rounds")
      .select(
        "id, status, started_at, ended_at, course_id, layout_id, round_context, play_format, scoring_type, team_size, is_rated",
      )
      .eq("created_by", userId)
      .order("started_at", { ascending: false })
      .limit(limit),
    invitedIds.length
      ? supabase
          .from("rounds")
          .select(
            "id, status, started_at, ended_at, course_id, layout_id, round_context, play_format, scoring_type, team_size, is_rated",
          )
          .in("id", invitedIds)
          .order("started_at", { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [] }),
  ]);

  const byId = new Map<string, any>();
  for (const row of [...((mine ?? []) as any[]), ...((invited ?? []) as any[])]) {
    byId.set(row.id as string, row);
  }
  const data = [...byId.values()]
    .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))
    .slice(0, limit);

  const list = (data ?? []) as Array<{
    id: string;
    status: string;
    started_at: string;
    ended_at: string | null;
    course_id: string;
    layout_id: string;
    round_context: string | null;
    play_format: string | null;
    scoring_type: string | null;
    team_size: number | null;
    is_rated: boolean | null;
  }>;
  if (list.length === 0) return [];

  const courseIds = [...new Set(list.map((r) => r.course_id).filter(Boolean))];
  const layoutIds = [...new Set(list.map((r) => r.layout_id).filter(Boolean))];

  const [{ data: courses }, { data: mePlayers }] = await Promise.all([
    courseIds.length
      ? supabase.from("courses").select("id, name, city, state").in("id", courseIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("round_players")
      .select("id, round_id")
      .in(
        "round_id",
        list.map((r) => r.id),
      )
      .eq("user_id", userId),
  ]);

  const courseById = new Map(
    (
      (courses ?? []) as Array<{
        id: string;
        name: string;
        city: string | null;
        state: string | null;
      }>
    ).map((c) => [c.id, { name: c.name, city: c.city, state: c.state }]),
  );
  // Layout details (name + hole count) and the full card, so each round can
  // show who played and how far along the scorecard is.
  const [{ data: layouts }, { data: allPlayers }] = await Promise.all([
    layoutIds.length
      ? supabase.from("course_layouts").select("id, name, hole_count").in("id", layoutIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("round_players")
      .select("round_id, user_id, guest_name, position")
      .in(
        "round_id",
        list.map((r) => r.id),
      )
      .order("position", { ascending: true }),
  ]);

  const layoutById = new Map(
    ((layouts ?? []) as Array<{ id: string; name: string | null; hole_count: number | null }>).map(
      (l) => [l.id, { name: l.name, hole_count: l.hole_count }],
    ),
  );

  const cardRows = (allPlayers ?? []) as Array<{
    round_id: string;
    user_id: string | null;
    guest_name: string | null;
  }>;
  const otherUserIds = [
    ...new Set(cardRows.map((p) => p.user_id).filter((id): id is string => !!id && id !== userId)),
  ];
  const { data: mateProfiles } = otherUserIds.length
    ? await supabase.from("profiles").select("id, display_name, username").in("id", otherUserIds)
    : { data: [] };
  const profileById = new Map(
    (
      (mateProfiles ?? []) as Array<{
        id: string;
        display_name: string | null;
        username: string | null;
      }>
    ).map((p) => [p.id, p]),
  );
  const cardmatesByRound = new Map<string, Array<{ name: string; username: string | null }>>();
  for (const p of cardRows) {
    if (p.user_id === userId) continue;
    const profile = p.user_id ? profileById.get(p.user_id) : undefined;
    const name = profile?.display_name || profile?.username || p.guest_name || "Guest";
    const arr = cardmatesByRound.get(p.round_id) ?? [];
    arr.push({ name, username: profile?.username ?? null });
    cardmatesByRound.set(p.round_id, arr);
  }

  const players = (mePlayers ?? []) as Array<{ id: string; round_id: string }>;
  const playerByRound = new Map(players.map((p) => [p.round_id, p.id]));
  const roundByPlayer = new Map(players.map((p) => [p.id, p.round_id]));
  const layoutByRound = new Map(list.map((r) => [r.id, r.layout_id]));

  const totals = new Map<string, { total: number; toPar: number; holes: number }>();
  if (players.length > 0) {
    const [{ data: scores }, { data: holes }] = await Promise.all([
      supabase
        .from("round_scores")
        .select("round_player_id, hole_number, strokes")
        .in(
          "round_player_id",
          players.map((p) => p.id),
        )
        .limit(STATS_LIMITS.holeScores),
      layoutIds.length
        ? supabase.from("holes").select("layout_id, number, par").in("layout_id", layoutIds)
        : Promise.resolve({ data: [] }),
    ]);
    const parByHole = new Map<string, number>();
    for (const h of (holes ?? []) as Array<{ layout_id: string; number: number; par: number }>) {
      parByHole.set(`${h.layout_id}:${h.number}`, h.par);
    }
    for (const s of (scores ?? []) as Array<{
      round_player_id: string;
      hole_number: number;
      strokes: number;
    }>) {
      const roundId = roundByPlayer.get(s.round_player_id);
      if (!roundId) continue;
      const par = parByHole.get(`${layoutByRound.get(roundId) ?? ""}:${s.hole_number}`) ?? 3;
      const cur = totals.get(s.round_player_id) ?? { total: 0, toPar: 0, holes: 0 };
      cur.total += s.strokes;
      cur.toPar += s.strokes - par;
      cur.holes += 1;
      totals.set(s.round_player_id, cur);
    }
  }

  return list.map((r) => {
    const playerId = playerByRound.get(r.id);
    const agg = playerId ? totals.get(playerId) : undefined;
    return {
      id: r.id,
      status: r.status,
      started_at: r.started_at,
      ended_at: r.ended_at,
      course_id: r.course_id,
      layout_id: r.layout_id,
      course: courseById.get(r.course_id) ?? null,
      total: agg?.total ?? null,
      toPar: agg?.toPar ?? null,
      layout_name: layoutById.get(r.layout_id)?.name ?? null,
      holes_total: layoutById.get(r.layout_id)?.hole_count ?? null,
      holes_scored: agg?.holes ?? 0,
      cardmates: cardmatesByRound.get(r.id) ?? [],
      round_context: r.round_context ?? null,
      play_format: r.play_format ?? null,
      scoring_type: r.scoring_type ?? null,
      team_size: r.team_size ?? null,
      is_rated: r.is_rated ?? null,
    };
  });
}

async function loadExternal(
  supabase: Client,
  userId: string,
  source: "pdga" | "udisc",
  limit: number,
): Promise<ExternalRoundRow[]> {
  const { data } = await supabase
    .from("external_rounds")
    .select(EXTERNAL_COLUMNS)
    .eq("user_id", userId)
    .eq("source", source)
    .order("played_on", { ascending: false })
    .limit(limit);
  return (data ?? []) as ExternalRoundRow[];
}

async function loadFriendsActive(
  supabase: Client,
  userId: string,
): Promise<FriendActiveRoundRow[]> {
  const { data: friendships } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id, status")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq("status", "accepted");

  const friendIds = ((friendships ?? []) as Array<{ requester_id: string; addressee_id: string }>)
    .map((f) => (f.requester_id === userId ? f.addressee_id : f.requester_id))
    .filter((id) => id && id !== userId);
  if (friendIds.length === 0) return [];

  const { data: rounds } = await supabase
    .from("rounds")
    .select("id, started_at, created_by, course_id")
    .in("created_by", friendIds)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(STATS_LIMITS.friendRounds);

  const rows = (rounds ?? []) as Array<{
    id: string;
    started_at: string;
    created_by: string;
    course_id: string;
  }>;
  if (rows.length === 0) return [];

  const courseIds = [...new Set(rows.map((r) => r.course_id).filter(Boolean))];
  const [{ data: courses }, { data: profiles }] = await Promise.all([
    courseIds.length
      ? supabase.from("courses").select("id, name, city, state").in("id", courseIds)
      : Promise.resolve({ data: [] }),
    supabase.from("profiles").select("id, display_name, username").in("id", friendIds),
  ]);
  const courseById = new Map(
    (
      (courses ?? []) as Array<{
        id: string;
        name: string;
        city: string | null;
        state: string | null;
      }>
    ).map((c) => [c.id, c]),
  );
  const profileById = new Map(
    (
      (profiles ?? []) as Array<{
        id: string;
        display_name: string | null;
        username: string | null;
      }>
    ).map((p) => [p.id, p]),
  );

  return rows.map((r) => {
    const course = courseById.get(r.course_id);
    return {
      id: r.id,
      started_at: r.started_at,
      created_by: r.created_by,
      course_name: course?.name ?? null,
      city: course?.city ?? null,
      state: course?.state ?? null,
      player_name:
        profileById.get(r.created_by)?.display_name ||
        profileById.get(r.created_by)?.username ||
        "Friend",
      player_username: profileById.get(r.created_by)?.username ?? null,
    };
  });
}

async function loadPlanned(supabase: Client, userId: string): Promise<PlannedEventRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("scheduled_events")
    .select("id, title, starts_on, starts_at, location, city, state, event_url, source, status")
    .eq("user_id", userId)
    .in("status", ["registered", "confirmed"])
    .or(`starts_on.gte.${today},starts_on.is.null`)
    .order("starts_on", { ascending: true, nullsFirst: false })
    .limit(STATS_LIMITS.plannedEvents);
  return (data ?? []) as PlannedEventRow[];
}

export const getRoundHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        nativeLimit: z.number().int().min(1).max(300).nullish(),
        externalLimit: z.number().int().min(1).max(1000).nullish(),
        includeFriends: z.boolean().nullish(),
        includePlanned: z.boolean().nullish(),
      })
      .nullish()
      .transform((v) => v ?? {})
      .parse(raw),
  )
  .handler(async ({ data, context }): Promise<RoundHistoryResult> => {
    const { supabase, userId } = context as unknown as { supabase: Client; userId: string };
    const nativeLimit = data.nativeLimit ?? STATS_LIMITS.nativeRounds;
    const externalLimit = data.externalLimit ?? STATS_LIMITS.rounds;

    const [native, pdga, udisc, friendsActive, planned] = await Promise.all([
      loadNative(supabase, userId, nativeLimit),
      loadExternal(supabase, userId, "pdga", externalLimit),
      loadExternal(supabase, userId, "udisc", externalLimit),
      data.includeFriends === false ? Promise.resolve([]) : loadFriendsActive(supabase, userId),
      data.includePlanned === false ? Promise.resolve([]) : loadPlanned(supabase, userId),
    ]);

    return { native, pdga, udisc, friendsActive, planned };
  });
