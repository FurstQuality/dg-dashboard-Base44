/**
 * Calendar sync server functions:
 *  - Google Calendar App User Connector (two-way sync)
 *  - ICS subscription feed token management
 *
 * All handlers are authenticated. Google credentials are stored per-user,
 * encrypted at rest, and never returned to the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";
import { calendarProvider } from "./service-providers";

async function calendarRequest(userId: string, key: string, path: string, init?: RequestInit) {
  if (calendarProvider(process.env).id === "google") {
    const { directCalendarRequest } = await import("./google-calendar.server");
    return directCalendarRequest(userId, path, init);
  }
  const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
  return callAsAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: key, connectorId: GOOGLE_CONNECTOR, path, init });
}

function calendarConnectionId() {
  return calendarProvider(process.env).id === "google" ? "google_calendar_direct" : GOOGLE_CONNECTOR;
}

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const GOOGLE_CONNECTOR = "google_calendar";
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

/* ------------------------------------------------------------------ */
/* Google Calendar OAuth start + save                                  */
/* ------------------------------------------------------------------ */

export const startGoogleCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((targetOrigin: string) => z.string().url().max(500).parse(targetOrigin))
  .handler(async ({ data: targetOrigin, context }) => {
    if (getRequest().headers.get("origin") !== targetOrigin) throw new Error("Calendar connection must start from this app.");
    if (calendarProvider(process.env).id === "google") {
      const { startDirectCalendar } = await import("./google-calendar.server");
      return startDirectCalendar(context.userId, targetOrigin);
    }
    const clientKey = process.env.GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY;
    if (!clientKey) {
      throw new Error("Google Calendar connector is not configured.");
    }
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: GOOGLE_CONNECTOR,
      appUserId: context.userId,
      clientAPIKey: clientKey,
      returnUrl: targetOrigin,
      responseMode: "web_message",
      webMessageTargetOrigin: targetOrigin,
      credentialsConfiguration: { scopes: GOOGLE_SCOPES },
    });
    return { authorizationUrl, provider: "lovable" as const, state: null };
  });

export const completeGoogleCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ code: z.string().min(1).max(4000), state: z.string().min(32).max(100) }).parse(raw))
  .handler(async ({ data, context }) => {
    const { completeDirectCalendar } = await import("./google-calendar.server");
    return completeDirectCalendar(context.userId, data.code, data.state, getRequest().headers.get("origin") ?? "");
  });

export const saveGoogleCalendarConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ connectionAPIKey: z.string().min(1).max(500) }).parse(raw))
  .handler(async ({ data, context }) => {
    if (calendarProvider(process.env).id === "google") throw new Error("Complete Google authorization to connect this calendar.");
    const { saveConnectionKeyForUser } = await import("@/lib/app-user-connections.server");
    await saveConnectionKeyForUser(context.userId, GOOGLE_CONNECTOR, data.connectionAPIKey);
    return { ok: true };
  });

export const disconnectGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (calendarProvider(process.env).id === "google") {
      const { disconnectDirectCalendar } = await import("./google-calendar.server");
      await disconnectDirectCalendar(context.userId);
      return { ok: true };
    }
    const { getConnectionKeyForUser, deleteConnectionKeyForUser } =
      await import("@/lib/app-user-connections.server");
    const key = await getConnectionKeyForUser(context.userId, GOOGLE_CONNECTOR);
    if (key) {
      try {
        const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
        await disconnectAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey: key,
          connectorId: GOOGLE_CONNECTOR,
        });
      } catch {
        /* ignore — still clear local */
      }
    }
    await deleteConnectionKeyForUser(context.userId, GOOGLE_CONNECTOR);
    return { ok: true };
  });

export const getCalendarConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser } = await import("@/lib/app-user-connections.server");
    const provider = calendarProvider(process.env);
    const key = await getConnectionKeyForUser(context.userId, calendarConnectionId());
    return { google: Boolean(key), provider: provider.id };
  });

/* ------------------------------------------------------------------ */
/* Google Calendar two-way sync                                        */
/* ------------------------------------------------------------------ */

type GoogleEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  status?: string;
};

function eventDateFields(g: GoogleEvent): {
  starts_on: string | null;
  ends_on: string | null;
  starts_at: string | null;
  all_day: boolean;
} {
  const startDate = g.start?.date ?? null;
  const endDate = g.end?.date ?? null;
  const startDT = g.start?.dateTime ?? null;
  const endDT = g.end?.dateTime ?? null;
  if (startDate) {
    return { starts_on: startDate, ends_on: endDate ? new Date(Date.parse(`${endDate}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) : startDate, starts_at: null, all_day: true };
  }
  if (startDT) {
    return {
      starts_on: startDT.slice(0, 10),
      ends_on: endDT ? endDT.slice(0, 10) : startDT.slice(0, 10),
      starts_at: startDT,
      all_day: false,
    };
  }
  return { starts_on: null, ends_on: null, starts_at: null, all_day: true };
}

export const syncGoogleCalendarPull = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser } = await import("@/lib/app-user-connections.server");
    const key = await getConnectionKeyForUser(context.userId, calendarConnectionId());
    if (!key) throw new Error("Connect Google Calendar first.");

    const timeMin = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const timeMax = new Date(Date.now() + 365 * 86_400_000).toISOString();
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    const { recordSnapshot, recordObservation } = await import("./data-intel/snapshots.server");
    const items: Array<{ event: GoogleEvent; snapshotId: string }> = [];
    for (let page = 0; page < 20; page++) {
      const res = await calendarRequest(context.userId, key, `/calendar/v3/calendars/primary/events?${params}`);
      if (!res.ok) throw new Error(`Google Calendar sync failed (${res.status}). Please reconnect or try again.`);
      const body = (await res.json()) as { items?: GoogleEvent[]; nextPageToken?: string };
      const snapshotId = await recordSnapshot({ source: "google_calendar", entityType: "calendar", externalId: context.userId, payload: body, parserVersion: "google-calendar-v1" });
      if (!snapshotId) throw new Error("Calendar source could not be archived. Please try again.");
      items.push(...(body.items ?? []).filter(e => e.status !== "cancelled").map(event => ({ event, snapshotId })));
      if (!body.nextPageToken) break;
      if (page === 19) throw new Error("Calendar has too many events to sync in one pass.");
      params.set("pageToken", body.nextPageToken);
    }

    const { supabase, userId } = context;
    let imported = 0;
    for (const { event: g, snapshotId } of items) {
      const d = eventDateFields(g);
      if (!d.starts_on) continue;
      const row = {
        user_id: userId,
        source: "google" as const,
        status: "interested" as const,
        title: (g.summary ?? "Untitled event").slice(0, 200),
        event_url: g.htmlLink ?? null,
        location: g.location ?? null,
        starts_on: d.starts_on,
        ends_on: d.ends_on,
        starts_at: d.starts_at,
        all_day: d.all_day,
        google_event_id: g.id,
        notes: g.description ? g.description.slice(0, 2000) : null,
        last_synced_at: new Date().toISOString(),
      };
      const { data: existing, error: lookupError } = await supabase
        .from("scheduled_events")
        .select("id, status")
        .eq("user_id", userId)
        .eq("google_event_id", g.id)
        .maybeSingle();
      if (lookupError) throw new Error("Could not read the scheduled event. Please try again.");
      const result = existing
        ? await supabase
          .from("scheduled_events")
          .update({ ...row, status: existing.status } as never)
          .eq("id", existing.id).eq("user_id", userId).select("id").single()
        : await supabase.from("scheduled_events").insert(row as never).select("id").single();
      if (result.error || !result.data) throw new Error("Could not save the scheduled event. Please try again.");
      for (const field of ["title", "event_url", "location", "starts_on", "ends_on", "starts_at", "all_day", "notes"] as const) {
        await recordObservation({ entityType: "scheduled_event", entityId: result.data.id, field, source: "google_calendar", value: row[field], snapshotId, parserVersion: "google-calendar-v1" });
      }
      imported++;
    }
    return { imported };
  });

export const pushEventToGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { getConnectionKeyForUser } = await import("@/lib/app-user-connections.server");
    const key = await getConnectionKeyForUser(context.userId, calendarConnectionId());
    if (!key) throw new Error("Connect Google Calendar first.");
    const { supabase, userId } = context;

    const { data: row, error } = await supabase
      .from("scheduled_events")
      .select(
        "id, title, event_url, location, starts_on, ends_on, starts_at, all_day, notes, google_event_id",
      )
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) { console.error("[db]", error.message); throw new Error("Something went wrong on our side. Please try again."); }
    if (!row) throw new Error("Event not found");
    const ev = row as {
      id: string;
      title: string;
      event_url: string | null;
      location: string | null;
      starts_on: string | null;
      ends_on: string | null;
      starts_at: string | null;
      all_day: boolean;
      notes: string | null;
      google_event_id: string | null;
    };
    if (!ev.starts_on) throw new Error("Event has no date to push.");

    const body: Record<string, unknown> = {
      summary: ev.title,
      description: [ev.notes, ev.event_url].filter(Boolean).join("\n\n") || undefined,
      location: ev.location ?? undefined,
    };
    if (ev.all_day || !ev.starts_at) {
      const endDate = new Date(`${ev.ends_on ?? ev.starts_on}T00:00:00Z`);
      endDate.setUTCDate(endDate.getUTCDate() + 1); // Google end.date is exclusive
      body.start = { date: ev.starts_on };
      body.end = { date: endDate.toISOString().slice(0, 10) };
    } else {
      body.start = { dateTime: ev.starts_at };
      body.end = { dateTime: new Date(Date.parse(ev.starts_at) + 60 * 60_000).toISOString() };
    }

    const method = ev.google_event_id ? "PATCH" : "POST";
    const exportId = `dgd${ev.id.replaceAll("-", "")}`;
    if (!ev.google_event_id) {
      body.id = exportId;
      body.extendedProperties = { private: { dgd_event_id: ev.id, dgd_user_id: userId } };
    }
    const path = ev.google_event_id
      ? `/calendar/v3/calendars/primary/events/${encodeURIComponent(ev.google_event_id)}`
      : `/calendar/v3/calendars/primary/events`;
    let res = await calendarRequest(context.userId, key, path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    // An earlier insertion may have succeeded before its response or local
    // receipt was saved. Recover only the same caller's same scheduled event.
    if (res.status === 409 && !ev.google_event_id) {
      const retryPath = `/calendar/v3/calendars/primary/events/${exportId}`;
      const existing = await calendarRequest(userId, key, retryPath);
      if (!existing.ok) throw new Error("Could not verify the earlier calendar export. Please try again.");
      const receipt = await existing.json();
      const { recordSnapshot } = await import("./data-intel/snapshots.server");
      if (!await recordSnapshot({ source: "google_calendar", entityType: "calendar_event", externalId: `${userId}/${exportId}`, payload: receipt, parserVersion: "google-calendar-v1" })) throw new Error("Could not archive the calendar export receipt.");
      if (receipt.extendedProperties?.private?.dgd_event_id !== ev.id || receipt.extendedProperties?.private?.dgd_user_id !== userId) throw new Error("The calendar event ID belongs to a different export.");
      delete body.id; // Event IDs are assigned on insertion, never changed by PATCH.
      res = await calendarRequest(userId, key, retryPath, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    if (!res.ok) {
      throw new Error(`Google Calendar sync failed (${res.status}). Please reconnect or try again.`);
    }
    const responseBody = (await res.json()) as { id?: string };
    if (typeof responseBody.id !== "string" || !responseBody.id) throw new Error("Google returned no event receipt. Please try again.");
    if (!ev.google_event_id) {
      const { error: saveError, data: saved } = await supabase
        .from("scheduled_events")
        .update({
          google_event_id: responseBody.id,
          last_synced_at: new Date().toISOString(),
        } as never)
        .eq("id", ev.id).eq("user_id", userId).select("id").single();
      if (saveError || !saved) throw new Error("The calendar event was created but its receipt could not be saved. Retry to reconnect the same event.");
    }
    return { ok: true, google_event_id: responseBody.id ?? ev.google_event_id };
  });

export const pushAllRegisteredToGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser } = await import("@/lib/app-user-connections.server");
    const key = await getConnectionKeyForUser(context.userId, calendarConnectionId());
    if (!key) throw new Error("Connect Google Calendar first.");
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("scheduled_events")
      .select("id")
      .eq("user_id", userId)
      .in("status", ["registered", "confirmed", "waitlisted"])
      .is("google_event_id", null)
      .not("starts_on", "is", null)
      .limit(100);
    const rows = (data ?? []) as Array<{ id: string }>;
    let pushed = 0;
    for (const r of rows) {
      try {
        await pushEventToGoogle({ data: { id: r.id } });
        pushed++;
      } catch {
        /* skip failures */
      }
    }
    return { pushed };
  });

/* ------------------------------------------------------------------ */
/* ICS subscription feed token                                         */
/* ------------------------------------------------------------------ */

function generateIcsToken(): string {
  // Cryptographically secure, no user-identifying content. 32 bytes -> 64 hex chars.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const getOrCreateIcsFeedToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    // ics_feed_token is column-revoked from anon/authenticated to keep the
    // private calendar URL secret; go through the service role client.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("ics_feed_token")
      .eq("id", userId)
      .maybeSingle();
    const current = (existing as { ics_feed_token: string | null } | null)?.ics_feed_token;
    if (current) return { token: current };
    const token = generateIcsToken();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ ics_feed_token: token })
      .eq("id", userId);
    if (error) { console.error("[db]", error.message); throw new Error("Something went wrong on our side. Please try again."); }
    return { token };
  });

export const rotateIcsFeedToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = generateIcsToken();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ ics_feed_token: token })
      .eq("id", userId);
    if (error) { console.error("[db]", error.message); throw new Error("Something went wrong on our side. Please try again."); }
    return { token };
  });

/* ------------------------------------------------------------------ */
/* Bulk import from in-app registrations                               */
/* ------------------------------------------------------------------ */

export const importFromRegistrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Tournaments the user has registered for
    const { data: regs } = await supabase
      .from("tournament_registrations")
      .select("tournament_id, tournaments(id, name, start_date, end_date, location, pdga_tier)")
      .eq("user_id", userId);
    let added = 0;
    for (const reg of (regs ?? []) as Array<{
      tournament_id: string;
      tournaments: {
        id: string;
        name: string;
        start_date: string | null;
        end_date: string | null;
        location: string | null;
        pdga_tier: string | null;
      } | null;
    }>) {
      const t = reg.tournaments;
      if (!t) continue;
      const { data: existing } = await supabase
        .from("scheduled_events")
        .select("id")
        .eq("user_id", userId)
        .eq("tournament_id", t.id)
        .maybeSingle();
      if (existing) continue;
      await supabase.from("scheduled_events").insert({
        user_id: userId,
        source: "tournament",
        status: "registered",
        title: t.name,
        starts_on: t.start_date,
        ends_on: t.end_date,
        location: t.location,
        tier: t.pdga_tier,
        tournament_id: t.id,
      } as never);
      added++;
    }
    // League registrations
    const { data: leagueRegs } = await supabase
      .from("league_registrations")
      .select("league_id, leagues(id, name, season)")
      .eq("user_id", userId);
    for (const reg of (leagueRegs ?? []) as Array<{
      league_id: string;
      leagues: { id: string; name: string; season: string | null } | null;
    }>) {
      const l = reg.leagues;
      if (!l) continue;
      const { data: existing } = await supabase
        .from("scheduled_events")
        .select("id")
        .eq("user_id", userId)
        .eq("league_id", l.id)
        .maybeSingle();
      if (existing) continue;
      await supabase.from("scheduled_events").insert({
        user_id: userId,
        source: "league",
        status: "registered",
        title: l.season ? `${l.name} — ${l.season}` : l.name,
        league_id: l.id,
      } as never);
      added++;
    }
    return { added };
  });

/* ------------------------------------------------------------------ */
/* Import PDGA upcoming events for this user                          */
/* ------------------------------------------------------------------ */

export const importPdgaUpcomingEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("pdga_number")
      .eq("id", userId)
      .maybeSingle();
    const pdgaNumber = (profile as { pdga_number: number | null } | null)?.pdga_number;
    if (!pdgaNumber) {
      throw new Error("Add your PDGA number to your profile first.");
    }
    const { getPdgaUpcomingEvents, getPdgaEventSchedule } =
      await import("@/lib/pdga-lab.functions");
    const events = await getPdgaUpcomingEvents({ data: { pdgaNumber: String(pdgaNumber) } });
    let added = 0;
    for (const ev of events) {
      if (!ev.event_date) continue;

      // Fetch the event's PDGA-published round/course schedule so downstream
      // tools (Game Plan, Rating Studio, StatLink) can wire course names,
      // rated round history, and per-round SSA targets to this event.
      let rounds: Array<{
        round_number: number;
        course_name: string | null;
        layout_name: string | null;
      }> = [];
      if (ev.event_ref) {
        try {
          const sched = await getPdgaEventSchedule({ data: { eventRef: ev.event_ref } });
          const dedup = new Map<
            number,
            { round_number: number; course_name: string | null; layout_name: string | null }
          >();
          for (const s of sched) {
            if (!dedup.has(s.round_number) && s.course_name) {
              dedup.set(s.round_number, {
                round_number: s.round_number,
                course_name: s.course_name,
                layout_name: s.course_layout,
              });
            }
          }
          rounds = Array.from(dedup.values()).sort((a, b) => a.round_number - b.round_number);
        } catch {
          /* best-effort — schedule is optional */
        }
      }

      const row = {
        user_id: userId,
        source: "pdga" as const,
        status: "registered" as const,
        title: ev.event_name,
        event_url: ev.url,
        external_id: ev.event_ref,
        location: ev.location,
        starts_on: ev.event_date,
        ends_on: ev.event_date,
        tier: ev.tier,
        raw: {
          pdga_event_id: ev.event_ref,
          rounds,
        } as Record<string, unknown>,
        last_synced_at: new Date().toISOString(),
      };
      const { data: existing } = await supabase
        .from("scheduled_events")
        .select("id")
        .eq("user_id", userId)
        .eq("source", "pdga")
        .eq("external_id", ev.event_ref)
        .maybeSingle();
      if (existing) {
        await supabase
          .from("scheduled_events")
          .update(row as never)
          .eq("id", (existing as { id: string }).id);
      } else {
        await supabase.from("scheduled_events").insert(row as never);
        added++;
      }
    }
    return { added, total: events.length };
  });

/* ------------------------------------------------------------------ */
/* Backfill course info onto PDGA scheduled events already imported    */
/* ------------------------------------------------------------------ */

export const backfillPdgaEventCourses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase
      .from("scheduled_events")
      .select("id, external_id, raw")
      .eq("user_id", userId)
      .eq("source", "pdga");
    const list = (rows ?? []) as Array<{
      id: string;
      external_id: string | null;
      raw: Record<string, unknown> | null;
    }>;
    // Parse the PDGA event page directly. Calling the getPdgaEventSchedule
    // server function from inside this handler fails at runtime (nested
    // server-fn RPC is not registered), which made every event look
    // "unresolved" and the sync button appear to do nothing.
    const { parseEventSchedule } = await import("@/lib/pdga-lab.functions");
    const fetchEventHtml = async (ref: string) => {
      const { fetchPdgaHtml } = await import("@/lib/pdga-fetch.server");
      return fetchPdgaHtml(`https://www.pdga.com/tour/event/${ref}`);
    };
    let updated = 0;
    let unresolved = 0;
    let alreadyHad = 0;
    for (const r of list) {
      if (!r.external_id) continue;
      const existingRounds = (r.raw?.rounds as unknown[] | undefined) ?? [];
      const hasCourse = existingRounds.some(
        (x) => (x as { course_name?: string | null } | null)?.course_name,
      );
      if (hasCourse) {
        alreadyHad++;
        continue;
      }
      try {
        const sched = parseEventSchedule(await fetchEventHtml(r.external_id), r.external_id);
        const dedup = new Map<
          number,
          { round_number: number; course_name: string | null; layout_name: string | null }
        >();
        for (const s of sched) {
          if (!dedup.has(s.round_number) && s.course_name) {
            dedup.set(s.round_number, {
              round_number: s.round_number,
              course_name: s.course_name,
              layout_name: s.course_layout,
            });
          }
        }
        const rounds = Array.from(dedup.values()).sort((a, b) => a.round_number - b.round_number);
        if (rounds.length === 0) {
          unresolved++;
          continue;
        }
        const nextRaw = { ...(r.raw ?? {}), pdga_event_id: r.external_id, rounds };
        await supabase
          .from("scheduled_events")
          .update({ raw: nextRaw, last_synced_at: new Date().toISOString() } as never)
          .eq("id", r.id)
          .eq("user_id", userId);
        updated++;
      } catch {
        unresolved++;
      }
    }
    return { updated, unresolved, alreadyHad, total: list.length };
  });

/* ------------------------------------------------------------------ */
/* Import UDisc played rounds as past calendar entries                */
/* ------------------------------------------------------------------ */

export const importUdiscRounds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rounds } = await supabase
      .from("external_rounds")
      .select("id, course_name, event_name, played_on, layout_name")
      .eq("user_id", userId)
      .eq("source", "udisc")
      .order("played_on", { ascending: false })
      .limit(500);
    let added = 0;
    for (const r of (rounds ?? []) as Array<{
      id: string;
      course_name: string;
      event_name: string | null;
      played_on: string;
      layout_name: string | null;
    }>) {
      const { data: existing } = await supabase
        .from("scheduled_events")
        .select("id")
        .eq("user_id", userId)
        .eq("source", "udisc")
        .eq("external_id", r.id)
        .maybeSingle();
      if (existing) continue;
      const title = r.event_name
        ? `${r.event_name} — ${r.course_name}`
        : r.layout_name
          ? `${r.course_name} (${r.layout_name})`
          : r.course_name;
      await supabase.from("scheduled_events").insert({
        user_id: userId,
        source: "udisc",
        status: "completed",
        title,
        external_id: r.id,
        starts_on: r.played_on,
        ends_on: r.played_on,
        all_day: true,
      } as never);
      added++;
    }
    return { added };
  });
