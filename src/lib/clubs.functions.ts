/**
 * Clubs data layer — authenticated, bounded, server-filtered.
 *
 * The directory paginates and searches in Postgres instead of pulling every
 * club into the browser, and membership writes are authorized server-side.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { CLUB_LIMITS } from "./community-queries";
import type { Json } from "@/integrations/supabase/types";

export type ClubRole = "owner" | "admin" | "member";
export type ClubScope = "mine" | "discover" | "managed";

export type ClubSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  location: string | null;
  member_count: number;
  avatar_url: string | null;
  cover_url: string | null;
  external_source: string | null;
  my_role: ClubRole | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  state: string | null;
  /** Straight-line miles from the requested origin, when one was supplied. */
  distance_miles: number | null;
  /** Friends of yours who are already members. */
  friend_members: number;
  /** Plain-language reasons this club is a good fit for you. */
  match_reasons: string[];
};

export type ClubSort = "suggested" | "near" | "members" | "name" | "new";

export type ClubDirectory = {
  clubs: ClubSummary[];
  /** Total clubs matching the current scope + search. */
  total: number;
  /** Tab counts, independent of the active scope. */
  counts: { mine: number; managed: number; discover: number };
  hasMore: boolean;
  /** States present in the club data, for the state filter. */
  states: string[];
  /** Top personalized picks for the Discover tab. */
  suggestions: ClubSummary[];
};

const CLUB_COLS =
  "id, slug, name, description, location, member_count, avatar_url, cover_url, external_source, latitude, longitude, created_at";

const directoryInput = z.object({
  scope: z.enum(["mine", "discover", "managed"]).default("mine"),
  q: z.string().trim().max(80).default(""),
  page: z.number().int().min(0).max(50).default(0),
  city: z.string().trim().max(80).default(""),
  state: z.string().trim().max(40).default(""),
  radiusMiles: z.number().min(1).max(3000).nullable().default(null),
  lat: z.number().min(-90).max(90).nullable().default(null),
  lng: z.number().min(-180).max(180).nullable().default(null),
  sort: z.enum(["suggested", "near", "members", "name", "new"]).default("suggested"),
});

type ClubRow = Omit<
  ClubSummary,
  "my_role" | "city" | "state" | "distance_miles" | "friend_members" | "match_reasons"
> & { created_at: string };

/** Straight-line distance in miles — good enough for radius filtering. */
function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = a.lat - b.lat;
  const dLng = (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180);
  return 69 * Math.sqrt(dLat * dLat + dLng * dLng);
}

/** Best-effort "City, ST" split of the free-text club location. */
function splitLocation(location: string | null): { city: string | null; state: string | null } {
  if (!location) return { city: null, state: null };
  const parts = location
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return { city: null, state: null };
  const last = parts[parts.length - 1]!;
  const state = /^[A-Za-z]{2}$/.test(last) ? last.toUpperCase() : parts.length > 1 ? last : null;
  const city = parts.length > 1 ? parts[0]! : state ? null : parts[0]!;
  return { city: city ?? null, state: state ?? null };
}

export const getClubDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => directoryInput.parse(raw ?? {}))
  .handler(async ({ data, context }): Promise<ClubDirectory> => {
    const { supabase, userId } = context;

    const { data: memberRows } = await supabase
      .from("club_members")
      .select("club_id, role")
      .eq("user_id", userId)
      .limit(CLUB_LIMITS.directoryScan);
    const roles = new Map<string, ClubRole>();
    for (const r of (memberRows ?? []) as Array<{ club_id: string; role: ClubRole }>) {
      roles.set(r.club_id, r.role);
    }
    const myIds = [...roles.keys()];
    const managedIds = myIds.filter((id) => {
      const role = roles.get(id);
      return role === "owner" || role === "admin";
    });

    const search = data.q.replace(/[,()]/g, " ").trim();

    // Scan a bounded slice, then filter/sort/paginate in the handler so distance
    // and personalization can participate in ordering.
    let query = supabase
      .from("clubs")
      .select(CLUB_COLS)
      .order("member_count", { ascending: false })
      .order("name")
      .limit(CLUB_LIMITS.directoryScan * 3);

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,location.ilike.%${search}%,description.ilike.%${search}%`,
      );
    }
    if (data.city) query = query.ilike("location", `%${data.city}%`);
    if (data.state) query = query.ilike("location", `%${data.state}%`);

    const { data: rows, error } = await query;
    if (error) { console.error("[db]", error.message); throw new Error("Something went wrong on our side. Please try again."); }
    const allRows = (rows ?? []) as ClubRow[];

    const origin = data.lat !== null && data.lng !== null ? { lat: data.lat, lng: data.lng } : null;
    const signals = await loadSignals(supabase, userId, allRows.length ? allRows : []);

    const decorated = allRows.map((row) => {
      const { city, state } = splitLocation(row.location);
      const distance =
        origin && row.latitude !== null && row.longitude !== null
          ? Math.round(milesBetween(origin, { lat: row.latitude, lng: row.longitude }) * 10) / 10
          : null;
      const friendMembers = signals.friendsByClub.get(row.id) ?? 0;
      const reasons: string[] = [];
      if (friendMembers > 0) {
        reasons.push(
          `${friendMembers} ${friendMembers === 1 ? "friend plays" : "friends play"} here`,
        );
      }
      if (distance !== null && distance <= 50) reasons.push(`${Math.round(distance)} mi from you`);
      if (state && signals.playedStates.has(state)) reasons.push(`You've played rounds in ${state}`);
      if (state && signals.homeState && state === signals.homeState) {
        reasons.push("In your home state");
      }
      if (city && signals.playedCities.has(city.toLowerCase())) {
        reasons.push(`Near courses you play in ${city}`);
      }
      return {
        ...row,
        city,
        state,
        distance_miles: distance,
        friend_members: friendMembers,
        match_reasons: reasons.slice(0, 3),
        my_role: roles.get(row.id) ?? null,
      } satisfies ClubSummary & { created_at: string };
    });

    const states = Array.from(
      new Set(decorated.map((c) => c.state).filter((s): s is string => !!s)),
    ).sort();

    // Clubs without coordinates keep showing up: a missing map pin is a data gap,
    // not proof the club is far away. They simply sort after the located ones.
    const withinRadius = (c: (typeof decorated)[number]) =>
      data.radiusMiles === null || !origin
        ? true
        : c.distance_miles === null || c.distance_miles <= data.radiusMiles;

    const inRadius = decorated.filter(withinRadius);

    // Your own clubs are always yours, wherever they are.
    const mine = decorated.filter((c) => myIds.includes(c.id));
    const managed = decorated.filter((c) => managedIds.includes(c.id));
    const discover = inRadius.filter((c) => !myIds.includes(c.id));

    const scoped = data.scope === "mine" ? mine : data.scope === "managed" ? managed : discover;

    const score = (c: (typeof decorated)[number]) => {
      let s = c.friend_members * 40;
      if (c.distance_miles !== null) s += Math.max(0, 60 - c.distance_miles / 2);
      if (c.state && signals.playedStates.has(c.state)) s += 25;
      if (c.state && signals.homeState && c.state === signals.homeState) s += 20;
      if (c.city && signals.playedCities.has(c.city.toLowerCase())) s += 15;
      s += Math.min(20, c.member_count / 5);
      return s;
    };

    const sorted = [...scoped].sort((a, b) => {
      switch (data.sort) {
        case "near":
          if (a.distance_miles === null && b.distance_miles === null)
            return b.member_count - a.member_count;
          if (a.distance_miles === null) return 1;
          if (b.distance_miles === null) return -1;
          return a.distance_miles - b.distance_miles;
        case "members":
          return b.member_count - a.member_count || a.name.localeCompare(b.name);
        case "name":
          return a.name.localeCompare(b.name);
        case "new":
          return b.created_at.localeCompare(a.created_at);
        default:
          return score(b) - score(a) || b.member_count - a.member_count;
      }
    });

    const from = data.page * CLUB_LIMITS.directoryPage;
    const pageRows = sorted.slice(from, from + CLUB_LIMITS.directoryPage);

    const suggestions =
      data.scope === "discover"
        ? [...discover]
            .filter((c) => score(c) > 20 && c.match_reasons.length > 0)
            .sort((a, b) => score(b) - score(a))
            .slice(0, 3)
            .map(stripInternal)
        : [];

    return {
      clubs: pageRows.map(stripInternal),
      total: sorted.length,
      counts: { mine: mine.length, managed: managed.length, discover: discover.length },
      hasMore: sorted.length > from + pageRows.length,
      states,
      suggestions,
    };
  });

type Db = { from: (t: string) => any };

function stripInternal(c: ClubSummary & { created_at: string }): ClubSummary {
  const { created_at: _created, ...rest } = c;
  return rest;
}

/** Friend memberships, courses played, and home state — the personalization inputs. */
async function loadSignals(
  supabase: Db,
  userId: string,
  clubs: ClubRow[],
): Promise<{
  friendsByClub: Map<string, number>;
  playedStates: Set<string>;
  playedCities: Set<string>;
  homeState: string | null;
}> {
  const friendsByClub = new Map<string, number>();
  const playedStates = new Set<string>();
  const playedCities = new Set<string>();
  let homeState: string | null = null;

  const [friendRes, profileRes, roundRes] = await Promise.all([
    supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .limit(500),
    supabase.from("profiles").select("home_state, location").eq("id", userId).maybeSingle(),
    supabase
      .from("rounds")
      .select("course_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(120),
  ]);

  const friendIds = Array.from(
    new Set(
      ((friendRes.data ?? []) as Array<{ requester_id: string; addressee_id: string }>)
        .map((l) => (l.requester_id === userId ? l.addressee_id : l.requester_id))
        .filter((id) => id && id !== userId),
    ),
  );

  if (friendIds.length && clubs.length) {
    const { data: memberships } = await supabase
      .from("club_members")
      .select("club_id, user_id")
      .in("user_id", friendIds.slice(0, 200))
      .limit(2000);
    for (const m of (memberships ?? []) as Array<{ club_id: string }>) {
      friendsByClub.set(m.club_id, (friendsByClub.get(m.club_id) ?? 0) + 1);
    }
  }

  const profile = profileRes.data as { home_state: string | null; location: string | null } | null;
  if (profile?.home_state) homeState = profile.home_state.trim().toUpperCase().slice(0, 2);
  else if (profile?.location) homeState = splitLocation(profile.location).state;

  const courseIds = Array.from(
    new Set(
      ((roundRes.data ?? []) as Array<{ course_id: string | null }>)
        .map((r) => r.course_id)
        .filter((id): id is string => !!id),
    ),
  ).slice(0, 100);
  if (courseIds.length) {
    const { data: courseRows } = await supabase
      .from("courses")
      .select("city, state")
      .in("id", courseIds);
    for (const c of (courseRows ?? []) as Array<{ city: string | null; state: string | null }>) {
      if (c.state) playedStates.add(c.state.trim().toUpperCase().slice(0, 2));
      if (c.city) playedCities.add(c.city.trim().toLowerCase());
    }
  }

  return { friendsByClub, playedStates, playedCities, homeState };
}


export const joinClub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ clubId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("club_members")
      .select("club_id")
      .eq("club_id", data.clubId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) return { kind: "already_member" as const };

    const { error } = await supabase
      .from("club_members")
      .insert({ club_id: data.clubId, user_id: userId, role: "member" } as never);
    if (error) { console.error("[db]", error.message); throw new Error("Something went wrong on our side. Please try again."); }
    return { kind: "joined" as const };
  });

export const leaveClub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ clubId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("club_members")
      .select("role")
      .eq("club_id", data.clubId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!row) return { kind: "not_member" as const };
    if ((row as { role: ClubRole }).role === "owner") {
      throw new Error("Transfer ownership before leaving this club.");
    }
    const { error } = await supabase
      .from("club_members")
      .delete()
      .eq("club_id", data.clubId)
      .eq("user_id", userId);
    if (error) { console.error("[db]", error.message); throw new Error("Something went wrong on our side. Please try again."); }
    return { kind: "left" as const };
  });

export const createClub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        description: z.string().trim().max(500).optional(),
        location: z.string().trim().max(120).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }): Promise<{ slug: string }> => {
    const { supabase, userId } = context;
    const slug = `${data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`;

    const { data: row, error } = await supabase
      .from("clubs")
      .insert({
        slug,
        name: data.name,
        description: data.description || null,
        location: data.location || null,
        owner_id: userId,
      } as never)
      .select("slug")
      .single();
    if (error) { console.error("[db]", error.message); throw new Error("Something went wrong on our side. Please try again."); }
    return { slug: (row as { slug: string }).slug };
  });

export type ClubDetailPost = {
  id: string;
  author_id: string;
  type: string;
  body: string | null;
  media: Json;
  location: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  course_name: string | null;
  round_id: string | null;
  score_data: Json;
  club_id: string | null;
  posted_as_club: boolean | null;
  club?: { id: string; name: string; slug: string; avatar_url: string | null } | null;
  author: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
};

export type ClubDetail = {
  club: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    location: string | null;
    owner_id: string;
    member_count: number;
    facebook_url: string | null;
    instagram_url: string | null;
    website_url: string | null;
    youtube_url: string | null;
    tiktok_url: string | null;
    x_url: string | null;
    discgolfscene_url: string | null;
    discord_url: string | null;
  } | null;
  posts: ClubDetailPost[];
  isMember: boolean;
  myRole: ClubRole | null;
  /** Exact roster size, not the cached column. */
  memberCount: number;
};

/** Club page payload: club, block-aware club feed, and my membership. */
export const getClubDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ slug: z.string().trim().min(1).max(120) }).parse(raw))
  .handler(async ({ data, context }): Promise<ClubDetail> => {
    const { supabase, userId } = context;

    const { data: clubRow } = await supabase
      .from("clubs")
      .select(
        "id, slug, name, description, location, owner_id, member_count, facebook_url, instagram_url, website_url, youtube_url, tiktok_url, x_url, discgolfscene_url, discord_url",
      )
      .eq("slug", data.slug)
      .maybeSingle();
    const club = clubRow as ClubDetail["club"];
    if (!club) return { club: null, posts: [], isMember: false, myRole: null, memberCount: 0 };

    const [memRes, countRes, blocksRes, mutedRes, postsRes] = await Promise.all([
      supabase
        .from("club_members")
        .select("role")
        .eq("club_id", club.id)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("club_members")
        .select("user_id", { count: "exact", head: true })
        .eq("club_id", club.id),
      supabase.from("blocks").select("blocked_id").eq("blocker_id", userId).limit(1000),
      supabase.from("muted_authors").select("muted_id").eq("user_id", userId).limit(1000),
      supabase
        .from("posts")
        .select(
          "id, author_id, type, body, media, location, like_count, comment_count, created_at, course_name, round_id, score_data, club_id, posted_as_club",
        )
        .eq("club_id", club.id)
        .order("created_at", { ascending: false })
        .limit(CLUB_LIMITS.clubPosts),
    ]);

    const hidden = new Set<string>([
      ...((blocksRes.data ?? []) as Array<{ blocked_id: string }>).map((r) => r.blocked_id),
      ...((mutedRes.data ?? []) as Array<{ muted_id: string }>).map((r) => r.muted_id),
    ]);

    const rawPosts = ((postsRes.data ?? []) as unknown as ClubDetailPost[]).filter(
      (p) => !hidden.has(p.author_id),
    );
    const authorIds = [...new Set(rawPosts.map((p) => p.author_id))];
    const authors = new Map<string, ClubDetailPost["author"]>();
    if (authorIds.length) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", authorIds);
      for (const a of (profileRows ?? []) as NonNullable<ClubDetailPost["author"]>[]) {
        authors.set(a.id, a);
      }
    }

    const myRole = (memRes.data as { role: ClubRole } | null)?.role ?? null;

    return {
      club,
      posts: rawPosts.map((p) => ({
        ...p,
        author: authors.get(p.author_id) ?? null,
        club: p.posted_as_club
          ? { id: club.id, name: club.name, slug: club.slug, avatar_url: null }
          : null,
      })),
      isMember: !!myRole,
      myRole,
      memberCount: countRes.count ?? club.member_count,
    };
  });

/** Owners and admins attach social / website links to their club. */
export const updateClubLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        clubId: z.string().uuid(),
        facebook_url: z.string().url().max(500).nullable().optional(),
        instagram_url: z.string().url().max(500).nullable().optional(),
        website_url: z.string().url().max(500).nullable().optional(),
        youtube_url: z.string().url().max(500).nullable().optional(),
        tiktok_url: z.string().url().max(500).nullable().optional(),
        x_url: z.string().url().max(500).nullable().optional(),
        discgolfscene_url: z.string().url().max(500).nullable().optional(),
        discord_url: z.string().url().max(500).nullable().optional(),
        description: z.string().trim().max(2000).nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { clubId, ...patch } = data;

    const { data: membership } = await supabase
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", userId)
      .maybeSingle();
    const { data: clubRow } = await supabase
      .from("clubs")
      .select("owner_id")
      .eq("id", clubId)
      .maybeSingle();
    const role = (membership as { role: ClubRole } | null)?.role;
    const isOwner = (clubRow as { owner_id: string } | null)?.owner_id === userId;
    if (!isOwner && role !== "owner" && role !== "admin") {
      throw new Error("Only club owners and admins can update club links.");
    }

    const { error } = await supabase
      .from("clubs")
      .update(patch as never)
      .eq("id", clubId);
    if (error) { console.error("[db]", error.message); throw new Error("Something went wrong on our side. Please try again."); }
    return { ok: true as const };
  });

export type ClubMember = {
  user_id: string;
  role: ClubRole;
  joined_at: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  pdga_rating: number | null;
};

/** Roster for a club, officers first. Bounded page size. */
export const getClubMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ clubId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }): Promise<{ members: ClubMember[]; total: number }> => {
    const { supabase } = context;
    const { data: rows, count } = await supabase
      .from("club_members")
      .select("user_id, role, created_at", { count: "exact" })
      .eq("club_id", data.clubId)
      .limit(CLUB_LIMITS.roster);

    const memberRows = (
      (rows ?? []) as Array<{
        user_id: string;
        role: ClubRole;
        created_at: string | null;
      }>
    ).map((m) => ({ user_id: m.user_id, role: m.role, joined_at: m.created_at }));
    if (!memberRows.length) return { members: [], total: count ?? 0 };

    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, pdga_rating")
      .in(
        "id",
        memberRows.map((m) => m.user_id),
      );
    const profiles = new Map(
      (
        (profileRows ?? []) as Array<{
          id: string;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
          pdga_rating: number | null;
        }>
      ).map((p) => [p.id, p]),
    );

    const rank: Record<ClubRole, number> = { owner: 0, admin: 1, member: 2 };
    const members = memberRows
      .map((m) => {
        const p = profiles.get(m.user_id);
        return {
          ...m,
          username: p?.username ?? null,
          display_name: p?.display_name ?? null,
          avatar_url: p?.avatar_url ?? null,
          pdga_rating: p?.pdga_rating ?? null,
        };
      })
      .sort(
        (a, b) =>
          rank[a.role] - rank[b.role] || (a.display_name ?? "").localeCompare(b.display_name ?? ""),
      );

    return { members, total: count ?? members.length };
  });

/**
 * Opens (or creates) the club's DGIM room and makes sure the caller is in it.
 * Members and officers only — the club feed stays public, the chat does not.
 */
export const openClubChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ clubId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }): Promise<{ conversationId: string }> => {
    const { supabase, userId } = context;

    const [{ data: membership }, { data: clubRow }] = await Promise.all([
      supabase
        .from("club_members")
        .select("role")
        .eq("club_id", data.clubId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.from("clubs").select("id, name, owner_id").eq("id", data.clubId).maybeSingle(),
    ]);
    const club = clubRow as { id: string; name: string; owner_id: string } | null;
    if (!club) throw new Error("That club no longer exists.");
    if (!membership && club.owner_id !== userId) {
      throw new Error("Join the club to use its chat.");
    }

    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("event_kind", "club")
      .eq("event_id", data.clubId)
      .limit(1)
      .maybeSingle();

    let conversationId = (existing as { id: string } | null)?.id ?? null;
    if (!conversationId) {
      const { data: created, error } = await supabase
        .from("conversations")
        .insert({
          is_group: true,
          created_by: userId,
          title: `${club.name} chat`,
          event_kind: "club",
          event_id: data.clubId,
        } as never)
        .select("id")
        .single();
      if (error) { console.error("[db]", error.message); throw new Error("Something went wrong on our side. Please try again."); }
      conversationId = (created as { id: string }).id;
    }

    const { data: joined } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!joined) {
      const { error } = await supabase
        .from("conversation_members")
        .insert({ conversation_id: conversationId, user_id: userId } as never);
      if (error) { console.error("[db]", error.message); throw new Error("Something went wrong on our side. Please try again."); }
    }

    return { conversationId };
  });
