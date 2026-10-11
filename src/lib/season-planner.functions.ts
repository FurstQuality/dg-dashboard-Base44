import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { firecrawlConnection } from "@/lib/firecrawl-connection.server";

/* ----------------------------- PDGA Tour scrape --------------------------- */

const PDGA_CACHE_MS = 6 * 60 * 60 * 1000; // 6h

function normDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (isNaN(d.getTime())) return null;
  const yr = d.getUTCFullYear();
  if (yr < 2000 || yr > new Date().getUTCFullYear() + 3) return null;
  return d.toISOString().slice(0, 10);
}

async function firecrawlScrapeEvents(url: string): Promise<any[]> {
  const connection = firecrawlConnection();
  if (!connection) throw new Error("Configure a direct FIRECRAWL_API_KEY on the app server.");

  const schema = {
    type: "object",
    properties: {
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            pdga_event_id: {
              type: "string",
              description: "PDGA event id (numeric) from the event URL if present",
            },
            name: { type: "string" },
            url: { type: "string" },
            start_date: { type: "string", description: "ISO date YYYY-MM-DD" },
            end_date: { type: "string", description: "ISO date YYYY-MM-DD" },
            tier: { type: "string", description: "PDGA tier (M, A, B, C, XM, XA, XB, XC, League)" },
            sanctioning: { type: "string" },
            city: { type: "string" },
            state: { type: "string" },
            country: { type: "string" },
            location: { type: "string" },
            registration_url: { type: "string" },
            registration_status: { type: "string", description: "e.g. Open, Waitlist, Closed" },
          },
          required: ["name"],
        },
      },
    },
    required: ["events"],
  };

  const res = await fetch(`${connection.baseUrl}/scrape`, {
    method: "POST",
    headers: connection.headers,
    body: JSON.stringify({
      url,
      onlyMainContent: true,
      waitFor: 1500,
      formats: [
        {
          type: "json",
          schema,
          prompt:
            "Extract every disc golf tournament / event listed on the page. Return one entry per event with dates, tier, city/state/country, and any registration link.",
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firecrawl ${res.status}: ${body.slice(0, 240)}`);
  }
  const json = await res.json();
  const payload = json?.data ?? json;
  const raw = payload?.json?.events ?? payload?.extract?.events ?? [];
  return Array.isArray(raw) ? raw : [];
}

/** Scrape PDGA public tour search (cached 6h) and upsert into pdga_tour_events. */
export const refreshPdgaTourEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        country: z.string().default("United States"),
        year: z.number().int().min(2000).max(2100).optional(),
        force: z.boolean().optional(),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const year = data.year ?? new Date().getUTCFullYear();

    if (!data.force) {
      const { data: recent } = await supabaseAdmin
        .from("pdga_tour_events")
        .select("refreshed_at")
        .order("refreshed_at", { ascending: false })
        .limit(1);
      const last = recent?.[0]?.refreshed_at
        ? new Date(recent[0].refreshed_at as string).getTime()
        : 0;
      if (Date.now() - last < PDGA_CACHE_MS) return { refreshed: false, cached: true, count: 0 };
    }

    // Primary path: read pdga.com/tour/search HTML directly (server-rendered).
    const { scrapePdgaTourEvents } = await import("@/lib/pdga-tour-scrape.server");
    const now = new Date().toISOString();
    let rows: Array<Record<string, unknown>> = [];
    let scrapeError: string | null = null;

    try {
      const direct = await scrapePdgaTourEvents({ year });
      rows = direct.map((e) => ({
        pdga_event_id: e.pdga_event_id,
        name: e.name,
        url: e.url,
        start_date: e.start_date,
        end_date: e.end_date ?? e.start_date,
        tier: e.tier,
        sanctioning: e.sanctioning,
        city: e.city,
        state: e.state,
        country: e.country ?? data.country,
        location: e.location,
        source: "pdga",
        raw: e,
        refreshed_at: now,
      }));
    } catch (e) {
      scrapeError = e instanceof Error ? e.message : "scrape failed";
    }

    // Fallback: vendor extraction, in case the PDGA markup changes.
    if (!rows.length) {
      const url = `https://www.pdga.com/tour/search?year=${year}`;
      let items: any[] = [];
      try {
        items = await firecrawlScrapeEvents(url);
      } catch (e) {
        return {
          refreshed: false,
          error: scrapeError ?? (e instanceof Error ? e.message : "scrape failed"),
          count: 0,
        };
      }

      rows = items
        .map((it) => {
          const eventUrl: string | null = it.url ?? null;
          let eid: string | null = it.pdga_event_id ?? null;
          if (!eid && eventUrl) {
            const m =
              String(eventUrl).match(/(?:event|tour\/event)\/(\d+)/i) ??
              String(eventUrl).match(/(\d{4,7})/);
            if (m) eid = m[1];
          }
          return {
            pdga_event_id: eid,
            name: String(it.name ?? "").trim(),
            url: eventUrl,
            start_date: normDate(it.start_date),
            end_date: normDate(it.end_date) ?? normDate(it.start_date),
            tier: it.tier ?? null,
            sanctioning: it.sanctioning ?? null,
            city: it.city ?? null,
            state: it.state ?? null,
            country: it.country ?? data.country,
            location:
              it.location ?? ([it.city, it.state, it.country].filter(Boolean).join(", ") || null),
            registration_url: it.registration_url ?? null,
            registration_status: it.registration_status ?? null,
            source: "pdga",
            raw: it,
            refreshed_at: now,
          };
        })
        .filter((r) => r.name && r.pdga_event_id);
    }

    // Live upcoming feed (pdga.com/tour/events/upcoming). Its map markers carry
    // real coordinates, so it both fills gaps in the search crawl and pins
    // every upcoming event on the map.
    let upcomingCount = 0;
    let upcomingError: string | null = null;
    try {
      const { scrapePdgaUpcomingEvents } = await import("@/lib/pdga-tour-scrape.server");
      const upcoming = await scrapePdgaUpcomingEvents();
      upcomingCount = upcoming.length;
      const byId = new Map(rows.map((r) => [String(r.pdga_event_id), r]));
      for (const e of upcoming) {
        const existing = byId.get(e.pdga_event_id);
        if (existing) {
          existing.latitude = e.latitude;
          existing.longitude = e.longitude;
          if (!existing.tier) existing.tier = e.tier;
          if (!existing.sanctioning) existing.sanctioning = e.tier_label;
          if (!existing.start_date) existing.start_date = e.start_date;
          if (!existing.end_date) existing.end_date = e.end_date;
          continue;
        }
        const row: Record<string, unknown> = {
          pdga_event_id: e.pdga_event_id,
          name: e.name,
          url: e.url,
          start_date: e.start_date,
          end_date: e.end_date ?? e.start_date,
          tier: e.tier,
          sanctioning: e.tier_label,
          latitude: e.latitude,
          longitude: e.longitude,
          country: data.country,
          source: "pdga",
          raw: e,
          refreshed_at: now,
        };
        byId.set(e.pdga_event_id, row);
        rows.push(row);
      }

      // Mirror into the browsable directory so /events lists them too.
      if (upcoming.length) {
        const { persistDirectoryRows } = await import("@/lib/event-directory.server");
        await persistDirectoryRows({
          source: "pdga",
          scope: "upcoming",
          startedAt: now,
          rows: upcoming.map((e) => ({
            source: "pdga" as const,
            source_event_id: e.pdga_event_id,
            url: e.url,
            name: e.name,
            kind: (e.tier === "L" ? "league" : "tournament") as "tournament" | "league",
            tier: e.tier,
            sanctioning: e.tier_label,
            start_date: e.start_date,
            end_date: e.end_date,
            venue_name: null,
            city: null,
            state: null,
            country: null,
            latitude: e.latitude,
            longitude: e.longitude,
            registration_status: null,
            field_size: null,
            field_capacity: null,
            cover_url: null,
            pdga_event_ref: e.pdga_event_id,
            discovered_via: "pdga_upcoming",
          })),
        });
      }
    } catch (e) {
      upcomingError = e instanceof Error ? e.message : "upcoming feed failed";
    }

    if (rows.length) {
      await supabaseAdmin
        .from("pdga_tour_events")
        .upsert(rows as never, { onConflict: "pdga_event_id" });
    }
    return {
      refreshed: true,
      cached: false,
      count: rows.length,
      upcoming: upcomingCount,
      error: scrapeError ?? upcomingError,
    };
  });

/** Read cached PDGA tour events. */
export const listPdgaTourEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        country: z.string().optional(),
        state: z.string().optional(),
        tier: z.string().optional(),
        /** Tournaments exclude PDGA league tier "L"; leagues show only it. */
        kind: z.enum(["all", "tournaments", "leagues"]).default("all"),
        search: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(80),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date().toISOString().slice(0, 10);
    let q = supabaseAdmin
      .from("pdga_tour_events")
      .select(
        "id, pdga_event_id, name, url, start_date, end_date, tier, sanctioning, city, state, country, location, registration_url, registration_status, refreshed_at",
      )
      .gte("end_date", today)
      .order("start_date", { ascending: true })
      .limit(data.limit);
    if (data.country) q = q.ilike("country", `%${data.country}%`);
    if (data.state) q = q.ilike("state", `%${data.state}%`);
    if (data.tier) q = q.ilike("tier", `%${data.tier}%`);
    if (data.kind === "tournaments") q = q.or("tier.is.null,tier.neq.L");
    if (data.kind === "leagues") q = q.eq("tier", "L");
    if (data.search)
      q = q.or(
        `name.ilike.%${data.search}%,location.ilike.%${data.search}%,city.ilike.%${data.search}%`,
      );

    const { data: events, error } = await q;
    if (error) return { events: [], error: error.message, refreshedAt: null as string | null };
    const refreshedAt = (events?.[0]?.refreshed_at as string | null) ?? null;
    return { events: events ?? [], error: null as string | null, refreshedAt };
  });

/* ---------------------------- Upcoming events ---------------------------- */

export const listUpcomingTournaments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date().toISOString().slice(0, 10);
    const { data: tournaments } = await supabaseAdmin
      .from("tournaments")
      .select(
        "id, name, slug, start_date, end_date, location, pdga_sanctioned, pdga_tier, status, max_players, entry_fee_cents, course_id, registration_opens, registration_closes",
      )
      .in("status", ["published", "registration_open", "registration_closed"])
      .gte("end_date", today)
      .order("start_date", { ascending: true })
      .limit(60);

    const ids = (tournaments ?? []).map((t) => t.id as string);
    if (!ids.length)
      return { tournaments: [], divisions: [], counts: {} as Record<string, number> };

    const [{ data: divisions }, { data: regs }] = await Promise.all([
      supabaseAdmin
        .from("tournament_divisions")
        .select("id, tournament_id, code, name, min_rating, max_rating, max_players")
        .in("tournament_id", ids),
      supabaseAdmin
        .from("tournament_registrations")
        .select("tournament_id")
        .in("tournament_id", ids),
    ]);

    const counts: Record<string, number> = {};
    for (const r of regs ?? [])
      counts[r.tournament_id as string] = (counts[r.tournament_id as string] ?? 0) + 1;

    return { tournaments: tournaments ?? [], divisions: divisions ?? [], counts };
  });

/* --------------------------- Field for an event -------------------------- */

export const getTournamentField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ tournamentId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Public metadata always OK to read (tournaments have their own RLS).
    const [{ data: tour }, { data: divs }] = await Promise.all([
      supabaseAdmin
        .from("tournaments")
        .select("id, name, slug, start_date, location, pdga_tier")
        .eq("id", data.tournamentId)
        .maybeSingle(),
      supabaseAdmin
        .from("tournament_divisions")
        .select("id, code, name, min_rating, max_rating")
        .eq("tournament_id", data.tournamentId),
    ]);

    // Roster + per-player identity is restricted to the tournament owner
    // (TD) or registrants themselves. Everyone else gets an empty roster.
    const { checkTournamentAccess } = await import("@/lib/tournament-access.server");
    const access = await checkTournamentAccess(supabase, userId, data.tournamentId);
    if (!access.allowed) {
      return { tournament: tour, divisions: divs ?? [], players: [] as Array<never> };
    }

    const { data: regs } = await supabaseAdmin
      .from("tournament_registrations")
      .select("id, division_id, user_id, pdga_number, status")
      .eq("tournament_id", data.tournamentId)
      .in("status", ["confirmed", "checked_in", "pending", "waitlist"]);

    const userIds = Array.from(new Set((regs ?? []).map((r) => r.user_id as string)));
    const { data: profiles } = userIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, display_name, username, avatar_url, pdga_number, pdga_rating")
          .in("id", userIds)
      : { data: [] as any[] };

    const byUser = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    const players = (regs ?? []).map((r: any) => {
      const p = byUser.get(r.user_id) || {};
      return {
        registration_id: r.id,
        division_id: r.division_id,
        status: r.status,
        display_name: p.display_name ?? "Player",
        username: p.username ?? null,
        avatar_url: p.avatar_url ?? null,
        pdga_number: r.pdga_number ?? p.pdga_number ?? null,
        pdga_rating: p.pdga_rating ?? null,
      };
    });

    return { tournament: tour, divisions: divs ?? [], players };
  });

/* --------------- Batch competitor analysis (PDGA scrape reuse) --------- */

export const analyzeField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({ pdgaNumbers: z.array(z.number().int().min(1).max(999_999_999)).max(150) })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const keys = Array.from(new Set(data.pdgaNumbers.map(String)));
    if (!keys.length) return { players: [] };

    // Prefer cache; only fresh-scrape missing/very stale rows
    const { data: cached } = await supabaseAdmin
      .from("pdga_players")
      .select("*")
      .in("pdga_number", keys);
    const cacheMap = new Map((cached ?? []).map((c: any) => [c.pdga_number as string, c]));

    const CACHE_MS = 24 * 60 * 60 * 1000;
    const stale: string[] = [];
    for (const k of keys) {
      const row = cacheMap.get(k);
      if (
        !row ||
        !row.refreshed_at ||
        Date.now() - new Date(row.refreshed_at as string).getTime() > CACHE_MS
      )
        stale.push(k);
    }

    // Best-effort scrape for stale — small concurrency
    async function scrapeOne(key: string) {
      try {
        const res = await fetch(`https://www.pdga.com/player/${key}`, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0)" },
        });
        if (!res.ok) return null;
        const html = await res.text();
        const rating =
          html.match(/Current Rating:?\s*<\/strong>\s*<[^>]*>\s*(\d{3,4})/i)?.[1] ??
          html.match(/PDGA Rating[^\d]{0,60}(\d{3,4})/i)?.[1] ??
          null;
        const name = html.match(/<h1[^>]*>\s*([^<(]+?)\s*(?:#\d+)?\s*<\/h1>/i)?.[1]?.trim() ?? null;
        const location =
          html.match(/Location:?\s*<\/strong>\s*<[^>]*>\s*([^<]+)/i)?.[1]?.trim() ?? null;
        const classification =
          html.match(/Classification:?\s*<\/strong>\s*<[^>]*>\s*([^<]+)/i)?.[1]?.trim() ?? null;
        const stdDev =
          html.match(/Rating Round Standard Deviation:?\s*<\/strong>\s*([\d.]+)/i)?.[1] ?? null;
        const roundsUsed = html.match(/Ratings? Rounds? Used[^\d]{0,20}(\d+)/i)?.[1] ?? null;
        const row = {
          pdga_number: key,
          name,
          location,
          classification,
          current_rating: rating ? parseInt(rating, 10) : null,
          rounds_used: roundsUsed ? parseInt(roundsUsed, 10) : null,
          std_dev: stdDev ? Number(stdDev) : null,
          drop_below: null,
          last_changed: null,
          next_update: null,
          raw: { url: `https://www.pdga.com/player/${key}` },
          refreshed_at: new Date().toISOString(),
        };
        await supabaseAdmin.from("pdga_players").upsert(row as never);
        return row;
      } catch {
        return null;
      }
    }

    const CONCURRENCY = 5;
    for (let i = 0; i < stale.length; i += CONCURRENCY) {
      const chunk = stale.slice(i, i + CONCURRENCY);
      const results = await Promise.all(chunk.map(scrapeOne));
      results.forEach((r, idx) => {
        if (r) cacheMap.set(chunk[idx], r);
      });
    }

    const players = keys.map((k) => {
      const p: any = cacheMap.get(k);
      return p
        ? {
            pdga_number: k,
            name: p.name,
            location: p.location,
            classification: p.classification,
            current_rating: p.current_rating,
            rounds_used: p.rounds_used,
            std_dev: p.std_dev,
          }
        : {
            pdga_number: k,
            name: null,
            location: null,
            classification: null,
            current_rating: null,
            rounds_used: null,
            std_dev: null,
          };
    });

    return { players };
  });

/* ------------------------- Nearby PDGA tour events ------------------------ */

/**
 * Default discovery radius for the tracker's "Find events" tab. PDGA rows only
 * carry city/state, so coordinates are geocoded once and cached on the row.
 */
export const NEARBY_EVENT_RADIUS_MILES = 100;

/** Serializable row shape returned by the nearby-event lookup. */
export type NearbyEventRow = {
  id: string;
  pdga_event_id: string | null;
  name: string;
  url: string | null;
  start_date: string | null;
  end_date: string | null;
  tier: string | null;
  sanctioning: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  location: string | null;
  registration_url: string | null;
  registration_status: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceMiles: number | null;
};

export const listNearbyPdgaTourEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        /** Free-text place (city, "City, ST", or ZIP) to search around. */
        near: z.string().max(120).optional(),
        radius_miles: z.number().int().min(10).max(1000).default(NEARBY_EVENT_RADIUS_MILES),
        /** Tournaments exclude PDGA league tier "L"; leagues show only it. */
        kind: z.enum(["all", "tournaments", "leagues"]).default("all"),
        limit: z.number().int().min(1).max(200).default(80),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { haversineMiles } = await import("@/lib/play-geo");
    const { geocodePlace } = await import("@/lib/geocode.server");

    // Origin: explicit device coordinates win, then a typed place, then the
    // saved profile location.
    let origin: { lat: number; lng: number } | null =
      data.latitude != null && data.longitude != null
        ? { lat: data.latitude, lng: data.longitude }
        : null;
    let originLabel: string | null = origin ? "your current location" : null;

    const typed = data.near?.trim();
    if (!origin && typed && typed.length >= 2) {
      const hit = await geocodePlace(typed);
      if (hit) {
        origin = { lat: hit.latitude, lng: hit.longitude };
        originLabel = hit.name ?? typed;
      }
    }

    if (!origin) {
      const { data: profile } = await context.supabase
        .from("profiles")
        .select("location, home_state")
        .eq("id", context.userId)
        .maybeSingle();
      const city = (profile?.location as string | null)?.trim() || null;
      const state = (profile?.home_state as string | null)?.trim() || null;
      // Pair the saved city with the home state so a bare "Valparaiso" resolves
      // to Indiana rather than a same-named city overseas.
      const query = city && state && !city.includes(",") ? `${city}, ${state}` : city || state;
      if (query) {
        const hit = await geocodePlace(query);
        if (hit) {
          origin = { lat: hit.latitude, lng: hit.longitude };
          originLabel = hit.name ?? query;
        }
      }
    }

    const today = new Date().toISOString().slice(0, 10);

    // Keep the PDGA mirror fresh: if the newest upcoming row is older than the
    // cache window (or there are none), pull the live schedule before reading.
    const { data: freshness, count: upcomingCount } = await supabaseAdmin
      .from("pdga_tour_events")
      .select("refreshed_at", { count: "exact" })
      .gte("end_date", today)
      .order("refreshed_at", { ascending: false })
      .limit(1);
    const lastRefresh = freshness?.[0]?.refreshed_at
      ? new Date(freshness[0].refreshed_at as string).getTime()
      : 0;
    const thinMirror = (upcomingCount ?? 0) < 60;
    if (thinMirror || Date.now() - lastRefresh > PDGA_CACHE_MS) {
      try {
        const { scrapePdgaTourEvents } = await import("@/lib/pdga-tour-scrape.server");
        const stamp = new Date().toISOString();
        const scraped = await scrapePdgaTourEvents({});
        if (scraped.length) {
          await supabaseAdmin.from("pdga_tour_events").upsert(
            scraped.map((e) => ({
              pdga_event_id: e.pdga_event_id,
              name: e.name,
              url: e.url,
              start_date: e.start_date,
              end_date: e.end_date ?? e.start_date,
              tier: e.tier,
              sanctioning: e.sanctioning,
              city: e.city,
              state: e.state,
              country: e.country,
              location: e.location,
              source: "pdga",
              raw: e,
              refreshed_at: stamp,
            })) as never,
            { onConflict: "pdga_event_id" },
          );
        }
      } catch {
        // Fall through to whatever is already mirrored.
      }
    }

    // Pull a wide window of upcoming events; the radius filter below narrows it.
    let rowQuery = supabaseAdmin
      .from("pdga_tour_events")
      .select(
        "id, pdga_event_id, name, url, start_date, end_date, tier, sanctioning, city, state, country, location, registration_url, registration_status, refreshed_at, latitude, longitude",
      )
      .gte("end_date", today);
    if (data.kind === "tournaments") rowQuery = rowQuery.or("tier.is.null,tier.neq.L");
    if (data.kind === "leagues") rowQuery = rowQuery.eq("tier", "L");
    const { data: rows, error } = await rowQuery
      .order("start_date", { ascending: true })
      .limit(origin ? 500 : data.limit);

    if (error)
      return {
        events: [] as NearbyEventRow[],
        error: error.message,
        refreshedAt: null as string | null,
        origin: null as null | { latitude: number; longitude: number; label: string | null },
        radiusMiles: data.radius_miles,
        withoutCoords: 0,
      };

    const refreshedAt = ((rows ?? [])[0]?.refreshed_at as string | null) ?? null;
    const events: NearbyEventRow[] = (rows ?? []).map((r) => {
      const e = r as Record<string, unknown>;
      return {
        id: e.id as string,
        pdga_event_id: (e.pdga_event_id as string | null) ?? null,
        name: (e.name as string) ?? "Untitled event",
        url: (e.url as string | null) ?? null,
        start_date: (e.start_date as string | null) ?? null,
        end_date: (e.end_date as string | null) ?? null,
        tier: (e.tier as string | null) ?? null,
        sanctioning: (e.sanctioning as string | null) ?? null,
        city: (e.city as string | null) ?? null,
        state: (e.state as string | null) ?? null,
        country: (e.country as string | null) ?? null,
        location: (e.location as string | null) ?? null,
        registration_url: (e.registration_url as string | null) ?? null,
        registration_status: (e.registration_status as string | null) ?? null,
        latitude: (e.latitude as number | null) ?? null,
        longitude: (e.longitude as number | null) ?? null,
        distanceMiles: null,
      };
    });

    if (!origin) {
      return {
        events,
        error: null as string | null,
        refreshedAt,
        origin: null as null | { latitude: number; longitude: number; label: string | null },
        radiusMiles: data.radius_miles,
        withoutCoords: 0,
      };
    }

    // Geocode any rows still missing coordinates, then cache them on the row so
    // this only ever happens once per venue.
    // Geocode by unique place so a full page of events costs only a handful of
    // lookups, then cache the result on every row that shares the place.
    const missing = events.filter((e) => e.latitude == null || e.longitude == null);
    const byPlace = new Map<string, NearbyEventRow[]>();
    for (const row of missing) {
      const place =
        [row.city, row.state, row.country].filter(Boolean).join(", ") || row.location || "";
      if (!place) continue;
      const list = byPlace.get(place) ?? [];
      list.push(row);
      byPlace.set(place, list);
    }
    for (const [place, group] of Array.from(byPlace.entries()).slice(0, 80)) {
      const hit = await geocodePlace(place);
      if (!hit) continue;
      const stamp = new Date().toISOString();
      for (const row of group) {
        row.latitude = hit.latitude;
        row.longitude = hit.longitude;
      }
      await supabaseAdmin
        .from("pdga_tour_events")
        .update({ latitude: hit.latitude, longitude: hit.longitude, enriched_at: stamp })
        .in(
          "id",
          group.map((r) => r.id),
        );
    }

    let withoutCoords = 0;
    const near: NearbyEventRow[] = [];
    for (const e of events) {
      const lat = e.latitude;
      const lng = e.longitude;
      if (lat == null || lng == null) {
        withoutCoords += 1;
        continue;
      }
      const miles = Math.round(haversineMiles(origin, { lat, lng }) * 10) / 10;
      if (miles <= data.radius_miles) near.push({ ...e, distanceMiles: miles });
    }

    return {
      events: near.slice(0, data.limit),

      error: null as string | null,
      refreshedAt,
      origin: { latitude: origin.lat, longitude: origin.lng, label: originLabel },
      radiusMiles: data.radius_miles,
      withoutCoords,
    };
  });