/**
 * Play section server reads.
 *
 * Everything the Play home and Practice pages need to answer "what should I
 * do right now?" — recent form, practice reps, courses you actually play, and
 * the closest courses to wherever you are standing. All aggregation happens
 * server-side so the browser never pulls thousands of throw/putt rows just to
 * render a couple of numbers.
 */
import { createServerFn } from "@tanstack/react-start";
import { orFilterText } from "@/lib/postgrest-safe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { rankByDistance, normalizeCourseName } from "@/lib/play-geo";

export type PlayForm = {
  /** Completed DG Dashboard rounds in the window. */
  rounds: number;
  /** Imported/verified rounds (PDGA, UDisc, manual) in the window. */
  importedRounds: number;
  /** Best round rating seen in the window, native or imported. */
  bestRating: number | null;
  /** Best score relative to par in the window (lower is better). */
  bestToPar: number | null;
  practiceSessions: number;
  puttsLogged: number;
  puttMakePct: number | null;
  windowDays: number;
};

export type PlayCourse = {
  courseKey: string;
  name: string;
  location: string | null;
  courseId: string | null;
  rounds: number;
  lastPlayed: string | null;
  bestToPar: number | null;
  pinned: boolean;
};

export type NearbyCourse = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  holeCount: number | null;
  distanceMi: number;
};

export type PracticeHistoryRow = {
  id: string;
  kind: "range" | "putting";
  started_at: string;
  ended_at: string | null;
  location: string | null;
  reps: number;
  makePct: number | null;
};

export type PracticeSummary = {
  range: { sessions: number; throws: number; lastAt: string | null };
  putting: { sessions: number; putts: number; makePct: number | null; lastAt: string | null };
};

/* ------------------------------------------------------------------ */
/* Recent form — rounds, ratings, practice reps                        */
/* ------------------------------------------------------------------ */
export const getPlayForm = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ days: z.number().int().min(1).max(365).default(30) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<PlayForm> => {
    const { supabase, userId } = context;
    const days = data.days;
    const sinceIso = new Date(Date.now() - days * 864e5).toISOString();
    const sinceDate = sinceIso.slice(0, 10);

    const [rounds, imported, nativeRatings, rangeSessions, puttSessions, putts] = await Promise.all(
      [
        supabase
          .from("rounds")
          .select("id", { count: "exact", head: true })
          .eq("created_by", userId)
          .eq("status", "completed")
          .gte("started_at", sinceIso),
        supabase
          .from("external_rounds")
          .select("round_rating, to_par")
          .eq("user_id", userId)
          .gte("played_on", sinceDate)
          .limit(500),
        supabase
          .from("round_ratings")
          .select("round_rating")
          .eq("user_id", userId)
          .gte("created_at", sinceIso)
          .limit(500),
        supabase
          .from("range_sessions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("started_at", sinceIso),
        supabase
          .from("putting_sessions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("started_at", sinceIso),
        supabase
          .from("putting_putts")
          .select("made")
          .eq("user_id", userId)
          .gte("created_at", sinceIso)
          .limit(5000),
      ],
    );

    const importedRows = (imported.data ?? []) as Array<{
      round_rating: number | null;
      to_par: number | null;
    }>;
    const nativeRows = (nativeRatings.data ?? []) as Array<{ round_rating: number | null }>;
    const puttRows = (putts.data ?? []) as Array<{ made: boolean | null }>;

    const ratings = [
      ...importedRows.map((r) => r.round_rating),
      ...nativeRows.map((r) => r.round_rating),
    ].filter((r): r is number => typeof r === "number" && r > 0);
    const toPars = importedRows
      .map((r) => r.to_par)
      .filter((v): v is number => typeof v === "number");

    const made = puttRows.filter((p) => p.made).length;

    return {
      rounds: rounds.count ?? 0,
      importedRounds: importedRows.length,
      bestRating: ratings.length ? Math.max(...ratings) : null,
      bestToPar: toPars.length ? Math.min(...toPars) : null,
      practiceSessions: (rangeSessions.count ?? 0) + (puttSessions.count ?? 0),
      puttsLogged: puttRows.length,
      puttMakePct: puttRows.length ? Math.round((made / puttRows.length) * 100) : null,
      windowDays: days,
    };
  });

/* ------------------------------------------------------------------ */
/* Your courses — pinned course book entries + most-played recents     */
/* ------------------------------------------------------------------ */
export const getMyCourses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(24).default(6) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<PlayCourse[]> => {
    const { supabase, userId } = context;

    const [native, ext, book] = await Promise.all([
      supabase
        .from("rounds")
        .select("id, started_at, course_id, courses!inner(id, name, city, state)")
        .eq("created_by", userId)
        .order("started_at", { ascending: false })
        .limit(300),
      supabase
        .from("external_rounds")
        .select("course_name, played_on, to_par")
        .eq("user_id", userId)
        .order("played_on", { ascending: false })
        .limit(400),
      supabase
        .from("course_book_entries")
        .select("course_key, display_name, location, pinned, course_id")
        .eq("user_id", userId)
        .limit(200),
    ]);

    const byKey = new Map<string, PlayCourse>();
    const touch = (key: string, seed: Omit<PlayCourse, "rounds" | "courseKey">) => {
      const existing = byKey.get(key);
      if (existing) return existing;
      const created: PlayCourse = { courseKey: key, rounds: 0, ...seed };
      byKey.set(key, created);
      return created;
    };

    for (const row of (native.data ?? []) as Array<{
      started_at: string;
      course_id: string | null;
      courses: { id: string; name: string; city: string | null; state: string | null } | null;
    }>) {
      const course = row.courses;
      if (!course?.name) continue;
      const key = normalizeCourseName(course.name);
      const entry = touch(key, {
        name: course.name,
        location: [course.city, course.state].filter(Boolean).join(", ") || null,
        courseId: course.id,
        lastPlayed: row.started_at,
        bestToPar: null,
        pinned: false,
      });
      entry.rounds += 1;
      if (!entry.lastPlayed || row.started_at > entry.lastPlayed) entry.lastPlayed = row.started_at;
      if (!entry.courseId) entry.courseId = course.id;
    }

    for (const row of (ext.data ?? []) as Array<{
      course_name: string | null;
      played_on: string | null;
      to_par: number | null;
    }>) {
      if (!row.course_name) continue;
      const key = normalizeCourseName(row.course_name);
      const entry = touch(key, {
        name: row.course_name,
        location: null,
        courseId: null,
        lastPlayed: row.played_on,
        bestToPar: row.to_par ?? null,
        pinned: false,
      });
      entry.rounds += 1;
      if (row.played_on && (!entry.lastPlayed || row.played_on > entry.lastPlayed))
        entry.lastPlayed = row.played_on;
      if (
        typeof row.to_par === "number" &&
        (entry.bestToPar === null || row.to_par < entry.bestToPar)
      ) {
        entry.bestToPar = row.to_par;
      }
    }

    for (const row of (book.data ?? []) as Array<{
      course_key: string;
      display_name: string;
      location: string | null;
      pinned: boolean | null;
      course_id: string | null;
    }>) {
      const key = normalizeCourseName(row.display_name || row.course_key);
      const entry = touch(key, {
        name: row.display_name || row.course_key,
        location: row.location,
        courseId: row.course_id,
        lastPlayed: null,
        bestToPar: null,
        pinned: !!row.pinned,
      });
      entry.pinned = entry.pinned || !!row.pinned;
      if (!entry.location) entry.location = row.location;
      if (!entry.courseId) entry.courseId = row.course_id;
    }

    return [...byKey.values()]
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (b.lastPlayed ?? "").localeCompare(a.lastPlayed ?? "");
      })
      .slice(0, data.limit);
  });

/* ------------------------------------------------------------------ */
/* Nearby courses                                                      */
/* ------------------------------------------------------------------ */
export const getNearbyCourses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        limit: z.number().int().min(1).max(20).default(6),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<NearbyCourse[]> => {
    const { supabase } = context;
    // Bounding box first (~1 degree lat ≈ 69 mi) so we never scan the table.
    const latPad = 1.2;
    const lngPad = 1.2 / Math.max(0.2, Math.cos((data.lat * Math.PI) / 180));

    const { data: rows, error } = await supabase
      .from("courses")
      .select("id, name, city, state, hole_count, latitude, longitude")
      .eq("moderation_status", "approved")
      .gte("latitude", data.lat - latPad)
      .lte("latitude", data.lat + latPad)
      .gte("longitude", data.lng - lngPad)
      .lte("longitude", data.lng + lngPad)
      .limit(500);
    if (error) throw error;

    return rankByDistance(
      (rows ?? []) as Array<{
        id: string;
        name: string;
        city: string | null;
        state: string | null;
        hole_count: number | null;
        latitude: number | null;
        longitude: number | null;
      }>,
      { lat: data.lat, lng: data.lng },
      data.limit,
    ).map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      state: r.state,
      holeCount: r.hole_count,
      distanceMi: r.distanceMi,
    }));
  });

/* ------------------------------------------------------------------ */
/* Practice summary — server-side counts, no bulk row pulls            */
/* ------------------------------------------------------------------ */
export const getPracticeSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PracticeSummary> => {
    const { supabase, userId } = context;

    const [rangeCount, throwCount, lastRange, puttCount, puttsTotal, puttsMade, lastPutt] =
      await Promise.all([
        supabase
          .from("range_sessions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase
          .from("range_throws")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase
          .from("range_sessions")
          .select("started_at")
          .eq("user_id", userId)
          .order("started_at", { ascending: false })
          .limit(1),
        supabase
          .from("putting_sessions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase
          .from("putting_putts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase
          .from("putting_putts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("made", true),
        supabase
          .from("putting_sessions")
          .select("started_at")
          .eq("user_id", userId)
          .order("started_at", { ascending: false })
          .limit(1),
      ]);

    const total = puttsTotal.count ?? 0;
    const made = puttsMade.count ?? 0;

    return {
      range: {
        sessions: rangeCount.count ?? 0,
        throws: throwCount.count ?? 0,
        lastAt: ((lastRange.data ?? [])[0]?.started_at as string | undefined) ?? null,
      },
      putting: {
        sessions: puttCount.count ?? 0,
        putts: total,
        makePct: total > 0 ? Math.round((made / total) * 100) : null,
        lastAt: ((lastPutt.data ?? [])[0]?.started_at as string | undefined) ?? null,
      },
    };
  });

/** Recent practice sessions for the Practice history table. */
export const getPracticeHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(50).default(20) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<PracticeHistoryRow[]> => {
    const { supabase, userId } = context;
    const [r, p] = await Promise.all([
      supabase
        .from("range_sessions")
        .select("id, started_at, ended_at, location")
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .limit(data.limit),
      supabase
        .from("putting_sessions")
        .select("id, started_at, ended_at, location")
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .limit(data.limit),
    ]);

    const rangeSessions = r.data ?? [];
    const puttSessions = p.data ?? [];

    // Reps are counted only for the sessions we are about to render.
    const [throws, putts] = await Promise.all([
      rangeSessions.length
        ? supabase
            .from("range_throws")
            .select("session_id")
            .in(
              "session_id",
              rangeSessions.map((s) => s.id),
            )
            .limit(5000)
        : Promise.resolve({ data: [] as Array<{ session_id: string }> }),
      puttSessions.length
        ? supabase
            .from("putting_putts")
            .select("session_id, made")
            .in(
              "session_id",
              puttSessions.map((s) => s.id),
            )
            .limit(5000)
        : Promise.resolve({ data: [] as Array<{ session_id: string; made: boolean }> }),
    ]);

    const throwCounts = new Map<string, number>();
    for (const t of (throws.data ?? []) as Array<{ session_id: string }>) {
      throwCounts.set(t.session_id, (throwCounts.get(t.session_id) ?? 0) + 1);
    }
    const puttAgg = new Map<string, { total: number; made: number }>();
    for (const t of (putts.data ?? []) as Array<{ session_id: string; made: boolean }>) {
      const cur = puttAgg.get(t.session_id) ?? { total: 0, made: 0 };
      cur.total += 1;
      if (t.made) cur.made += 1;
      puttAgg.set(t.session_id, cur);
    }

    return [
      ...rangeSessions.map((s) => ({
        id: s.id,
        kind: "range" as const,
        started_at: s.started_at,
        ended_at: s.ended_at,
        location: s.location,
        reps: throwCounts.get(s.id) ?? 0,
        makePct: null,
      })),
      ...puttSessions.map((s) => {
        const agg = puttAgg.get(s.id);
        return {
          id: s.id,
          kind: "putting" as const,
          started_at: s.started_at,
          ended_at: s.ended_at,
          location: s.location,
          reps: agg?.total ?? 0,
          makePct: agg && agg.total > 0 ? Math.round((agg.made / agg.total) * 100) : null,
        };
      }),
    ]
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, data.limit);
  });

export type FriendRoundActivity = {
  roundId: string;
  playerId: string;
  playerName: string;
  playerUsername: string | null;
  courseName: string | null;
  playedAt: string;
  toPar: number | null;
  /** True when this course also shows up in your own course book. */
  yourCourse: boolean;
};

export type FriendEventActivity = {
  tournamentId: string;
  slug: string | null;
  name: string;
  startDate: string;
  location: string | null;
  friendCount: number;
  friendNames: string[];
};

export type FriendPlayActivity = {
  rounds: FriendRoundActivity[];
  events: FriendEventActivity[];
};

/**
 * Play activity rail: what your friends just played and where they are headed.
 * Bounded reads only — friend ids, then a capped slice of their finished rounds
 * and their confirmed upcoming registrations.
 */
export const getFriendPlayActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(20).default(6) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<FriendPlayActivity> => {
    const { supabase, userId } = context;
    const empty: FriendPlayActivity = { rounds: [], events: [] };

    const { data: friendships } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq("status", "accepted")
      .limit(500);
    const friendIds = [
      ...new Set(
        (friendships ?? [])
          .map((f) => (f.requester_id === userId ? f.addressee_id : f.requester_id))
          .filter((id): id is string => !!id && id !== userId),
      ),
    ];
    if (!friendIds.length) return empty;

    const today = new Date().toISOString().slice(0, 10);
    const [roundsRes, regsRes, myRoundsRes, profilesRes] = await Promise.all([
      supabase
        .from("rounds")
        .select("id, created_by, course_id, started_at, ended_at, status")
        .in("created_by", friendIds)
        .eq("status", "completed")
        .order("started_at", { ascending: false })
        .limit(data.limit * 3),
      supabase
        .from("tournament_registrations")
        .select("tournament_id, user_id, status")
        .in("user_id", friendIds)
        .in("status", ["confirmed", "waitlist"])
        .limit(200),
      supabase
        .from("rounds")
        .select("course_id")
        .eq("created_by", userId)
        .not("course_id", "is", null)
        .limit(200),
      supabase.from("profiles").select("id, display_name, username").in("id", friendIds),
    ]);

    const profileMap = new Map(
      (profilesRes.data ?? []).map((p) => [
        p.id,
        {
          name: (p.display_name || p.username || "Friend") as string,
          username: (p.username as string | null) ?? null,
        },
      ]),
    );
    const myCourseIds = new Set(
      ((myRoundsRes.data ?? []) as Array<{ course_id: string | null }>)
        .map((r) => r.course_id)
        .filter((id): id is string => !!id),
    );

    const roundRows = (roundsRes.data ?? []).slice(0, data.limit);
    const courseIds = [
      ...new Set(roundRows.map((r) => r.course_id).filter((id): id is string => !!id)),
    ];
    const [coursesRes, scoresRes] = await Promise.all([
      courseIds.length
        ? supabase.from("courses").select("id, name").in("id", courseIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      roundRows.length
        ? supabase
            .from("round_ratings")
            .select("round_id, user_id, score_to_par")
            .in(
              "round_id",
              roundRows.map((r) => r.id),
            )
            .limit(200)
        : Promise.resolve({
            data: [] as Array<{
              round_id: string;
              user_id: string | null;
              score_to_par: number | null;
            }>,
          }),
    ]);
    const courseMap = new Map((coursesRes.data ?? []).map((c) => [c.id, c.name]));
    const toParMap = new Map<string, number>();
    for (const s of (scoresRes.data ?? []) as Array<{
      round_id: string;
      user_id: string | null;
      score_to_par: number | null;
    }>) {
      if (s.score_to_par == null || !s.user_id) continue;
      toParMap.set(`${s.round_id}:${s.user_id}`, s.score_to_par);
    }

    const rounds: FriendRoundActivity[] = roundRows.map((r) => {
      const info = profileMap.get(r.created_by);
      return {
        roundId: r.id,
        playerId: r.created_by,
        playerName: info?.name ?? "Friend",
        playerUsername: info?.username ?? null,
        courseName: r.course_id ? (courseMap.get(r.course_id) ?? null) : null,
        playedAt: (r.ended_at as string | null) ?? r.started_at,
        toPar: toParMap.get(`${r.id}:${r.created_by}`) ?? null,
        yourCourse: !!r.course_id && myCourseIds.has(r.course_id),
      };
    });

    const regs = (regsRes.data ?? []) as Array<{ tournament_id: string; user_id: string }>;
    let events: FriendEventActivity[] = [];
    const tournamentIds = [...new Set(regs.map((r) => r.tournament_id))];
    if (tournamentIds.length) {
      const { data: tournaments } = await supabase
        .from("tournaments")
        .select("id, slug, name, start_date, location")
        .in("id", tournamentIds)
        .gte("start_date", today)
        .order("start_date", { ascending: true })
        .limit(data.limit);
      const byTournament = new Map<string, string[]>();
      for (const r of regs) {
        const name = profileMap.get(r.user_id)?.name;
        if (!name) continue;
        const list = byTournament.get(r.tournament_id) ?? [];
        if (!list.includes(name)) list.push(name);
        byTournament.set(r.tournament_id, list);
      }
      events = (tournaments ?? []).map((t) => {
        const names = byTournament.get(t.id) ?? [];
        return {
          tournamentId: t.id,
          slug: (t.slug as string | null) ?? null,
          name: t.name,
          startDate: t.start_date,
          location: (t.location as string | null) ?? null,
          friendCount: names.length,
          friendNames: names.slice(0, 3),
        };
      });
    }

    return { rounds, events };
  });

/* ------------------------------------------------------------------ */
/* Phase 4 — events coverage on Play                                   */
/* ------------------------------------------------------------------ */

export type MyPlayEvent = {
  id: string;
  title: string;
  startsOn: string | null;
  startsAt: string | null;
  location: string | null;
  division: string | null;
  status: string;
  tier: string | null;
  tournamentId: string | null;
};

export type NearbyPlayEvent = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  tier: string | null;
  registrationStatus: string | null;
  registrationUrl: string | null;
  pdgaEventId: string | null;
};

export type PlayEvents = {
  /** The user's own committed calendar entries, soonest first. */
  mine: MyPlayEvent[];
  /** Upcoming sanctioned events in the user's home state. */
  nearby: NearbyPlayEvent[];
  /** Home state used for the nearby list, when known. */
  homeState: string | null;
};

/** Registered/tracked events plus the soonest sanctioned events in your state. */
export const getPlayEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(12).default(5) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<PlayEvents> => {
    const { supabase, userId } = context;
    const today = new Date().toISOString().slice(0, 10);

    const [mineRes, profileRes] = await Promise.all([
      supabase
        .from("scheduled_events")
        .select("id, title, starts_on, starts_at, location, division, status, tier, tournament_id")
        .eq("user_id", userId)
        .gte("starts_on", today)
        .not("status", "in", "(withdrawn,cancelled,completed)")
        .order("starts_on", { ascending: true })
        .limit(data.limit),
      supabase.from("profiles").select("home_state").eq("id", userId).maybeSingle(),
    ]);

    const homeState =
      ((profileRes.data as { home_state: string | null } | null)?.home_state ?? null) || null;

    let nearby: NearbyPlayEvent[] = [];
    if (homeState) {
      const { data: rows } = await supabase
        .from("pdga_tour_events")
        .select(
          "id, name, start_date, end_date, location, city, state, tier, registration_status, registration_url, pdga_event_id",
        )
        .eq("state", homeState)
        .gte("start_date", today)
        .order("start_date", { ascending: true })
        .limit(data.limit);
      nearby = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        name: String(r.name),
        startDate: (r.start_date as string | null) ?? null,
        endDate: (r.end_date as string | null) ?? null,
        location: (r.location as string | null) ?? null,
        city: (r.city as string | null) ?? null,
        state: (r.state as string | null) ?? null,
        tier: (r.tier as string | null) ?? null,
        registrationStatus: (r.registration_status as string | null) ?? null,
        registrationUrl: (r.registration_url as string | null) ?? null,
        pdgaEventId: (r.pdga_event_id as string | null) ?? null,
      }));
    }

    const mine = ((mineRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      title: String(r.title),
      startsOn: (r.starts_on as string | null) ?? null,
      startsAt: (r.starts_at as string | null) ?? null,
      location: (r.location as string | null) ?? null,
      division: (r.division as string | null) ?? null,
      status: String(r.status),
      tier: (r.tier as string | null) ?? null,
      tournamentId: (r.tournament_id as string | null) ?? null,
    }));

    return { mine, nearby, homeState };
  });

/**
 * Upcoming sanctioned events near a searched place, used by the "Playing
 * somewhere else?" weather lookup so a player can check the forecast for an
 * event in a city they are traveling to.
 */
export const searchEventsNearLocation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        query: z.string().min(2).max(120),
        limit: z.number().int().min(1).max(12).default(6),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<NearbyPlayEvent[]> => {
    const { supabase } = context;
    const { normalizeStateCode, stateCodeFromName } = await import("@/lib/us-states");
    const today = new Date().toISOString().slice(0, 10);

    const raw = data.query.trim();
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    const tail = parts.length > 1 ? parts[parts.length - 1]! : raw;
    const state = normalizeStateCode(tail) ?? stateCodeFromName(raw);
    const city = parts.length > 1 ? parts[0]! : state ? null : raw;

    let query = supabase
      .from("pdga_tour_events")
      .select(
        "id, name, start_date, end_date, location, city, state, tier, registration_status, registration_url, pdga_event_id",
      )
      .gte("start_date", today)
      .order("start_date", { ascending: true })
      .limit(data.limit * 3);

    if (state) query = query.eq("state", state);
    else if (city && orFilterText(city)) {
      const safeCity = orFilterText(city);
      query = query.or(`city.ilike.%${safeCity}%,location.ilike.%${safeCity}%`);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const mapped = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      startDate: (r.start_date as string | null) ?? null,
      endDate: (r.end_date as string | null) ?? null,
      location: (r.location as string | null) ?? null,
      city: (r.city as string | null) ?? null,
      state: (r.state as string | null) ?? null,
      tier: (r.tier as string | null) ?? null,
      registrationStatus: (r.registration_status as string | null) ?? null,
      registrationUrl: (r.registration_url as string | null) ?? null,
      pdgaEventId: (r.pdga_event_id as string | null) ?? null,
    })) satisfies NearbyPlayEvent[];

    // When a city was given alongside a state, float exact-city matches first.
    if (city && state) {
      const needle = city.toLowerCase();
      mapped.sort((a, b) => {
        const am = (a.city ?? a.location ?? "").toLowerCase().includes(needle) ? 0 : 1;
        const bm = (b.city ?? b.location ?? "").toLowerCase().includes(needle) ? 0 : 1;
        return am - bm;
      });
    }

    return mapped.slice(0, data.limit);
  });

/* ------------------------------------------------------------------ */
/* Course picker for the Start a round flow                            */
/* ------------------------------------------------------------------ */
export type PickableCourse = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  holeCount: number | null;
  latitude: number | null;
  longitude: number | null;
  distanceMi: number | null;
  /** True when the player has a pinned course-book entry for this course. */
  pinned: boolean;
  /** Most recent round start for this player at this course, if any. */
  lastPlayed: string | null;
};

/**
 * Courses a player can start a round on, ranked for picking: their own
 * pinned/recent courses first, then the closest approved courses, with an
 * optional name/city search. Search and distance ranking both run server-side.
 */
export const searchCoursesForRound = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        q: z.string().trim().max(120).default(""),
        lat: z.number().min(-90).max(90).nullish(),
        lng: z.number().min(-180).max(180).nullish(),
        limit: z.number().int().min(1).max(60).default(30),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<PickableCourse[]> => {
    const { supabase, userId } = context;
    const q = data.q.trim();
    const hasCoords = typeof data.lat === "number" && typeof data.lng === "number";

    let query = supabase
      .from("courses")
      .select("id, name, city, state, hole_count, latitude, longitude")
      .eq("moderation_status", "approved");

    if (q) {
      const safe = q.replace(/[%,()]/g, " ").trim();
      query = query.or(`name.ilike.%${safe}%,city.ilike.%${safe}%`).limit(200);
    } else if (hasCoords) {
      const latPad = 1.5;
      const lngPad = 1.5 / Math.max(0.2, Math.cos(((data.lat as number) * Math.PI) / 180));
      query = query
        .gte("latitude", (data.lat as number) - latPad)
        .lte("latitude", (data.lat as number) + latPad)
        .gte("longitude", (data.lng as number) - lngPad)
        .lte("longitude", (data.lng as number) + lngPad)
        .limit(400);
    } else {
      query = query.order("name", { ascending: true }).limit(200);
    }

    const [{ data: rows, error }, book, recent] = await Promise.all([
      query,
      supabase
        .from("course_book_entries")
        .select("course_id, pinned")
        .eq("user_id", userId)
        .not("course_id", "is", null)
        .limit(300),
      supabase
        .from("rounds")
        .select("course_id, started_at")
        .eq("created_by", userId)
        .not("course_id", "is", null)
        .order("started_at", { ascending: false })
        .limit(200),
    ]);
    if (error) throw error;

    const pinned = new Set<string>();
    for (const row of (book.data ?? []) as Array<{ course_id: string; pinned: boolean | null }>) {
      if (row.pinned) pinned.add(row.course_id);
    }
    const lastPlayed = new Map<string, string>();
    for (const row of (recent.data ?? []) as Array<{ course_id: string; started_at: string }>) {
      if (!lastPlayed.has(row.course_id)) lastPlayed.set(row.course_id, row.started_at);
    }

    type Row = {
      id: string;
      name: string;
      city: string | null;
      state: string | null;
      hole_count: number | null;
      latitude: number | null;
      longitude: number | null;
    };
    const base = (rows ?? []) as Row[];

    const withDistance = new Map<string, number>();
    if (hasCoords) {
      for (const r of rankByDistance(base, { lat: data.lat as number, lng: data.lng as number }, base.length)) {
        withDistance.set(r.id, r.distanceMi);
      }
    }

    const mapped: PickableCourse[] = base.map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      state: r.state,
      holeCount: r.hole_count,
      latitude: r.latitude,
      longitude: r.longitude,
      distanceMi: withDistance.get(r.id) ?? null,
      pinned: pinned.has(r.id),
      lastPlayed: lastPlayed.get(r.id) ?? null,
    }));

    mapped.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.distanceMi !== null && b.distanceMi !== null) return a.distanceMi - b.distanceMi;
      if (a.distanceMi !== null) return -1;
      if (b.distanceMi !== null) return 1;
      const al = a.lastPlayed ?? "";
      const bl = b.lastPlayed ?? "";
      if (al !== bl) return bl.localeCompare(al);
      return a.name.localeCompare(b.name);
    });

    return mapped.slice(0, data.limit);
  });

/* ------------------------------------------------------------------ */
/* Event leaderboard for a live round                                  */
/* ------------------------------------------------------------------ */
export type EventLeaderboardRow = {
  name: string;
  total: number;
  toPar: number;
  thru: number;
  isMe: boolean;
  division: string | null;
};

export type EventLeaderboard = {
  kind: "tournament" | "league";
  id: string;
  name: string;
  rows: EventLeaderboardRow[];
} | null;

/**
 * Standings across every card in the tournament or league night a round belongs
 * to. Aggregated server-side so a phone on course data never downloads every
 * sibling card's strokes just to show a leaderboard.
 */
export const getRoundEventLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ roundId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<EventLeaderboard> => {
    const supabase = context.supabase;
    const userId = context.userId;

    const { data: round } = await supabase
      .from("rounds")
      .select("id, tournament_id, league_event_id")
      .eq("id", data.roundId)
      .maybeSingle();
    if (!round) return null;
    const tid = round.tournament_id ?? null;
    const lid = round.league_event_id ?? null;
    if (!tid && !lid) return null;

    let name = "Event";
    let kind: "tournament" | "league" = tid ? "tournament" : "league";
    let leagueId: string | null = null;
    let siblingRounds: { id: string; layout_id: string }[] = [];

    if (tid) {
      const [{ data: t }, { data: siblings }] = await Promise.all([
        supabase.from("tournaments").select("name").eq("id", tid).maybeSingle(),
        supabase.from("rounds").select("id, layout_id").eq("tournament_id", tid),
      ]);
      name = t?.name ?? "Tournament";
      siblingRounds = (siblings ?? []) as { id: string; layout_id: string }[];
    } else {
      kind = "league";
      const [{ data: le }, { data: siblings }] = await Promise.all([
        supabase.from("league_events").select("league_id").eq("id", lid!).maybeSingle(),
        supabase.from("rounds").select("id, layout_id").eq("league_event_id", lid!),
      ]);
      leagueId = (le?.league_id as string | undefined) ?? null;
      if (leagueId) {
        const { data: lg } = await supabase
          .from("leagues")
          .select("name")
          .eq("id", leagueId)
          .maybeSingle();
        name = lg?.name ?? "League night";
      }
      siblingRounds = (siblings ?? []) as { id: string; layout_id: string }[];
    }

    const siblingIds = siblingRounds.map((r) => r.id);
    if (!siblingIds.length) return null;

    const [{ data: rps }, { data: rss }] = await Promise.all([
      supabase
        .from("round_players")
        .select("id, round_id, user_id, guest_name")
        .in("round_id", siblingIds),
      supabase
        .from("round_scores")
        .select("round_id, round_player_id, hole_number, strokes")
        .in("round_id", siblingIds),
    ]);

    const layoutIds = [...new Set(siblingRounds.map((r) => r.layout_id).filter(Boolean))];
    const { data: allHoles } = layoutIds.length
      ? await supabase.from("holes").select("layout_id, number, par").in("layout_id", layoutIds)
      : { data: [] as { layout_id: string; number: number; par: number }[] };

    // par lookup: layout -> hole number -> par, then round -> layout.
    const parByLayoutHole = new Map<string, number>();
    for (const h of allHoles ?? []) parByLayoutHole.set(`${h.layout_id}:${h.number}`, h.par);
    const layoutByRound = new Map(siblingRounds.map((r) => [r.id, r.layout_id]));

    const uids = [
      ...new Set((rps ?? []).map((p) => p.user_id).filter((x): x is string => !!x)),
    ];
    const { data: profs } = uids.length
      ? await supabase.from("profiles").select("id, display_name, username").in("id", uids)
      : { data: [] as { id: string; display_name: string | null; username: string | null }[] };
    const profMap = new Map((profs ?? []).map((p) => [p.id, p]));

    // Divisions by user.
    const divisionByUser = new Map<string, string>();
    if (tid) {
      const [{ data: divs }, { data: regs }] = await Promise.all([
        supabase.from("tournament_divisions").select("id, name").eq("tournament_id", tid),
        supabase
          .from("tournament_registrations")
          .select("user_id, division_id")
          .eq("tournament_id", tid),
      ]);
      const dMap = new Map((divs ?? []).map((d) => [d.id, d.name]));
      for (const r of regs ?? []) {
        if (r.user_id && r.division_id && dMap.has(r.division_id))
          divisionByUser.set(r.user_id, dMap.get(r.division_id)!);
      }
    } else if (leagueId) {
      const [{ data: divs }, { data: regs }] = await Promise.all([
        supabase.from("league_divisions").select("id, name").eq("league_id", leagueId),
        supabase
          .from("league_registrations")
          .select("user_id, division_id")
          .eq("league_id", leagueId),
      ]);
      const dMap = new Map((divs ?? []).map((d) => [d.id, d.name]));
      for (const r of regs ?? []) {
        if (r.user_id && r.division_id && dMap.has(r.division_id))
          divisionByUser.set(r.user_id, dMap.get(r.division_id)!);
      }
    }

    const agg = new Map<string, EventLeaderboardRow>();
    const playerMap = new Map<
      string,
      { round_id: string; user_id: string | null; guest_name: string | null }
    >();
    for (const rp of rps ?? []) {
      playerMap.set(rp.id, rp);
      const key = rp.user_id ?? `g:${rp.round_id}:${rp.guest_name ?? "Guest"}`;
      if (!agg.has(key)) {
        const profile = rp.user_id ? profMap.get(rp.user_id) : null;
        agg.set(key, {
          name: profile?.display_name ?? profile?.username ?? rp.guest_name ?? "Guest",
          total: 0,
          toPar: 0,
          thru: 0,
          isMe: !!(userId && rp.user_id === userId),
          division: rp.user_id ? (divisionByUser.get(rp.user_id) ?? null) : null,
        });
      }
    }
    for (const s of rss ?? []) {
      const rp = playerMap.get(s.round_player_id);
      if (!rp) continue;
      const row = agg.get(rp.user_id ?? `g:${rp.round_id}:${rp.guest_name ?? "Guest"}`);
      if (!row) continue;
      const layout = layoutByRound.get(s.round_id);
      row.total += s.strokes;
      row.thru += 1;
      row.toPar += s.strokes - (parByLayoutHole.get(`${layout}:${s.hole_number}`) ?? 3);
    }

    return {
      kind,
      id: tid ?? lid!,
      name,
      rows: [...agg.values()].sort((a, b) => a.toPar - b.toPar),
    };
  });
