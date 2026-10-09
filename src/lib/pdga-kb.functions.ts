/**
 * PDGA Knowledgebase — server functions.
 *
 * Slow, throttled Firecrawl-driven ingestion for courses, players, and events.
 * All scraping is server-side; access to the raw KB tables is restricted to
 * super admins by RLS. App-facing reads project safe columns only.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  parseCoursePage,
  parsePlayerPage,
  parseEventPage,
  classifyPdgaUrl,
  haversineKm,
  type ParsedCourse,
  type ParsedPlayer,
  type ParsedEvent,
} from "./pdga-kb-parsers";

const FIRECRAWL_GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";

// ~ 1 request per 4 s minimum, jittered 3–8s.
const MIN_INTERVAL_MS = 4000;
const JITTER_MS = 5000;
const DAILY_CAP = 600;

async function firecrawlScrape(
  url: string,
  formats: ("markdown" | "html")[] = ["markdown", "html"],
): Promise<{ markdown?: string; html?: string; status: number }> {
  const lovable = process.env.LOVABLE_API_KEY;
  const conn = process.env.FIRECRAWL_API_KEY;
  if (!lovable || !conn) throw new Error("Firecrawl connector not configured");

  const res = await fetch(`${FIRECRAWL_GATEWAY}/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": conn,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats,
      onlyMainContent: false,
      waitFor: 500,
      location: { country: "US", languages: ["en"] },
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    return { status: res.status };
  }
  const json = JSON.parse(body);
  const data = json.data ?? json;
  return { markdown: data.markdown, html: data.html, status: res.status };
}

async function throttleCheck(supabase: any): Promise<void> {
  // Global limiter: check last successful/attempted job time.
  const since = new Date(Date.now() - MIN_INTERVAL_MS).toISOString();
  const { count } = await supabase
    .from("pdga_kb_sync_jobs")
    .select("id", { count: "exact", head: true })
    .gte("started_at", since);
  if ((count ?? 0) > 0) {
    // Wait remainder of jitter window.
    const wait = MIN_INTERVAL_MS + Math.floor(Math.random() * JITTER_MS);
    await new Promise((r) => setTimeout(r, wait));
  } else {
    // Small jitter even on empty queue to keep pattern human.
    await new Promise((r) => setTimeout(r, 500 + Math.floor(Math.random() * 1500)));
  }

  // Daily cap
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { count: dayCount } = await supabase
    .from("pdga_kb_sync_jobs")
    .select("id", { count: "exact", head: true })
    .gte("started_at", dayAgo)
    .in("status", ["success", "failed"]);
  if ((dayCount ?? 0) >= DAILY_CAP) {
    throw new Error("PDGA daily scrape cap reached; try again tomorrow.");
  }
}

async function logJob(
  supabase: any,
  fields: {
    kind: string;
    target: string;
    status: "running" | "success" | "failed" | "skipped";
    http_status?: number | null;
    error?: string | null;
    result?: any;
  },
) {
  const now = new Date().toISOString();
  await supabase.from("pdga_kb_sync_jobs").insert({
    ...fields,
    started_at: fields.status === "running" ? now : null,
    finished_at: fields.status !== "running" ? now : null,
    attempts: 1,
    next_run_at: now,
  });
}

// ============ Scrape: course ============

export const pdgaScrapeCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pdgaCourseId?: string; url?: string }) =>
    z
      .object({
        pdgaCourseId: z.string().regex(/^\d+$/).optional(),
        url: z.string().url().optional(),
      })
      .refine((v) => v.pdgaCourseId || v.url, "pdgaCourseId or url required")
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Only super admins can trigger scrapes.
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isAdmin) throw new Error("Super admin only");

    const id = data.pdgaCourseId ?? classifyPdgaUrl(data.url ?? "").key;
    if (!id) throw new Error("Invalid PDGA course reference");
    // Always scrape the canonical PDGA page built from the id — never a caller URL.
    const url = `https://www.pdga.com/course-directory/course/${id}`;

    await throttleCheck(context.supabase);
    const scrape = await firecrawlScrape(url);
    if (scrape.status !== 200 || (!scrape.html && !scrape.markdown)) {
      await logJob(context.supabase, {
        kind: "course",
        target: id,
        status: "failed",
        http_status: scrape.status,
        error: `Firecrawl ${scrape.status}`,
      });
      throw new Error(`Fetch failed (${scrape.status})`);
    }

    const parsed: ParsedCourse | null = parseCoursePage({
      url,
      html: scrape.html,
      markdown: scrape.markdown,
    });
    if (!parsed) throw new Error("Could not parse course page");

    // Upsert KB row
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("pdga_kb_courses").upsert(
      {
        pdga_course_id: parsed.pdga_course_id ?? id,
        name: parsed.name,
        city: parsed.city,
        state: parsed.state,
        country: parsed.country,
        postal_code: parsed.postal_code,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        hole_count: parsed.hole_count,
        designer: parsed.designer,
        year_established: parsed.year_established,
        pdga_url: url,
        raw: { markdown: scrape.markdown?.slice(0, 20_000) ?? null },
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "pdga_course_id" },
    );

    // Enrich matching `courses` row (by pdga id, else name)
    const enrichPatch = {
      pdga_course_id: parsed.pdga_course_id ?? id,
      pdga_url: url,
      country: parsed.country,
      postal_code: parsed.postal_code,
      hole_count_verified: parsed.hole_count != null,
      enriched_at: new Date().toISOString(),
      enrichment_source: "pdga_kb",
    };
    const { data: byId } = await supabaseAdmin
      .from("courses")
      .select("id")
      .eq("pdga_course_id", parsed.pdga_course_id ?? id)
      .maybeSingle();
    if (byId) {
      await supabaseAdmin.from("courses").update(enrichPatch).eq("id", byId.id);
      // PDGA's listed coordinates upgrade approximate pins only — never a GPS-verified or source pin.
      if (parsed.latitude != null && parsed.longitude != null) {
        await supabaseAdmin.from("courses")
          .update({ latitude: parsed.latitude, longitude: parsed.longitude, location_quality: "source_coordinate" })
          .eq("id", byId.id)
          .in("location_quality", ["address_geocoded", "park_geocoded", "city_approximate", "unknown"]);
      }
    } else if (parsed.name) {
      await supabaseAdmin
        .from("courses")
        .update(enrichPatch)
        .ilike("name", parsed.name)
        .is("pdga_course_id", null);
    }

    await logJob(context.supabase, {
      kind: "course",
      target: id,
      status: "success",
      http_status: 200,
      result: { name: parsed.name },
    });

    return { ok: true, parsed };
  });

// ============ Scrape: player ============

export const pdgaScrapePlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pdgaNumber: number | string }) =>
    z.object({ pdgaNumber: z.coerce.number().int().positive() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isAdmin) throw new Error("Super admin only");

    const url = `https://www.pdga.com/player/${data.pdgaNumber}`;
    await throttleCheck(context.supabase);
    const scrape = await firecrawlScrape(url);
    if (scrape.status !== 200) {
      await logJob(context.supabase, {
        kind: "player",
        target: String(data.pdgaNumber),
        status: "failed",
        http_status: scrape.status,
      });
      throw new Error(`Fetch failed (${scrape.status})`);
    }
    const parsed: ParsedPlayer | null = parsePlayerPage({
      url,
      html: scrape.html,
      markdown: scrape.markdown,
    });
    if (!parsed) throw new Error("Could not parse player page");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("pdga_kb_players").upsert(
      {
        pdga_number: parsed.pdga_number,
        name: parsed.name,
        rating: parsed.rating,
        class: parsed.class,
        city: parsed.city,
        state: parsed.state,
        country: parsed.country,
        member_since: parsed.member_since,
        official_status: parsed.official_status,
        career_wins: parsed.career_wins,
        pdga_url: url,
        raw: { markdown: scrape.markdown?.slice(0, 20_000) ?? null },
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "pdga_number" },
    );

    // Enrich pdga_players
    await supabaseAdmin
      .from("pdga_players")
      .update({
        city: parsed.city,
        state: parsed.state,
        country: parsed.country,
        member_since: parsed.member_since,
        class: parsed.class,
        official_status: parsed.official_status,
        career_wins: parsed.career_wins,
        enriched_at: new Date().toISOString(),
      })
      .eq("pdga_number", String(parsed.pdga_number));

    await logJob(context.supabase, {
      kind: "player",
      target: String(parsed.pdga_number),
      status: "success",
      http_status: 200,
      result: { name: parsed.name, rating: parsed.rating },
    });

    return { ok: true, parsed };
  });

// ============ Scrape: event ============

export const pdgaScrapeEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pdgaEventId?: string; url?: string }) =>
    z
      .object({
        pdgaEventId: z.string().regex(/^\d+$/).optional(),
        url: z.string().url().optional(),
      })
      .refine((v) => v.pdgaEventId || v.url)
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isAdmin) throw new Error("Super admin only");

    const id = data.pdgaEventId ?? classifyPdgaUrl(data.url ?? "").key;
    if (!id) throw new Error("Invalid PDGA event reference");
    // Always scrape the canonical PDGA page built from the id — never a caller URL.
    const url = `https://www.pdga.com/tour/event/${id}`;

    await throttleCheck(context.supabase);
    const scrape = await firecrawlScrape(url);
    if (scrape.status !== 200) {
      await logJob(context.supabase, {
        kind: "event",
        target: id,
        status: "failed",
        http_status: scrape.status,
      });
      throw new Error(`Fetch failed (${scrape.status})`);
    }
    const parsed: ParsedEvent | null = parseEventPage({
      url,
      html: scrape.html,
      markdown: scrape.markdown,
    });
    if (!parsed) throw new Error("Could not parse event page");

    // Distance from active seed regions
    const { data: regions } = await context.supabase
      .from("pdga_kb_seed_regions")
      .select("latitude, longitude")
      .eq("active", true);
    let distance: number | null = null;
    if (parsed.latitude != null && parsed.longitude != null && regions?.length) {
      distance = Math.min(
        ...regions.map((r: any) =>
          haversineKm(
            { lat: parsed.latitude!, lng: parsed.longitude! },
            { lat: r.latitude, lng: r.longitude },
          ),
        ),
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("pdga_kb_events").upsert(
      {
        pdga_event_id: parsed.pdga_event_id,
        name: parsed.name,
        tier: parsed.tier,
        start_date: parsed.start_date,
        end_date: parsed.end_date,
        host_club: parsed.host_club,
        city: parsed.city,
        state: parsed.state,
        country: parsed.country,
        postal_code: parsed.postal_code,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        distance_from_seed_km: distance,
        course_refs: parsed.course_refs,
        pdga_url: url,
        raw: { markdown: scrape.markdown?.slice(0, 20_000) ?? null },
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "pdga_event_id" },
    );

    // Enrich pdga_events / pdga_tour_events
    const patch = {
      postal_code: parsed.postal_code,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      distance_from_seed_km: distance,
      enriched_at: new Date().toISOString(),
    };
    await supabaseAdmin.from("pdga_events").update(patch).eq("event_ref", parsed.pdga_event_id);
    await supabaseAdmin
      .from("pdga_tour_events")
      .update(patch)
      .eq("pdga_event_id", parsed.pdga_event_id);

    // Enqueue linked courses for later scraping (no immediate fetch)
    if (parsed.course_refs.length) {
      const now = new Date().toISOString();
      const jobs = parsed.course_refs.map((c) => ({
        kind: "course",
        target: c,
        status: "pending",
        next_run_at: now,
      }));
      await supabaseAdmin.from("pdga_kb_sync_jobs").insert(jobs);
    }

    await logJob(context.supabase, {
      kind: "event",
      target: id,
      status: "success",
      http_status: 200,
      result: { name: parsed.name, distance_km: distance },
    });

    return { ok: true, parsed, distance_km: distance };
  });

// ============ Ingest arbitrary URL ============

export const pdgaIngestUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string }) => z.object({ url: z.string().url() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isAdmin) throw new Error("Super admin only");

    let host = "";
    try {
      host = new URL(data.url).hostname.toLowerCase();
    } catch {
      /* invalid */
    }
    if (host !== "pdga.com" && host !== "www.pdga.com") {
      throw new Error("Only pdga.com links can be imported");
    }
    const cls = classifyPdgaUrl(data.url);
    if (cls.kind === "unknown" || !cls.key) {
      throw new Error("URL is not a recognized PDGA course, player, or event");
    }
    if (cls.kind === "course")
      return pdgaScrapeCourse({ data: { pdgaCourseId: cls.key } });
    if (cls.kind === "player") return pdgaScrapePlayer({ data: { pdgaNumber: Number(cls.key) } });
    return pdgaScrapeEvent({ data: { pdgaEventId: cls.key } });
  });

// ============ Enqueue seed batch ============
// Queues N events from PDGA tour search around the active seed region(s).
// We queue jobs only; the /admin page then calls processSeedBatch which
// respects the rate limiter.

export const enqueueSeedBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { count?: number }) =>
    z.object({ count: z.number().int().min(1).max(50).default(10) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isAdmin) throw new Error("Super admin only");

    // Courses and players come first: queue PDGA course pages for every
    // course we already link to PDGA but haven't read yet, and player pages
    // for known PDGA players without a profile read. Events are no longer
    // discovered here — they're much less important for the app.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.count * 20;
    const [{ data: kbC }, { data: kbP }, { data: queued }] = await Promise.all([
      supabaseAdmin.from("pdga_kb_courses").select("pdga_course_id").limit(20000),
      supabaseAdmin.from("pdga_kb_players").select("pdga_number").limit(50000),
      supabaseAdmin.from("pdga_kb_sync_jobs").select("kind, target").in("kind", ["course", "player"]).in("status", ["pending", "running"]).limit(20000),
    ]);
    const haveC = new Set([...(kbC ?? []).map((r) => String(r.pdga_course_id)), ...(queued ?? []).filter((q) => q.kind === "course").map((q) => q.target)]);
    const haveP = new Set([...(kbP ?? []).map((r) => String(r.pdga_number)), ...(queued ?? []).filter((q) => q.kind === "player").map((q) => q.target)]);
    const [{ data: cs }, { data: ps }] = await Promise.all([
      supabaseAdmin.from("courses").select("pdga_course_id").not("pdga_course_id", "is", null).eq("is_ghost", false).limit(20000),
      supabaseAdmin.from("pdga_players").select("pdga_number").limit(50000),
    ]);
    const now = new Date().toISOString();
    const courseRows = [...new Set((cs ?? []).map((c) => String(c.pdga_course_id)))].filter((id) => !haveC.has(id)).slice(0, limit)
      .map((target) => ({ kind: "course", target, status: "pending", next_run_at: now }));
    const playerRows = [...new Set((ps ?? []).map((p) => String(p.pdga_number)))].filter((n) => !haveP.has(n)).slice(0, limit)
      .map((target) => ({ kind: "player", target, status: "pending", next_run_at: now }));
    const rows = [...courseRows, ...playerRows];
    if (rows.length) await supabaseAdmin.from("pdga_kb_sync_jobs").insert(rows).throwOnError();
    return { queued: rows.length, next_batch: data.count };
  });

// ============ Process the next N pending jobs ============

export const processSeedBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { batch?: number; skipEvents?: boolean }) =>
    z.object({ batch: z.number().int().min(1).max(10).default(3), skipEvents: z.boolean().default(false) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isAdmin) throw new Error("Super admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Courses and players always go first; events only run when nothing else waits.
    const pick = (kinds: string[]) =>
      supabaseAdmin.from("pdga_kb_sync_jobs").select("id, kind, target").eq("status", "pending").in("kind", kinds)
        .lte("next_run_at", new Date().toISOString()).order("created_at", { ascending: true }).limit(data.batch);
    let { data: jobs } = await pick(["course", "player"]);
    if (!jobs?.length && !data.skipEvents) ({ data: jobs } = await pick(["event", "directory"]));

    if (!jobs?.length) return { processed: 0, results: [] };
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const j of jobs) {
      await supabaseAdmin
        .from("pdga_kb_sync_jobs")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", j.id);
      try {
        if (j.kind === "course") {
          await pdgaScrapeCourse({ data: { pdgaCourseId: j.target } });
        } else if (j.kind === "player") {
          await pdgaScrapePlayer({ data: { pdgaNumber: Number(j.target) } });
        } else if (j.kind === "event") {
          await pdgaScrapeEvent({ data: { pdgaEventId: j.target } });
        } else if (j.kind === "directory" && j.target.startsWith("tour_search:")) {
          const state = j.target.split(":")[1];
          const url = `https://www.pdga.com/tour/search?state=${state}&year=${new Date().getFullYear()}`;
          await throttleCheck(context.supabase);
          const scrape = await firecrawlScrape(url);
          if (scrape.status === 200) {
            const eventIds = Array.from((scrape.html ?? "").matchAll(/\/tour\/event\/(\d+)/gi)).map(
              (m) => m[1],
            );
            const uniq = Array.from(new Set(eventIds)).slice(0, 30);
            if (uniq.length) {
              await supabaseAdmin.from("pdga_kb_sync_jobs").insert(
                uniq.map((ev) => ({
                  kind: "event",
                  target: ev,
                  status: "pending",
                  next_run_at: new Date().toISOString(),
                })),
              );
            }
          }
        }
        await supabaseAdmin
          .from("pdga_kb_sync_jobs")
          .update({ status: "success", finished_at: new Date().toISOString() })
          .eq("id", j.id);
        results.push({ id: j.id, ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await supabaseAdmin
          .from("pdga_kb_sync_jobs")
          .update({
            status: "failed",
            error: msg,
            finished_at: new Date().toISOString(),
          })
          .eq("id", j.id);
        results.push({ id: j.id, ok: false, error: msg });
      }
    }
    return { processed: jobs.length, results };
  });

// ============ Reads for admin UI ============

export const pdgaKbStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("pdga_kb_stats");
    if (error) throw new Error(error.message);
    return data as {
      courses: number;
      players: number;
      events: number;
      pending: number;
      failed: number;
      last_success: string | null;
    } | null;
  });

export const pdgaKbRecentJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isAdmin) return { jobs: [] };
    const { data } = await context.supabase
      .from("pdga_kb_sync_jobs")
      .select("id, kind, target, status, http_status, error, finished_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    return { jobs: data ?? [] };
  });

export const pdgaKbRetryJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isAdmin) throw new Error("Super admin only");
    await context.supabase
      .from("pdga_kb_sync_jobs")
      .update({ status: "pending", next_run_at: new Date().toISOString(), error: null })
      .eq("id", data.id);
    return { ok: true };
  });
