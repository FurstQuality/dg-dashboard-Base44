/**
 * Durable weather cache shared by every request and every worker isolate.
 *
 * Why this exists: the server runs on short-lived serverless isolates, so an
 * in-memory cache is effectively empty on production. Every widget mount used
 * to hit Open-Meteo directly from the shared platform egress IP, which trips
 * the provider's per-IP rate limit (HTTP 429) and blanks the weather card for
 * everyone at once. Persisting responses in Postgres means:
 *
 *  - one provider call per point per FRESH window, no matter how many players
 *    or isolates are involved;
 *  - a last-good payload to serve when the provider is rate-limiting or down,
 *    so the card degrades to "as of 12 min ago" instead of an error.
 */

const FRESH_MS = 5 * 60 * 1000; // reuse without calling the provider
const STALE_MS = 6 * 60 * 60 * 1000; // acceptable fallback while provider fails

export type CachedWeather = { payload: unknown; fetchedAt: string; ageMs: number };

/** Round to ~1km so nearby players share a single cache slot. */
export function pointKey(kind: string, latitude: number, longitude: number, extra = ""): string {
  return `${kind}:${latitude.toFixed(2)}:${longitude.toFixed(2)}${extra ? `:${extra}` : ""}`;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function readWeatherCache(
  key: string,
  maxAgeMs = FRESH_MS,
): Promise<CachedWeather | null> {
  try {
    const db = await admin();
    const { data } = await db
      .from("weather_cache")
      .select("payload, fetched_at")
      .eq("cache_key", key)
      .maybeSingle();
    if (!data) return null;
    const ageMs = Date.now() - new Date(data.fetched_at as string).getTime();
    if (!Number.isFinite(ageMs) || ageMs > maxAgeMs) return null;
    return { payload: data.payload, fetchedAt: data.fetched_at as string, ageMs };
  } catch {
    // Cache problems must never break a weather lookup.
    return null;
  }
}

export async function readStaleWeatherCache(key: string): Promise<CachedWeather | null> {
  return readWeatherCache(key, STALE_MS);
}

export async function writeWeatherCache(key: string, payload: unknown): Promise<void> {
  try {
    const db = await admin();
    await db
      .from("weather_cache")
      .upsert(
        { cache_key: key, payload: payload as never, fetched_at: new Date().toISOString() },
        { onConflict: "cache_key" },
      );
    // Opportunistic pruning keeps the table small without a scheduled job.
    if (Math.random() < 0.02) {
      await db
        .from("weather_cache")
        .delete()
        .lt("fetched_at", new Date(Date.now() - STALE_MS).toISOString());
    }
  } catch {
    // Non-fatal: a failed write only costs an extra provider call later.
  }
}

/**
 * Fetch JSON with a hard timeout. Hanging upstream calls are the other way the
 * weather card used to fail: without an abort signal a stalled provider socket
 * holds the whole server function until the platform kills the request.
 */
export async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 6000,
): Promise<{ ok: true; body: T } | { ok: false; status: number }> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, body: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * Fetch JSON with bounded retry on rate limits and provider hiccups.
 * Open-Meteo answers 429 when the shared platform IP is busy; a couple of
 * short backoffs almost always clears it, so the widget never has to surface
 * an error for a transient limit.
 */
export async function fetchJsonResilient<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 7000,
  attempts = 3,
): Promise<{ ok: true; body: T } | { ok: false; status: number }> {
  let last: { ok: false; status: number } = { ok: false, status: 0 };
  for (let i = 0; i < attempts; i++) {
    const res = await fetchJsonWithTimeout<T>(url, init, timeoutMs);
    if (res.ok) return res;
    last = res;
    // Anything other than a rate limit or server fault is permanent.
    if (res.status !== 0 && res.status !== 429 && res.status < 500) break;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * Math.pow(2, i)));
  }
  return last;
}

/**
 * Last resort for the weather card: the closest cached reading from a nearby
 * point. Conditions a few miles away are still a useful answer, and it means a
 * rate-limited provider degrades to "as of a while ago" instead of an error.
 */
export async function readNearestWeatherCache(
  kind: string,
  latitude: number,
  longitude: number,
  extra = "",
  maxDegrees = 0.75,
): Promise<CachedWeather | null> {
  try {
    const db = await admin();
    const suffix = extra ? `:${extra}` : "";
    const { data } = await db
      .from("weather_cache")
      .select("cache_key, payload, fetched_at")
      .like("cache_key", `${kind}:%${suffix}`)
      .gt("fetched_at", new Date(Date.now() - STALE_MS).toISOString())
      .order("fetched_at", { ascending: false })
      .limit(400);
    if (!data?.length) return null;

    let best: { row: (typeof data)[number]; dist: number } | null = null;
    for (const row of data) {
      const parts = String(row.cache_key).split(":");
      const lat = Number(parts[1]);
      const lng = Number(parts[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const dist = Math.hypot(lat - latitude, lng - longitude);
      if (dist > maxDegrees) continue;
      if (!best || dist < best.dist) best = { row, dist };
    }
    if (!best) return null;
    const fetchedAt = best.row.fetched_at as string;
    return { payload: best.row.payload, fetchedAt, ageMs: Date.now() - new Date(fetchedAt).getTime() };
  } catch {
    return null;
  }
}
