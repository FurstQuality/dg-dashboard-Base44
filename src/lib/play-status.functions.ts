import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * "Looking to play" lobby.
 *
 * Players set an availability status (looking / maybe / not looking) and post
 * open rounds — courses they want to play and the time window they're free.
 * Friends (or everyone, when a post is public) can see those posts and join.
 */

export type PlayAvailabilityStatus =
  | "looking"
  | "maybe"
  | "not_looking"
  | "casual_round"
  | "league_round"
  | "tournament_round"
  | "practicing";

/** Statuses the app can set on its own from what the player is currently doing. */
export const AUTO_STATUSES: PlayAvailabilityStatus[] = [
  "casual_round",
  "league_round",
  "tournament_round",
];

export type PlayAvailability = {
  status: PlayAvailabilityStatus;
  note: string | null;
  updated_at: string | null;
  /** When true, the app keeps the status in sync with the round being scored. */
  auto: boolean;
  auto_round_id: string | null;
};

export type OpenRoundJoin = {
  user_id: string;
  state: "in" | "maybe";
  player_name: string;
  avatar_url: string | null;
};

export type OpenRound = {
  id: string;
  user_id: string;
  player_name: string;
  avatar_url: string | null;
  course_names: string[];
  course_id: string | null;
  city: string | null;
  state: string | null;
  window_start: string;
  window_end: string;
  holes: number | null;
  note: string | null;
  visibility: "friends" | "public";
  is_mine: boolean;
  joins: OpenRoundJoin[];
  my_join: "in" | "maybe" | null;
};

export type PlayLobby = {
  availability: PlayAvailability;
  openRounds: OpenRound[];
  friendsLooking: Array<{
    user_id: string;
    player_name: string;
    avatar_url: string | null;
    status: PlayAvailabilityStatus;
    note: string | null;
  }>;
};

type Client = { from: (table: string) => any };

async function friendIdsOf(supabase: Client, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .limit(500);
  return Array.from(
    new Set(
      ((data ?? []) as Array<{ requester_id: string; addressee_id: string }>)
        .map((l) => (l.requester_id === userId ? l.addressee_id : l.requester_id))
        .filter((id) => id && id !== userId),
    ),
  );
}

async function profileMap(supabase: Client, ids: string[]) {
  if (!ids.length) return new Map<string, { name: string; avatar_url: string | null }>();
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, username, avatar_url")
    .in("id", ids);
  return new Map<string, { name: string; avatar_url: string | null }>(
    ((data ?? []) as Array<{
      id: string;
      display_name: string | null;
      username: string | null;
      avatar_url: string | null;
    }>).map((p) => [p.id, { name: p.display_name || p.username || "Player", avatar_url: p.avatar_url }]),
  );
}

export const getPlayLobby = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlayLobby> => {
    const supabase = context.supabase as unknown as Client;
    const userId = context.userId as string;
    const nowIso = new Date().toISOString();

    const [{ data: mine }, friendIds] = await Promise.all([
      supabase
        .from("play_availability")
        .select("status, note, updated_at, auto, auto_round_id")
        .eq("user_id", userId)
        .maybeSingle(),
      friendIdsOf(supabase, userId),
    ]);

    const { data: intentRows } = await supabase
      .from("play_intents")
      .select(
        "id, user_id, course_id, course_names, city, state, window_start, window_end, holes, note, visibility",
      )
      .gte("window_end", nowIso)
      .order("window_start", { ascending: true })
      .limit(60);

    const intents = (intentRows ?? []) as Array<Omit<OpenRound, "player_name" | "avatar_url" | "is_mine" | "joins" | "my_join">>;

    const { data: joinRows } = intents.length
      ? await supabase
          .from("play_intent_joins")
          .select("intent_id, user_id, state")
          .in(
            "intent_id",
            intents.map((i) => i.id),
          )
      : { data: [] };
    const joins = (joinRows ?? []) as Array<{ intent_id: string; user_id: string; state: "in" | "maybe" }>;

    const { data: availRows } = friendIds.length
      ? await supabase
          .from("play_availability")
          .select("user_id, status, note")
          .in("user_id", friendIds)
          .neq("status", "not_looking")
      : { data: [] };
    const avails = (availRows ?? []) as Array<{
      user_id: string;
      status: PlayAvailabilityStatus;
      note: string | null;
    }>;

    const ids = Array.from(
      new Set([
        ...intents.map((i) => i.user_id),
        ...joins.map((j) => j.user_id),
        ...avails.map((a) => a.user_id),
      ]),
    );
    const profiles = await profileMap(supabase, ids);
    const nameOf = (id: string) => profiles.get(id)?.name ?? "Player";
    const avatarOf = (id: string) => profiles.get(id)?.avatar_url ?? null;

    const openRounds: OpenRound[] = intents.map((i) => {
      const rowJoins = joins.filter((j) => j.intent_id === i.id);
      return {
        ...i,
        course_names: i.course_names ?? [],
        player_name: i.user_id === userId ? "You" : nameOf(i.user_id),
        avatar_url: avatarOf(i.user_id),
        is_mine: i.user_id === userId,
        joins: rowJoins.map((j) => ({
          user_id: j.user_id,
          state: j.state,
          player_name: j.user_id === userId ? "You" : nameOf(j.user_id),
          avatar_url: avatarOf(j.user_id),
        })),
        my_join: rowJoins.find((j) => j.user_id === userId)?.state ?? null,
      };
    });

    return {
      availability: {
        status: (mine?.status as PlayAvailabilityStatus) ?? "not_looking",
        note: mine?.note ?? null,
        updated_at: mine?.updated_at ?? null,
        auto: mine?.auto ?? true,
        auto_round_id: mine?.auto_round_id ?? null,
      },
      openRounds,
      friendsLooking: avails.map((a) => ({
        user_id: a.user_id,
        player_name: nameOf(a.user_id),
        avatar_url: avatarOf(a.user_id),
        status: a.status,
        note: a.note,
      })),
    };
  });

export const setPlayAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        status: z.enum([
          "looking",
          "maybe",
          "not_looking",
          "casual_round",
          "league_round",
          "tournament_round",
          "practicing",
        ]),
        note: z.string().trim().max(280).nullable().optional(),
        /** Set false when the player picks a status by hand. */
        auto: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as Client;
    const { error } = await supabase
      .from("play_availability")
      .upsert(
        {
          user_id: context.userId,
          status: data.status,
          note: data.note ?? null,
          auto: data.auto ?? false,
          auto_round_id: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const intentInput = z.object({
  id: z.string().uuid().optional(),
  course_names: z.array(z.string().trim().min(1).max(120)).min(1).max(5),
  course_id: z.string().uuid().nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  state: z.string().trim().max(40).nullable().optional(),
  window_start: z.string().min(1),
  window_end: z.string().min(1),
  holes: z.number().int().min(1).max(36).nullable().optional(),
  note: z.string().trim().max(280).nullable().optional(),
  visibility: z.enum(["friends", "public"]).default("friends"),
});

export const savePlayIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => intentInput.parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as Client;
    const start = new Date(data.window_start);
    const end = new Date(data.window_end);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error("Pick a valid start and end time.");
    if (end <= start) throw new Error("The end of your window has to be after the start.");

    const row = {
      user_id: context.userId,
      course_names: data.course_names,
      course_id: data.course_id ?? null,
      city: data.city ?? null,
      state: data.state ?? null,
      window_start: start.toISOString(),
      window_end: end.toISOString(),
      holes: data.holes ?? null,
      note: data.note ?? null,
      visibility: data.visibility,
    };

    if (data.id) {
      const { error } = await supabase
        .from("play_intents")
        .update(row)
        .eq("id", data.id)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await supabase
      .from("play_intents")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    // Posting an open round means you're looking to play.
    await supabase
      .from("play_availability")
      .upsert(
        { user_id: context.userId, status: "looking", updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    return { id: (inserted as { id: string }).id };
  });

export const deletePlayIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as Client;
    const { error } = await supabase
      .from("play_intents")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setPlayIntentJoin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        intent_id: z.string().uuid(),
        state: z.enum(["in", "maybe"]).nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as Client;
    if (data.state === null) {
      const { error } = await supabase
        .from("play_intent_joins")
        .delete()
        .eq("intent_id", data.intent_id)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await supabase
      .from("play_intent_joins")
      .upsert(
        { intent_id: data.intent_id, user_id: context.userId, state: data.state },
        { onConflict: "intent_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type MyPlayStatus = PlayAvailability & {
  /** The round that produced an automatic status, when there is one. */
  active_round: {
    id: string;
    course_name: string | null;
    context: PlayAvailabilityStatus;
  } | null;
};

/**
 * Header status resolver. Reads the player's saved status and, when automatic
 * status is on, derives it from the round they're currently scoring:
 * tournament round, league round, or casual round. When that round ends the
 * status falls back to "looking to play" for the rest of the day.
 */
export const getMyPlayStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyPlayStatus> => {
    const supabase = context.supabase as unknown as Client;
    const userId = context.userId as string;

    const { data: row } = await supabase
      .from("play_availability")
      .select("status, note, updated_at, auto, auto_round_id")
      .eq("user_id", userId)
      .maybeSingle();

    const current: PlayAvailability = {
      status: (row?.status as PlayAvailabilityStatus) ?? "not_looking",
      note: row?.note ?? null,
      updated_at: row?.updated_at ?? null,
      auto: row?.auto ?? true,
      auto_round_id: row?.auto_round_id ?? null,
    };

    // Rounds the player is scoring themselves, plus rounds they were added to.
    const { data: playerRows } = await supabase
      .from("round_players")
      .select("round_id")
      .eq("user_id", userId)
      .limit(50);
    const playerRoundIds = ((playerRows ?? []) as Array<{ round_id: string }>).map((r) => r.round_id);

    const { data: ownRounds } = await supabase
      .from("rounds")
      .select("id, course_id, tournament_id, league_event_id, round_context, started_at, created_by, status")
      .eq("status", "in_progress")
      .or(
        playerRoundIds.length
          ? `created_by.eq.${userId},id.in.(${playerRoundIds.join(",")})`
          : `created_by.eq.${userId}`,
      )
      .order("started_at", { ascending: false })
      .limit(1);

    const round = ((ownRounds ?? []) as Array<{
      id: string;
      course_id: string | null;
      tournament_id: string | null;
      league_event_id: string | null;
      round_context: string | null;
    }>)[0];

    let active: MyPlayStatus["active_round"] = null;
    if (round) {
      const context_: PlayAvailabilityStatus = round.tournament_id
        ? "tournament_round"
        : round.league_event_id
          ? "league_round"
          : "casual_round";
      let courseName: string | null = null;
      if (round.course_id) {
        const { data: course } = await supabase
          .from("courses")
          .select("name")
          .eq("id", round.course_id)
          .maybeSingle();
        courseName = (course as { name?: string } | null)?.name ?? null;
      }
      active = { id: round.id, course_name: courseName, context: context_ };
    }

    if (!current.auto) return { ...current, active_round: active };

    const desired: PlayAvailabilityStatus = active
      ? active.context
      : AUTO_STATUSES.includes(current.status)
        ? "looking"
        : current.status;
    const desiredRoundId = active?.id ?? null;

    if (desired !== current.status || desiredRoundId !== current.auto_round_id) {
      const updated_at = new Date().toISOString();
      await supabase.from("play_availability").upsert(
        {
          user_id: userId,
          status: desired,
          note: current.note,
          auto: true,
          auto_round_id: desiredRoundId,
          updated_at,
        },
        { onConflict: "user_id" },
      );
      return { ...current, status: desired, auto_round_id: desiredRoundId, updated_at, active_round: active };
    }

    return { ...current, active_round: active };
  });

/** Turn automatic status on and immediately re-resolve it. */
export const setPlayAutoStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ auto: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as Client;
    const { error } = await supabase.from("play_availability").upsert(
      {
        user_id: context.userId,
        auto: data.auto,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
