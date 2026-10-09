/**
 * "Search by PDGA #" on the tracker: look up any PDGA member — friend or not —
 * and show what PDGA has published for them (name, rating, location, upcoming
 * registrations) so the caller can add them to one of their crews.
 *
 * Everything returned is public PDGA data or the caller's own crew roster; no
 * other DG Dashboard user's private data is exposed.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { lookupPdgaPlayer } from "@/lib/pdga-lab.functions";
import { normalizePdgaNumber, pdgaNumberQueryValues } from "@/lib/pdga-number";
import { ensurePersonalTrackerGroup } from "@/lib/tracker-watchlist.server";

export type PdgaPlayerSearchEvent = {
  eventRef: string;
  name: string | null;
  tier: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  division: string | null;
  pdgaUrl: string;
};

export type PdgaPlayerSearchResult = {
  pdgaNumber: string;
  name: string | null;
  location: string | null;
  rating: number | null;
  classification: string | null;
  profileUrl: string;
  /** Crews owned by the caller that already have this player on the roster. */
  trackedInGroups: Array<{ id: string; name: string }>;
  /** Crews owned by the caller that can still take this player. */
  availableGroups: Array<{ id: string; name: string }>;
  upcomingEvents: PdgaPlayerSearchEvent[];
  /** Most recent rated rounds PDGA has published, newest first. */
  recentRounds: PdgaPlayerRound[];
  /** Most recent event finishes, newest first. */
  recentFinishes: PdgaPlayerFinish[];
  /** Average of the recent published round ratings, or null when none. */
  recentRatingAverage: number | null;
  /** Recent average minus current rating — positive means trending up. */
  ratingTrend: number | null;
  careerWins: number | null;
};

export type PdgaPlayerRound = {
  playedOn: string | null;
  eventName: string | null;
  division: string | null;
  roundLabel: string | null;
  score: number | null;
  rating: number | null;
  included: boolean | null;
};

export type PdgaPlayerFinish = {
  eventName: string;
  eventDate: string | null;
  division: string | null;
  tier: string | null;
  place: number | null;
};

/** One candidate from a name search. */
export type PdgaPlayerNameMatch = {
  pdgaNumber: string;
  name: string | null;
  rating: number | null;
  location: string | null;
  classification: string | null;
  careerWins: number | null;
  /** Crews (or the personal tracker) where this player is already followed. */
  trackedIn: string[];
};

function locationOf(row: {
  city?: string | null;
  state?: string | null;
  country?: string | null;
}): string | null {
  return (
    [row.city, row.state, row.country]
      .map((p) => p?.trim())
      .filter((p): p is string => !!p)
      .join(", ") || null
  );
}

export const searchPdgaPlayerToTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => z.object({ pdga_number: z.string().min(1).max(20) }).parse(raw))
  .handler(async ({ data, context }): Promise<PdgaPlayerSearchResult> => {
    const num = normalizePdgaNumber(data.pdga_number);
    if (!num) throw new Error("Enter a PDGA number, like 128745.");

    // Public PDGA profile (cached in the mirror; refreshed by the lookup).
    type PdgaProfileShape = {
      name?: string | null;
      location?: string | null;
      current_rating?: number | null;
      rating?: number | null;
      classification?: string | null;
    };
    type LookedRound = {
      played_on?: string | null;
      event_name?: string | null;
      division?: string | null;
      round_label?: string | null;
      score?: number | null;
      round_rating?: number | null;
      included?: boolean | null;
    };
    let profile: PdgaProfileShape | null = null;
    let lookedRounds: LookedRound[] = [];
    try {
      const looked = (await lookupPdgaPlayer({
        data: { pdgaNumber: Number(num) },
      })) as unknown as { profile?: PdgaProfileShape | null; rounds?: LookedRound[] } | null;
      profile = looked?.profile ?? null;
      lookedRounds = looked?.rounds ?? [];
    } catch {
      profile = null;
    }
    if (!profile) {
      throw new Error(`PDGA #${num} didn't come back with a profile. Double-check the number.`);
    }

    const recentRounds: PdgaPlayerRound[] = lookedRounds
      .slice()
      .sort((a, b) => (b.played_on ?? "").localeCompare(a.played_on ?? ""))
      .slice(0, 12)
      .map((r) => ({
        playedOn: r.played_on ?? null,
        eventName: r.event_name ?? null,
        division: r.division ?? null,
        roundLabel: r.round_label ?? null,
        score: typeof r.score === "number" ? r.score : null,
        rating: typeof r.round_rating === "number" ? r.round_rating : null,
        included: r.included ?? null,
      }));
    const ratedValues = recentRounds
      .map((r) => r.rating)
      .filter((v): v is number => typeof v === "number");
    const recentRatingAverage = ratedValues.length
      ? Math.round(ratedValues.reduce((sum, v) => sum + v, 0) / ratedValues.length)
      : null;

    // Recent finishes and career wins come from the public PDGA mirror.
    const { data: finishRows } = await context.supabase
      .from("pdga_events")
      .select("event_name, event_date, division, tier, place")
      .in("pdga_number", pdgaNumberQueryValues([num]))
      .order("event_date", { ascending: false })
      .limit(8);
    const recentFinishes: PdgaPlayerFinish[] = (
      (finishRows ?? []) as Array<{
        event_name: string | null;
        event_date: string | null;
        division: string | null;
        tier: string | null;
        place: number | null;
      }>
    ).map((row) => ({
      eventName: row.event_name ?? "PDGA event",
      eventDate: row.event_date,
      division: row.division,
      tier: row.tier,
      place: row.place,
    }));

    const { data: kbPlayer } = await context.supabase
      .from("pdga_kb_players")
      .select("career_wins")
      .eq("pdga_number", Number(num))
      .maybeSingle();
    const careerWins = (kbPlayer as { career_wins?: number | null } | null)?.career_wins ?? null;

    const today = new Date().toISOString().slice(0, 10);

    // Published field rows for this player, then the event details.
    const { data: fieldRows } = await context.supabase
      .from("pdga_event_field")
      .select("event_ref, division")
      .in("pdga_number", pdgaNumberQueryValues([num]))
      .limit(300);

    const divisionByRef = new Map<string, string | null>();
    for (const row of (fieldRows ?? []) as Array<{ event_ref: string; division: string | null }>) {
      if (!divisionByRef.has(row.event_ref)) divisionByRef.set(row.event_ref, row.division);
    }

    let upcomingEvents: PdgaPlayerSearchEvent[] = [];
    const refs = Array.from(divisionByRef.keys());
    if (refs.length) {
      const { data: kbRows } = await context.supabase
        .from("pdga_kb_events")
        .select("pdga_event_id, name, tier, start_date, end_date, city, state, country, pdga_url")
        .in("pdga_event_id", refs)
        .gte("start_date", today)
        .order("start_date", { ascending: true })
        .limit(25);
      upcomingEvents = (
        (kbRows ?? []) as Array<{
          pdga_event_id: string;
          name: string | null;
          tier: string | null;
          start_date: string | null;
          end_date: string | null;
          city: string | null;
          state: string | null;
          country: string | null;
          pdga_url: string | null;
        }>
      ).map((row) => ({
        eventRef: row.pdga_event_id,
        name: row.name,
        tier: row.tier,
        startDate: row.start_date,
        endDate: row.end_date ?? row.start_date,
        location: locationOf(row),
        division: divisionByRef.get(row.pdga_event_id) ?? null,
        pdgaUrl: row.pdga_url ?? `https://www.pdga.com/tour/event/${row.pdga_event_id}`,
      }));
    }

    // Caller's own crews, split by whether the player is already on the roster.
    const { data: groups } = await context.supabase
      .from("tracker_groups")
      .select("id, name")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    const groupList = ((groups ?? []) as Array<{ id: string; name: string }>).map((g) => ({
      id: g.id,
      name: g.name,
    }));

    const trackedGroupIds = new Set<string>();
    if (groupList.length) {
      const { data: members } = await context.supabase
        .from("tracker_group_members")
        .select("group_id, pdga_number")
        .in(
          "group_id",
          groupList.map((g) => g.id),
        )
        .in("pdga_number", pdgaNumberQueryValues([num]))
        .limit(200);
      for (const row of (members ?? []) as Array<{ group_id: string }>) {
        trackedGroupIds.add(row.group_id);
      }
    }

    const rating = profile.current_rating ?? profile.rating ?? null;
    const currentRating = typeof rating === "number" ? rating : rating ? Number(rating) : null;
    return {
      pdgaNumber: num,
      name: (profile.name ?? null)?.replace(/\s*#\s*\d+\s*$/, "").trim() || null,
      location: profile.location ?? null,
      rating: currentRating,
      classification: profile.classification ?? null,
      profileUrl: `https://www.pdga.com/player/${num}`,
      trackedInGroups: groupList.filter((g) => trackedGroupIds.has(g.id)),
      availableGroups: groupList.filter((g) => !trackedGroupIds.has(g.id)),
      upcomingEvents,
      recentRounds,
      recentFinishes,
      recentRatingAverage,
      ratingTrend:
        recentRatingAverage != null && currentRating != null
          ? recentRatingAverage - currentRating
          : null,
      careerWins,
    };
  });

/**
 * Name search over the public PDGA player mirror, for callers who know who they
 * want to follow but not the number (pro tour players, an upcoming opponent).
 */
export const searchPdgaPlayersByName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => z.object({ query: z.string().min(2).max(80) }).parse(raw))
  .handler(async ({ data, context }): Promise<PdgaPlayerNameMatch[]> => {
    const term = data.query.trim().replace(/[%_]/g, "");
    if (term.length < 2) return [];
    const { data: rows, error } = await context.supabase
      .from("pdga_kb_players")
      .select("pdga_number, name, rating, city, state, country, class, career_wins")
      .ilike("name", `%${term}%`)
      .order("rating", { ascending: false, nullsFirst: false })
      .limit(15);
    if (error) throw new Error(error.message);
    const matches: PdgaPlayerNameMatch[] = (
      (rows ?? []) as Array<{
        pdga_number: number;
        name: string | null;
        rating: number | null;
        city: string | null;
        state: string | null;
        country: string | null;
        class: string | null;
        career_wins: number | null;
      }>
    ).map((row) => ({
      pdgaNumber: String(row.pdga_number),
      name: row.name,
      rating: row.rating,
      location: locationOf(row),
      classification: row.class,
      careerWins: row.career_wins,
      trackedIn: [] as string[],
    }));

    // Flag the ones already followed so a repeat search doesn't look like a
    // fresh player.
    const numbers = matches.map((m) => m.pdgaNumber);
    if (numbers.length) {
      const { data: groups } = await context.supabase
        .from("tracker_groups")
        .select("id, name")
        .eq("owner_id", context.userId);
      const groupRows = (groups ?? []) as Array<{ id: string; name: string }>;
      if (groupRows.length) {
        const nameById = new Map(groupRows.map((g) => [g.id, g.name]));
        const { data: mems } = await context.supabase
          .from("tracker_group_members")
          .select("group_id, pdga_number")
          .in("group_id", groupRows.map((g) => g.id))
          .in("pdga_number", numbers);
        const byNumber = new Map<string, string[]>();
        for (const m of (mems ?? []) as Array<{ group_id: string; pdga_number: string }>) {
          const label = nameById.get(m.group_id);
          if (!label) continue;
          const list = byNumber.get(m.pdga_number) ?? [];
          if (!list.includes(label)) list.push(label);
          byNumber.set(m.pdga_number, list);
        }
        for (const m of matches) m.trackedIn = byNumber.get(m.pdgaNumber) ?? [];
      }
    }

    return matches;
  });

/**
 * Follow a player without needing a crew: adds them to the named crew when one
 * is given, otherwise to the caller's personal tracker (created on demand).
 * Idempotent — re-adding someone already tracked is a no-op.
 */
export const trackPdgaPlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) =>
    z
      .object({
        pdga_number: z.string().min(1).max(20),
        display_name: z.string().max(120).optional().nullable(),
        group_id: z.string().uuid().optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const num = normalizePdgaNumber(data.pdga_number);
    if (!num) throw new Error("Enter a PDGA number, like 128745.");

    let group: { id: string; name: string };
    if (data.group_id) {
      const { data: owned, error } = await supabase
        .from("tracker_groups")
        .select("id, name")
        .eq("id", data.group_id)
        .eq("owner_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!owned) throw new Error("That crew isn't yours to add players to.");
      group = { id: owned.id as string, name: owned.name as string };
    } else {
      // Default home for a followed player: the permanent all-time crew.
      const { data: allTime } = await supabase
        .from("tracker_groups")
        .select("id, name")
        .eq("owner_id", userId)
        .eq("is_all_time", true)
        .maybeSingle();
      if (allTime) {
        group = { id: allTime.id as string, name: allTime.name as string };
      } else {
        const { data: created, error: createError } = await supabase
          .from("tracker_groups")
          .insert({
            owner_id: userId,
            name: "All-time crew",
            description:
              "Everyone you follow year after year. Players stay here for good, and their events keep showing up.",
            is_all_time: true,
          })
          .select("id, name")
          .single();
        if (createError || !created) {
          group = await ensurePersonalTrackerGroup(supabase, userId);
        } else {
          group = { id: created.id as string, name: created.name as string };
        }
      }
    }

    const { data: existing, error: findError } = await supabase
      .from("tracker_group_members")
      .select("id")
      .eq("group_id", group.id)
      .in("pdga_number", pdgaNumberQueryValues([num]))
      .limit(1)
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    if (existing) return { group, duplicate: true as const };

    const { error } = await supabase.from("tracker_group_members").insert({
      group_id: group.id,
      pdga_number: num,
      display_name: data.display_name ?? null,
    });
    if (error) throw new Error(error.message);
    return { group, duplicate: false as const };
  });

/** Stop following a player: removes them from one of the caller's crews. */
export const untrackPdgaPlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) =>
    z.object({ pdga_number: z.string().min(1).max(20), group_id: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const num = normalizePdgaNumber(data.pdga_number);
    if (!num) throw new Error("Enter a PDGA number, like 128745.");
    const { data: owned, error: ownError } = await supabase
      .from("tracker_groups")
      .select("id")
      .eq("id", data.group_id)
      .eq("owner_id", userId)
      .maybeSingle();
    if (ownError) throw new Error(ownError.message);
    if (!owned) throw new Error("That crew isn't yours to change.");
    const { error } = await supabase
      .from("tracker_group_members")
      .delete()
      .eq("group_id", data.group_id)
      .in("pdga_number", pdgaNumberQueryValues([num]));
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export type TrackedPlayer = {
  member_id: string;
  group_id: string;
  group_name: string;
  pdga_number: string;
  display_name: string | null;
  rating: number | null;
};

/**
 * Every player the caller follows, across all of their crews. Used by the
 * "Players being tracked" panel that appears on each tracker page.
 */
export const listTrackedPlayers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ players: TrackedPlayer[] }> => {
    const { supabase, userId } = context;
    const { data: groups, error: groupError } = await supabase
      .from("tracker_groups")
      .select("id, name")
      .eq("owner_id", userId);
    if (groupError) throw new Error(groupError.message);
    const groupRows = (groups ?? []) as { id: string; name: string }[];
    if (!groupRows.length) return { players: [] };

    const { data: members, error: memberError } = await supabase
      .from("tracker_group_members")
      .select("id, group_id, pdga_number, display_name, is_you")
      .in(
        "group_id",
        groupRows.map((g) => g.id),
      )
      .order("position", { ascending: true });
    if (memberError) throw new Error(memberError.message);

    const rows = (members ?? []) as {
      id: string;
      group_id: string;
      pdga_number: string;
      display_name: string | null;
      is_you: boolean | null;
    }[];
    const numbers = Array.from(
      new Set(rows.map((r) => normalizePdgaNumber(r.pdga_number)).filter(Boolean) as string[]),
    );
    const ratings = new Map<string, number>();
    if (numbers.length) {
      const { data: players } = await supabase
        .from("pdga_players")
        .select("pdga_number, current_rating")
        .in("pdga_number", pdgaNumberQueryValues(numbers));
      for (const p of (players ?? []) as {
        pdga_number: string | number;
        current_rating: number | null;
      }[]) {
        const key = normalizePdgaNumber(String(p.pdga_number));
        if (key && p.current_rating != null) ratings.set(key, Number(p.current_rating));
      }
    }

    const groupNames = new Map(groupRows.map((g) => [g.id, g.name]));
    const seen = new Set<string>();
    const players: TrackedPlayer[] = [];
    for (const r of rows) {
      const num = normalizePdgaNumber(r.pdga_number) ?? r.pdga_number;
      const key = `${r.group_id}:${num}`;
      if (seen.has(key)) continue;
      seen.add(key);
      players.push({
        member_id: r.id,
        group_id: r.group_id,
        group_name: groupNames.get(r.group_id) ?? "Your crew",
        pdga_number: num,
        display_name: r.display_name,
        rating: ratings.get(num) ?? null,
      });
    }
    return { players };
  });

/* --------------------------- Crew candidate search -------------------------- */

/**
 * One person who can be added to a crew. Comes from the DG Dashboard player
 * directory (friends surface first) or the public PDGA player mirror. Only a
 * PDGA number makes someone trackable, so `pdgaNumber` may be null for
 * directory profiles that haven't linked one yet.
 */
export type CrewCandidate = {
  key: string;
  name: string;
  username: string | null;
  pdgaNumber: string | null;
  rating: number | null;
  location: string | null;
  isFriend: boolean;
  source: "directory" | "pdga";
  alreadyInCrew: boolean;
};

/**
 * Search the player directory, the caller's friends, and the public PDGA mirror
 * in one pass. Accepts a PDGA number, a DG Dashboard username, or a first/last
 * name. Friends rank first, then other DG Dashboard players, then PDGA members.
 */
export const searchCrewCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) =>
    z
      .object({
        query: z.string().trim().min(2).max(80),
        group_id: z.string().uuid().optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }): Promise<CrewCandidate[]> => {
    const { supabase, userId } = context;
    const raw = data.query.trim();
    const safe = raw.replace(/[%_,()]/g, " ").trim();
    if (safe.length < 2) return [];
    const digits = raw.replace(/\D/g, "");
    const numericQuery = digits.length >= 3 && digits.length === raw.replace(/\s|#/g, "").length;

    // Friends of the caller, so those people rank first.
    const { data: friendRows } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .limit(2000);
    const friendIds = new Set<string>();
    for (const row of (friendRows ?? []) as Array<{
      requester_id: string;
      addressee_id: string;
    }>) {
      friendIds.add(row.requester_id === userId ? row.addressee_id : row.requester_id);
    }

    // Directory profiles: by PDGA number when the query is numeric, otherwise
    // by username or display name.
    let profileQuery = supabase
      .from("profiles")
      .select("id, username, display_name, pdga_number, pdga_rating, home_course");
    profileQuery = numericQuery
      ? profileQuery.eq("pdga_number", digits)
      : profileQuery.or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`);
    const { data: profileRows } = await profileQuery.limit(20);

    // Blocked either direction stays out of the results.
    const [outgoing, incoming] = await Promise.all([
      supabase.from("blocks").select("blocked_id").eq("blocker_id", userId).limit(1000),
      supabase.from("blocks").select("blocker_id").eq("blocked_id", userId).limit(1000),
    ]);
    const hidden = new Set<string>();
    for (const r of (outgoing.data ?? []) as Array<{ blocked_id: string }>) hidden.add(r.blocked_id);
    for (const r of (incoming.data ?? []) as Array<{ blocker_id: string }>) hidden.add(r.blocker_id);

    const results: CrewCandidate[] = [];
    const seenPdga = new Set<string>();
    for (const row of (profileRows ?? []) as Array<{
      id: string;
      username: string | null;
      display_name: string | null;
      pdga_number: string | number | null;
      pdga_rating: number | null;
      home_course: string | null;
    }>) {
      if (hidden.has(row.id)) continue;
      const num = row.pdga_number == null ? null : normalizePdgaNumber(String(row.pdga_number));
      if (num) seenPdga.add(num);
      results.push({
        key: `profile:${row.id}`,
        name: row.display_name || (row.username ? `@${row.username}` : "DG Dashboard player"),
        username: row.username,
        pdgaNumber: num,
        rating: row.pdga_rating,
        location: row.home_course,
        isFriend: friendIds.has(row.id),
        source: "directory",
        alreadyInCrew: false,
      });
    }

    // Public PDGA mirror: exact number, or a name match.
    let pdgaQuery = supabase
      .from("pdga_kb_players")
      .select("pdga_number, name, rating, city, state, country");
    pdgaQuery = numericQuery
      ? pdgaQuery.eq("pdga_number", Number(digits))
      : pdgaQuery.ilike("name", `%${safe}%`);
    const { data: pdgaRows } = await pdgaQuery
      .order("rating", { ascending: false, nullsFirst: false })
      .limit(15);
    for (const row of (pdgaRows ?? []) as Array<{
      pdga_number: number;
      name: string | null;
      rating: number | null;
      city: string | null;
      state: string | null;
      country: string | null;
    }>) {
      const num = String(row.pdga_number);
      if (seenPdga.has(num)) continue;
      seenPdga.add(num);
      results.push({
        key: `pdga:${num}`,
        name: (row.name ?? "").replace(/\s*#\s*\d+\s*$/, "").trim() || `PDGA #${num}`,
        username: null,
        pdgaNumber: num,
        rating: row.rating,
        location: locationOf(row),
        isFriend: false,
        source: "pdga",
        alreadyInCrew: false,
      });
    }

    // Flag who is already on this crew's roster.
    if (data.group_id) {
      const nums = results
        .map((r) => r.pdgaNumber)
        .filter((n): n is string => !!n)
        .slice(0, 100);
      if (nums.length) {
        const { data: roster } = await supabase
          .from("tracker_group_members")
          .select("pdga_number")
          .eq("group_id", data.group_id)
          .in("pdga_number", pdgaNumberQueryValues(nums));
        const tracked = new Set(
          ((roster ?? []) as Array<{ pdga_number: string }>).map((r) =>
            normalizePdgaNumber(r.pdga_number),
          ),
        );
        for (const r of results) {
          if (r.pdgaNumber && tracked.has(r.pdgaNumber)) r.alreadyInCrew = true;
        }
      }
    }

    const rank = (c: CrewCandidate) => (c.isFriend ? 0 : c.source === "directory" ? 1 : 2);
    return results
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
      .slice(0, 25);
  });
