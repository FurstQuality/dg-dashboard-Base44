import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  lookupPdgaPlayer,
  getPdgaUpcomingEvents,
  getPdgaEventTeeTimes,
  getPdgaEventInfo,
  getPdgaEventSchedule,
  parseEventPageInfo,
} from "@/lib/pdga-lab.functions";
import { refreshTrackerEventLive } from "@/lib/tracker-live.functions";

/** Rotating palette used everywhere in the tracker so each crew member is
 *  visually distinct at a glance. Source of truth: src/lib/tracker-colors.ts */
import { MEMBER_COLORS } from "@/lib/tracker-colors";
import { canonicalTeeTime, dayTeeSortKey } from "@/lib/tee-time";
import { courseMatchKey } from "@/lib/course-match";
import { assertEventSourceUrl } from "@/lib/safe-fetch-url";
import { deriveRoundDates } from "@/lib/tracker-round-dates";

async function pickNextColor(supabase: any, groupId: string): Promise<string> {
  const { data } = await supabase
    .from("tracker_group_members")
    .select("color")
    .eq("group_id", groupId);
  const used = new Set((data ?? []).map((r: { color: string | null }) => r.color).filter(Boolean));
  const free = MEMBER_COLORS.find((c) => !used.has(c));
  return free ?? MEMBER_COLORS[(data?.length ?? 0) % MEMBER_COLORS.length];
}

/* ---------------------------------- Types --------------------------------- */

export type TrackerGroup = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  trip_start: string | null;
  trip_end: string | null;
  is_all_time: boolean;
  created_at: string;
};
export type TrackerMember = {
  id: string;
  group_id: string;
  pdga_number: string;
  display_name: string | null;
  default_division: string | null;
  is_you: boolean;
  color: string | null;
  position: number;
};
export type TrackerEvent = {
  id: string;
  group_id: string;
  name: string;
  event_date: string | null;
  location: string | null;
  tier: string | null;
  pdga_event_ref: string | null;
  url: string | null;
  position: number;
  live_scoring_url?: string | null;
  live_last_synced_at?: string | null;
  live_current_round?: number | null;
  live_status?: string | null;
};
export type TrackerTeeTime = {
  id: string;
  event_id: string;
  member_id: string;
  division: string | null;
  tee_time: string | null;
  notes: string | null;
  round_number: number | null;
  pool: string | null;
  starting_hole: string | null;
  status?: string | null;
};
export type TrackerEventRound = {
  id: string;
  event_id: string;
  round_number: number;
  round_label: string | null;
  round_date: string | null;
  course_name: string | null;
  course_layout: string | null;
  division: string | null;
  pool: string | null;
};

export type TrackerLiveScoreRow = {
  id: string;
  event_id: string;
  pdga_number: string;
  member_id: string | null;
  division: string | null;
  round_number: number | null;
  place: number | null;
  running_place: number | null;
  round_score: number | null;
  round_to_par: number | null;
  total: number | null;
  to_par: number | null;
  thru: number | null;
  hole_scores: number[] | null;
  hole_pars: number[] | null;
  hole_lengths: number[] | null;
  hole_length_units: string | null;
  completed: boolean;
  round_started: boolean;
  tee_time: string | null;
  card_number: string | null;
  player_name: string | null;
  updated_at: string;
  last_synced_at: string;
};

export type MemberSnapshot = {
  pdga_number: string;
  name: string | null;
  avatar_url: string | null;
  current_rating: number | null;
  refreshed_at: string | null;
  finishes: {
    event_ref: string | null;
    event_name: string;
    event_date: string | null;
    division: string | null;
    tier: string | null;
    place: number | null;
    points: number | null;
  }[];
  rounds: {
    played_on: string | null;
    round_rating: number | null;
    round_label: string | null;
    division: string | null;
    event_ref: string | null;
  }[];
};

/**
 * PDGA profile names are cached as "Mario Guzman #249285". Strip the trailing
 * PDGA number so crew rosters show a clean player name.
 */
function cleanPdgaName(name: string | null | undefined): string | null {
  if (!name) return null;
  const cleaned = name.replace(/\s*#\s*\d+\s*$/, "").trim();
  return cleaned || null;
}

/* --------------------------------- Listing -------------------------------- */

export const listTrackerGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: groups } = await supabase
      .from("tracker_groups")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    const ids = (groups ?? []).map((g) => g.id);
    const memberCounts: Record<string, number> = {};
    const eventCounts: Record<string, number> = {};
    const courseSets: Record<string, Set<string>> = {};
    const nextActivity: Record<
      string,
      {
        member_id: string;
        event_id: string;
        tee_time: string | null;
        round_number: number | null;
        event_date: string | null;
      }
    > = {};
    const missingTeeCounts: Record<string, number> = {};
    const changeCounts: Record<string, number> = {};
    if (ids.length) {
      const today = new Date().toISOString().slice(0, 10);
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [{ data: m }, { data: e }, { data: rounds }, { data: tees }, { data: log }] =
        await Promise.all([
          supabase.from("tracker_group_members").select("group_id, id").in("group_id", ids),
          supabase
            .from("tracker_group_events")
            .select("group_id, id, event_date, name, location")
            .in("group_id", ids),
          supabase
            .from("tracker_event_rounds")
            .select("event_id, course_name, round_date, round_number")
            .in(
              "event_id",
              (
                await supabase.from("tracker_group_events").select("id").in("group_id", ids)
              ).data?.map((r) => r.id) ?? [],
            ),
          supabase
            .from("tracker_tee_times")
            .select("event_id, member_id, tee_time, round_number")
            .in(
              "event_id",
              (
                await supabase.from("tracker_group_events").select("id").in("group_id", ids)
              ).data?.map((r) => r.id) ?? [],
            ),
          supabase
            .from("tracker_change_log")
            .select("group_id")
            .in("group_id", ids)
            .gte("created_at", since),
        ]);
      const eventGroup = new Map<string, string>();
      const memberGroup = new Map<string, string>();
      const eventDate = new Map<string, string | null>();
      for (const r of m ?? []) {
        memberCounts[r.group_id] = (memberCounts[r.group_id] ?? 0) + 1;
        memberGroup.set(r.id, r.group_id);
      }
      for (const r of e ?? []) {
        eventCounts[r.group_id] = (eventCounts[r.group_id] ?? 0) + 1;
        eventGroup.set(r.id, r.group_id);
        eventDate.set(r.id, r.event_date);
        if (r.location) (courseSets[r.group_id] ??= new Set()).add(r.location.split(",")[0].trim());
      }
      for (const r of rounds ?? []) {
        const gid = eventGroup.get(r.event_id);
        if (gid && r.course_name) (courseSets[gid] ??= new Set()).add(r.course_name);
      }
      for (const r of log ?? []) changeCounts[r.group_id] = (changeCounts[r.group_id] ?? 0) + 1;
      // Next activity: earliest future tee_time across group
      const sortedTees = (tees ?? [])
        .filter((t) => t.tee_time)
        .map((t) => {
          const gid = eventGroup.get(t.event_id);
          const date = eventDate.get(t.event_id) ?? null;
          return { gid, ...t, date };
        })
        .filter((t) => t.gid && (!t.date || t.date >= today))
        .sort((a, b) =>
          dayTeeSortKey(a.date, a.tee_time).localeCompare(dayTeeSortKey(b.date, b.tee_time)),
        );
      for (const t of sortedTees) {
        if (!t.gid || nextActivity[t.gid]) continue;
        nextActivity[t.gid] = {
          member_id: t.member_id,
          event_id: t.event_id,
          tee_time: t.tee_time,
          round_number: t.round_number,
          event_date: t.date,
        };
      }
      // Missing tee times: (member,event) pairs for events that have not started
      // yet. Once an event is underway or finished, a blank tee time is history,
      // not a gap to chase — the round result is what matters from then on.
      const paired = new Set<string>();
      for (const t of tees ?? []) paired.add(`${t.event_id}:${t.member_id}`);
      for (const gid of ids) {
        const gEvents = (e ?? []).filter(
          (x) => x.group_id === gid && !!x.event_date && x.event_date > today,
        );
        const gMembers = (m ?? []).filter((x) => x.group_id === gid);
        let missing = 0;
        for (const ev of gEvents)
          for (const mm of gMembers) if (!paired.has(`${ev.id}:${mm.id}`)) missing++;
        missingTeeCounts[gid] = missing;
      }
    }
    // Resolve next-activity refs to human labels
    const memberIds = Object.values(nextActivity).map((n) => n.member_id);
    const eventIdsN = Object.values(nextActivity).map((n) => n.event_id);
    const memberLookup = new Map<string, { display_name: string | null; pdga_number: string }>();
    const eventLookup = new Map<string, { name: string; location: string | null }>();
    if (memberIds.length) {
      const { data } = await supabase
        .from("tracker_group_members")
        .select("id, display_name, pdga_number")
        .in("id", memberIds);
      for (const r of data ?? [])
        memberLookup.set(r.id, { display_name: r.display_name, pdga_number: r.pdga_number });
    }
    if (eventIdsN.length) {
      const { data } = await supabase
        .from("tracker_group_events")
        .select("id, name, location")
        .in("id", eventIdsN);
      for (const r of data ?? []) eventLookup.set(r.id, { name: r.name, location: r.location });
    }
    return (groups ?? []).map((g) => {
      const na = nextActivity[g.id];
      const naMember = na ? memberLookup.get(na.member_id) : undefined;
      const naEvent = na ? eventLookup.get(na.event_id) : undefined;
      return {
        ...g,
        member_count: memberCounts[g.id] ?? 0,
        event_count: eventCounts[g.id] ?? 0,
        course_count: courseSets[g.id]?.size ?? 0,
        missing_tee_times: missingTeeCounts[g.id] ?? 0,
        recent_changes: changeCounts[g.id] ?? 0,
        next_activity: na
          ? {
              player_name: naMember?.display_name || (naMember ? `#${naMember.pdga_number}` : null),
              event_name: naEvent?.name ?? null,
              event_location: naEvent?.location ?? null,
              tee_time: na.tee_time,
              event_date: na.event_date,
              round_number: na.round_number,
            }
          : null,
      };
    });
  });

export const getTrackerGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: group } = await supabase
      .from("tracker_groups")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!group) return null;
    const [{ data: members }, { data: events }] = await Promise.all([
      supabase
        .from("tracker_group_members")
        .select("*")
        .eq("group_id", data.id)
        .order("position", { ascending: true }),
      supabase
        .from("tracker_group_events")
        .select("*")
        .eq("group_id", data.id)
        .order("event_date", { ascending: true, nullsFirst: true })
        .order("position", { ascending: true }),
    ]);

    // Backfill missing colors so every member is color-coded across the tracker.
    const memberRows = (members ?? []) as TrackerMember[];
    const missingColor = memberRows.filter((m) => !m.color);
    if (missingColor.length) {
      const used = new Set(memberRows.map((m) => m.color).filter(Boolean) as string[]);
      for (let i = 0; i < missingColor.length; i++) {
        const m = missingColor[i];
        const color =
          MEMBER_COLORS.find((c) => !used.has(c)) ??
          MEMBER_COLORS[memberRows.indexOf(m) % MEMBER_COLORS.length];
        used.add(color);
        m.color = color;
        await supabase.from("tracker_group_members").update({ color }).eq("id", m.id);
      }
    }

    const eventIds = (events ?? []).map((e) => e.id);
    let teeTimes: TrackerTeeTime[] = [];
    let eventRounds: TrackerEventRound[] = [];
    let liveScores: TrackerLiveScoreRow[] = [];
    if (eventIds.length) {
      const [{ data: tt }, { data: rounds }, { data: live }] = await Promise.all([
        supabase.from("tracker_tee_times").select("*").in("event_id", eventIds),
        supabase
          .from("tracker_event_rounds")
          .select("*")
          .in("event_id", eventIds)
          .order("round_number", { ascending: true }),
        supabase
          .from("tracker_live_scores")
          .select("*")
          .in("event_id", eventIds)
          .order("last_synced_at", { ascending: false }),
      ]);
      teeTimes = (tt as TrackerTeeTime[]) ?? [];
      eventRounds = (rounds as TrackerEventRound[]) ?? [];
      liveScores = (live as TrackerLiveScoreRow[]) ?? [];

      // Rounds imported before per-hole par/distance was captured still carry
      // scores only. Fill the gaps from the PDGA layout so the hole-by-hole
      // card can colour birdies and the statboard can bucket holes by length.
      const needsMeta = liveScores.some(
        (r) => r.hole_scores?.some((n) => n > 0) && !(r.hole_pars?.some((n) => n > 0) ?? false),
      );
      if (needsMeta) {
        const { backfillTrackerHoleMeta, pdgaTournIdFrom } =
          await import("@/lib/tracker-hole-meta.server");
        const tournIdByEvent = new Map<string, string>();
        for (const e of (events ?? []) as Array<{
          id: string;
          live_scoring_url: string | null;
          pdga_event_ref: string | null;
        }>) {
          const tournId = pdgaTournIdFrom(e.live_scoring_url, e.pdga_event_ref);
          if (tournId) tournIdByEvent.set(e.id, tournId);
        }
        try {
          await backfillTrackerHoleMeta(supabase, liveScores as never, tournIdByEvent);
        } catch {
          // Backfill is best-effort; the tracker still renders without pars.
        }
      }
    }

    // Snapshot: read cached PDGA finishes + player rating for each member.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const numbers = (members ?? []).map((m) => m.pdga_number);
    let snapshots: MemberSnapshot[] = [];
    if (numbers.length) {
      const [{ data: players }, { data: pEvents }, { data: profs }] = await Promise.all([
        supabaseAdmin
          .from("pdga_players")
          .select("pdga_number, name, current_rating, refreshed_at")
          .in("pdga_number", numbers),
        supabaseAdmin.from("pdga_events").select("*").in("pdga_number", numbers),
        supabaseAdmin.from("profiles").select("pdga_number, avatar_url").in("pdga_number", numbers),
      ]);
      const avatarByNum = new Map<string, string | null>();
      for (const p of profs ?? []) {
        if (p.pdga_number) avatarByNum.set(p.pdga_number, p.avatar_url ?? null);
      }
      const byNum = new Map<string, MemberSnapshot>();
      for (const p of players ?? []) {
        byNum.set(p.pdga_number, {
          pdga_number: p.pdga_number,
          name: p.name ?? null,
          avatar_url: avatarByNum.get(p.pdga_number) ?? null,
          current_rating: p.current_rating ?? null,
          refreshed_at: p.refreshed_at ?? null,
          finishes: [],
          rounds: [],
        });
      }
      for (const num of numbers) {
        if (!byNum.has(num)) {
          byNum.set(num, {
            pdga_number: num,
            name: null,
            avatar_url: avatarByNum.get(num) ?? null,
            current_rating: null,
            refreshed_at: null,
            finishes: [],
            rounds: [],
          });
        }
      }
      for (const ev of pEvents ?? []) {
        const s = byNum.get(ev.pdga_number);
        if (!s) continue;
        s.finishes.push({
          event_ref: ev.event_ref,
          event_name: ev.event_name,
          event_date: ev.event_date,
          division: ev.division,
          tier: ev.tier,
          place: ev.place,
          points: ev.points ? Number(ev.points) : null,
        });
      }
      snapshots = Array.from(byNum.values());

      // Backfill member names from the cached PDGA profile so nobody shows as
      // a bare "#249285" once their profile has been fetched.
      for (const m of memberRows) {
        if (m.display_name) continue;
        const name = cleanPdgaName(byNum.get(m.pdga_number)?.name ?? null);
        if (!name) continue;
        m.display_name = name;
        await supabase.from("tracker_group_members").update({ display_name: name }).eq("id", m.id);
      }
    }

    // Recent change log (last 30 days), scoped to this group.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: changes } = await supabase
      .from("tracker_change_log")
      .select("*")
      .eq("group_id", data.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);

    return {
      group: group as TrackerGroup,
      members: (members as TrackerMember[]) ?? [],
      events: (events as TrackerEvent[]) ?? [],
      teeTimes,
      eventRounds,
      liveScores,
      snapshots,
      changes: (changes ?? []) as Array<{
        id: string;
        group_id: string;
        event_id: string | null;
        member_id: string | null;
        field: string;
        from_value: string | null;
        to_value: string | null;
        severity: string;
        source: string;
        actor_id: string | null;
        created_at: string;
      }>,
    };
  });

/* -------------------------------- Mutations ------------------------------- */

/**
 * The one permanent crew every person has: friends and players they follow
 * forever, with no start or end date. Created on first use and reused after.
 */
export const ensureAllTimeCrew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TrackerGroup> => {
    const { supabase, userId } = context;
    const { data: existing, error: findError } = await supabase
      .from("tracker_groups")
      .select("*")
      .eq("owner_id", userId)
      .eq("is_all_time", true)
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    if (existing) return existing as TrackerGroup;

    const { data: created, error } = await supabase
      .from("tracker_groups")
      .insert({
        owner_id: userId,
        name: "All-time crew",
        description:
          "Everyone you follow year after year. Players stay here for good, and their events keep showing up.",
        is_all_time: true,
        trip_start: null,
        trip_end: null,
      })
      .select("*")
      .single();
    if (error) {
      // Someone else created it in a parallel request — read it back.
      const { data: raced } = await supabase
        .from("tracker_groups")
        .select("*")
        .eq("owner_id", userId)
        .eq("is_all_time", true)
        .maybeSingle();
      if (raced) return raced as TrackerGroup;
      throw new Error(error.message);
    }
    return created as TrackerGroup;
  });

export const createTrackerGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        name: z.string().min(1).max(120),
        description: z.string().max(2000).optional().nullable(),
        trip_start: z.string().optional().nullable(),
        trip_end: z.string().optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: g, error } = await supabase
      .from("tracker_groups")
      .insert({
        owner_id: userId,
        name: data.name,
        description: data.description ?? null,
        trip_start: data.trip_start || null,
        trip_end: data.trip_end || null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return g as TrackerGroup;
  });

export const updateTrackerGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(2000).optional().nullable(),
        trip_start: z.string().optional().nullable(),
        trip_end: z.string().optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { error } = await context.supabase.from("tracker_groups").update(rest).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTrackerGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: group } = await context.supabase
      .from("tracker_groups")
      .select("is_all_time")
      .eq("id", data.id)
      .maybeSingle();
    if (group?.is_all_time) {
      throw new Error(
        "Your all-time crew stays put. Remove individual players instead, or delete a temporary crew.",
      );
    }
    const { error } = await context.supabase.from("tracker_groups").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Clear tracker alerts. Pass `ids` to clear specific sync-log alerts, or omit
 * them to clear every logged alert for the group. Derived alerts (conflicts,
 * travel gaps, stale syncs) are recomputed from live data and are dismissed
 * client-side instead.
 */
export const clearTrackerAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        group_id: z.string().uuid(),
        ids: z.array(z.string().uuid()).max(500).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("tracker_change_log").delete().eq("group_id", data.group_id);
    if (data.ids && data.ids.length > 0) q = q.in("id", data.ids);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addTrackerMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        group_id: z.string().uuid(),
        pdga_number: z.string().min(1).max(20),
        display_name: z.string().max(120).optional().nullable(),
        default_division: z.string().max(20).optional().nullable(),
        is_you: z.boolean().optional(),
        color: z.string().max(20).optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const pdga = data.pdga_number.replace(/\D/g, "");
    if (!pdga) throw new Error("PDGA number required");

    // Look up if the PDGA # belongs to an existing DG Dashboard player.
    const { data: matched } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, pdga_rating")
      .eq("pdga_number", pdga)
      .maybeSingle();

    const color = data.color ?? (await pickNextColor(supabase, data.group_id));

    // Already in this crew? Treat as a no-op success instead of throwing —
    // the caller just re-added someone who is already tracked.
    const { data: existing } = await supabase
      .from("tracker_group_members")
      .select("*")
      .eq("group_id", data.group_id)
      .eq("pdga_number", pdga)
      .maybeSingle();
    if (existing) {
      return {
        ...(existing as TrackerMember),
        duplicate: true as const,
        notified: false,
        matched_profile: matched
          ? {
              id: matched.id,
              username: matched.username,
              display_name: matched.display_name,
              avatar_url: matched.avatar_url,
            }
          : null,
      };
    }

    const { data: m, error } = await supabase
      .from("tracker_group_members")
      .insert({
        group_id: data.group_id,
        pdga_number: pdga,
        display_name: data.display_name ?? matched?.display_name ?? null,
        default_division: data.default_division ?? null,
        is_you: data.is_you ?? false,
        color,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") {
        const { data: dupe } = await supabase
          .from("tracker_group_members")
          .select("*")
          .eq("group_id", data.group_id)
          .eq("pdga_number", pdga)
          .maybeSingle();
        return {
          ...(dupe as TrackerMember),
          duplicate: true as const,
          notified: false,
          matched_profile: null,
        };
      }
      throw new Error(error.message);
    }

    // Notify the DG Dashboard user that they were added to a crew — unless it's
    // the user adding themselves.
    let notified = false;
    if (matched && matched.id !== userId && !data.is_you) {
      const { data: group } = await supabase
        .from("tracker_groups")
        .select("id, name")
        .eq("id", data.group_id)
        .maybeSingle();
      await supabase.from("notifications").insert({
        user_id: matched.id,
        actor_id: userId,
        type: "crew_added",
        payload: {
          group_id: data.group_id,
          group_name: group?.name ?? null,
          pdga_number: pdga,
        },
      } as never);
      notified = true;
    }

    // Auto-seed: pull the new member's PDGA profile + upcoming events + tee
    // times into the group immediately so trackers reflect real data as soon
    // as someone is added. Failure here shouldn't block the add — refresh
    // can be re-run manually from the group page.
    const seeded: { profile: boolean; events_added: number; error?: string } = {
      profile: false,
      events_added: 0,
    };
    try {
      const looked = await lookupPdgaPlayer({ data: { pdgaNumber: Number(pdga), force: true } });
      seeded.profile = true;
      // Name the member from their PDGA profile when no name was supplied.
      const row = m as TrackerMember;
      if (!row.display_name) {
        const pdgaName = cleanPdgaName(
          (looked as { profile?: { name?: string | null } } | null)?.profile?.name ?? null,
        );
        if (pdgaName) {
          row.display_name = pdgaName;
          await supabase
            .from("tracker_group_members")
            .update({ display_name: pdgaName })
            .eq("id", row.id);
        }
      }
    } catch (e) {
      seeded.error = (e as Error).message;
    }

    try {
      const refreshed = await refreshTrackerGroup({ data: { id: data.group_id } });
      seeded.events_added = (refreshed as { eventsAdded?: number } | null)?.eventsAdded ?? 0;
    } catch (e) {
      seeded.error = seeded.error ?? (e as Error).message;
    }

    return {
      ...(m as TrackerMember),
      matched_profile: matched
        ? {
            id: matched.id,
            username: matched.username,
            display_name: matched.display_name,
            avatar_url: matched.avatar_url,
          }
        : null,
      notified,
      seeded,
    };
  });

/**
 * Bulk-add every accepted DG Dashboard friend who has a PDGA # to a tracker.
 * Skips anyone already on the roster. Returns per-friend results so the UI
 * can toast a summary.
 */
export const seedTrackerFromFriends = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ group_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Fetch accepted friendships in either direction.
    const { data: fs } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    const friendIds = Array.from(
      new Set(
        (fs ?? []).map((f: { requester_id: string; addressee_id: string }) =>
          f.requester_id === userId ? f.addressee_id : f.requester_id,
        ),
      ),
    );
    if (friendIds.length === 0) return { added: 0, skipped: 0, missing_pdga: 0 };

    const { data: profs } = await supabase
      .from("profiles")
      .select("id, username, display_name, pdga_number")
      .in("id", friendIds);
    const withPdga = (profs ?? []).filter((p: { pdga_number: string | null }) => !!p.pdga_number);
    const missing = (profs ?? []).length - withPdga.length;

    const { data: existing } = await supabase
      .from("tracker_group_members")
      .select("pdga_number")
      .eq("group_id", data.group_id);
    const taken = new Set((existing ?? []).map((r: { pdga_number: string }) => r.pdga_number));

    let added = 0,
      skipped = 0;
    for (const p of withPdga as Array<{
      id: string;
      username: string;
      display_name: string | null;
      pdga_number: string;
    }>) {
      const pdga = String(p.pdga_number).replace(/\D/g, "");
      if (!pdga || taken.has(pdga)) {
        skipped++;
        continue;
      }
      const color = await pickNextColor(supabase, data.group_id);
      const { error } = await supabase.from("tracker_group_members").insert({
        group_id: data.group_id,
        pdga_number: pdga,
        display_name: p.display_name ?? p.username,
        default_division: null,
        is_you: false,
        color,
      });
      if (error) {
        skipped++;
        continue;
      }
      taken.add(pdga);
      added++;
    }
    return { added, skipped, missing_pdga: missing };
  });

/**
 * Add one DG Dashboard player (by their account id) to a tracker crew. When no
 * crew is named, the player's first crew is used, or a personal one is created.
 * Requires the friend to have a PDGA number on their profile.
 */
export const addFriendToTracker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        user_id: z.string().uuid(),
        group_id: z.string().uuid().optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: prof } = await supabase
      .from("profiles")
      .select("id, username, display_name, pdga_number")
      .eq("id", data.user_id)
      .maybeSingle();
    const pdga = String(prof?.pdga_number ?? "").replace(/\D/g, "");
    if (!pdga) {
      // Expected, non-exceptional outcome: report it as data so the UI can show
      // a friendly message instead of surfacing an app-level runtime error.
      return {
        group_id: null,
        group_name: null,
        duplicate: false as const,
        missing_pdga: true as const,
      };
    }

    let groupId = data.group_id ?? null;
    if (!groupId) {
      // Default target is the permanent all-time crew, not whichever group
      // happens to be oldest (that is usually the event watchlist).
      const { data: allTime } = await supabase
        .from("tracker_groups")
        .select("id")
        .eq("owner_id", userId)
        .eq("is_all_time", true)
        .limit(1)
        .maybeSingle();
      groupId = allTime?.id ?? null;
    }
    let groupName = "your crew";
    if (!groupId) {
      const { data: created, error: createError } = await supabase
        .from("tracker_groups")
        .insert({ owner_id: userId, name: "All-time crew", is_all_time: true })
        .select("id, name")
        .single();
      if (createError) throw new Error(createError.message);
      groupId = created.id as string;
      groupName = created.name as string;
    } else {
      const { data: g } = await supabase
        .from("tracker_groups")
        .select("name")
        .eq("id", groupId)
        .maybeSingle();
      groupName = (g?.name as string) ?? groupName;
    }

    const { data: already } = await supabase
      .from("tracker_group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("pdga_number", pdga)
      .maybeSingle();
    if (already) {
      return { group_id: groupId, group_name: groupName, duplicate: true as const };
    }

    const color = await pickNextColor(supabase, groupId);
    const { error } = await supabase.from("tracker_group_members").insert({
      group_id: groupId,
      pdga_number: pdga,
      display_name: prof?.display_name ?? prof?.username ?? null,
      is_you: false,
      color,
    });
    if (error) throw new Error(error.message);
    return { group_id: groupId, group_name: groupName, duplicate: false as const };
  });

export const updateTrackerMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        id: z.string().uuid(),
        pdga_number: z.string().min(1).max(20).optional(),
        display_name: z.string().max(120).optional().nullable(),
        default_division: z.string().max(20).optional().nullable(),
        is_you: z.boolean().optional(),
        color: z.string().max(20).optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const patch: Partial<TrackerMember> = {};
    if (data.pdga_number !== undefined) {
      const pdga = data.pdga_number.replace(/\D/g, "");
      if (!pdga) throw new Error("PDGA number required");
      patch.pdga_number = pdga;
    }
    if (data.display_name !== undefined) patch.display_name = data.display_name;
    if (data.default_division !== undefined) patch.default_division = data.default_division;
    if (data.is_you !== undefined) patch.is_you = data.is_you;
    if (data.color !== undefined) patch.color = data.color;
    const { data: m, error } = await context.supabase
      .from("tracker_group_members")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!m) throw new Error("Member not found or you don't have permission to edit");
    return m as TrackerMember;
  });

export const removeTrackerMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tracker_group_members")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addTrackerEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        group_id: z.string().uuid(),
        name: z.string().min(1).max(200),
        event_date: z.string().optional().nullable(),
        location: z.string().max(200).optional().nullable(),
        tier: z.string().max(30).optional().nullable(),
        url: z.string().url().optional().nullable(),
        pdga_event_ref: z.string().max(30).optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    let ref = data.pdga_event_ref ?? null;
    if (!ref && data.url) {
      const m = data.url.match(/pdga\.com\/(?:tour\/)?event\/(\d+)/i);
      if (m) ref = m[1];
    }
    const { data: e, error } = await context.supabase
      .from("tracker_group_events")
      .insert({
        group_id: data.group_id,
        name: data.name,
        event_date: data.event_date || null,
        location: data.location ?? null,
        tier: data.tier ?? null,
        pdga_event_ref: ref,
        url: data.url ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return e as TrackerEvent;
  });

export const importTrackerEventFromUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        group_id: z.string().uuid(),
        url: z.string().url().max(500),
        about_url: z.string().url().max(500).optional().nullable(),
        players_url: z.string().url().max(500).optional().nullable(),
      })
      .transform((v) => ({
        ...v,
        url: assertEventSourceUrl(v.url),
        about_url: v.about_url ? assertEventSourceUrl(v.about_url) : v.about_url,
        players_url: v.players_url ? assertEventSourceUrl(v.players_url) : v.players_url,
      }))
      .parse(raw),
  )

  .handler(async ({ data, context }) => {
    const m = data.url.match(/pdga\.com\/(?:tour\/)?event\/(\d+)/i);
    if (!m)
      throw new Error("URL must be a PDGA event page (e.g. https://www.pdga.com/tour/event/86677)");
    const ref = m[1];

    // Fetch + parse main event page.
    const { fetchAllowedUrl } = await import("./safe-fetch.server");
    const { readBoundedText } = await import("./http-safety");
    const res = await fetchAllowedUrl(`https://www.pdga.com/tour/event/${ref}`, assertEventSourceUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new Error(`Couldn't reach PDGA (${res.status})`);
    const html = await readBoundedText(res, 4 * 1024 * 1024);
    const info = parseEventPageInfo(html, ref);

    // Optional About page — merge any missing fields (tier/location/dates) from
    // a supplemental URL. Supports PDGA and Disc Golf Scene.
    if (data.about_url) {
      try {
        const stripped = data.about_url.split("#")[0];
        const aboutRes = await fetchAllowedUrl(stripped, assertEventSourceUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0)",
            Accept: "text/html,application/xhtml+xml",
          },
        });
        if (aboutRes.ok) {
          const aboutHtml = await readBoundedText(aboutRes, 4 * 1024 * 1024);
          const isDgs = new URL(stripped).hostname.toLowerCase().endsWith("discgolfscene.com");
          const aboutInfo = isDgs
            ? parseDgsAboutPage(aboutHtml)
            : parseEventPageInfo(aboutHtml, ref);
          info.name = info.name ?? aboutInfo.name;
          info.tier = info.tier ?? aboutInfo.tier;
          info.start_date = info.start_date ?? aboutInfo.start_date;
          info.end_date = info.end_date ?? aboutInfo.end_date;
          info.location = info.location ?? aboutInfo.location;
        }
      } catch {
        /* best-effort */
      }
    }

    // Upsert by pdga_event_ref within this group.
    const { data: existing } = await context.supabase
      .from("tracker_group_events")
      .select("id, name, event_date, location, tier, url")
      .eq("group_id", data.group_id)
      .eq("pdga_event_ref", ref)
      .maybeSingle();

    const row = {
      group_id: data.group_id,
      name: info.name ?? `PDGA event ${ref}`,
      event_date: info.start_date ?? null,
      location: info.location ?? null,
      tier: info.tier ?? null,
      pdga_event_ref: ref,
      url: info.url,
    };

    let eventId: string;
    if (existing) {
      const { data: updated, error } = await context.supabase
        .from("tracker_group_events")
        .update(row)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      eventId = updated.id;
    } else {
      const { data: inserted, error } = await context.supabase
        .from("tracker_group_events")
        .insert(row)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      eventId = inserted.id;
    }

    // Sync tee times / divisions for members registered for this event.
    let teeTimesAdded = 0;
    let teeTimesUpdated = 0;
    try {
      const tees = await getPdgaEventTeeTimes({ data: { eventRef: ref } });
      if (tees.length) {
        const { data: members } = await context.supabase
          .from("tracker_group_members")
          .select("id, pdga_number")
          .eq("group_id", data.group_id);
        const byNum = new Map((members ?? []).map((m) => [m.pdga_number, m.id]));
        const { data: existingTees } = await context.supabase
          .from("tracker_tee_times")
          .select("id, member_id, tee_time, division")
          .eq("event_id", eventId);
        const existingByMember = new Map((existingTees ?? []).map((t) => [t.member_id, t]));
        for (const t of tees) {
          const memberId = byNum.get(t.pdga_number);
          if (!memberId) continue;
          const cur = existingByMember.get(memberId);
          if (!cur) {
            await context.supabase.from("tracker_tee_times").insert({
              event_id: eventId,
              member_id: memberId,
              tee_time: canonicalTeeTime(t.tee_time),
              division: t.division,
            });
            teeTimesAdded += 1;
          } else if (cur.tee_time !== canonicalTeeTime(t.tee_time) || cur.division !== t.division) {
            await context.supabase
              .from("tracker_tee_times")
              .update({
                tee_time: canonicalTeeTime(t.tee_time),
                division: t.division,
              })
              .eq("id", cur.id);
            teeTimesUpdated += 1;
          }
        }
      }
    } catch {
      // best-effort — event is already saved
    }

    // Optional Players page — parse registered PDGA numbers + divisions and
    // auto-add them as tracker members (skips duplicates).
    let playersAdded = 0;
    let playersScanned = 0;
    if (data.players_url) {
      try {
        const stripped = data.players_url.split("#")[0];
        const pRes = await fetchAllowedUrl(stripped, assertEventSourceUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0)",
            Accept: "text/html,application/xhtml+xml",
          },
        });
        if (pRes.ok) {
          const pHtml = await readBoundedText(pRes, 4 * 1024 * 1024);
          const isDgs = new URL(stripped).hostname.toLowerCase().endsWith("discgolfscene.com");
          const parsed = isDgs ? parseDgsPlayersPage(pHtml) : parsePlayersPage(pHtml);
          playersScanned = parsed.length;

          const { data: existingMembers } = await context.supabase
            .from("tracker_group_members")
            .select("pdga_number, color")
            .eq("group_id", data.group_id);
          const have = new Set((existingMembers ?? []).map((m) => m.pdga_number));
          const usedColors = new Set(
            (existingMembers ?? []).map((m) => m.color).filter(Boolean) as string[],
          );

          const { data: posRow } = await context.supabase
            .from("tracker_group_members")
            .select("position")
            .eq("group_id", data.group_id)
            .order("position", { ascending: false })
            .limit(1)
            .maybeSingle();
          let pos = ((posRow?.position as number | undefined) ?? 0) + 1;

          for (const p of parsed) {
            if (have.has(p.pdga_number)) continue;
            const color =
              MEMBER_COLORS.find((c) => !usedColors.has(c)) ??
              MEMBER_COLORS[have.size % MEMBER_COLORS.length];
            const { error } = await context.supabase.from("tracker_group_members").insert({
              group_id: data.group_id,
              pdga_number: p.pdga_number,
              display_name: p.name ?? null,
              default_division: p.division ?? null,
              is_you: false,
              color,
              position: pos++,
            });
            if (!error) {
              have.add(p.pdga_number);
              usedColors.add(color);
              playersAdded += 1;
            }
          }
        }
      } catch {
        /* best-effort */
      }
    }

    return {
      event_id: eventId,
      event_ref: ref,
      info,
      teeTimesAdded,
      teeTimesUpdated,
      playersAdded,
      playersScanned,
    };
  });

/** Parse a PDGA event Players page for registered PDGA numbers + divisions. */
function parsePlayersPage(
  html: string,
): Array<{ pdga_number: string; name: string | null; division: string | null }> {
  const out: Array<{ pdga_number: string; name: string | null; division: string | null }> = [];
  const seen = new Set<string>();

  // Track division section headers (e.g. <h3 id="MPO">Open</h3>) so rows inherit division context.
  const markerRe = /<h[2-6][^>]*\bid="([A-Z]{2,6}\d{0,3})"[^>]*>[\s\S]*?<\/h[2-6]>/gi;
  const divisionMarkers: Array<{ division: string; index: number }> = [];
  let mm: RegExpExecArray | null;
  while ((mm = markerRe.exec(html)) !== null) {
    divisionMarkers.push({ division: mm[1], index: mm.index + mm[0].length });
  }

  const rowRe = /<tr[\s\S]*?<\/tr>/gi;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(html)) !== null) {
    const row = rm[0];
    const pdgaM = row.match(/<td[^>]*class="[^"]*pdga-number[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    if (!pdgaM) continue;
    const pdga = pdgaM[1].replace(/<[^>]+>/g, "").trim();
    if (!/^\d+$/.test(pdga)) continue;
    if (seen.has(pdga)) continue;
    seen.add(pdga);

    const nameM = row.match(/<td[^>]*class="[^"]*(?:player|name)[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    const name = nameM ? nameM[1].replace(/<[^>]+>/g, "").trim() || null : null;

    const divM = row.match(/<td[^>]*class="[^"]*division[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    let division: string | null = divM ? divM[1].replace(/<[^>]+>/g, "").trim() || null : null;
    if (!division) {
      // Fall back to the nearest section header above this row.
      let last: string | null = null;
      for (const dm of divisionMarkers) {
        if (dm.index <= rm.index) last = dm.division;
        else break;
      }
      division = last;
    }

    out.push({ pdga_number: pdga, name, division });
  }
  return out;
}

/** Parse a Disc Golf Scene tournament Players page. Heuristic — DGS renders
 *  a table per division with cells for player name, PDGA number, rating, etc. */
function parseDgsPlayersPage(
  html: string,
): Array<{ pdga_number: string; name: string | null; division: string | null }> {
  const out: Array<{ pdga_number: string; name: string | null; division: string | null }> = [];
  const seen = new Set<string>();

  // Division section anchors (e.g. <h2>MPO — Mixed Pro Open</h2> or <h3 id="mpo">).
  const divMarkers: Array<{ division: string; index: number }> = [];
  const headerRe = /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi;
  let hm: RegExpExecArray | null;
  while ((hm = headerRe.exec(html)) !== null) {
    const text = hm[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const m = text.match(/\b([MF][APJ]?[OA]?\d{0,3}\+?)\b/);
    if (m) divMarkers.push({ division: m[1].toUpperCase(), index: hm.index + hm[0].length });
  }
  const nearestDivision = (idx: number): string | null => {
    let last: string | null = null;
    for (const d of divMarkers) {
      if (d.index <= idx) last = d.division;
      else break;
    }
    return last;
  };

  const rowRe = /<tr[\s\S]*?<\/tr>/gi;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(html)) !== null) {
    const row = rm[0];
    const cells: string[] = [];
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(row)) !== null) {
      cells.push(
        cm[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      );
    }
    if (cells.length < 2) continue;

    // PDGA number: a cell of digits (3-7). Skip PDGA-less players.
    let pdga: string | null = null;
    for (const c of cells) {
      const mm = c.match(/^#?\s*(\d{3,7})\s*$/);
      if (mm) {
        pdga = mm[1];
        break;
      }
    }
    if (!pdga || seen.has(pdga)) continue;
    seen.add(pdga);

    const name =
      cells.find((c) => /[A-Za-z]{2,}/.test(c) && !/^[MF][APJ]?[OA]?\d{0,3}\+?$/i.test(c)) ?? null;
    const divCell = cells.find((c) => /^[MF][APJ]?[OA]?\d{0,3}\+?$/i.test(c.trim()));
    const division = divCell ? divCell.toUpperCase() : nearestDivision(rm.index);

    out.push({ pdga_number: pdga, name, division });
  }
  return out;
}

/** Parse a Disc Golf Scene tournament About/landing page for event metadata. */
function parseDgsAboutPage(html: string): {
  name: string | null;
  tier: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
} {
  const flat = html.replace(/\s+/g, " ");
  const ogTitle =
    flat.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? null;
  const ogDesc =
    flat.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    null;
  const h1 =
    flat
      .match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
      ?.replace(/<[^>]+>/g, "")
      .trim() ?? null;
  const name = h1 || ogTitle || null;

  const tierM = flat.match(
    /\b(Major|Elite Series|Silver Series|DGPT[^<\s]*|X?[A-C]-Tier|M-Tier)\b/i,
  );
  const tier = tierM ? tierM[1] : null;

  const dateRe =
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{0,4}\b/gi;
  const rawDates = Array.from(flat.matchAll(dateRe)).map((m) => m[0]);
  const year = flat.match(/\b(20\d{2})\b/)?.[1] ?? String(new Date().getFullYear());
  const toISO = (s: string): string | null => {
    const withYear = /\d{4}/.test(s) ? s : `${s.replace(/,\s*$/, "")}, ${year}`;
    const d = new Date(withYear);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  };
  const start_date = rawDates[0] ? toISO(rawDates[0]) : null;
  const end_date = rawDates[1] ? toISO(rawDates[1]) : null;

  // DGS typically renders location as "City, ST" — pull the first match from the description or body.
  const locSrc = ogDesc ?? flat;
  const locM = locSrc.match(/\b([A-Z][A-Za-z .'-]+),\s*([A-Z]{2})\b/);
  const location = locM ? `${locM[1]}, ${locM[2]}` : null;

  return { name, tier, start_date, end_date, location };
}

export const removeTrackerEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tracker_group_events")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateTrackerEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        event_date: z.string().max(20).optional().nullable(),
        location: z.string().max(200).optional().nullable(),
        tier: z.string().max(30).optional().nullable(),
        url: z.string().url().optional().nullable().or(z.literal("")),
        pdga_event_ref: z.string().max(30).optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      name?: string;
      event_date?: string | null;
      location?: string | null;
      tier?: string | null;
      url?: string | null;
      pdga_event_ref?: string | null;
    } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.event_date !== undefined) patch.event_date = data.event_date || null;
    if (data.location !== undefined) patch.location = data.location ?? null;
    if (data.tier !== undefined) patch.tier = data.tier ?? null;
    if (data.url !== undefined) patch.url = data.url ? data.url : null;
    if (data.pdga_event_ref !== undefined) patch.pdga_event_ref = data.pdga_event_ref ?? null;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("tracker_group_events")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Log a "flex" (unsanctioned or one-off sanctioned) round played during a
 * tracker trip. Creates a tracker_group_events row for the whole crew to see
 * and — when the caller marks it as their own PDGA-verified result — inserts a
 * verified external_rounds row for the caller so it flows into DG Statboard
 * rating projections immediately.
 */
export const logFlexRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        group_id: z.string().uuid(),
        name: z.string().min(1).max(200),
        event_date: z.string().min(4).max(20),
        course_name: z.string().min(1).max(200),
        location: z.string().max(200).optional().nullable(),
        url: z.string().url().optional().nullable().or(z.literal("")),
        // Player-specific fields (all optional — the crew can log an event without
        // recording a personal score if the caller didn't play).
        division: z.string().max(30).optional().nullable(),
        score: z.number().int().min(0).max(500).optional().nullable(),
        to_par: z.number().int().min(-50).max(200).optional().nullable(),
        round_rating: z.number().int().min(300).max(1200).optional().nullable(),
        ssa: z.number().min(20).max(120).optional().nullable(),
        layout_name: z.string().max(200).optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    // Parse PDGA event ref if the URL is a PDGA event page.
    let ref: string | null = null;
    if (data.url) {
      const m = data.url.match(/pdga\.com\/(?:tour\/)?event\/(\d+)/i);
      if (m) ref = m[1];
    }

    const { data: ev, error: evErr } = await context.supabase
      .from("tracker_group_events")
      .insert({
        group_id: data.group_id,
        name: data.name,
        event_date: data.event_date,
        location: data.location ?? data.course_name,
        tier: "Flex",
        pdga_event_ref: ref,
        url: data.url || null,
        event_classification: "flex",
      })
      .select("*")
      .single();
    if (evErr) throw new Error(evErr.message);

    let roundId: string | null = null;
    if (data.round_rating != null || data.score != null || data.to_par != null) {
      const source = ref ? "pdga" : "manual";
      const trust = ref ? "verified" : "manual";
      const { data: rr, error: rrErr } = await context.supabase
        .from("external_rounds")
        .insert({
          user_id: context.userId,
          source,
          trust_level: trust,
          format: "singles",
          course_name: data.course_name,
          course_layout: data.layout_name ?? null,
          played_on: data.event_date,
          score: data.score ?? null,
          to_par: data.to_par ?? null,
          round_rating: data.round_rating ?? null,
          ssa: data.ssa ?? null,
          pdga_event_ref: ref,
          division: data.division ?? null,
          included: true,
        } as never)
        .select("id")
        .single();
      if (rrErr) throw new Error(rrErr.message);
      roundId = rr?.id ?? null;
    }

    return { event: ev, round_id: roundId };
  });

/**
 * Fetch an event with its crew, existing per-round results, and the schedule.
 * Powers the tracker Results page.
 */
export const getTrackerEventResults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ event_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: event, error: evErr } = await supabase
      .from("tracker_group_events")
      .select("*")
      .eq("id", data.event_id)
      .single();
    if (evErr || !event) throw new Error(evErr?.message ?? "Event not found");
    // Confirm caller owns the parent group.
    const { data: group } = await supabase
      .from("tracker_groups")
      .select("id, name, owner_id")
      .eq("id", event.group_id)
      .single();
    if (!group || group.owner_id !== userId) throw new Error("Not authorized");
    // Events saved before the record was filled out top up on first view, so
    // the page always shows the event's own full details.
    let eventRow = event as Record<string, unknown>;
    if (!eventRow["hydrated_at"]) {
      try {
        const { hydrateTrackedEvent } = await import("@/lib/tracker/event-hydrate.server");
        const filled = await hydrateTrackedEvent(supabase, data.event_id);
        eventRow = { ...eventRow, ...filled, hydrated_at: new Date().toISOString() };
      } catch {
        // Non-fatal — render what we have.
      }
    }
    const [{ data: members }, { data: rounds }, { data: scores }] = await Promise.all([
      supabase
        .from("tracker_group_members")
        .select("*")
        .eq("group_id", event.group_id)
        .order("position"),
      supabase
        .from("tracker_event_rounds")
        .select("*")
        .eq("event_id", data.event_id)
        .order("round_number"),
      supabase.from("tracker_live_scores").select("*").eq("event_id", data.event_id),
    ]);
    // Pull current ratings for everyone in the field (crew plus the rest of the
    // event) so the leaderboard and field analysis can rank by rating.
    const numSet = new Set<string>();
    for (const m of members ?? []) if (m.pdga_number) numSet.add(String(m.pdga_number));
    for (const s of scores ?? []) if (s.pdga_number) numSet.add(String(s.pdga_number));
    const ratings: Record<string, number | null> = {};
    if (numSet.size > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const all = Array.from(numSet);
      for (let i = 0; i < all.length; i += 500) {
        const { data: pdgaRows } = await supabaseAdmin
          .from("pdga_players")
          .select("pdga_number, current_rating")
          .in("pdga_number", all.slice(i, i + 500));
        for (const r of pdgaRows ?? []) ratings[r.pdga_number] = r.current_rating ?? null;
      }
    }
    // The signed-in player's own PDGA number, so the field analysis knows which
    // row is theirs even when they aren't listed as a crew member.
    const { data: myProfile } = await supabase
      .from("profiles")
      .select("pdga_number")
      .eq("id", userId)
      .maybeSingle();
    const myPdga = myProfile?.pdga_number ? String(myProfile.pdga_number) : null;
    // Everything that changed on this event since it was tracked — tee times
    // moved, divisions switched, withdrawals, status flips — newest first.
    const { data: updates } = await supabase
      .from("tracker_change_log")
      .select("id, field, from_value, to_value, source, severity, member_id, created_at")
      .eq("event_id", data.event_id)
      .order("created_at", { ascending: false })
      .limit(60);
    // PDGA rarely dates each round. Fill blanks from the event's own dates
    // (weekly for league play, consecutive days otherwise).
    const roundRows = rounds ?? [];
    let roundsOut = roundRows.map((r) => ({ ...r, round_date_expected: false }));
    if (roundRows.some((r) => !r.round_date)) {
      const derived = deriveRoundDates({
        startDate: (eventRow["event_date"] as string | null) ?? null,
        endDate: (eventRow["end_date"] as string | null) ?? null,
        tier: (eventRow["tier"] as string | null) ?? null,
        name: (eventRow["name"] as string | null) ?? null,
        rounds: roundRows.map((r) => r.round_number ?? 0),
      });
      roundsOut = roundsOut.map((r) =>
        r.round_date
          ? r
          : {
              ...r,
              round_date: derived[r.round_number ?? 0] ?? null,
              round_date_expected: true,
            },
      );
    }
    return {
      event: eventRow as typeof event,
      group,
      members: members ?? [],
      rounds: roundsOut,
      scores: scores ?? [],
      ratings,
      myPdga,
      updates: updates ?? [],
    };
  });

/**
 * Post (or overwrite) results for a tracker event. For each provided member
 * row, upserts a tracker_live_scores row scoped to (event, pdga_number, round)
 * with completed = true. When the row belongs to the caller (is_you), also
 * writes a verified external_rounds entry so DG Statboard picks it up.
 */
export const postEventResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        event_id: z.string().uuid(),
        round_number: z.number().int().min(1).max(20).default(1),
        course_name: z.string().max(200).optional().nullable(),
        course_layout: z.string().max(200).optional().nullable(),
        rows: z
          .array(
            z.object({
              member_id: z.string().uuid(),
              division: z.string().max(30).optional().nullable(),
              score: z.number().int().min(0).max(500).optional().nullable(),
              to_par: z.number().int().min(-50).max(200).optional().nullable(),
              round_rating: z.number().int().min(300).max(1200).optional().nullable(),
            }),
          )
          .min(1),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Ownership check via the event's group.
    const { data: event, error: evErr } = await supabase
      .from("tracker_group_events")
      .select("id, group_id, name, event_date, pdga_event_ref, url")
      .eq("id", data.event_id)
      .single();
    if (evErr || !event) throw new Error(evErr?.message ?? "Event not found");
    const { data: group } = await supabase
      .from("tracker_groups")
      .select("owner_id")
      .eq("id", event.group_id)
      .single();
    if (!group || group.owner_id !== userId) throw new Error("Not authorized");
    const { data: members } = await supabase
      .from("tracker_group_members")
      .select("*")
      .eq("group_id", event.group_id);
    const memberById = new Map((members ?? []).map((m) => [m.id, m]));

    // Ensure a schedule row exists for this round so the results page can show
    // the course/layout meta alongside the leaderboard.
    if (data.course_name || data.course_layout) {
      const { data: existing } = await supabase
        .from("tracker_event_rounds")
        .select("id")
        .eq("event_id", data.event_id)
        .eq("round_number", data.round_number)
        .is("division", null)
        .maybeSingle();
      const patch = {
        event_id: data.event_id,
        round_number: data.round_number,
        round_date: event.event_date,
        course_name: data.course_name ?? null,
        course_layout: data.course_layout ?? null,
      };
      if (existing?.id) {
        await supabase.from("tracker_event_rounds").update(patch).eq("id", existing.id);
      } else {
        await supabase.from("tracker_event_rounds").insert(patch);
      }
    }

    let written = 0;
    let skippedOfficial = 0;
    for (const row of data.rows) {
      const member = memberById.get(row.member_id);
      if (!member) continue;
      // Skip fully-empty rows so we don't blank out prior results by accident.
      if (row.score == null && row.to_par == null && row.round_rating == null) continue;

      // Upsert on (event_id, pdga_number, round_number). Official synced rows
      // are never overwritten by hand-entered numbers.
      const { data: existing } = await supabase
        .from("tracker_live_scores")
        .select("id, result_source")
        .eq("event_id", data.event_id)
        .eq("pdga_number", member.pdga_number)
        .eq("round_number", data.round_number)
        .maybeSingle();
      if (existing && existing.result_source !== "MANUAL_PRIVATE") {
        skippedOfficial += 1;
        continue;
      }
      // Event total = sum of this player's posted round scores (never the
      // single round's strokes standing in for a multi-round total).
      const { data: others } = await supabase
        .from("tracker_live_scores")
        .select("round_number, round_score, round_to_par")
        .eq("event_id", data.event_id)
        .eq("pdga_number", member.pdga_number)
        .neq("round_number", data.round_number);
      const prior = (others ?? []).filter((o) => (o.round_number ?? 0) < data.round_number);
      const allScored = row.score != null && prior.every((o) => o.round_score != null);
      const allToPar = row.to_par != null && prior.every((o) => o.round_to_par != null);
      const payload = {
        event_id: data.event_id,
        pdga_number: member.pdga_number,
        member_id: member.id,
        division: row.division ?? member.default_division ?? null,
        round_number: data.round_number,
        round_score: row.score ?? null,
        round_to_par: row.to_par ?? null,
        total: allScored
          ? prior.reduce((t, o) => t + (o.round_score ?? 0), row.score as number)
          : null,
        to_par: allToPar
          ? prior.reduce((t, o) => t + (o.round_to_par ?? 0), row.to_par as number)
          : null,
        thru: null,
        completed: true,
        round_started: true,
        player_name: member.display_name ?? null,
        result_source: "MANUAL_PRIVATE",
        last_synced_at: new Date().toISOString(),
      };
      if (existing?.id) {
        await supabase.from("tracker_live_scores").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("tracker_live_scores").insert(payload);
      }
      written += 1;
      // Tracker notes never create Statboard rounds: official PDGA results
      // reach the Statboard only through the PDGA import, so nothing is doubled.
    }
    return { ok: true, written, skipped_official: skippedOfficial };
  });

export const setTrackerTeeTime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        event_id: z.string().uuid(),
        member_id: z.string().uuid(),
        tee_time: z.string().max(30).optional().nullable(),
        division: z.string().max(20).optional().nullable(),
        notes: z.string().max(500).optional().nullable(),
        round_number: z.number().int().min(1).max(20).optional().nullable(),
        starting_hole: z.string().max(20).optional().nullable(),
        card_number: z.string().max(20).optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    // The unique index on tracker_tee_times is
    //   (event_id, member_id, COALESCE(round_number, 0))
    // which PostgREST can't target with `onConflict`. Do an explicit
    // find-then-update/insert so manual edits from the UI actually persist,
    // and stamp manual_override so the PDGA sync doesn't clobber them.
    const roundNumber = data.round_number ?? null;
    const q = context.supabase
      .from("tracker_tee_times")
      .select("id")
      .eq("event_id", data.event_id)
      .eq("member_id", data.member_id)
      .limit(1);
    const { data: existing, error: findErr } = await (
      roundNumber === null ? q.is("round_number", null) : q.eq("round_number", roundNumber)
    ).maybeSingle();
    if (findErr) throw new Error(findErr.message);

    const patch = {
      tee_time: canonicalTeeTime(data.tee_time),

      division: data.division ?? null,
      notes: data.notes ?? null,
      starting_hole: data.starting_hole ?? null,
      card_number: data.card_number ?? null,
      manual_override: true,
      source: "manual" as const,
    };

    if (existing?.id) {
      const { error } = await context.supabase
        .from("tracker_tee_times")
        .update(patch)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: existing.id, mode: "update" as const };
    }

    const { data: inserted, error: insErr } = await context.supabase
      .from("tracker_tee_times")
      .insert({
        event_id: data.event_id,
        member_id: data.member_id,
        round_number: roundNumber,
        status: "scheduled",
        ...patch,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    return { ok: true, id: inserted.id, mode: "insert" as const };
  });

/* --------------------------- PDGA data refresh --------------------------- */

export const refreshTrackerGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: members } = await supabase
      .from("tracker_group_members")
      .select("id, pdga_number, default_division")
      .eq("group_id", data.id);
    const memberRows = members ?? [];
    const numbers = Array.from(new Set(memberRows.map((m) => m.pdga_number)));
    const results: { pdga_number: string; ok: boolean; error?: string }[] = [];

    // Refresh cached PDGA profile + finishes for each member.
    for (const num of numbers) {
      try {
        await lookupPdgaPlayer({ data: { pdgaNumber: Number(num), force: true } });
        results.push({ pdga_number: num, ok: true });
      } catch (e) {
        results.push({ pdga_number: num, ok: false, error: (e as Error).message });
      }
    }

    // Pull upcoming events for every member and merge into the group schedule.
    // Track fetch success separately so a scrape failure isn't treated as
    // "player withdrew from everything".
    type Upcoming = Awaited<ReturnType<typeof getPdgaUpcomingEvents>>[number];
    const perMember = new Map<string, Upcoming[]>();
    const upcomingOk = new Map<string, boolean>();
    for (const num of numbers) {
      try {
        const list = await getPdgaUpcomingEvents({ data: { pdgaNumber: num } });
        perMember.set(num, list);
        upcomingOk.set(num, true);
      } catch {
        perMember.set(num, []);
        upcomingOk.set(num, false);
      }
    }

    // Existing events in the group, keyed by pdga_event_ref (so we don't duplicate).
    const { data: existingEvents } = await supabase
      .from("tracker_group_events")
      .select("id, pdga_event_ref")
      .eq("group_id", data.id);
    const eventByRef = new Map<string, string>();
    for (const e of existingEvents ?? []) {
      if (e.pdga_event_ref) eventByRef.set(e.pdga_event_ref, e.id);
    }

    // Union of upcoming events across the crew.
    const unionMap = new Map<string, Upcoming>();
    for (const list of perMember.values()) {
      for (const ev of list) {
        if (!unionMap.has(ev.event_ref)) unionMap.set(ev.event_ref, ev);
      }
    }

    let eventsAdded = 0;
    for (const ev of unionMap.values()) {
      if (eventByRef.has(ev.event_ref)) continue;
      const { data: inserted, error } = await supabase
        .from("tracker_group_events")
        .insert({
          group_id: data.id,
          name: ev.event_name,
          event_date: ev.event_date,
          location: ev.location,
          tier: ev.tier,
          pdga_event_ref: ev.event_ref,
          url: ev.url,
          // Found from a crew member's PDGA schedule, not saved by the owner:
          // stays off the personal Event Tracker list until it's saved there.
          auto_added: true,
        })
        .select("id")
        .single();
      if (!error && inserted) {
        eventByRef.set(ev.event_ref, inserted.id as string);
        eventsAdded += 1;
      }
    }

    // Fetch tee times for every event in the group (not just events in a
    // member's PDGA upcoming list — that list can omit events the crew is
    // registered for). Iterate scraped rows and upsert for any matching
    // crew member.
    const eventRefsAll = new Set<string>();
    for (const e of existingEvents ?? []) {
      if (e.pdga_event_ref) eventRefsAll.add(e.pdga_event_ref);
    }
    for (const ref of unionMap.keys()) eventRefsAll.add(ref);

    const teesByEvent = new Map<string, Awaited<ReturnType<typeof getPdgaEventTeeTimes>>>();
    const teeSheetOk = new Map<string, boolean>();
    const schedByEvent = new Map<string, Awaited<ReturnType<typeof getPdgaEventSchedule>>>();
    for (const ref of eventRefsAll) {
      try {
        const [rows, sched] = await Promise.all([
          getPdgaEventTeeTimes({ data: { eventRef: ref } }),
          getPdgaEventSchedule({ data: { eventRef: ref } }),
        ]);
        teesByEvent.set(ref, rows);
        schedByEvent.set(ref, sched);
        teeSheetOk.set(ref, true);
      } catch {
        teesByEvent.set(ref, []);
        schedByEvent.set(ref, []);
        teeSheetOk.set(ref, false);
      }
    }

    // Refresh event metadata (date, location, tier, url) straight from the PDGA
    // event page for EVERY tracked event — not just newly-inserted ones. Values
    // are only written when PDGA actually publishes them, so a failed scrape can
    // never blank out a field that was already verified.
    for (const ref of eventRefsAll) {
      const eventId = eventByRef.get(ref);
      if (!eventId) continue;
      try {
        const info = await getPdgaEventInfo({ data: { eventRef: ref } });
        const patch: {
          last_synced_at: string;
          sync_error: string | null;
          name?: string;
          event_date?: string;
          end_date?: string;
          location?: string;
          tier?: string;
          url?: string;
          description?: string;
        } = {
          last_synced_at: new Date().toISOString(),
          sync_error: null,
        };
        if (info.name) patch.name = info.name;
        if (info.start_date) patch.event_date = info.start_date;
        if (info.end_date) patch.end_date = info.end_date;
        if (info.location) patch.location = info.location;
        if (info.tier) patch.tier = info.tier;
        if (info.url) patch.url = info.url;
        if (info.description) patch.description = info.description;
        await supabase.from("tracker_group_events").update(patch).eq("id", eventId);
        // Top up anything PDGA's page didn't publish from the app's own sources.
        try {
          const { hydrateTrackedEvent } = await import("@/lib/tracker/event-hydrate.server");
          await hydrateTrackedEvent(supabase, eventId);
        } catch {
          // Non-fatal — details stay as published.
        }
      } catch (e) {
        await supabase
          .from("tracker_group_events")
          .update({
            last_synced_at: new Date().toISOString(),
            sync_error:
              e instanceof Error ? e.message.slice(0, 300) : "PDGA event page unavailable",
          })
          .eq("id", eventId);
      }
    }

    // Upsert tracker_event_rounds — one row per (event, round, division).
    //
    // The PDGA event page schedule has no pool column, so a division that is
    // split across pools shows up several times for the same round with
    // different courses. Writing those into a single pool-less row makes the
    // last-parsed pool's course look like the whole division's course, which is
    // how a player ends up shown at a course another pool played. So: a
    // (round, division) pair with conflicting courses is written as "unknown"
    // (course_name null) and only pool-specific rows — sourced from live
    // scoring or the published rotation — decide the course.
    let roundsAdded = 0;
    for (const ref of eventRefsAll) {
      const eventId = eventByRef.get(ref);
      if (!eventId) continue;
      const sched = schedByEvent.get(ref) ?? [];

      const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
      // Group by round+division so conflicts are detectable.
      const byKey = new Map<
        string,
        { round: number; division: string | null; courses: Set<string>; layouts: Set<string> }
      >();
      for (const s of sched) {
        const key = `${s.round_number}::${norm(s.division)}`;
        const bucket = byKey.get(key) ?? {
          round: s.round_number,
          division: s.division ?? null,
          courses: new Set<string>(),
          layouts: new Set<string>(),
        };
        if (s.course_name) bucket.courses.add(s.course_name);
        if (s.course_layout) bucket.layouts.add(s.course_layout);
        byKey.set(key, bucket);
      }
      const perDivision = [...byKey.values()].map((b) => ({
        event_id: eventId,
        round_number: b.round,
        division: b.division,
        course_name: b.courses.size === 1 ? [...b.courses][0] : null,
        course_layout: b.layouts.size === 1 ? [...b.layouts][0] : null,
      }));

      // Aggregate (division-less) row per round — only when the entire round is
      // played on one course. Pool-split rounds get a null course so nothing
      // downstream can mistake one pool's course for everyone's.
      const byRound = new Map<number, { courses: Set<string>; layouts: Set<string> }>();
      for (const s of sched) {
        const bucket = byRound.get(s.round_number) ?? {
          courses: new Set<string>(),
          layouts: new Set<string>(),
        };
        if (s.course_name) bucket.courses.add(s.course_name);
        if (s.course_layout) bucket.layouts.add(s.course_layout);
        byRound.set(s.round_number, bucket);
      }
      const aggregate = Array.from(byRound.entries()).map(([n, b]) => ({
        event_id: eventId,
        round_number: n,
        division: null as string | null,
        course_name: b.courses.size === 1 ? [...b.courses][0] : null,
        course_layout: b.layouts.size === 1 ? [...b.layouts][0] : null,
      }));
      const base = [...aggregate, ...perDivision];
      // PDGA publishes no date per round, so derive one from the event's own
      // dates: spread across a published range, weekly for league play, else
      // consecutive days.
      const { data: evMeta } = await supabase
        .from("tracker_group_events")
        .select("event_date, end_date, tier, name")
        .eq("id", eventId)
        .maybeSingle();
      const dateByRound = deriveRoundDates({
        startDate: evMeta?.event_date ?? null,
        endDate: (evMeta as { end_date?: string | null } | null)?.end_date ?? null,
        tier: evMeta?.tier ?? null,
        name: evMeta?.name ?? null,
        rounds: base.map((r) => r.round_number),
      });
      const rows = base.map((r) => ({
        ...r,
        round_date: dateByRound[r.round_number] ?? null,
      }));
      if (rows.length) {
        const { error } = await supabase.from("tracker_event_rounds").upsert(rows, {
          onConflict: "event_id,round_number,division,pool",
        });
        if (!error) roundsAdded += rows.length;
      }
    }

    // Ghost Course auto-creation. Any course_name that appears in a PDGA
    // schedule (or a manually-added tracker round) but does not exist in
    // public.courses gets a lightweight placeholder row so the tracker's
    // Courses tab, /courses, and event pages can link to it. Ghost courses
    // are `is_ghost=true`, moderation-approved (so signed-in users can read
    // them), and hidden from the public directory until a builder promotes
    // them by uploading holes/layouts.
    {
      const scheduleCourseNames = new Set<string>();
      for (const ref of eventRefsAll) {
        for (const s of schedByEvent.get(ref) ?? []) {
          const n = s.course_name?.trim();
          if (n && !/^Default Layout/i.test(n)) scheduleCourseNames.add(n);
        }
      }
      // Also fold in any manually-entered course names on tracker rounds.
      const { data: manualRounds } = await supabase
        .from("tracker_event_rounds")
        .select("course_name, event_id")
        .in("event_id", Array.from(eventByRef.values()));
      for (const r of manualRounds ?? []) {
        const n = (r as { course_name: string | null }).course_name?.trim();
        if (n && !/^Default Layout/i.test(n)) scheduleCourseNames.add(n);
      }
      if (scheduleCourseNames.size) {
        const names = Array.from(scheduleCourseNames);
        // Match on the shared course key so we never fork a ghost copy of a
        // course that already lives in the library under a different spelling.
        const existingKeys = new Set<string>();
        for (const n of names) {
          const token = n
            .replace(/[^A-Za-z0-9 ]/g, " ")
            .split(/\s+/)
            .filter((w) => w.length > 3)[0];
          if (!token) continue;
          const { data: candidates } = await supabase
            .from("courses")
            .select("name")
            .ilike("name", `%${token}%`)
            .limit(50);
          for (const c of candidates ?? []) {
            existingKeys.add(courseMatchKey((c as { name: string }).name));
          }
        }
        const toCreate = names
          .filter((n) => !existingKeys.has(courseMatchKey(n)))
          .map((n) => ({
            name: n,
            slug: `ghost-${n
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")}-${Math.random().toString(36).slice(2, 7)}`,
            hole_count: 18,
            created_by: userId,
            moderation_status: "approved" as const,
            is_ghost: true,
            source: "pdga",
          }));
        if (toCreate.length) {
          // Best-effort — ignore conflict on unique ghost-name index.
          await supabase.from("courses").insert(toCreate);
        }
      }
    }

    let teeTimesAdded = 0;
    let teeTimesUpdated = 0;
    let teeTimesWithdrawn = 0;
    let eventsWithdrawn = 0;
    const changeLogRows: Array<{
      group_id: string;
      event_id: string | null;
      member_id: string | null;
      field: string;
      from_value: string | null;
      to_value: string | null;
      severity: string;
      source: string;
    }> = [];
    const { data: existingTees } = await supabase
      .from("tracker_tee_times")
      .select(
        "id, event_id, member_id, tee_time, division, round_number, pool, starting_hole, status, source, manual_override",
      );
    type TeeRow = {
      id: string;
      event_id: string;
      member_id: string;
      tee_time: string | null;
      division: string | null;
      round_number: number | null;
      pool: string | null;
      starting_hole: string | null;
      status: string;
      source: string;
      manual_override: boolean;
    };
    const teeMap = new Map<string, TeeRow>();
    for (const t of (existingTees ?? []) as TeeRow[]) {
      teeMap.set(`${t.event_id}:${t.member_id}:${t.round_number ?? 0}`, t);
    }
    const membersByNum = new Map(memberRows.map((m) => [m.pdga_number, m]));
    const memberById = new Map(memberRows.map((m) => [m.id, m]));

    // Events belonging to this group and their pdga refs (needed for
    // withdrawal detection scoped to this refresh).
    const eventIdToRef = new Map<string, string>();
    for (const [ref, id] of eventByRef.entries()) eventIdToRef.set(id, ref);

    // Which (event, member, round) rows appeared in this scrape? Anything
    // previously scheduled but missing here is a candidate for withdrawal.
    const scrapedKeys = new Set<string>();
    const nowIso = new Date().toISOString();

    for (const ref of eventRefsAll) {
      const eventId = eventByRef.get(ref);
      if (!eventId) continue;
      const scrapedRows = teesByEvent.get(ref) ?? [];
      for (const s of scrapedRows) {
        const m = membersByNum.get(s.pdga_number);
        if (!m) continue;
        const roundKey = s.round_number ?? 0;
        const key = `${eventId}:${m.id}:${roundKey}`;
        scrapedKeys.add(key);
        const nextTee = canonicalTeeTime(s.tee_time);
        const nextDivision = s.division ?? m.default_division ?? null;
        const nextPool = s.pool ?? null;
        const nextHole = s.starting_hole ?? null;
        const existing = teeMap.get(key);
        if (!existing) {
          const { error } = await supabase.from("tracker_tee_times").insert({
            event_id: eventId,
            member_id: m.id,
            division: nextDivision,
            tee_time: nextTee,
            notes: null,
            round_number: s.round_number,
            pool: nextPool,
            starting_hole: nextHole,
            status: "scheduled",
            source: "pdga_sync",
            last_synced_at: nowIso,
          });
          if (!error) {
            teeTimesAdded += 1;
            changeLogRows.push({
              group_id: data.id,
              event_id: eventId,
              member_id: m.id,
              field: "tee_time_added",
              from_value: null,
              to_value: nextTee ?? nextDivision ?? "scheduled",
              severity: "info",
              source: "sync",
            });
          }
        } else {
          // Honor manual overrides: don't clobber user edits from the app.
          if (existing.manual_override) {
            await supabase
              .from("tracker_tee_times")
              .update({ last_synced_at: nowIso })
              .eq("id", existing.id);
            continue;
          }
          const patch: {
            last_synced_at: string;
            tee_time?: string | null;
            division?: string | null;
            pool?: string | null;
            starting_hole?: string | null;
            status?: string;
          } = { last_synced_at: nowIso };
          const diffs: Array<{ field: string; from: string | null; to: string | null }> = [];
          if (nextTee && nextTee !== existing.tee_time) {
            patch.tee_time = nextTee;
            diffs.push({ field: "tee_time", from: existing.tee_time, to: nextTee });
          }
          if (nextDivision && nextDivision !== existing.division) {
            patch.division = nextDivision;
            diffs.push({ field: "division", from: existing.division, to: nextDivision });
          }
          if (nextPool && nextPool !== existing.pool) {
            patch.pool = nextPool;
            diffs.push({ field: "pool", from: existing.pool, to: nextPool });
          }
          if (nextHole && nextHole !== existing.starting_hole) {
            patch.starting_hole = nextHole;
            diffs.push({ field: "starting_hole", from: existing.starting_hole, to: nextHole });
          }
          // Re-activate a previously withdrawn slot if the player re-registered.
          if (existing.status !== "scheduled") {
            patch.status = "scheduled";
            diffs.push({ field: "status", from: existing.status, to: "scheduled" });
          }
          const { error } = await supabase
            .from("tracker_tee_times")
            .update(patch)
            .eq("id", existing.id);
          if (!error && diffs.length) {
            teeTimesUpdated += 1;
            for (const d of diffs) {
              changeLogRows.push({
                group_id: data.id,
                event_id: eventId,
                member_id: m.id,
                field: d.field,
                from_value: d.from,
                to_value: d.to,
                severity: d.field === "status" ? "info" : "warning",
                source: "sync",
              });
            }
          }
        }
      }
    }

    // Event metadata used by both withdrawal passes below. Fetched once.
    const { data: eventsForCleanup } = await supabase
      .from("tracker_group_events")
      .select("id, pdga_event_ref, event_status, name, event_date")
      .eq("group_id", data.id);
    const eventDateById = new Map<string, string | null>(
      ((eventsForCleanup ?? []) as Array<{ id: string; event_date: string | null }>).map((e) => [
        e.id,
        e.event_date,
      ]),
    );
    const todayIso = new Date().toISOString().slice(0, 10);
    /** A player can't withdraw from a round that already happened. */
    const isPastEvent = (eventId: string) => {
      const d = eventDateById.get(eventId);
      return !!d && d <= todayIso;
    };
    /**
     * Events starting within the next 2 days churn on PDGA: they drop off
     * player "upcoming" lists and tee sheets get rebuilt round by round.
     * Treating that churn as a withdrawal produced false alerts.
     */
    const isImminentEvent = (eventId: string) => {
      const d = eventDateById.get(eventId);
      if (!d) return false;
      const days =
        (Date.parse(`${d}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86_400_000;
      return days <= 2;
    };

    // Any round scraped for this (event, member) at all — used to protect
    // legacy round-less rows from being read as a withdrawal just because the
    // tee sheet now reports numbered rounds.
    const scrapedEventMember = new Set<string>();
    for (const k of scrapedKeys) {
      const [eid, mid] = k.split(":");
      scrapedEventMember.add(`${eid}:${mid}`);
    }

    // Withdrawal detection. For each existing tee slot in this group where
    // sync data was authoritative (both the player's PDGA upcoming list AND
    // the event tee sheet were fetched successfully) and the player no longer
    // appears on the tee sheet AND the event is no longer in their upcoming
    // list, mark the slot withdrawn. Never touch manual overrides.
    for (const t of (existingTees ?? []) as TeeRow[]) {
      if (t.manual_override) continue;
      if (t.status === "withdrawn") continue;
      const ref = eventIdToRef.get(t.event_id);
      if (!ref) continue; // manually added event with no PDGA link
      // Past/played events fall off the PDGA "upcoming" list by design —
      // treating that as a withdrawal produced false alerts.
      if (isPastEvent(t.event_id)) continue;
      if (isImminentEvent(t.event_id)) continue;
      const key = `${t.event_id}:${t.member_id}:${t.round_number ?? 0}`;
      if (scrapedKeys.has(key)) continue;
      // The player appears somewhere on this event's tee sheet (another round,
      // pool, or the legacy round-less registration row) — still registered.
      if (scrapedEventMember.has(`${t.event_id}:${t.member_id}`)) continue;
      // An empty tee sheet means a partial/failed scrape, not that everyone
      // withdrew. Only trust a sheet that actually returned players.
      if ((teesByEvent.get(ref) ?? []).length === 0) continue;

      const m = memberById.get(t.member_id);
      if (!m) continue;
      const sheetOk = teeSheetOk.get(ref) === true;
      const upOk = upcomingOk.get(m.pdga_number) === true;
      if (!sheetOk || !upOk) continue; // don't withdraw on scrape failure

      const stillUpcoming = (perMember.get(m.pdga_number) ?? []).some((e) => e.event_ref === ref);
      if (stillUpcoming) continue; // player still registered, just no assigned tee
      const { error } = await supabase
        .from("tracker_tee_times")
        .update({ status: "withdrawn", last_synced_at: nowIso })
        .eq("id", t.id);
      if (!error) {
        teeTimesWithdrawn += 1;
        changeLogRows.push({
          group_id: data.id,
          event_id: t.event_id,
          member_id: t.member_id,
          field: "status",
          from_value: t.status,
          to_value: "withdrawn",
          severity: "warning",
          source: "sync",
        });
      }
    }

    // Event-level cleanup: if a PDGA-linked event has no member with an
    // active tee slot AND no member has it in their upcoming list, mark the
    // event withdrawn so it drops out of the active schedule (but stays
    // visible in history / change log). Skip when we couldn't reach PDGA.
    for (const e of (eventsForCleanup ?? []) as Array<{
      id: string;
      pdga_event_ref: string | null;
      event_status: string | null;
      name: string;
    }>) {
      const ref = e.pdga_event_ref;
      if (!ref) continue;
      if (e.event_status === "withdrawn") continue;
      if (isPastEvent(e.id)) continue;
      if (isImminentEvent(e.id)) continue;
      if (teeSheetOk.get(ref) !== true) continue;
      if ((teesByEvent.get(ref) ?? []).length === 0) continue;

      const anyMemberUpcoming = memberRows.some(
        (m) =>
          upcomingOk.get(m.pdga_number) === true &&
          (perMember.get(m.pdga_number) ?? []).some((u) => u.event_ref === ref),
      );
      if (anyMemberUpcoming) continue;

      const { data: liveSlots } = await supabase
        .from("tracker_tee_times")
        .select("id")
        .eq("event_id", e.id)
        .neq("status", "withdrawn")
        .limit(1);
      if ((liveSlots ?? []).length > 0) continue;
      const { error } = await supabase
        .from("tracker_group_events")
        .update({ event_status: "withdrawn", last_synced_at: nowIso })
        .eq("id", e.id);
      if (!error) {
        eventsWithdrawn += 1;
        changeLogRows.push({
          group_id: data.id,
          event_id: e.id,
          member_id: null,
          field: "event_status",
          from_value: e.event_status,
          to_value: "withdrawn",
          severity: "warning",
          source: "sync",
        });
      }
    }

    if (changeLogRows.length) {
      await supabase.from("tracker_change_log").insert(changeLogRows);
    }

    // Auto-pull live/completed round results for every event linked to a
    // PDGA tournament id. Best-effort — a scrape failure for one event
    // shouldn't block the rest of the sync.
    let liveEventsSynced = 0;
    let livePlayersSynced = 0;
    const eventsForLive = (eventsForCleanup ?? []).filter((e) => !!e.pdga_event_ref);
    for (const e of eventsForLive) {
      try {
        const res = await refreshTrackerEventLive({ data: { eventId: e.id } });
        if (res?.ok) {
          liveEventsSynced += 1;
          livePlayersSynced += res.players ?? 0;
        }
      } catch {
        /* best effort */
      }
    }

    return {
      refreshed: results.filter((r) => r.ok).length,
      total: numbers.length,
      results,
      eventsAdded,
      teeTimesAdded,
      teeTimesUpdated,
      teeTimesWithdrawn,
      eventsWithdrawn,
      roundsAdded,
      liveEventsSynced,
      livePlayersSynced,
    };
  });

/**
 * Lightweight list of the viewer's trackers (id + name only) for pickers that
 * let a player be added to any tracker without loading full roster stats.
 */
export const listTrackerGroupOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("tracker_groups")
      .select("id, name, is_all_time, trip_start, trip_end")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    type Option = {
      id: string;
      name: string;
      is_all_time: boolean;
      trip_start: string | null;
      trip_end: string | null;
    };
    // The auto-provisioned "My Tracker" watchlist is the Event Tracker, not a
    // crew, so it stays out of crew pickers exactly like the Trackers page.
    const rows = ((data ?? []) as Option[]).filter(
      (g) => !/^my tracker$/i.test((g.name ?? "").trim()),
    );
    // Forever crew first, then temporary crews in the order they were created.
    return [...rows].sort((a, b) => Number(b.is_all_time) - Number(a.is_all_time));
  });
