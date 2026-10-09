/**
 * Server-only loader for "Live now": friends currently playing.
 *
 * Two sources, both privacy-respecting:
 *  - Sanctioned events: PDGA's published field cache matched to friends' linked
 *    player numbers, then live cards read from `live_event_scores` (kept fresh
 *    by the scheduled sync, so nobody has to press refresh).
 *  - In-app rounds: the `friends_live_rounds()` database helper, which only
 *    returns rounds belonging to accepted friends of the signed-in player.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePdgaNumber, pdgaNumberQueryValues } from "@/lib/pdga-number";
import {
  isEventInPlay,
  latestRoundPerPlayer,
  liveEventSort,
  livePlayerSort,
  type FriendLiveEvent,
  type FriendLivePlayer,
  type FriendLiveRound,
  type FriendsLiveNow,
} from "@/lib/live/friend-live";

const LIMITS = {
  friendships: 300,
  friends: 300,
  field: 1500,
  events: 40,
  scores: 2000,
} as const;

type FriendMeta = { userId: string; displayName: string; username: string | null };

async function friendsByPdgaNumber(supabase: SupabaseClient, userId: string) {
  const { data: links, error: linkError } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .limit(LIMITS.friendships);
  if (linkError) throw new Error(linkError.message);

  const friendIds = Array.from(
    new Set(
      ((links ?? []) as Array<{ requester_id: string; addressee_id: string }>)
        .map((l) => (l.requester_id === userId ? l.addressee_id : l.requester_id))
        .filter((id) => id && id !== userId),
    ),
  );
  const byNumber = new Map<string, FriendMeta>();
  if (!friendIds.length) return { byNumber, friendIds };

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, username, pdga_number")
    .in("id", friendIds)
    .not("pdga_number", "is", null)
    .limit(LIMITS.friends);
  if (profileError) throw new Error(profileError.message);

  for (const p of (profiles ?? []) as Array<{
    id: string;
    display_name: string | null;
    username: string | null;
    pdga_number: string | null;
  }>) {
    const num = normalizePdgaNumber(p.pdga_number);
    if (!num) continue;
    byNumber.set(num, {
      userId: p.id,
      displayName: p.display_name ?? p.username ?? `#${num}`,
      username: p.username,
    });
  }
  return { byNumber, friendIds };
}

/**
 * Make sure every event we want live scoring for is on the automatic refresh
 * schedule. Registration is metadata only — no scores are written here.
 */
export async function registerEventsForLiveSync(
  events: Array<{
    eventRef: string;
    name?: string | null;
    location?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    priority?: number;
  }>,
): Promise<number> {
  if (!events.length) return 0;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows = events.map((e) => ({
    event_ref: e.eventRef,
    name: e.name ?? null,
    location: e.location ?? null,
    start_date: e.startDate ?? null,
    end_date: e.endDate ?? null,
    source: "pdga",
    priority: e.priority ?? 0,
    active: true,
  }));
  const { error } = await supabaseAdmin
    .from("live_sync_registry")
    .upsert(rows, { onConflict: "event_ref", ignoreDuplicates: false });
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function loadFriendsLiveNow(
  supabase: SupabaseClient,
  userId: string,
  options: { today?: string } = {},
): Promise<FriendsLiveNow> {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const fetchedAt = new Date().toISOString();

  const [{ byNumber }, roundsResult] = await Promise.all([
    friendsByPdgaNumber(supabase, userId),
    supabase.rpc("friends_live_rounds"),
  ]);

  const rounds: FriendLiveRound[] = (
    (roundsResult.data ?? []) as Array<{
      round_id: string;
      player_id: string;
      display_name: string | null;
      username: string | null;
      avatar_url: string | null;
      course_name: string | null;
      started_at: string | null;
      holes_played: number | null;
      total_strokes: number | null;
      total_par: number | null;
      last_score_at: string | null;
    }>
  ).map((r) => ({
    roundId: r.round_id,
    playerId: r.player_id,
    displayName: r.display_name ?? r.username ?? "A friend",
    username: r.username,
    avatarUrl: r.avatar_url,
    courseName: r.course_name,
    startedAt: r.started_at,
    holesPlayed: r.holes_played ?? 0,
    totalStrokes: r.total_strokes ?? 0,
    totalPar: r.total_par ?? 0,
    lastScoreAt: r.last_score_at,
  }));

  const empty: FriendsLiveNow = {
    events: [],
    rounds,
    friendsPlaying: rounds.length,
    friendsWithPdga: byNumber.size,
    oldestSyncedAt: null,
    fetchedAt,
  };
  if (!byNumber.size) return empty;

  const numbers = [...byNumber.keys()];
  const { data: fieldRows, error: fieldError } = await supabase
    .from("pdga_event_field")
    .select("event_ref, pdga_number, division")
    .in("pdga_number", pdgaNumberQueryValues(numbers))
    .limit(LIMITS.field);
  if (fieldError) throw new Error(fieldError.message);

  const divisionByKey = new Map<string, string | null>();
  const refs = new Set<string>();
  for (const row of (fieldRows ?? []) as Array<{
    event_ref: string;
    pdga_number: string;
    division: string | null;
  }>) {
    const num = normalizePdgaNumber(row.pdga_number);
    if (!num || !byNumber.has(num)) continue;
    refs.add(row.event_ref);
    divisionByKey.set(`${row.event_ref}:${num}`, row.division);
  }
  if (!refs.size) return empty;

  const { data: kbRows } = await supabase
    .from("pdga_kb_events")
    .select("pdga_event_id, name, tier, start_date, end_date, city, state, country, pdga_url")
    .in("pdga_event_id", [...refs])
    .lte("start_date", today)
    .gte("end_date", today)
    .limit(LIMITS.events);

  const inPlay = ((kbRows ?? []) as Array<{
    pdga_event_id: string;
    name: string | null;
    tier: string | null;
    start_date: string | null;
    end_date: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    pdga_url: string | null;
  }>).filter((row) => isEventInPlay(row.start_date, row.end_date, today));
  if (!inPlay.length) return empty;

  const inPlayRefs = inPlay.map((e) => e.pdga_event_id);

  // Keep these events on the automatic refresh schedule; failure here must not
  // hide scores we already have.
  try {
    await registerEventsForLiveSync(
      inPlay.map((e) => ({
        eventRef: e.pdga_event_id,
        name: e.name,
        location: [e.city, e.state, e.country].filter(Boolean).join(", ") || null,
        startDate: e.start_date,
        endDate: e.end_date,
        priority: 10,
      })),
    );
  } catch {
    /* the scheduled sync retries on its own */
  }

  const [{ data: scoreRows }, { data: registryRows }] = await Promise.all([
    supabase
      .from("live_event_scores")
      .select(
        "event_ref, pdga_number, player_name, division, round_number, place, running_place, round_to_par, total, to_par, thru, tee_time, card_number, completed, round_started, hole_scores, hole_pars, last_synced_at",
      )
      .in("event_ref", inPlayRefs)
      .in("pdga_number", pdgaNumberQueryValues(numbers))
      .limit(LIMITS.scores),
    supabase
      .from("live_sync_registry")
      .select("event_ref, last_synced_at, last_status")
      .in("event_ref", inPlayRefs),
  ]);

  const registryByRef = new Map(
    ((registryRows ?? []) as Array<{
      event_ref: string;
      last_synced_at: string | null;
      last_status: string | null;
    }>).map((r) => [r.event_ref, r]),
  );

  const playersByRef = new Map<string, FriendLivePlayer[]>();
  for (const row of (scoreRows ?? []) as Array<{
    event_ref: string;
    pdga_number: string;
    player_name: string | null;
    division: string | null;
    round_number: number | null;
    place: number | null;
    running_place: number | null;
    round_to_par: number | null;
    total: number | null;
    to_par: number | null;
    thru: number | null;
    tee_time: string | null;
    card_number: string | null;
    completed: boolean | null;
    round_started: boolean | null;
    hole_scores: number[] | null;
    hole_pars: number[] | null;
    last_synced_at: string | null;
  }>) {
    const num = normalizePdgaNumber(row.pdga_number);
    if (!num) continue;
    const meta = byNumber.get(num);
    if (!meta) continue;
    const list = playersByRef.get(row.event_ref) ?? [];
    list.push({
      userId: meta.userId,
      displayName: meta.displayName,
      username: meta.username,
      pdgaNumber: num,
      division: row.division ?? divisionByKey.get(`${row.event_ref}:${num}`) ?? null,
      roundNumber: row.round_number ?? 1,
      thru: row.thru ?? 0,
      holeCount: row.hole_pars?.length ?? row.hole_scores?.length ?? null,
      place: row.place ?? row.running_place ?? null,
      total: row.total,
      toPar: row.to_par,
      roundToPar: row.round_to_par,
      teeTime: row.tee_time,
      cardNumber: row.card_number,
      completed: !!row.completed,
      roundStarted: !!row.round_started,
      holeScores: row.hole_scores,
      holePars: row.hole_pars,
      lastSyncedAt: row.last_synced_at,
    });
    playersByRef.set(row.event_ref, list);
  }

  const events: FriendLiveEvent[] = inPlay.map((row) => {
    const players = latestRoundPerPlayer(playersByRef.get(row.pdga_event_id) ?? []).sort(
      livePlayerSort,
    );
    const registry = registryByRef.get(row.pdga_event_id);
    return {
      eventRef: row.pdga_event_id,
      name: row.name ?? `PDGA event ${row.pdga_event_id}`,
      location: [row.city, row.state, row.country].filter(Boolean).join(", ") || null,
      startDate: row.start_date,
      endDate: row.end_date,
      tier: row.tier,
      pdgaUrl: row.pdga_url ?? `https://www.pdga.com/tour/event/${row.pdga_event_id}`,
      lastSyncedAt: registry?.last_synced_at ?? null,
      syncStatus: registry?.last_status ?? null,
      players,
    };
  });

  const withPlayers = events.filter((e) => e.players.length > 0).sort(liveEventSort);
  const syncTimes = withPlayers
    .map((e) => e.lastSyncedAt)
    .filter((v): v is string => typeof v === "string")
    .sort();

  return {
    events: withPlayers,
    rounds,
    friendsPlaying:
      rounds.length + withPlayers.reduce((sum, e) => sum + e.players.length, 0),
    friendsWithPdga: byNumber.size,
    oldestSyncedAt: syncTimes[0] ?? null,
    fetchedAt,
  };
}

/** Full card detail for one friend at one event — used by the card sheet. */
export async function loadFriendLiveCard(
  supabase: SupabaseClient,
  eventRef: string,
  pdgaNumber: string,
) {
  const num = normalizePdgaNumber(pdgaNumber);
  if (!num) return { rounds: [] as FriendLivePlayer[] };
  const { data, error } = await supabase
    .from("live_event_scores")
    .select(
      "pdga_number, player_name, division, round_number, place, running_place, round_to_par, total, to_par, thru, tee_time, card_number, completed, round_started, hole_scores, hole_pars, last_synced_at",
    )
    .eq("event_ref", eventRef)
    .in("pdga_number", pdgaNumberQueryValues([num]))
    .order("round_number", { ascending: true });
  if (error) throw new Error(error.message);

  const rounds: FriendLivePlayer[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    userId: null,
    displayName: (r.player_name as string | null) ?? `#${num}`,
    username: null,
    pdgaNumber: num,
    division: (r.division as string | null) ?? null,
    roundNumber: (r.round_number as number | null) ?? 1,
    thru: (r.thru as number | null) ?? 0,
    holeCount:
      (r.hole_pars as number[] | null)?.length ?? (r.hole_scores as number[] | null)?.length ?? null,
    place: (r.place as number | null) ?? (r.running_place as number | null) ?? null,
    total: (r.total as number | null) ?? null,
    toPar: (r.to_par as number | null) ?? null,
    roundToPar: (r.round_to_par as number | null) ?? null,
    teeTime: (r.tee_time as string | null) ?? null,
    cardNumber: (r.card_number as string | null) ?? null,
    completed: !!r.completed,
    roundStarted: !!r.round_started,
    holeScores: (r.hole_scores as number[] | null) ?? null,
    holePars: (r.hole_pars as number[] | null) ?? null,
    lastSyncedAt: (r.last_synced_at as string | null) ?? null,
  }));
  return { rounds };
}
