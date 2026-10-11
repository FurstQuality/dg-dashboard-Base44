import { firecrawlRequest, isFirecrawlConfigured, archiveSourceHtml } from "./firecrawl.server";
/**
 * Scheduled events — unified "what am I signed up for" tracker.
 *
 * Sources supported:
 *  - "disc_golf_scene": URL paste + auto-parse (Firecrawl if connected, plain fetch otherwise).
 *  - "pdga":            manual entry with URL + basic parse.
 *  - "tournament":      link an internal tournament created in this app.
 *  - "league":          link an internal league.
 *  - "manual":          anything else (casual meetup, charity round, etc.).
 *
 * Data lives in the RLS-scoped `scheduled_events` table (see migration).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { parseSceneHtml, type SceneParsed } from "./scene-parser";
import { assertEventSourceUrl } from "@/lib/safe-fetch-url";
import { getPdgaUpcomingEvents } from "@/lib/pdga-lab.functions";

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */
const SOURCE = ["disc_golf_scene", "pdga", "udisc", "tournament", "league", "manual"] as const;
const STATUS = [
  "interested",
  "registered",
  "waitlisted",
  "confirmed",
  "completed",
  "withdrawn",
  "cancelled",
] as const;

const ScheduledEventUpsert = z.object({
  id: z.string().uuid().optional(),
  source: z.enum(SOURCE).default("manual"),
  status: z.enum(STATUS).default("interested"),
  title: z.string().trim().min(1).max(200),
  event_url: z.string().url().max(500).nullable().optional(),
  registration_url: z.string().url().max(500).nullable().optional(),
  external_id: z.string().max(200).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  state: z.string().max(60).nullable().optional(),
  country: z.string().max(60).nullable().optional(),
  starts_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  ends_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  registration_deadline: z.string().datetime().nullable().optional(),
  division: z.string().max(60).nullable().optional(),
  tier: z.string().max(40).nullable().optional(),
  entry_fee_cents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  currency: z.string().max(6).default("USD").optional(),
  spots_total: z.number().int().min(0).max(10_000).nullable().optional(),
  spots_taken: z.number().int().min(0).max(10_000).nullable().optional(),
  waitlist_position: z.number().int().min(0).max(10_000).nullable().optional(),
  tournament_id: z.string().uuid().nullable().optional(),
  league_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  recurrence_dow: z.number().int().min(0).max(6).nullable().optional(),
});

export type ScheduledEventInput = z.infer<typeof ScheduledEventUpsert>;

/* ------------------------------------------------------------------ */
/* List + summary                                                      */
/* ------------------------------------------------------------------ */
export const listMySchedule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Roll finished one-off events forward so the calendar and lists reflect
    // live reality instead of leaving months-old tournaments as "Registered".
    // Recurring league rows (recurrence_dow set) keep their status.
    const today = new Date().toISOString().slice(0, 10);
    await supabase
      .from("scheduled_events")
      .update({ status: "completed" } as never)
      .eq("user_id", userId)
      .is("recurrence_dow", null)
      .in("status", ["interested", "registered", "waitlisted", "confirmed"])
      .lt("ends_on", today);

    const [scheduled, hostTourneys, hostLeagues, registeredTourneys] = await Promise.all([
      supabase
        .from("scheduled_events")
        .select("*")
        .eq("user_id", userId)
        .order("starts_on", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false }),
      // In-app tournaments the user hosts — auto-surface them
      supabase
        .from("tournaments")
        .select("id, name, pdga_tier, start_date, end_date, location")
        .eq("owner_id", userId)
        .gte("start_date", new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10))
        .order("start_date", { ascending: true }),
      supabase
        .from("leagues")
        .select("id, name, season, status")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false }),
      // Tournaments the user is registered/confirmed/waitlisted for
      supabase
        .from("tournament_registrations")
        .select(
          "tournament_id, status, tournaments!inner(id, name, pdga_tier, start_date, end_date, location)",
        )
        .eq("user_id", userId)
        .in("status", ["pending", "confirmed", "waitlist", "checked_in"]),
    ]);

    if (scheduled.error) throw new Error(scheduled.error.message);

    // Flatten registrations into a tournament-shaped list, dedup vs hosted.
    type TRow = {
      id: string;
      name: string;
      pdga_tier: string | null;
      start_date: string | null;
      end_date: string | null;
      location: string | null;
    };
    const hostedIds = new Set((hostTourneys.data ?? []).map((t) => (t as { id: string }).id));
    const registeredTournamentsFlat: TRow[] = [];
    for (const r of (registeredTourneys.data ?? []) as Array<{
      tournaments: TRow | TRow[] | null;
    }>) {
      const t = Array.isArray(r.tournaments) ? r.tournaments[0] : r.tournaments;
      if (!t || hostedIds.has(t.id)) continue;
      registeredTournamentsFlat.push(t);
    }

    return {
      scheduled: scheduled.data ?? [],
      hosted_tournaments: hostTourneys.data ?? [],
      hosted_leagues: hostLeagues.data ?? [],
      registered_tournaments: registeredTournamentsFlat,
    };
  });

/* ------------------------------------------------------------------ */
/* Create / update / delete                                            */
/* ------------------------------------------------------------------ */
export const upsertScheduledEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => ScheduledEventUpsert.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = { ...data, user_id: userId };
    if (data.id) {
      const { error } = await supabase
        .from("scheduled_events")
        .update(payload as never)
        .eq("id", data.id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { error, data: row } = await supabase
      .from("scheduled_events")
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const setScheduledEventStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(STATUS),
        waitlist_position: z.number().int().min(0).max(10_000).nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = { status: data.status };
    if (data.waitlist_position !== undefined) patch.waitlist_position = data.waitlist_position;
    const { error } = await supabase
      .from("scheduled_events")
      .update(patch as never)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteScheduledEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("scheduled_events")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* URL parse — Disc Golf Scene / PDGA                                  */
/* ------------------------------------------------------------------ */
async function fetchHtml(rawUrl: string): Promise<string> {
  // Re-check every fetch (including stored URLs) against the approved event sites.
  const url = assertEventSourceUrl(rawUrl);
  if (isFirecrawlConfigured()) {
    try {
      const res = await firecrawlRequest("/scrape", { url, formats: ["rawHtml", "html"], onlyMainContent: false });
      if (res.ok) {
        const payload = await res.json();
        const html = payload.data?.rawHtml ?? payload.data?.html ?? payload.rawHtml ?? payload.html;
        if (typeof html === "string" && html) return html;
      }
    } catch { /* A supported public source can still be read directly. */ }
  }
  // Plain fetch fallback — Disc Golf Scene event pages are server-rendered.
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ChainSocial/1.0; +https://chainsocial.app)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "manual",
  });
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
  return archiveSourceHtml(url, await res.text());
}

export const parseEventUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({ url: z.string().url().max(500) })
      .transform((v) => ({ url: assertEventSourceUrl(v.url) }))
      .parse(raw),
  )
  .handler(async ({ data }): Promise<SceneParsed | null> => {
    const url = data.url;
    const html = await fetchHtml(url);
    const parsed = parseSceneHtml(html, url);
    if (!parsed) throw new Error("Could not extract an event from that page.");
    return parsed;
  });

/* ------------------------------------------------------------------ */
/* Search — powered by Firecrawl when connected                        */
/* ------------------------------------------------------------------ */
export const searchSceneEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        query: z.string().trim().min(2).max(120),
        limit: z.number().int().min(1).max(10).default(6),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    if (!isFirecrawlConfigured()) return { results: [], needsConnector: true };
    const res = await firecrawlRequest("/search", {
      query: `${data.query} site:discgolfscene.com/tournaments`, limit: data.limit,
    });
    if (!res.ok) {
      throw new Error(`Event search failed (${res.status}). Please try again.`);
    }
    const body = (await res.json()) as {
      data?: Array<{ url: string; title?: string; description?: string }> | { web?: Array<{ url: string; title?: string; description?: string }> };
      results?: Array<{ url: string; title?: string; description?: string }>;
    };
    const raw = Array.isArray(body.data) ? body.data : body.data?.web ?? body.results ?? [];
    const results = raw
      .filter((r) => /discgolfscene\.com\/tournaments\/[^/?#]+/i.test(r.url))
      .map((r) => ({
        url: r.url,
        title: (r.title ?? "").replace(/\s*[·|-]\s*Disc Golf Scene\s*$/i, "").slice(0, 200),
        description: (r.description ?? "").slice(0, 300),
      }));
    return { results, needsConnector: false };
  });

/* ------------------------------------------------------------------ */
/* Refresh — re-fetch an existing scheduled event to update spots      */
/* ------------------------------------------------------------------ */
export const refreshScheduledEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("scheduled_events")
      .select("id, event_url, source")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Not found");
    const eventUrl = (row as { event_url: string | null }).event_url;
    if (!eventUrl) throw new Error("This event has no URL to refresh.");
    const html = await fetchHtml(eventUrl);
    const parsed = parseSceneHtml(html, eventUrl);
    if (!parsed) throw new Error("Refresh: could not parse the page.");
    const { error: updateErr } = await supabase
      .from("scheduled_events")
      .update({
        title: parsed.title,
        location: parsed.location,
        city: parsed.city,
        state: parsed.state,
        country: parsed.country,
        starts_on: parsed.starts_on,
        ends_on: parsed.ends_on,
        registration_deadline: parsed.registration_deadline,
        tier: parsed.tier,
        entry_fee_cents: parsed.entry_fee_cents,
        currency: parsed.currency,
        spots_total: parsed.spots_total,
        spots_taken: parsed.spots_taken,
        registration_url: parsed.registration_url,
        raw: parsed as unknown as Record<string, unknown>,
        last_synced_at: new Date().toISOString(),
      } as never)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (updateErr) throw new Error(updateErr.message);
    return { ok: true, parsed };
  });

/* ------------------------------------------------------------------ */
/* Link internal tournament or league into the personal schedule       */
/* ------------------------------------------------------------------ */
export const linkInternalToSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        kind: z.enum(["tournament", "league"]),
        id: z.string().uuid(),
        status: z.enum(STATUS).default("registered"),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.kind === "tournament") {
      const { data: rec, error } = await supabase
        .from("tournaments")
        .select("id, name, start_date, end_date, location, pdga_tier")
        .eq("id", data.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!rec) throw new Error("Tournament not found");
      const t = rec as {
        name: string;
        start_date: string | null;
        end_date: string | null;
        location: string | null;
        pdga_tier: string | null;
      };
      const rowIn = {
        user_id: userId,
        source: "tournament" as const,
        status: data.status,
        title: t.name,
        starts_on: t.start_date,
        ends_on: t.end_date,
        location: t.location,
        tier: t.pdga_tier,
        tournament_id: data.id,
      };
      const { error: insertErr, data: inserted } = await supabase
        .from("scheduled_events")
        .insert(rowIn as never)
        .select("id")
        .single();
      if (insertErr) throw new Error(insertErr.message);
      return { id: (inserted as { id: string }).id };
    }

    const { data: rec, error } = await supabase
      .from("leagues")
      .select("id, name, season")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!rec) throw new Error("League not found");
    const l = rec as { name: string; season: string | null };
    const rowIn = {
      user_id: userId,
      source: "league" as const,
      status: data.status,
      title: l.season ? `${l.name} — ${l.season}` : l.name,
      league_id: data.id,
    };
    const { error: insertErr, data: inserted } = await supabase
      .from("scheduled_events")
      .insert(rowIn as never)
      .select("id")
      .single();
    if (insertErr) throw new Error(insertErr.message);
    return { id: (inserted as { id: string }).id };
  });

/* ------------------------------------------------------------------ */
/* Sync my PDGA schedule — mirror the tracker's per-member logic for  */
/* the current user's own PDGA number.                                 */
/* ------------------------------------------------------------------ */
export const syncMyPdgaEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("pdga_number")
      .eq("id", userId)
      .maybeSingle();
    const pdgaNumber = (profile as { pdga_number: string | null } | null)?.pdga_number;
    if (!pdgaNumber) {
      throw new Error("Add your PDGA number in your profile to sync your PDGA schedule.");
    }
    const upcoming = await getPdgaUpcomingEvents({ data: { pdgaNumber: String(pdgaNumber) } });
    if (!upcoming.length) return { added: 0, updated: 0, total: 0 };

    // Existing PDGA-source rows for this user, keyed by external_id.
    const { data: existing } = await supabase
      .from("scheduled_events")
      .select("id, external_id, event_url, recurrence_dow, starts_on")
      .eq("user_id", userId)
      .eq("source", "pdga");
    const byExt = new Map<string, { id: string }>();
    for (const row of (existing ?? []) as Array<{
      id: string;
      external_id: string | null;
      event_url: string | null;
    }>) {
      if (row.external_id) byExt.set(row.external_id, { id: row.id });
    }

    let added = 0;
    let updated = 0;
    // Detect a weekday in the event title so recurring PDGA leagues
    // ("Portage Sanctioned Singles", "Duneland Singles Summer '26",
    // "Wednesday Doubles", etc.) don't paint every day of the calendar.
    function dowFromTitle(title: string): number | null {
      const t = title.toLowerCase();
      if (/\bsundays?\b/.test(t)) return 0;
      if (/\bmondays?\b/.test(t)) return 1;
      if (/\btues(day)?s?\b/.test(t)) return 2;
      if (/\bwednes(day)?s?\b/.test(t)) return 3;
      if (/\bthurs(day)?s?\b/.test(t)) return 4;
      if (/\bfridays?\b/.test(t)) return 5;
      if (/\bsatur(day)?s?\b/.test(t)) return 6;
      // Known regional leagues we already curate.
      if (/portage.*singles/.test(t)) return 2; // Tue
      if (/duneland.*singles/.test(t)) return 3; // Wed
      return null;
    }
    for (const ev of upcoming) {
      const externalId = `pdga:${ev.event_ref}`;
      const detectedDow = dowFromTitle(ev.event_name ?? "");
      const insertPayload = {
        user_id: userId,
        source: "pdga" as const,
        status: "registered" as const,
        title: ev.event_name,
        event_url: ev.url,
        external_id: externalId,
        location: ev.location,
        starts_on: ev.event_date,
        ends_on: ev.event_date,
        tier: ev.tier,
        recurrence_dow: detectedDow,
      };
      const match = byExt.get(externalId);
      if (match) {
        const updatePayload: Record<string, unknown> = {};
        if (ev.event_name) updatePayload.title = ev.event_name;
        if (ev.url) updatePayload.event_url = ev.url;
        if (ev.location) updatePayload.location = ev.location;
        if (ev.event_date) {
          updatePayload.starts_on = ev.event_date;
          updatePayload.ends_on = ev.event_date;
        }
        if (ev.tier) updatePayload.tier = ev.tier;
        if (detectedDow !== null) updatePayload.recurrence_dow = detectedDow;
        if (Object.keys(updatePayload).length === 0) {
          updated += 1;
          continue;
        }
        const { error } = await supabase
          .from("scheduled_events")
          .update(updatePayload as never)
          .eq("id", match.id)
          .eq("user_id", userId);
        if (!error) updated += 1;
      } else {
        const { error } = await supabase.from("scheduled_events").insert(insertPayload as never);
        if (!error) added += 1;
      }
    }

    // Drop PDGA-synced rows the player is no longer registered for (withdrawals,
    // cancelled registrations). Only auto-synced one-off rows are pruned:
    // recurring league rows and manually added entries are left alone.
    const keep = new Set(upcoming.map((ev) => `pdga:${ev.event_ref}`));
    const todayIso = new Date().toISOString().slice(0, 10);
    const stale = (
      (existing ?? []) as Array<{
        id: string;
        external_id: string | null;
        recurrence_dow: number | null;
        starts_on: string | null;
      }>
    )
      .filter(
        (row) =>
          row.external_id?.startsWith("pdga:") &&
          !keep.has(row.external_id) &&
          row.recurrence_dow === null &&
          (row.starts_on === null || row.starts_on >= todayIso),
      )
      .map((row) => row.id);
    let removed = 0;
    if (stale.length) {
      const { error } = await supabase
        .from("scheduled_events")
        .delete()
        .in("id", stale)
        .eq("user_id", userId);
      if (!error) removed = stale.length;
    }

    return { added, updated, removed, total: upcoming.length };
  });

/* ------------------------------------------------------------------ */
/* Community outreach → calendar                                       */
/* ------------------------------------------------------------------ */

/**
 * Mirrors the community outreach events the player is hosting or has RSVP'd to
 * into their schedule, so cleanups and clinics show up beside tournaments and
 * league nights (and get flagged in overlap checks).
 */
export const syncMyOutreachEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const fromIso = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [hostedRes, rsvpRes] = await Promise.all([
      supabase
        .from("community_events")
        .select("id, title, location, starts_at, ends_at, status")
        .eq("host_id", userId)
        .gte("starts_at", fromIso)
        .order("starts_at", { ascending: true })
        .limit(100),
      supabase
        .from("event_rsvps")
        .select("status, community_events!inner(id, title, location, starts_at, ends_at, status)")
        .eq("user_id", userId)
        .in("status", ["going", "maybe"])
        .limit(200),
    ]);

    type Ev = {
      id: string;
      title: string;
      location: string | null;
      starts_at: string;
      ends_at: string | null;
      status: string | null;
    };

    const wanted = new Map<string, { ev: Ev; status: "confirmed" | "interested" }>();
    for (const row of (hostedRes.data ?? []) as Ev[]) {
      if (row.status === "cancelled") continue;
      wanted.set(row.id, { ev: row, status: "confirmed" });
    }
    for (const row of (rsvpRes.data ?? []) as Array<{
      status: string;
      community_events: Ev | null;
    }>) {
      const ev = row.community_events;
      if (!ev || ev.status === "cancelled") continue;
      if (new Date(ev.starts_at).getTime() < new Date(fromIso).getTime()) continue;
      if (wanted.has(ev.id)) continue;
      wanted.set(ev.id, { ev, status: row.status === "going" ? "confirmed" : "interested" });
    }

    const { data: existing } = await supabase
      .from("scheduled_events")
      .select("id, external_id")
      .eq("user_id", userId)
      .like("external_id", "community:%")
      .limit(500);
    const byExt = new Map<string, string>();
    for (const row of (existing ?? []) as Array<{ id: string; external_id: string | null }>) {
      if (row.external_id) byExt.set(row.external_id, row.id);
    }

    let added = 0;
    let updated = 0;
    for (const [eventId, { ev, status }] of wanted) {
      const externalId = `community:${eventId}`;
      const startsOn = ev.starts_at.slice(0, 10);
      const payload = {
        title: ev.title,
        location: ev.location,
        starts_on: startsOn,
        ends_on: (ev.ends_at ?? ev.starts_at).slice(0, 10),
        status,
      };
      const existingId = byExt.get(externalId);
      if (existingId) {
        const { error } = await supabase
          .from("scheduled_events")
          .update(payload as never)
          .eq("id", existingId)
          .eq("user_id", userId);
        if (!error) updated += 1;
      } else {
        const { error } = await supabase.from("scheduled_events").insert({
          user_id: userId,
          source: "manual" as const,
          external_id: externalId,
          ...payload,
        } as never);
        if (!error) added += 1;
      }
    }

    // Drop mirrors for events the player left or that were cancelled.
    const stale = [...byExt.entries()]
      .filter(([ext]) => !wanted.has(ext.slice("community:".length)))
      .map(([, id]) => id);
    if (stale.length) {
      await supabase.from("scheduled_events").delete().in("id", stale).eq("user_id", userId);
    }

    return { added, updated, removed: stale.length, total: wanted.size };
  });

/* ------------------------------------------------------------------ */
/* Per-PDGA-event weekday helpers (for league detail page)             */
/* ------------------------------------------------------------------ */

/** Look up the current user's recurrence weekday (if any) for a PDGA event. */
export const getPdgaEventRecurrenceDow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ eventRef: z.string().min(1).max(40) }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("scheduled_events")
      .select("id, recurrence_dow")
      .eq("user_id", userId)
      .eq("external_id", `pdga:${data.eventRef}`)
      .maybeSingle();
    return {
      scheduledEventId: (row?.id as string | undefined) ?? null,
      recurrence_dow: (row?.recurrence_dow as number | null | undefined) ?? null,
    };
  });

/** Set/clear the recurring weekday for a PDGA event on the user's schedule. */
export const setPdgaEventRecurrenceDow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        eventRef: z.string().min(1).max(40),
        dow: z.number().int().min(0).max(6).nullable(),
        /** Fallbacks used only when the row must be created. */
        title: z.string().min(1).max(200).optional(),
        event_url: z.string().url().max(500).nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const externalId = `pdga:${data.eventRef}`;
    const { data: existing } = await supabase
      .from("scheduled_events")
      .select("id")
      .eq("user_id", userId)
      .eq("external_id", externalId)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await supabase
        .from("scheduled_events")
        .update({ recurrence_dow: data.dow } as never)
        .eq("id", existing.id as string)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      return { id: existing.id as string, recurrence_dow: data.dow };
    }
    // No row yet — create a minimal PDGA schedule entry so the setting persists.
    const insertPayload = {
      user_id: userId,
      source: "pdga" as const,
      status: "interested" as const,
      title: (data.title?.trim() || `PDGA event ${data.eventRef}`).slice(0, 200),
      event_url: data.event_url ?? `https://www.pdga.com/tour/event/${data.eventRef}`,
      external_id: externalId,
      recurrence_dow: data.dow,
    };
    const { data: inserted, error } = await supabase
      .from("scheduled_events")
      .insert(insertPayload as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted!.id as string, recurrence_dow: data.dow };
  });
