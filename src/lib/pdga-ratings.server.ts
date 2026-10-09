/**
 * One place that answers "what's this player's current rating?".
 *
 * Every event, field list, and scoreboard in the app goes through here so a
 * player never shows a blank rating on one screen and a number on another.
 * Order of truth:
 *   1. cached PDGA player records (pdga_players)
 *   2. the knowledge-base player table (pdga_kb_players)
 *   3. any cached event roster scrape (pdga_event_field)
 *   4. a live PDGA profile read for whoever is still missing, cached back into
 *      pdga_players so the next screen is instant
 *
 * Live reads are bounded: a handful at a time, capped per call, and failures
 * are swallowed — a missing rating renders as "—" rather than breaking a page.
 */

const LIVE_LOOKUP_CAP = 60;
const LIVE_CONCURRENCY = 6;
/** Ratings move once every few weeks; anything fresher than this is trusted. */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type RatingMap = Map<string, number | null>;

function digits(value: string | number | null | undefined): string {
  return value == null ? "" : String(value).replace(/\D/g, "");
}

function parseCurrentRating(html: string): number | null {
  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
  const m = plain.match(/Current Rating[:\s]+(\d{3,4})/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 300 && n <= 1200 ? n : null;
}

function parsePlayerName(html: string): string | null {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return null;
  const name = m[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/#\s*\d+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return name || null;
}

async function fetchRating(
  pdgaNumber: string,
): Promise<{ rating: number | null; name: string | null }> {
  try {
    const res = await fetch(`https://www.pdga.com/player/${pdgaNumber}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return { rating: null, name: null };
    const html = await res.text();
    return { rating: parseCurrentRating(html), name: parsePlayerName(html) };
  } catch {
    return { rating: null, name: null };
  }
}

/**
 * Resolve current ratings for a set of PDGA numbers.
 *
 * `eventRef` lets a cached roster scrape for that event fill gaps before we
 * hit the network. Set `live: false` to stay entirely on cached data.
 */
export async function resolvePdgaRatings(
  numbers: Array<string | number | null | undefined>,
  opts: { eventRef?: string | null; live?: boolean } = {},
): Promise<RatingMap> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ratings: RatingMap = new Map();

  const nums = Array.from(new Set(numbers.map(digits).filter((n) => n.length > 0)));
  if (nums.length === 0) return ratings;

  const numeric = nums.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  const staleBefore = new Date(Date.now() - CACHE_TTL_MS).toISOString();

  const [players, kb, roster] = await Promise.all([
    supabaseAdmin
      .from("pdga_players")
      .select("pdga_number, current_rating, refreshed_at")
      .in("pdga_number", nums),
    numeric.length
      ? supabaseAdmin
          .from("pdga_kb_players")
          .select("pdga_number, rating")
          .in("pdga_number", numeric)
      : Promise.resolve({ data: [] as Array<{ pdga_number: number; rating: number | null }> }),
    opts.eventRef
      ? supabaseAdmin
          .from("pdga_event_field")
          .select("pdga_number, rating")
          .eq("event_ref", opts.eventRef)
          .in("pdga_number", nums)
      : Promise.resolve({ data: [] as Array<{ pdga_number: string; rating: number | null }> }),
  ]);

  const fresh = new Set<string>();
  for (const row of players.data ?? []) {
    const key = digits(row.pdga_number as string);
    const value = (row.current_rating as number | null) ?? null;
    if (value != null) {
      ratings.set(key, value);
      if ((row.refreshed_at as string) > staleBefore) fresh.add(key);
    }
  }
  for (const row of (kb.data ?? []) as Array<{ pdga_number: number; rating: number | null }>) {
    const key = digits(row.pdga_number);
    if (row.rating != null && ratings.get(key) == null) ratings.set(key, row.rating);
  }
  for (const row of (roster.data ?? []) as Array<{ pdga_number: string; rating: number | null }>) {
    const key = digits(row.pdga_number);
    if (row.rating != null && ratings.get(key) == null) ratings.set(key, row.rating);
  }

  if (opts.live === false) return ratings;

  // Anyone we still have no rating for gets a live profile read.
  const missing = nums
    .filter((n) => ratings.get(n) == null && !fresh.has(n))
    .slice(0, LIVE_LOOKUP_CAP);
  if (missing.length === 0) return ratings;

  const found: Array<{ pdga_number: string; name: string | null; current_rating: number }> = [];
  for (let i = 0; i < missing.length; i += LIVE_CONCURRENCY) {
    const batch = missing.slice(i, i + LIVE_CONCURRENCY);
    const results = await Promise.all(batch.map((n) => fetchRating(n)));
    batch.forEach((num, idx) => {
      const hit = results[idx];
      if (hit?.rating != null) {
        ratings.set(num, hit.rating);
        found.push({ pdga_number: num, name: hit.name, current_rating: hit.rating });
      }
    });
  }

  // Cache what we learned so the next page load doesn't repeat the network trip.
  if (found.length) {
    try {
      const refreshedAt = new Date().toISOString();
      await supabaseAdmin.from("pdga_players").upsert(
        found.map((f) => ({
          pdga_number: f.pdga_number,
          ...(f.name ? { name: f.name } : {}),
          current_rating: f.current_rating,
          refreshed_at: refreshedAt,
        })),
        { onConflict: "pdga_number" },
      );
    } catch {
      /* caching is best-effort */
    }
  }

  return ratings;
}

/**
 * Fill in official ratings for stored PDGA players who have none yet, so the
 * app shows a verified number instead of falling back to a DGD estimate.
 * Capped per pass and rate-limited by `resolvePdgaRatings` itself.
 */
export async function backfillStoredPlayerRatings(limit = 40): Promise<{
  examined: number;
  rated: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("pdga_players")
    .select("pdga_number")
    .is("current_rating", null)
    .order("refreshed_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  const numbers = ((data ?? []) as Array<{ pdga_number: string }>).map((r) => r.pdga_number);
  if (!numbers.length) return { examined: 0, rated: 0 };

  const ratings = await resolvePdgaRatings(numbers, { live: true });
  let rated = 0;
  for (const num of numbers) {
    if (ratings.get(digits(num)) != null) rated += 1;
  }
  return { examined: numbers.length, rated };
}
