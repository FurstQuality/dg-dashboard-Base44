/**
 * Unified events read layer. `pdga_tour_events` is the canonical event registry.
 * Everything else (tracker imports, tournaments, tee times) links to it by
 * PDGA event ref. These server fns are the single source of truth read path
 * for the events browser + event detail pages.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  parseEventPageInfo,
  parseEventTeeTimes,
  parseEventSchedule,
} from "@/lib/pdga-lab.functions";

/* ---------------------------------- Types --------------------------------- */

export type UnifiedEventRow = {
  event_ref: string; // pdga_event_id
  name: string;
  url: string | null;
  tier: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  crew_count: number; // distinct tracker members with tee times
  group_count: number; // tracker groups that have this event
  divisions: string[]; // divisions any tracker member is registered under
  tournament_id: string | null; // in-app tournament linked to this ref, if any
  tournament_slug: string | null;
};

export type EventRosterRow = {
  pdga_number: string;
  name: string | null;
  division: string | null;
  tee_time: string | null;
  current_rating: number | null;
  is_me: boolean;
  in_crew: boolean;
  crew_display_name: string | null;
  crew_group_id: string | null;
  crew_group_name: string | null;
  crew_member_id: string | null;
  crew_color: string | null;
  rounds: Array<{
    round_number: number | null;
    tee_time: string | null;
    pool: string | null;
    starting_hole: string | null;
    division: string | null;
  }>;
};

export type EventScheduleRow = {
  round_number: number;
  division: string;
  course_name: string | null;
  course_layout: string | null;
};

export type EventCrewFinish = {
  pdga_number: string;
  name: string | null;
  crew_display_name: string | null;
  crew_color: string | null;
  division: string | null;
  place: number | null;
  points: number | null;
};

export type EventBundle = {
  event_ref: string;
  info: {
    name: string | null;
    url: string;
    tier: string | null;
    start_date: string | null;
    end_date: string | null;
    location: string | null;
    city: string | null;
    state: string | null;
    registration_url: string | null;
    registration_status: string | null;
    sanctioning: string | null;
  };
  divisions: string[];
  schedule: EventScheduleRow[];
  roster: EventRosterRow[];
  crew: EventRosterRow[];
  crew_finishes: EventCrewFinish[];
  me: EventRosterRow | null;
  tournament: { id: string; slug: string; name: string } | null;
  refreshed_at: string | null;
};

/* -------------------------------- Helpers -------------------------------- */

async function upsertPdgaTourEvent(eventRef: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Scrape event page + tee times (best-effort).
  const res = await fetch(`https://www.pdga.com/tour/event/${eventRef}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const info = parseEventPageInfo(html, eventRef);

  // Split location into city/state when possible ("Eureka, IL").
  let city: string | null = null;
  let state: string | null = null;
  if (info.location) {
    const m = info.location.match(/^([^,]+),\s*([A-Z]{2})/);
    if (m) {
      city = m[1].trim();
      state = m[2].trim();
    }
  }

  const row = {
    pdga_event_id: eventRef,
    name: info.name ?? `PDGA event ${eventRef}`,
    url: info.url,
    start_date: info.start_date,
    end_date: info.end_date,
    tier: info.tier,
    sanctioning: null,
    city,
    state,
    country: null,
    location: info.location,
    registration_url: null,
    registration_status: null,
    source: "pdga",
    raw: null,
    refreshed_at: new Date().toISOString(),
  };
  await supabaseAdmin
    .from("pdga_tour_events")
    .upsert(row as never, { onConflict: "pdga_event_id" });
  return row;
}

/* ---------------------------- List unified events --------------------------- */

export const listUnifiedEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        q: z.string().max(200).optional().nullable(),
        tier: z.array(z.string()).optional().nullable(),
        division: z.array(z.string()).optional().nullable(),
        dateFrom: z.string().optional().nullable(),
        dateTo: z.string().optional().nullable(),
        hasCrew: z.boolean().optional().nullable(),
        sort: z.enum(["date", "tier", "name"]).optional().nullable(),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }): Promise<UnifiedEventRow[]> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) All tracker groups the user owns → their events with PDGA refs.
    const { data: myGroups } = await supabase
      .from("tracker_groups")
      .select("id, name")
      .eq("owner_id", userId);
    const groupIds = (myGroups ?? []).map((g) => g.id);
    let trackerEvents: Array<{
      group_id: string;
      pdga_event_ref: string | null;
      name: string;
      event_date: string | null;
      location: string | null;
      tier: string | null;
      url: string | null;
      id: string;
    }> = [];
    if (groupIds.length) {
      const { data } = await supabase
        .from("tracker_group_events")
        .select("id, group_id, pdga_event_ref, name, event_date, location, tier, url")
        .in("group_id", groupIds);
      trackerEvents = (data ?? []) as typeof trackerEvents;
    }

    // 2) Distinct refs we care about (only PDGA-linked ones surface here).
    const refs = Array.from(
      new Set(trackerEvents.map((e) => e.pdga_event_ref).filter(Boolean) as string[]),
    );

    // 3) Canonical rows from pdga_tour_events (upsert missing ones on-demand best-effort? skip — only show what we know).
    const tourByRef = new Map<
      string,
      {
        pdga_event_id: string;
        name: string;
        url: string | null;
        tier: string | null;
        start_date: string | null;
        end_date: string | null;
        location: string | null;
        city: string | null;
        state: string | null;
      }
    >();
    if (refs.length) {
      const { data: tourRows } = await supabaseAdmin
        .from("pdga_tour_events")
        .select("pdga_event_id, name, url, tier, start_date, end_date, location, city, state")
        .in("pdga_event_id", refs);
      for (const r of tourRows ?? []) tourByRef.set(r.pdga_event_id as string, r as never);
    }

    // 4) Tee time / division / crew rollup keyed by ref.
    const eventIdToRef = new Map<string, string>();
    for (const e of trackerEvents) if (e.pdga_event_ref) eventIdToRef.set(e.id, e.pdga_event_ref);
    const eventIds = trackerEvents.map((e) => e.id);
    type Tee = {
      event_id: string;
      member_id: string;
      division: string | null;
      tee_time: string | null;
    };
    let tees: Tee[] = [];
    if (eventIds.length) {
      const { data } = await supabase
        .from("tracker_tee_times")
        .select("event_id, member_id, division, tee_time")
        .in("event_id", eventIds);
      tees = (data ?? []) as Tee[];
    }
    const crewByRef = new Map<string, Set<string>>();
    const divisionsByRef = new Map<string, Set<string>>();
    const groupsByRef = new Map<string, Set<string>>();
    for (const t of tees) {
      const ref = eventIdToRef.get(t.event_id);
      if (!ref) continue;
      if (!crewByRef.has(ref)) crewByRef.set(ref, new Set());
      crewByRef.get(ref)!.add(t.member_id);
      if (t.division) {
        if (!divisionsByRef.has(ref)) divisionsByRef.set(ref, new Set());
        divisionsByRef.get(ref)!.add(t.division);
      }
    }
    for (const e of trackerEvents) {
      if (!e.pdga_event_ref) continue;
      if (!groupsByRef.has(e.pdga_event_ref)) groupsByRef.set(e.pdga_event_ref, new Set());
      groupsByRef.get(e.pdga_event_ref)!.add(e.group_id);
    }

    // 5) In-app tournaments referencing these refs.
    const tournamentByRef = new Map<string, { id: string; slug: string }>();
    if (refs.length) {
      const { data: tRows } = await supabase
        .from("tournaments")
        .select("id, slug, pdga_event_number")
        .in("pdga_event_number", refs);
      for (const r of tRows ?? [])
        if (r.pdga_event_number)
          tournamentByRef.set(String(r.pdga_event_number), {
            id: r.id as string,
            slug: r.slug as string,
          });
    }

    // Also include in-app tournaments the user owns that reference a PDGA ref not yet in tracker.
    const { data: ownedT } = await supabase
      .from("tournaments")
      .select("id, slug, name, pdga_event_number, pdga_tier, start_date, end_date, location")
      .eq("owner_id", userId)
      .not("pdga_event_number", "is", null);
    const extraRefs: string[] = [];
    for (const r of ownedT ?? []) {
      const ref = String(r.pdga_event_number);
      if (!refs.includes(ref) && ref) extraRefs.push(ref);
      if (ref) tournamentByRef.set(ref, { id: r.id as string, slug: r.slug as string });
    }
    if (extraRefs.length) {
      const { data: tourRows } = await supabaseAdmin
        .from("pdga_tour_events")
        .select("pdga_event_id, name, url, tier, start_date, end_date, location, city, state")
        .in("pdga_event_id", extraRefs);
      for (const r of tourRows ?? []) tourByRef.set(r.pdga_event_id as string, r as never);
    }
    const allRefs = Array.from(new Set([...refs, ...extraRefs]));

    // 6) Build rows.
    let rows: UnifiedEventRow[] = allRefs.map((ref) => {
      const canon = tourByRef.get(ref);
      // Fallback to tracker metadata if canonical row missing.
      const fromTracker = trackerEvents.find((e) => e.pdga_event_ref === ref);
      const tourn = tournamentByRef.get(ref) ?? null;
      const nameFallback = canon?.name ?? fromTracker?.name ?? `PDGA event ${ref}`;
      const urlFallback =
        canon?.url ?? fromTracker?.url ?? `https://www.pdga.com/tour/event/${ref}`;
      const tierFallback = canon?.tier ?? fromTracker?.tier ?? null;
      const startFallback = canon?.start_date ?? fromTracker?.event_date ?? null;
      const endFallback = canon?.end_date ?? fromTracker?.event_date ?? null;
      const locFallback = canon?.location ?? fromTracker?.location ?? null;
      return {
        event_ref: ref,
        name: nameFallback,
        url: urlFallback,
        tier: tierFallback,
        start_date: startFallback,
        end_date: endFallback,
        location: locFallback,
        city: canon?.city ?? null,
        state: canon?.state ?? null,
        crew_count: crewByRef.get(ref)?.size ?? 0,
        group_count: groupsByRef.get(ref)?.size ?? 0,
        divisions: Array.from(divisionsByRef.get(ref) ?? []).sort(),
        tournament_id: tourn?.id ?? null,
        tournament_slug: tourn?.slug ?? null,
      };
    });

    // 7) Filter
    const q = (data.q ?? "").trim().toLowerCase();
    if (q)
      rows = rows.filter(
        (r) =>
          (r.name?.toLowerCase().includes(q) ?? false) ||
          (r.location?.toLowerCase().includes(q) ?? false) ||
          r.event_ref.includes(q),
      );
    if (data.tier?.length)
      rows = rows.filter(
        (r) =>
          r.tier && data.tier!.some((t) => (r.tier ?? "").toLowerCase().includes(t.toLowerCase())),
      );
    if (data.division?.length)
      rows = rows.filter((r) => r.divisions.some((d) => data.division!.includes(d)));
    if (data.dateFrom) rows = rows.filter((r) => !r.start_date || r.start_date >= data.dateFrom!);
    if (data.dateTo) rows = rows.filter((r) => !r.start_date || r.start_date <= data.dateTo!);
    if (data.hasCrew) rows = rows.filter((r) => r.crew_count > 0);

    // 8) Sort
    const sort = data.sort ?? "date";
    rows.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "tier")
        return (
          (a.tier ?? "z").localeCompare(b.tier ?? "z") ||
          (a.start_date ?? "9").localeCompare(b.start_date ?? "9")
        );
      return (a.start_date ?? "9").localeCompare(b.start_date ?? "9");
    });

    return rows;
  });

/* --------------------------- Event detail bundle -------------------------- */

export const getPdgaEventBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        eventRef: z.string().regex(/^\d{1,9}$/),
        refresh: z.boolean().optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }): Promise<EventBundle> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ref = data.eventRef;

    // 1) Canonical row — upsert if missing or refresh requested.
    const CANON_COLS =
      "pdga_event_id, name, url, tier, start_date, end_date, location, city, state, registration_url, registration_status, sanctioning, refreshed_at";
    let { data: canon } = await supabaseAdmin
      .from("pdga_tour_events")
      .select(CANON_COLS)
      .eq("pdga_event_id", ref)
      .maybeSingle();
    if (!canon || data.refresh) {
      await upsertPdgaTourEvent(ref);
      const r = await supabaseAdmin
        .from("pdga_tour_events")
        .select(CANON_COLS)
        .eq("pdga_event_id", ref)
        .maybeSingle();
      canon = r.data ?? canon;
    }

    // 2) Full field/tee time list + per-division round schedule from PDGA (best-effort).
    let field: Array<{
      pdga_number: string;
      name: string | null;
      rating: number | null;
      division: string | null;
      tee_time: string | null;
      round_number: number | null;
      pool: string | null;
      starting_hole: string | null;
    }> = [];
    let schedule: EventScheduleRow[] = [];
    try {
      const res = await fetch(`https://www.pdga.com/tour/event/${ref}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (res.ok) {
        const html = await res.text();
        field = parseEventTeeTimes(html).map((t) => ({
          pdga_number: t.pdga_number,
          name: t.name ?? null,
          rating: t.rating ?? null,
          division: t.division,
          tee_time: t.tee_time,
          round_number: t.round_number,
          pool: t.pool,
          starting_hole: t.starting_hole,
        }));
        schedule = parseEventSchedule(html, ref);
      }
    } catch {
      /* best-effort */
    }

    // 3) Enrich with pdga_players ratings and pull cached finishes for this event.
    const nums = Array.from(new Set(field.map((f) => f.pdga_number).filter(Boolean)));
    const ratingByNum = new Map<string, number | null>();
    const canonicalNameByNum = new Map<string, string | null>();
    const finishesByNum = new Map<
      string,
      { place: number | null; points: number | null; division: string | null }
    >();
    if (nums.length) {
      const [{ data: pRows }, { data: eRows }, { data: fRows }] = await Promise.all([
        supabaseAdmin
          .from("pdga_players")
          .select("pdga_number, name, current_rating")
          .in("pdga_number", nums),
        supabaseAdmin
          .from("pdga_events")
          .select("pdga_number, place, points, division")
          .eq("event_ref", ref)
          .in("pdga_number", nums),
        // Cached roster scrape — carries name + rating for players we have no
        // pdga_players record for yet.
        supabaseAdmin
          .from("pdga_event_field")
          .select("pdga_number, name, rating")
          .eq("event_ref", ref)
          .in("pdga_number", nums),
      ]);
      for (const p of pRows ?? []) {
        ratingByNum.set(p.pdga_number as string, (p.current_rating as number | null) ?? null);
        canonicalNameByNum.set(p.pdga_number as string, (p.name as string | null) ?? null);
      }
      // Cached roster scrape fills the gaps for players with no pdga_players row.
      for (const f of fRows ?? []) {
        const num = f.pdga_number as string;
        const nm = (f.name as string | null) ?? null;
        const rt = f.rating != null ? Number(f.rating) : null;
        if (nm && !canonicalNameByNum.get(num)) canonicalNameByNum.set(num, nm);
        if (rt != null && ratingByNum.get(num) == null) ratingByNum.set(num, rt);
      }
      for (const e of eRows ?? []) {
        finishesByNum.set(e.pdga_number as string, {
          place: (e.place as number | null) ?? null,
          points: e.points != null ? Number(e.points) : null,
          division: (e.division as string | null) ?? null,
        });
      }
    }

    // 3b) Anyone still without a rating goes through the shared resolver, which
    // checks the other cached player tables and then reads the PDGA profile.
    const liveRatingByNum = new Map<string, number>();
    for (const f of field) {
      if (f.rating != null && liveRatingByNum.get(f.pdga_number) == null)
        liveRatingByNum.set(f.pdga_number, Number(f.rating));
    }
    const missingRating = nums.filter(
      (n) => ratingByNum.get(n) == null && liveRatingByNum.get(n) == null,
    );
    if (missingRating.length) {
      try {
        const { resolvePdgaRatings } = await import("@/lib/pdga-ratings.server");
        const resolved = await resolvePdgaRatings(missingRating, { eventRef: ref });
        for (const [num, value] of resolved) if (value != null) ratingByNum.set(num, value);
      } catch {
        /* a blank rating is better than a broken field list */
      }
    }

    // 4) Crew overlay — every tracker member the user owns whose PDGA # is in the field.
    const { data: myGroups } = await supabase
      .from("tracker_groups")
      .select("id, name")
      .eq("owner_id", userId);
    const groupIds = (myGroups ?? []).map((g) => g.id);
    const groupNameById = new Map((myGroups ?? []).map((g) => [g.id as string, g.name as string]));
    let myMembers: Array<{
      id: string;
      group_id: string;
      pdga_number: string;
      display_name: string | null;
      color: string | null;
      default_division: string | null;
    }> = [];
    if (groupIds.length) {
      const { data } = await supabase
        .from("tracker_group_members")
        .select("id, group_id, pdga_number, display_name, color, default_division")
        .in("group_id", groupIds);
      myMembers = (data ?? []) as typeof myMembers;
    }
    const memberByNum = new Map<string, (typeof myMembers)[number]>();
    for (const m of myMembers)
      if (!memberByNum.has(m.pdga_number)) memberByNum.set(m.pdga_number, m);

    // 4b) "Me" overlay
    const { data: myProfile } = await supabase
      .from("profiles")
      .select("pdga_number")
      .eq("id", userId)
      .maybeSingle();
    const myPdga = (myProfile as { pdga_number: string | number | null } | null)?.pdga_number;
    const myPdgaKey = myPdga != null ? String(myPdga).replace(/\D/g, "") : "";

    // Group field rows per player (one player has multiple round entries).
    type FieldRow = (typeof field)[number];
    const byPlayer = new Map<string, FieldRow[]>();
    for (const f of field) {
      const arr = byPlayer.get(f.pdga_number) ?? [];
      arr.push(f);
      byPlayer.set(f.pdga_number, arr);
    }

    const roster: EventRosterRow[] = Array.from(byPlayer.entries()).map(([num, rows]) => {
      const crew = memberByNum.get(num) ?? null;
      const isMe = !!myPdgaKey && num === myPdgaKey;
      // Prefer round 1 for the top-line tee time / division.
      const sortedRows = [...rows].sort((a, b) => (a.round_number ?? 99) - (b.round_number ?? 99));
      const primary = sortedRows[0];
      const divs = Array.from(new Set(rows.map((r) => r.division).filter(Boolean) as string[]));
      return {
        pdga_number: num,
        name: canonicalNameByNum.get(num) ?? sortedRows.find((r) => r.name)?.name ?? null,
        division: primary?.division ?? divs[0] ?? null,
        tee_time: primary?.tee_time ?? null,
        current_rating:
          ratingByNum.get(num) ?? sortedRows.find((r) => r.rating != null)?.rating ?? null,
        is_me: isMe,
        in_crew: !!crew,
        crew_display_name: crew?.display_name ?? null,
        crew_group_id: crew?.group_id ?? null,
        crew_group_name: crew ? (groupNameById.get(crew.group_id) ?? null) : null,
        crew_member_id: crew?.id ?? null,
        crew_color: crew?.color ?? null,
        rounds: sortedRows.map((r) => ({
          round_number: r.round_number,
          tee_time: r.tee_time,
          pool: r.pool,
          starting_hole: r.starting_hole,
          division: r.division,
        })),
      };
    });

    // Sort roster: me first, then crew, then by division / tee time / name.
    roster.sort((a, b) => {
      if (a.is_me !== b.is_me) return a.is_me ? -1 : 1;
      if (a.in_crew !== b.in_crew) return a.in_crew ? -1 : 1;
      const d = (a.division ?? "z").localeCompare(b.division ?? "z");
      if (d) return d;
      const t = (a.tee_time ?? "z").localeCompare(b.tee_time ?? "z");
      if (t) return t;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

    const crew = roster.filter((r) => r.in_crew && !r.is_me);
    const me = roster.find((r) => r.is_me) ?? null;
    const divisions = Array.from(
      new Set(roster.flatMap((r) => r.rounds.map((rd) => rd.division)).filter(Boolean) as string[]),
    ).sort();

    // Crew finishes for this event — sorted by place asc, null last.
    const crew_finishes: EventCrewFinish[] = [me, ...crew]
      .filter((c): c is EventRosterRow => !!c)
      .map((c) => {
        const f = finishesByNum.get(c.pdga_number);
        if (!f) return null;
        return {
          pdga_number: c.pdga_number,
          name: c.name,
          crew_display_name: c.is_me ? "You" : c.crew_display_name,
          crew_color: c.crew_color,
          division: f.division ?? c.division,
          place: f.place,
          points: f.points,
        } as EventCrewFinish;
      })
      .filter((x): x is EventCrewFinish => !!x)
      .sort((a, b) => {
        if (a.place == null && b.place == null) return 0;
        if (a.place == null) return 1;
        if (b.place == null) return -1;
        return a.place - b.place;
      });

    // 5) Linked in-app tournament.
    const { data: t } = await supabase
      .from("tournaments")
      .select("id, slug, name")
      .eq("pdga_event_number", ref)
      .limit(1)
      .maybeSingle();

    return {
      event_ref: ref,
      info: {
        name: canon?.name ?? null,
        url: canon?.url ?? `https://www.pdga.com/tour/event/${ref}`,
        tier: canon?.tier ?? null,
        start_date: canon?.start_date ?? null,
        end_date: canon?.end_date ?? null,
        location: canon?.location ?? null,
        city: canon?.city ?? null,
        state: canon?.state ?? null,
        registration_url:
          (canon as { registration_url?: string | null } | null)?.registration_url ?? null,
        registration_status:
          (canon as { registration_status?: string | null } | null)?.registration_status ?? null,
        sanctioning: (canon as { sanctioning?: string | null } | null)?.sanctioning ?? null,
      },
      divisions,
      schedule,
      roster,
      crew,
      crew_finishes,
      me,
      tournament: t ? { id: t.id as string, slug: t.slug as string, name: t.name as string } : null,
      refreshed_at: canon?.refreshed_at ?? null,
    };
  });
