/**
 * Resilient fetch helpers for keyless weather/geocoding providers.
 *
 * Open-Meteo rate-limits by IP (HTTP 429). A shared server instance serving
 * many players trips that limit quickly, which previously surfaced as
 * "Open-Meteo 429" and a blank weather widget. These helpers add a short
 * in-memory response cache plus bounded retry with backoff, and fall back to
 * the last good cached payload when the provider is temporarily unavailable.
 */

type CacheEntry = { at: number; body: unknown };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

const FRESH_MS = 2 * 60 * 1000; // serve from cache without hitting provider
const STALE_MS = 60 * 60 * 1000; // acceptable fallback when provider fails
const MAX_ENTRIES = 500;

function readCache(key: string, maxAge: number): unknown | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > maxAge) return null;
  return hit.body;
}

function writeCache(key: string, body: unknown): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key, { at: Date.now(), body });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch JSON with cache, request de-duplication, and retry on 429/5xx.
 * Throws only when there is no usable cached payload to fall back on.
 */
export async function fetchJsonCached<T>(
  url: string,
  options: { label: string; init?: RequestInit; attempts?: number } = { label: "Provider" },
): Promise<T> {
  const key = url;
  const fresh = readCache(key, FRESH_MS);
  if (fresh !== null) return fresh as T;

  const pending = inflight.get(key);
  if (pending) return (await pending) as T;

  const attempts = options.attempts ?? 3;
  // Durable, cross-isolate cache key: serverless isolates are short-lived, so
  // the in-memory map above is only an L1. The shared DB slot is what keeps the
  // app under the provider's per-IP rate limit.
  const { readWeatherCache, readStaleWeatherCache, writeWeatherCache } = await import(
    "@/lib/weather-cache.server"
  );
  const dbKey = `url:${key}`;

  const run = (async () => {
    const shared = await readWeatherCache(dbKey);
    if (shared) {
      writeCache(key, shared.payload);
      return shared.payload;
    }

    let lastStatus = 0;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const res = await fetch(url, {
          cache: "no-store",
          ...(options.init ?? {}),
          signal: AbortSignal.timeout(7000),
        });
        if (res.ok) {
          const body = await res.json();
          writeCache(key, body);
          await writeWeatherCache(dbKey, body);
          return body;
        }
        lastStatus = res.status;
        // Only 429 and 5xx are worth retrying; 4xx others are permanent.
        if (res.status !== 429 && res.status < 500) break;
      } catch {
        lastStatus = 0;
      }
      if (attempt < attempts - 1) await sleep(400 * Math.pow(2, attempt));
    }

    const stale = readCache(key, STALE_MS) ?? (await readStaleWeatherCache(dbKey))?.payload ?? null;
    if (stale !== null) return stale;
    throw new Error(
      lastStatus === 429
        ? `${options.label} is busy right now — try again in a moment`
        : `${options.label} is unavailable right now (${lastStatus || "network error"})`,
    );
  })();

  inflight.set(key, run);
  try {
    return (await run) as T;
  } finally {
    inflight.delete(key);
  }
}
