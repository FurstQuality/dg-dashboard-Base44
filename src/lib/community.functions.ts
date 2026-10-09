/**
 * Community section server reads.
 *
 * The overview and outreach directory both aggregate here so the browser never
 * pulls whole tables to render counts, and so blocked/muted accounts are
 * filtered server-side rather than after they've already reached the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { COMMUNITY_LIMITS } from "@/lib/community-queries";
import { haversineMiles } from "@/lib/play-geo";

export type CommunityClub = {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  cover_url: string | null;
  avatar_url: string | null;
  member_count: number | null;
};

export type CommunityOutreachEvent = {
  id: string;
  host_id: string;
  kind: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  cover_url: string | null;
  cause: string | null;
  capacity: number | null;
  status?: string | null;
  latitude: number | null;
  longitude: number | null;
  goingCount: number;
  myRsvp: "going" | "maybe" | "declined" | null;
  isHost: boolean;
  /** Miles from the viewer's origin when a "near me" origin was supplied. */
  distanceMi: number | null;
  /** True once confirmed RSVPs meet or exceed capacity. */
  full: boolean;
};

export type CommunityActivity = {
  id: string;
  type: string;
  created_at: string;
  read_at: string | null;
  /** Human-readable summary pulled out of the notification payload. */
  summary: string | null;
  /** In-app destination, when the payload carries one. */
  link: string | null;
};

/** A player awaiting your answer, or one worth adding. */
export type CommunityPerson = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  pdga_rating: number | null;
  /** Friendship row id — present only for incoming requests. */
  friendshipId?: string;
  /** Shared friends, for suggestions. */
  mutualCount?: number;
};

export type CommunityOverview = {
  friendCount: number;
  clubCount: number;
  unreadMessages: number;
  trackerCount: number;
  pendingFriendRequests: number;
  goingCount: number;
  hostingCount: number;
  events: CommunityOutreachEvent[];
  clubs: CommunityClub[];
  activity: CommunityActivity[];
  /** Incoming friend requests needing an answer. */
  requests: CommunityPerson[];
  /** Players you likely know, ranked by shared friends. */
  suggestions: CommunityPerson[];
  /** Clubs you have not joined yet, biggest first. */
  discoverClubs: CommunityClub[];
};

export type OutreachPage = {
  rows: CommunityOutreachEvent[];
  total: number;
  page: number;
  pageSize: number;
  goingCount: number;
  hostingCount: number;
};

export const getCommunityOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CommunityOverview> => {
    const { supabase, userId } = context;
    const nowIso = new Date().toISOString();

    const [
      eventsRes,
      clubMembersRes,
      clubCountRes,
      activityRes,
      friendsRes,
      unreadRes,
      trackersRes,
      pendingRes,
      myRsvpRes,
      blocksRes,
      mutedRes,
      hostingRes,
    ] = await Promise.all([
      supabase
        .from("community_events")
        .select(
          "id,host_id,kind,title,description,location,latitude,longitude,starts_at,ends_at,cover_url,cause,capacity,status",
        )
        .gte("starts_at", nowIso)
        .order("starts_at")
        .limit(COMMUNITY_LIMITS.overviewEvents * 3),
      supabase
        .from("club_members")
        .select("clubs:club_id(id,slug,name,location,cover_url,avatar_url,member_count)")
        .eq("user_id", userId)
        .limit(COMMUNITY_LIMITS.overviewClubs),
      supabase
        .from("club_members")
        .select("club_id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("notifications")
        .select("id,type,created_at,data,read_at")
        .eq("user_id", userId)
        .in("type", ["friend_request", "friend_accept", "club_invite", "event", "mention"])
        .order("created_at", { ascending: false })
        .limit(COMMUNITY_LIMITS.overviewActivity),
      supabase
        .from("friendships")
        .select("id", { count: "exact", head: true })
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq("status", "accepted"),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("type", "message")
        .is("read_at", null),
      supabase
        .from("tracker_groups")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId),
      supabase
        .from("friendships")
        .select("id", { count: "exact", head: true })
        .eq("addressee_id", userId)
        .eq("status", "pending"),
      supabase.from("event_rsvps").select("event_id,status").eq("user_id", userId).limit(500),
      supabase.from("blocks").select("blocked_id").eq("blocker_id", userId).limit(1000),
      supabase.from("muted_authors").select("muted_id").eq("user_id", userId).limit(1000),
      // Events I'm hosting — the directory computes the same number, so both
      // surfaces stay in agreement instead of the overview reporting zero.
      supabase
        .from("community_events")
        .select("id", { count: "exact", head: true })
        .eq("host_id", userId),
    ]);

    const excluded = new Set<string>([
      ...(blocksRes.data ?? []).map((r) => r.blocked_id as string),
      ...(mutedRes.data ?? []).map((r) => r.muted_id as string),
    ]);

    const rsvpByEvent = new Map<string, "going" | "maybe" | "declined">();
    for (const r of myRsvpRes.data ?? []) {
      rsvpByEvent.set(r.event_id as string, r.status as "going" | "maybe" | "declined");
    }

    const rawEvents = (eventsRes.data ?? []).filter((e) => !excluded.has(e.host_id as string));
    const goingIds = rawEvents.map((e) => e.id as string);
    const counts = await countGoing(supabase, goingIds);

    const events = rawEvents.slice(0, COMMUNITY_LIMITS.overviewEvents).map((e) =>
      shapeEvent(e, {
        userId,
        goingCount: counts.get(e.id as string) ?? 0,
        myRsvp: rsvpByEvent.get(e.id as string) ?? null,
        origin: null,
      }),
    );

    const clubs = (clubMembersRes.data ?? [])
      .map((r) => (r as { clubs: CommunityClub | null }).clubs)
      .filter((c): c is CommunityClub => !!c);

    // People and clubs worth acting on. Kept in one round trip so the overview
    // never fans out per-card queries from the browser.
    const joinedClubIds = clubs.map((c) => c.id);
    const [requestRowsRes, suggRowsRes, discoverRes] = await Promise.all([
      supabase
        .from("friendships")
        .select("id,requester_id")
        .eq("addressee_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(COMMUNITY_LIMITS.overviewPeople),
      import("@/lib/friend-suggestions.server")
        .then((m) => m.fetchFriendSuggestions(userId, COMMUNITY_LIMITS.overviewPeople))
        .then((rows) => ({ data: rows }))
        .catch(() => ({ data: [] as Array<{ user_id: string; mutual_count: number }> })),
      joinedClubIds.length > 0
        ? supabase
            .from("clubs")
            .select("id,slug,name,location,cover_url,avatar_url,member_count")
            .not("id", "in", `(${joinedClubIds.join(",")})`)
            .order("member_count", { ascending: false, nullsFirst: false })
            .limit(COMMUNITY_LIMITS.overviewClubs)
        : supabase
            .from("clubs")
            .select("id,slug,name,location,cover_url,avatar_url,member_count")
            .order("member_count", { ascending: false, nullsFirst: false })
            .limit(COMMUNITY_LIMITS.overviewClubs),
    ]);

    const requestRows = (requestRowsRes.data ?? []).filter(
      (r) => !excluded.has(r.requester_id as string),
    );
    const suggestionRows = (
      (suggRowsRes.data ?? []) as Array<{
        user_id: string;
        mutual_count: number;
      }>
    ).filter((s) => !excluded.has(s.user_id));

    const peopleIds = [
      ...new Set([
        ...requestRows.map((r) => r.requester_id as string),
        ...suggestionRows.map((s) => s.user_id),
      ]),
    ];
    const profileById = new Map<string, Record<string, unknown>>();
    if (peopleIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url,pdga_rating")
        .in("id", peopleIds);
      for (const p of profiles ?? []) profileById.set(p.id as string, p as Record<string, unknown>);
    }
    const shapePerson = (id: string): CommunityPerson => {
      const p = profileById.get(id);
      return {
        id,
        username: (p?.["username"] as string | null) ?? null,
        display_name: (p?.["display_name"] as string | null) ?? null,
        avatar_url: (p?.["avatar_url"] as string | null) ?? null,
        pdga_rating: (p?.["pdga_rating"] as number | null) ?? null,
      };
    };

    return {
      friendCount: friendsRes.count ?? 0,
      clubCount: clubCountRes.count ?? 0,
      unreadMessages: unreadRes.count ?? 0,
      trackerCount: trackersRes.count ?? 0,
      pendingFriendRequests: pendingRes.count ?? 0,
      goingCount: [...rsvpByEvent.values()].filter((s) => s === "going").length,
      hostingCount: hostingRes.count ?? 0,
      events,
      clubs,
      activity: (activityRes.data ?? []).map((n) => shapeActivity(n as Record<string, unknown>)),
      requests: requestRows.map((r) => ({
        ...shapePerson(r.requester_id as string),
        friendshipId: r.id as string,
      })),
      suggestions: suggestionRows.map((s) => ({
        ...shapePerson(s.user_id),
        mutualCount: s.mutual_count,
      })),
      discoverClubs: (discoverRes.data ?? []) as CommunityClub[],
    };
  });

const outreachInput = z.object({
  kind: z.string().default("all"),
  when: z.enum(["upcoming", "week", "month", "past"]).default("upcoming"),
  scope: z.enum(["all", "going", "hosting"]).default("all"),
  q: z.string().max(120).default(""),
  page: z.number().int().min(0).max(50).default(0),
  origin: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .nullable()
    .default(null),
  radiusMi: z.number().min(5).max(500).default(100),
});

export const getOutreachEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => outreachInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<OutreachPage> => {
    const { supabase, userId } = context;
    const now = Date.now();
    const pageSize = COMMUNITY_LIMITS.outreachPage;

    // Timeframe bounds, shared by the listing and the tab badges so a badge can
    // never advertise events the current timeframe won't show.
    const nowIso = new Date(now).toISOString();
    // 6h grace so an event that started this morning is still findable.
    const graceIso = new Date(now - 6 * 3600_000).toISOString();
    const winBefore = data.when === "past" ? nowIso : null;
    const winFrom = data.when === "past" ? null : graceIso;
    const winTo =
      data.when === "week"
        ? new Date(now + 7 * 86_400_000).toISOString()
        : data.when === "month"
          ? new Date(now + 30 * 86_400_000).toISOString()
          : null;

    const [myRsvpRes, blocksRes, mutedRes] = await Promise.all([
      supabase.from("event_rsvps").select("event_id,status").eq("user_id", userId).limit(1000),
      supabase.from("blocks").select("blocked_id").eq("blocker_id", userId).limit(1000),
      supabase.from("muted_authors").select("muted_id").eq("user_id", userId).limit(1000),
    ]);

    const rsvpByEvent = new Map<string, "going" | "maybe" | "declined">();
    for (const r of myRsvpRes.data ?? []) {
      rsvpByEvent.set(r.event_id as string, r.status as "going" | "maybe" | "declined");
    }
    const goingEventIds = [...rsvpByEvent.entries()]
      .filter(([, s]) => s === "going")
      .map(([id]) => id);
    const excluded = new Set<string>([
      ...(blocksRes.data ?? []).map((r) => r.blocked_id as string),
      ...(mutedRes.data ?? []).map((r) => r.muted_id as string),
    ]);

    /** Count events inside the active timeframe, so badges match the list. */
    const countInWindow = async (apply: "hosting" | "going"): Promise<number> => {
      if (apply === "going" && goingEventIds.length === 0) return 0;
      let q = supabase.from("community_events").select("id", { count: "exact", head: true });
      q = apply === "hosting" ? q.eq("host_id", userId) : q.in("id", goingEventIds);
      if (winBefore) q = q.lt("starts_at", winBefore);
      if (winFrom) q = q.gte("starts_at", winFrom);
      if (winTo) q = q.lte("starts_at", winTo);
      const { count } = await q;
      return count ?? 0;
    };

    const [hostingCount, goingCount] = await Promise.all([
      countInWindow("hosting"),
      countInWindow("going"),
    ]);

    if (data.scope === "going" && goingEventIds.length === 0) {
      return {
        rows: [],
        total: 0,
        page: 0,
        pageSize,
        goingCount: 0,
        hostingCount,
      };
    }



    let query = supabase
      .from("community_events")
      .select(
        "id,host_id,kind,title,description,location,latitude,longitude,starts_at,ends_at,cover_url,cause,capacity,status",
        { count: "exact" },
      );

    if (data.when === "past") {
      query = query
        .lt("starts_at", new Date(now).toISOString())
        .order("starts_at", { ascending: false });
    } else {
      // 6h grace so an event that started this morning is still findable.
      query = query.gte("starts_at", new Date(now - 6 * 3600_000).toISOString());
      if (data.when === "week")
        query = query.lte("starts_at", new Date(now + 7 * 86_400_000).toISOString());
      if (data.when === "month")
        query = query.lte("starts_at", new Date(now + 30 * 86_400_000).toISOString());
      query = query.order("starts_at", { ascending: true });
    }

    if (data.kind !== "all") query = query.eq("kind", data.kind as never);
    if (data.scope === "hosting") query = query.eq("host_id", userId);
    if (data.scope === "going") query = query.in("id", goingEventIds);
    if (data.q.trim()) {
      const term = `%${data.q.trim().replace(/[%_]/g, "")}%`;
      query = query.or(
        `title.ilike.${term},description.ilike.${term},location.ilike.${term},cause.ilike.${term}`,
      );
    }

    // Near-me needs geo ranking across the candidate set, so scan wide then page locally.
    const origin = data.origin;
    if (origin) {
      const { data: rows } = await query.limit(COMMUNITY_LIMITS.outreachScan);
      const visible = (rows ?? []).filter((e) => !excluded.has(e.host_id as string));
      const counts = await countGoing(
        supabase,
        visible.map((e) => e.id as string),
      );
      const ranked = visible
        .map((e) =>
          shapeEvent(e, {
            userId,
            goingCount: counts.get(e.id as string) ?? 0,
            myRsvp: rsvpByEvent.get(e.id as string) ?? null,
            origin,
          }),
        )
        .filter((e) => e.distanceMi !== null && e.distanceMi <= data.radiusMi)
        .sort((a, b) => (a.distanceMi ?? 0) - (b.distanceMi ?? 0));
      return {
        rows: ranked.slice(data.page * pageSize, data.page * pageSize + pageSize),
        total: ranked.length,
        page: data.page,
        pageSize,
        goingCount,
        hostingCount,
      };
    }

    const from = data.page * pageSize;
    const { data: rows, count } = await query.range(from, from + pageSize - 1);
    const visible = (rows ?? []).filter((e) => !excluded.has(e.host_id as string));
    const counts = await countGoing(
      supabase,
      visible.map((e) => e.id as string),
    );

    return {
      rows: visible.map((e) =>
        shapeEvent(e, {
          userId,
          goingCount: counts.get(e.id as string) ?? 0,
          myRsvp: rsvpByEvent.get(e.id as string) ?? null,
          origin: null,
        }),
      ),
      total: count ?? visible.length,
      page: data.page,
      pageSize,
      goingCount,
      hostingCount,
    };
  });

/* ---------------- outreach event detail ---------------- */

export type OutreachAttendee = {
  user_id: string;
  status: "going" | "maybe" | "declined";
  attended: boolean;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type OutreachEventDetail = {
  event: CommunityOutreachEvent;
  attendees: OutreachAttendee[];
  myRsvp: "going" | "maybe" | "declined" | null;
  isHost: boolean;
};

export const getOutreachEventDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<OutreachEventDetail | null> => {
    const { supabase, userId } = context;
    const { data: ev } = await supabase
      .from("community_events")
      .select(
        "id,host_id,kind,title,description,location,latitude,longitude,starts_at,ends_at,cover_url,cause,capacity,status",
      )
      .eq("id", data.eventId)
      .maybeSingle();
    if (!ev) return null;

    const [rsvpRes, blocksRes, mutedRes] = await Promise.all([
      supabase
        .from("event_rsvps")
        .select("user_id,status,attended")
        .eq("event_id", data.eventId)
        .limit(COMMUNITY_LIMITS.rsvpScan),
      supabase.from("blocks").select("blocked_id").eq("blocker_id", userId).limit(1000),
      supabase.from("muted_authors").select("muted_id").eq("user_id", userId).limit(1000),
    ]);

    const excluded = new Set<string>([
      ...(blocksRes.data ?? []).map((r) => r.blocked_id as string),
      ...(mutedRes.data ?? []).map((r) => r.muted_id as string),
    ]);
    // Same filtering the directory and overview apply, so "N going" agrees
    // wherever this event appears.
    const rows = (rsvpRes.data ?? []).filter(
      (r) => r.user_id === userId || !excluded.has(r.user_id as string),
    );

    const ids = rows.map((r) => r.user_id as string);
    const profileById = new Map<string, Record<string, unknown>>();
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id", ids);
      for (const p of profiles ?? []) profileById.set(p.id as string, p as Record<string, unknown>);
    }

    const attendees: OutreachAttendee[] = rows.map((r) => {
      const p = profileById.get(r.user_id as string);
      return {
        user_id: r.user_id as string,
        status: r.status as "going" | "maybe" | "declined",
        attended: Boolean(r.attended),
        username: (p?.["username"] as string | null) ?? null,
        display_name: (p?.["display_name"] as string | null) ?? null,
        avatar_url: (p?.["avatar_url"] as string | null) ?? null,
      };
    });

    const goingCount = attendees.filter((a) => a.status === "going").length;
    const mine = attendees.find((a) => a.user_id === userId)?.status ?? null;

    return {
      event: shapeEvent(ev as Record<string, unknown>, {
        userId,
        goingCount,
        myRsvp: mine,
        origin: null,
      }),
      attendees,
      myRsvp: mine,
      isHost: (ev.host_id as string) === userId,
    };
  });

export const setOutreachRsvp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        eventId: z.string().uuid(),
        status: z.enum(["going", "maybe", "declined"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("event_rsvps")
      .upsert(
        { event_id: data.eventId, user_id: userId, status: data.status },
        { onConflict: "event_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Host-only: records that a player showed up (the XP trigger fires on this row). */
export const setOutreachAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        eventId: z.string().uuid(),
        playerId: z.string().uuid(),
        attended: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ev } = await supabase
      .from("community_events")
      .select("host_id")
      .eq("id", data.eventId)
      .maybeSingle();
    if (!ev) throw new Error("That event no longer exists.");
    if ((ev.host_id as string) !== userId) {
      throw new Error("Only the event host can mark attendance.");
    }
    const { error } = await supabase
      .from("event_rsvps")
      .update({ attended: data.attended })
      .eq("event_id", data.eventId)
      .eq("user_id", data.playerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- helpers (server-only, not exported as server fns) ---------------- */

type SupaLike = {
  from: (table: string) => {
    select: (cols: string) => {
      in: (
        col: string,
        vals: string[],
      ) => {
        eq: (
          col: string,
          val: string,
        ) => { limit: (n: number) => Promise<{ data: Array<{ event_id: string }> | null }> };
      };
    };
  };
};

async function countGoing(supabase: unknown, eventIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (eventIds.length === 0) return map;
  const { data } = await (supabase as SupaLike)
    .from("event_rsvps")
    .select("event_id")
    .in("event_id", eventIds)
    .eq("status", "going")
    .limit(COMMUNITY_LIMITS.rsvpScan);
  for (const r of data ?? []) {
    map.set(r.event_id, (map.get(r.event_id) ?? 0) + 1);
  }
  return map;
}

function shapeActivity(row: Record<string, unknown>): CommunityActivity {
  const payload = (row["data"] ?? null) as Record<string, unknown> | null;
  const pick = (k: string): string | null => {
    const v = payload?.[k];
    return typeof v === "string" && v.trim() ? v : null;
  };
  return {
    id: row["id"] as string,
    type: row["type"] as string,
    created_at: row["created_at"] as string,
    read_at: (row["read_at"] as string | null) ?? null,
    summary: pick("title") ?? pick("body") ?? pick("message") ?? pick("name"),
    link: pick("url") ?? pick("path") ?? pick("link"),
  };
}

function shapeEvent(
  row: Record<string, unknown>,
  opts: {
    userId: string;
    goingCount: number;
    myRsvp: "going" | "maybe" | "declined" | null;
    origin: { lat: number; lng: number } | null;
  },
): CommunityOutreachEvent {
  const lat = (row["latitude"] as number | null) ?? null;
  const lng = (row["longitude"] as number | null) ?? null;
  const capacity = (row["capacity"] as number | null) ?? null;
  const distanceMi =
    opts.origin && typeof lat === "number" && typeof lng === "number"
      ? Math.round(haversineMiles(opts.origin, { lat, lng }) * 10) / 10
      : null;

  return {
    id: row["id"] as string,
    host_id: row["host_id"] as string,
    kind: row["kind"] as string,
    title: row["title"] as string,
    description: (row["description"] as string | null) ?? null,
    location: (row["location"] as string | null) ?? null,
    starts_at: row["starts_at"] as string,
    ends_at: (row["ends_at"] as string | null) ?? null,
    cover_url: (row["cover_url"] as string | null) ?? null,
    cause: (row["cause"] as string | null) ?? null,
    capacity,
    latitude: lat,
    longitude: lng,
    goingCount: opts.goingCount,
    myRsvp: opts.myRsvp,
    isHost: (row["host_id"] as string) === opts.userId,
    distanceMi,
    full: capacity !== null && capacity > 0 && opts.goingCount >= capacity,
  };
}
