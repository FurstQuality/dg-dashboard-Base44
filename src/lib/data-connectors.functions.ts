import { firecrawlRequest, isFirecrawlConfigured } from "@/lib/firecrawl.server";
/**
 * Real-world data connectors:
 *  - Firecrawl-powered scraping for Facebook pages, PDGA course pages, UDisc course pages
 *  - OpenStreetMap Overpass discovery for disc golf courses and clubs
 *  - Open-Meteo weather lookup (free, no key) for rounds and events
 *
 * All calls are server-side. Provider credentials never touch the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_HISTORY = "https://archive-api.open-meteo.com/v1/archive";

/* --------------------------- Firecrawl helper --------------------------- */

async function firecrawlScrape(url: string, formats: string[] = ["markdown", "html"]) {
  if (!isFirecrawlConfigured()) throw new Error("Firecrawl connector is not configured");

  const res = await firecrawlRequest("/scrape", { url, formats, onlyMainContent: false });
  if (!res.ok) throw new Error(`Source lookup failed (${res.status}). Please try again.`);
  const body = await res.text();
  const json = JSON.parse(body);
  const data = json.data ?? json;
  return {
    markdown: data.markdown as string | undefined,
    html: data.html as string | undefined,
    metadata: data.metadata as Record<string, unknown> | undefined,
  };
}

/* --------------------------- Parsers --------------------------- */

function pickMeta(html: string | undefined, props: string[]): string | null {
  if (!html) return null;
  for (const p of props) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']+)["']`,
      "i",
    );
    const m = html.match(re);
    if (m) return m[1];
  }
  return null;
}

function extractLatLng(html: string | undefined): { lat: number; lng: number } | null {
  if (!html) return null;
  // Common patterns from FB / UDisc / PDGA pages
  const geoRe =
    /["']?(?:latitude|lat)["']?\s*[:=]\s*(-?\d+\.\d+)[^0-9-]+["']?(?:longitude|lng|lon)["']?\s*[:=]\s*(-?\d+\.\d+)/i;
  const m = html.match(geoRe);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  return null;
}

function detectSource(url: string): "facebook" | "instagram" | "pdga" | "udisc" | "website" {
  const u = url.toLowerCase();
  if (u.includes("facebook.com") || u.includes("fb.com")) return "facebook";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("pdga.com")) return "pdga";
  if (u.includes("udisc.com")) return "udisc";
  return "website";
}

/**
 * Club pages we are willing to fetch server-side. Anything else is rejected
 * before a request goes out, so the scraper can't be used as an open proxy or
 * to probe internal addresses.
 */
const CLUB_SCRAPE_HOSTS = [
  "facebook.com",
  "fb.com",
  "m.facebook.com",
  "instagram.com",
  "pdga.com",
  "udisc.com",
  "discgolfscene.com",
  "meetup.com",
  "linktr.ee",
];

/** Throws unless `raw` is a public https(s) URL on an allowed club-page host. */
export function assertClubScrapeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("That doesn't look like a valid link");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("Only http(s) links are supported");
  }
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    host === "169.254.169.254" ||
    /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    /^\[?(::1|fc00|fd|fe80)/i.test(host)
  ) {
    throw new Error("That host isn't allowed");
  }
  const allowed = CLUB_SCRAPE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  if (!allowed) {
    throw new Error(
      "Paste a Facebook, Instagram, UDisc, PDGA, Disc Golf Scene, Meetup, or Linktree club link",
    );
  }
  return u.toString();
}

/* --------------------------- Social fallbacks --------------------------- */

/** Sources that refuse automated reads; we collect their details by hand. */
const SOCIAL_MANUAL_SOURCES = new Set(["facebook", "instagram"]);

/** True when the scraper reported the site as unsupported or off-limits. */
function isUnsupportedSiteError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("do not support this site") ||
    m.includes("firecrawl 403") ||
    m.includes("forbidden") ||
    m.includes("unsupported")
  );
}

/** A friendly starting name for a social link we couldn't read. */
function guessSocialClubName(url: string, source: string): string {
  let handle = "";
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    handle = /^\d+$/.test(last) ? "" : last.replace(/[-_.]+/g, " ").trim();
  } catch {
    handle = "";
  }
  const label = source === "instagram" ? "Instagram club" : "Facebook club";
  if (!handle) return label;
  return handle.replace(/\b\w/g, (c) => c.toUpperCase());
}

/* --------------------------- Scrape single club --------------------------- */

export const scrapeClubUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { url: string }) =>
    z
      .object({ url: z.string().url().max(500) })
      .transform((v) => ({ url: assertClubScrapeUrl(v.url) }))
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const src = detectSource(data.url);

    // Facebook and Instagram block automated reads outright, so don't even try:
    // hand the link back for manual entry instead of failing the whole flow.
    if (SOCIAL_MANUAL_SOURCES.has(src)) {
      await context.supabase.from("data_ingest_jobs").insert({
        user_id: context.userId,
        kind: `club_scrape:${src}`,
        source_url: data.url,
        status: "completed",
        result: { manual: true, reason: "social_site_blocks_reads" },
      });
      return {
        source: src,
        url: data.url,
        name: guessSocialClubName(data.url, src),
        description: null,
        cover_image_url: null,
        latitude: null,
        longitude: null,
        needs_manual: true as boolean,
      };
    }

    let scraped: Awaited<ReturnType<typeof firecrawlScrape>>;
    try {
      scraped = await firecrawlScrape(data.url, ["markdown", "html"]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isUnsupportedSiteError(msg)) {
        return {
          source: src,
          url: data.url,
          name: guessSocialClubName(data.url, src),
          description: null,
          cover_image_url: null,
          latitude: null,
          longitude: null,
          needs_manual: true as boolean,
        };
      }
      throw err;
    }
    const meta = scraped.metadata ?? {};

    const name =
      pickMeta(scraped.html, ["og:title", "twitter:title"]) ||
      (typeof meta.title === "string" ? meta.title : null) ||
      "Untitled Club";
    const description =
      pickMeta(scraped.html, ["og:description", "twitter:description", "description"]) ||
      (typeof meta.description === "string" ? meta.description : null);
    const image = pickMeta(scraped.html, ["og:image", "twitter:image"]);
    const geo = extractLatLng(scraped.html);

    // Audit
    await context.supabase.from("data_ingest_jobs").insert({
      user_id: context.userId,
      kind: `club_scrape:${src}`,
      source_url: data.url,
      status: "completed",
      result: { name, has_image: !!image, geo },
    });

    return {
      source: src,
      url: data.url,
      name: name.replace(/\s+\|\s+Facebook.*$/i, "").trim(),
      description,
      cover_image_url: image,
      latitude: geo?.lat ?? null,
      longitude: geo?.lng ?? null,
      needs_manual: false as boolean,
    };
  });

/* --------------------------- Save scraped club --------------------------- */

const CLUB_SAVE = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  cover_image_url: z.string().url().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  facebook_url: z.string().url().nullable().optional(),
  instagram_url: z.string().url().nullable().optional(),
  website_url: z.string().url().nullable().optional(),
  external_source: z.string().max(40).nullable().optional(),
  external_id: z.string().max(200).nullable().optional(),
});

export const saveIngestedClub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => CLUB_SAVE.parse(input))
  .handler(async ({ data, context }) => {
    // Dedup: match by external_source+external_id, else by name (case-insensitive)
    if (data.external_source && data.external_id) {
      const { data: existing } = await context.supabase
        .from("clubs")
        .select("id, slug")
        .eq("external_source", data.external_source)
        .eq("external_id", data.external_id)
        .maybeSingle();
      if (existing) return { id: existing.id, slug: existing.slug, existed: true };
    }
    const { data: dup } = await context.supabase
      .from("clubs")
      .select("id, slug")
      .ilike("name", data.name)
      .maybeSingle();
    if (dup) return { id: dup.id, slug: dup.slug, existed: true };

    const slug =
      data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 60) +
      "-" +
      Math.random().toString(36).slice(2, 6);

    const { data: created, error } = await context.supabase
      .from("clubs")
      .insert({
        name: data.name,
        slug,
        description: data.description ?? null,
        location: data.location ?? null,
        cover_url: data.cover_image_url ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        facebook_url: data.facebook_url ?? null,
        instagram_url: data.instagram_url ?? null,
        website_url: data.website_url ?? null,
        external_source: data.external_source ?? null,
        external_id: data.external_id ?? null,
        last_synced_at: new Date().toISOString(),
        owner_id: context.userId,
      })
      .select("id, slug")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id, slug: created.slug, existed: false };
  });

/* --------------------------- Bulk import URLs --------------------------- */

export const bulkImportClubUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { urls: string[] }) =>
    z
      .object({ urls: z.array(z.string().url().max(500)).min(1).max(30) })
      .transform((v) => ({ urls: v.urls.map((u) => assertClubScrapeUrl(u)) }))
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const results: Array<{
      url: string;
      ok: boolean;
      club_id?: string;
      slug?: string;
      existed?: boolean;
      error?: string;
    }> = [];
    for (const url of data.urls) {
      try {
        const src = detectSource(url);
        if (SOCIAL_MANUAL_SOURCES.has(src)) {
          throw new Error(
            "Facebook and Instagram don't share club details — add this one from the Clubs page and we'll attach the link.",
          );
        }
        const scraped = await firecrawlScrape(url, ["html"]);

        const name =
          pickMeta(scraped.html, ["og:title"]) ||
          (typeof scraped.metadata?.title === "string" ? scraped.metadata.title : null) ||
          new URL(url).hostname;
        const description = pickMeta(scraped.html, ["og:description", "description"]);
        const image = pickMeta(scraped.html, ["og:image"]);
        const geo = extractLatLng(scraped.html);

        // Dedup by name
        const { data: dup } = await context.supabase
          .from("clubs")
          .select("id, slug")
          .ilike("name", name)
          .maybeSingle();
        if (dup) {
          results.push({ url, ok: true, club_id: dup.id, slug: dup.slug, existed: true });
          continue;
        }
        const slug =
          name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")
            .slice(0, 60) +
          "-" +
          Math.random().toString(36).slice(2, 6);
        const patch = {
          name: name.replace(/\s+\|\s+Facebook.*$/i, "").trim(),
          slug,
          description,
          cover_url: image,
          latitude: geo?.lat ?? null,
          longitude: geo?.lng ?? null,
          external_source: src,
          last_synced_at: new Date().toISOString(),
          owner_id: context.userId,
          facebook_url: src === "facebook" ? url : null,
          instagram_url: src === "instagram" ? url : null,
          website_url: src === "facebook" || src === "instagram" ? null : url,
        };

        const { data: created, error } = await context.supabase
          .from("clubs")
          .insert(patch)
          .select("id, slug")
          .single();

        if (error) throw new Error(error.message);
        results.push({ url, ok: true, club_id: created.id, slug: created.slug, existed: false });
      } catch (e) {
        results.push({ url, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    await context.supabase.from("data_ingest_jobs").insert({
      user_id: context.userId,
      kind: "club_bulk_import",
      status: "completed",
      result: { total: data.urls.length, ok: results.filter((r) => r.ok).length },
    });

    return { results };
  });

/* --------------------------- OSM discovery --------------------------- */

const OverpassInput = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radius_km: z.number().min(1).max(200).default(50),
});

async function runOverpass(query: string) {
  let lastErr: unknown = null;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": "DG Dashboard-DiscGolf/1.0 (+https://dgdashboard.app)",
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (res.status === 429 || res.status === 504 || res.status === 502) {
        lastErr = new Error(`Overpass ${res.status}`);
        continue;
      }
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      return (await res.json()) as {
        elements: Array<{
          type: string;
          id: number;
          lat?: number;
          lon?: number;
          center?: { lat: number; lon: number };
          tags?: Record<string, string>;
        }>;
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Overpass request failed");
}

export const discoverCoursesNearby = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => OverpassInput.parse(input))
  .handler(async ({ data, context }) => {
    const radiusM = Math.round(data.radius_km * 1000);
    const q = `
      [out:json][timeout:25];
      (
        node["sport"="disc_golf"](around:${radiusM},${data.latitude},${data.longitude});
        way["sport"="disc_golf"](around:${radiusM},${data.latitude},${data.longitude});
        relation["sport"="disc_golf"](around:${radiusM},${data.latitude},${data.longitude});
        node["leisure"="disc_golf_course"](around:${radiusM},${data.latitude},${data.longitude});
        way["leisure"="disc_golf_course"](around:${radiusM},${data.latitude},${data.longitude});
      );
      out center tags;`;
    const raw = await runOverpass(q);
    const seen = new Set<string>();
    const places = raw.elements
      .map((el) => {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat == null || lon == null) return null;
        const key = `${el.type}:${el.id}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return {
          osm_type: el.type,
          osm_id: el.id,
          kind: "course",
          name: el.tags?.name ?? "Unnamed course",
          latitude: lat,
          longitude: lon,
          address: el.tags?.["addr:full"] ?? null,
          tags: el.tags ?? {},
        };
      })
      .filter(Boolean) as Array<{
      osm_type: string;
      osm_id: number;
      kind: string;
      name: string;
      latitude: number;
      longitude: number;
      address: string | null;
      tags: Record<string, string>;
    }>;

    // Cache using service role
    if (places.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("osm_places").upsert(
        places.map((p) => ({ ...p, last_seen_at: new Date().toISOString() })),
        { onConflict: "osm_type,osm_id", ignoreDuplicates: false },
      );
    }

    await context.supabase.from("data_ingest_jobs").insert({
      user_id: context.userId,
      kind: "osm_courses_discover",
      status: "completed",
      result: { found: places.length, radius_km: data.radius_km },
    });

    return { places };
  });

/* --------------------------- Weather --------------------------- */

const WeatherInput = z.object({
  latitude: z.number(),
  longitude: z.number(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const fetchWeatherForPoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => WeatherInput.parse(input))
  .handler(async ({ data }) => {
    const fetchedAt = new Date().toISOString();
    const isPast = data.date
      ? new Date(data.date) < new Date(Date.now() - 24 * 3600 * 1000)
      : false;
    const params = new URLSearchParams({
      latitude: String(data.latitude),
      longitude: String(data.longitude),
      temperature_unit: "fahrenheit",
      wind_speed_unit: "mph",
      timezone: "auto",
    });

    let url: string;
    if (isPast && data.date) {
      params.set("start_date", data.date);
      params.set("end_date", data.date);
      params.set(
        "daily",
        "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant,weather_code",
      );
      url = `${OPEN_METEO_HISTORY}?${params.toString()}`;
    } else {
      params.set(
        "current",
        "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day",
      );
      params.set(
        "hourly",
        "temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day",
      );
      params.set(
        "daily",
        "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,weather_code",
      );
      params.set("forecast_days", "3");
      url = `${OPEN_METEO_URL}?${params.toString()}`;
    }

    const {
      pointKey,
      readWeatherCache,
      readStaleWeatherCache,
      writeWeatherCache,
      fetchJsonResilient,
      readNearestWeatherCache,
    } = await import("@/lib/weather-cache.server");

    type WeatherPayload = {
      current?: Record<string, number | string>;
      hourly?: Record<string, Array<number | string>>;
      daily?: Record<string, Array<number | string>>;
      timezone?: string;
      alerts?: Array<{
        id: string;
        event: string;
        severity: string;
        urgency: string;
        headline: string;
        description: string;
        effective: string;
        expires: string;
      }>;
      fetchedAt?: string | null;
      observedAt?: string | null;
      observedStation?: string | null;
      stale?: boolean;
    };

    // One shared slot per ~1km point (and per archive date) across all players
    // and all worker isolates. This is what keeps the app under the provider's
    // per-IP rate limit.
    const cacheKey = pointKey(
      isPast ? "archive" : "forecast",
      data.latitude,
      data.longitude,
      data.date ?? "",
    );
    const fresh = await readWeatherCache(cacheKey);
    if (fresh) return { ...(fresh.payload as WeatherPayload), fetchedAt: fresh.fetchedAt };

    const providerResult = await fetchJsonResilient<WeatherPayload>(url, {}, 7000, 3);
    if (!providerResult.ok) {
      // Rate-limited, down, or slow: serve the last good reading rather than
      // blanking the weather card, and fall back to the closest nearby point
      // before ever showing an error.
      const stale =
        (await readStaleWeatherCache(cacheKey)) ??
        (await readNearestWeatherCache(
          isPast ? "archive" : "forecast",
          data.latitude,
          data.longitude,
          data.date ?? "",
        ));
      if (stale) {
        return { ...(stale.payload as WeatherPayload), fetchedAt: stale.fetchedAt, stale: true };
      }
      throw new Error(
        providerResult.status === 429
          ? "The weather service is busy right now — try again in a moment"
          : `The weather service is unavailable right now (${providerResult.status || "network error"})`,
      );
    }
    const body = providerResult.body;

    // Attach US NWS active alerts (free, keyless). Non-US points simply return empty features.
    let alerts: Array<{
      id: string;
      event: string;
      severity: string;
      urgency: string;
      headline: string;
      description: string;
      effective: string;
      expires: string;
    }> = [];
    try {
      const alertRes = await fetch(
        `https://api.weather.gov/alerts/active?point=${data.latitude},${data.longitude}`,
        {
          cache: "no-store",
          headers: {
            "User-Agent": "DG-Dashboard (support@dgdashboard.app)",
            Accept: "application/geo+json",
          },
          // Hard cap: a stalled NWS socket must never hold the whole lookup.
          signal: AbortSignal.timeout(4000),
        },
      );
      if (alertRes.ok) {
        const j = (await alertRes.json()) as {
          features?: Array<{ id: string; properties: Record<string, string> }>;
        };
        // Only surface alerts relevant to disc golf play (weather that affects
        // outdoor safety on a course). Beach hazards, marine, coastal flood,
        // rip currents, air quality, heat/cold advisories for indoors, etc.
        // are filtered out.
        const RELEVANT =
          /tornado|thunderstorm|severe|lightning|wind|hurricane|tropical|hail|blizzard|winter storm|ice storm|snow squall|flash flood|flood warning|extreme|dust storm/i;
        const EXCLUDE =
          /beach|marine|rip current|surf|coastal|small craft|swim|boil water|air quality|shelter|child|amber|silver/i;
        alerts = (j.features ?? [])
          .map((f) => ({
            id: f.id,
            event: f.properties.event ?? "Alert",
            severity: f.properties.severity ?? "Unknown",
            urgency: f.properties.urgency ?? "Unknown",
            headline: f.properties.headline ?? f.properties.event ?? "Weather alert",
            description: f.properties.description ?? "",
            effective: f.properties.effective ?? "",
            expires: f.properties.expires ?? "",
          }))
          .filter((a) => RELEVANT.test(a.event) && !EXCLUDE.test(a.event));
      }
    } catch {
      // Alerts are best-effort; do not fail the weather call if NWS is unavailable.
    }

    // For US points, overlay the latest NWS station observation on top of the
    // model-derived "current" block. Open-Meteo's current values are hourly
    // model interpolations and can drift several degrees from actual readings;
    // NWS observations come from real ASOS/AWOS stations updated every few
    // minutes, so they are the source of truth when available.
    let observedAt: string | null = null;
    let observedStation: string | null = null;
    if (!isPast) {
      try {
        const stationsRes = await fetch(
          `https://api.weather.gov/points/${data.latitude.toFixed(4)},${data.longitude.toFixed(4)}/stations`,
          {
            cache: "no-store",
            headers: {
              "User-Agent": "DG-Dashboard (support@dgdashboard.app)",
              Accept: "application/geo+json",
            },
            signal: AbortSignal.timeout(4000),
          },
        );
        if (stationsRes.ok) {
          const stationsJ = (await stationsRes.json()) as {
            features?: Array<{ properties: { stationIdentifier?: string; name?: string } }>;
          };
          const stationId = stationsJ.features?.[0]?.properties?.stationIdentifier;
          const stationName = stationsJ.features?.[0]?.properties?.name ?? null;
          if (stationId) {
            const obsRes = await fetch(
              `https://api.weather.gov/stations/${stationId}/observations/latest?require_qc=false`,
              {
                cache: "no-store",
                headers: {
                  "User-Agent": "DG-Dashboard (support@dgdashboard.app)",
                  Accept: "application/geo+json",
                },
                signal: AbortSignal.timeout(4000),
              },
            );
            if (obsRes.ok) {
              const obsJ = (await obsRes.json()) as {
                properties?: {
                  timestamp?: string;
                  temperature?: { value: number | null; unitCode: string };
                  dewpoint?: { value: number | null };
                  windSpeed?: { value: number | null };
                  windGust?: { value: number | null };
                  windDirection?: { value: number | null };
                  relativeHumidity?: { value: number | null };
                  heatIndex?: { value: number | null };
                  windChill?: { value: number | null };
                  precipitationLastHour?: { value: number | null };
                  presentWeather?: Array<{ weather?: string }>;
                };
              };
              const p = obsJ.properties;
              if (p) {
                const observedTime = p.timestamp ? new Date(p.timestamp).getTime() : NaN;
                const stationObservationIsFresh =
                  Number.isFinite(observedTime) && Date.now() - observedTime <= 90 * 60 * 1000;

                if (stationObservationIsFresh) {
                  const cToF = (c: number | null | undefined) =>
                    c == null ? null : (c * 9) / 5 + 32;
                  const kmhToMph = (k: number | null | undefined) =>
                    k == null ? null : k * 0.621371;
                  const mmToIn = (m: number | null | undefined) => (m == null ? null : m / 25.4);

                  const temp = cToF(p.temperature?.value);
                  const feels = cToF(p.heatIndex?.value ?? p.windChill?.value) ?? temp;
                  const humidity =
                    p.relativeHumidity?.value != null ? Math.round(p.relativeHumidity.value) : null;
                  const wind = kmhToMph(p.windSpeed?.value);
                  const gust = kmhToMph(p.windGust?.value);
                  const windDir = p.windDirection?.value != null ? p.windDirection.value : null;
                  const precip = mmToIn(p.precipitationLastHour?.value);

                  // Only overwrite fields we actually have real observations for.
                  const cur: Record<string, number | string> = { ...(body.current ?? {}) };
                  if (temp != null) cur.temperature_2m = temp;
                  if (feels != null) cur.apparent_temperature = feels;
                  if (humidity != null) cur.relative_humidity_2m = humidity;
                  if (wind != null) cur.wind_speed_10m = wind;
                  if (gust != null) cur.wind_gusts_10m = gust;
                  if (windDir != null) cur.wind_direction_10m = windDir;
                  if (precip != null) cur.precipitation = precip;
                  body.current = cur;
                  observedAt = p.timestamp ?? null;
                  observedStation = stationName;
                }
              }
            }
          }
        }
      } catch {
        // NWS observations are best-effort; keep Open-Meteo values on failure.
      }
    }

    const payload = { ...body, alerts, fetchedAt, observedAt, observedStation };
    await writeWeatherCache(cacheKey, payload);
    return payload;
  });

/* --------------------------- Zip / place geocoding --------------------------- */

const GeocodeInput = z.object({
  query: z.string().min(2).max(120),
  country: z.string().length(2).optional(),
});

export const geocodeLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => GeocodeInput.parse(input))
  .handler(async ({ data }) => {
    const raw = data.query.trim();
    // Accept "61614", "61614-1234", "ZIP 61614", "zip: 61614" etc.
    const zipMatch = raw.match(/\b(\d{5})(?:-\d{4})?\b/);
    const q = raw;
    // US zip fast path via Zippopotam (free, keyless).
    if (zipMatch) {
      const zip = zipMatch[1];
      const r = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (r.ok) {
        const j = (await r.json()) as {
          places?: Array<{
            latitude: string;
            longitude: string;
            "place name": string;
            "state abbreviation": string;
          }>;
        };
        const p = j.places?.[0];
        if (p) {
          return {
            latitude: Number(p.latitude),
            longitude: Number(p.longitude),
            name: `${p["place name"]}, ${p["state abbreviation"]} ${zip}`,
          };
        }
      }
    }
    // Fall back to Open-Meteo geocoding for city names / non-US zips.
    const params = new URLSearchParams({ name: q, count: "1", language: "en", format: "json" });
    if (data.country) params.set("country_code", data.country);
    const { fetchJsonCached } = await import("@/lib/weather-fetch.server");
    const j = (await fetchJsonCached(
      `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`,
      { label: "Location search" },
    )) as {
      results?: Array<{
        latitude: number;
        longitude: number;
        name: string;
        admin1?: string;
        country_code?: string;
      }>;
    };
    const hit = j.results?.[0];
    if (!hit) throw new Error("No location matched that search");
    const pieces = [hit.name, hit.admin1, hit.country_code].filter(Boolean);
    return { latitude: hit.latitude, longitude: hit.longitude, name: pieces.join(", ") };
  });

/* --------------------------- Day forecast (event-focused) --------------------------- */

const DayForecastInput = z.object({
  latitude: z.number(),
  longitude: z.number(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type DayForecast = {
  date: string;
  is_past: boolean;
  in_range: boolean;
  timezone: string | null;
  hi: number | null;
  lo: number | null;
  precip_sum: number | null;
  precip_prob: number | null;
  wind_max: number | null;
  gust_max: number | null;
  wind_dir: number | null;
  code: number | null;
  hourly: Array<{
    time: string;
    temp: number | null;
    precipProb: number | null;
    precip: number | null;
    wind: number | null;
    gust: number | null;
    windDir: number | null;
    code: number | null;
  }>;
};

export const fetchDayForecast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => DayForecastInput.parse(input))
  .handler(async ({ data }): Promise<DayForecast> => {
    const target = new Date(`${data.date}T12:00:00Z`);
    const now = new Date();
    const daysAhead = Math.round((target.getTime() - now.getTime()) / 86_400_000);
    const isPast = daysAhead < -1;
    // Open-Meteo forecast supports up to 16 days ahead.
    const inRange = !isPast && daysAhead <= 16;

    const params = new URLSearchParams({
      latitude: String(data.latitude),
      longitude: String(data.longitude),
      temperature_unit: "fahrenheit",
      wind_speed_unit: "mph",
      timezone: "auto",
      start_date: data.date,
      end_date: data.date,
    });

    let url: string;
    if (isPast) {
      params.set(
        "daily",
        "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,weather_code",
      );
      params.set(
        "hourly",
        "temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code",
      );
      url = `${OPEN_METEO_HISTORY}?${params.toString()}`;
    } else if (inRange) {
      params.set(
        "daily",
        "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,weather_code",
      );
      params.set(
        "hourly",
        "temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code",
      );
      url = `${OPEN_METEO_URL}?${params.toString()}`;
    } else {
      // Beyond forecast horizon — no reliable data.
      return {
        date: data.date,
        is_past: false,
        in_range: false,
        timezone: null,
        hi: null,
        lo: null,
        precip_sum: null,
        precip_prob: null,
        wind_max: null,
        gust_max: null,
        wind_dir: null,
        code: null,
        hourly: [],
      };
    }

    const { fetchJsonCached } = await import("@/lib/weather-fetch.server");
    const body = (await fetchJsonCached(url, { label: "The weather service" })) as {
      timezone?: string;
      daily?: Record<string, Array<number | string | null>>;
      hourly?: Record<string, Array<number | string | null>>;
    };
    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const daily = body.daily ?? {};
    const hourly = body.hourly ?? {};
    const times = (hourly.time as string[] | undefined) ?? [];
    const hourlyPoints = times.map((t, i) => ({
      time: String(t),
      temp: num(hourly.temperature_2m?.[i]),
      precipProb: num(hourly.precipitation_probability?.[i]),
      precip: num(hourly.precipitation?.[i]),
      wind: num(hourly.wind_speed_10m?.[i]),
      gust: num(hourly.wind_gusts_10m?.[i]),
      windDir: num(hourly.wind_direction_10m?.[i]),
      code: num(hourly.weather_code?.[i]),
    }));

    return {
      date: data.date,
      is_past: isPast,
      in_range: inRange || isPast,
      timezone: body.timezone ?? null,
      hi: num(daily.temperature_2m_max?.[0]),
      lo: num(daily.temperature_2m_min?.[0]),
      precip_sum: num(daily.precipitation_sum?.[0]),
      precip_prob: num(daily.precipitation_probability_max?.[0]),
      wind_max: num(daily.wind_speed_10m_max?.[0]),
      gust_max: num(daily.wind_gusts_10m_max?.[0]),
      wind_dir: num(daily.wind_direction_10m_dominant?.[0]),
      code: num(daily.weather_code?.[0]),
      hourly: hourlyPoints,
    };
  });

/* --------------------------- Recent jobs --------------------------- */

export const listRecentIngestJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("data_ingest_jobs")
      .select("id, kind, source_url, status, result, error, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(25);
    return { jobs: data ?? [] };
  });
