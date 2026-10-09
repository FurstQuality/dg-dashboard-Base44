/**
 * Live event directory ingest.
 *
 * Sweeps the three public disc golf schedules (PDGA tour search, Disc Golf
 * Scene listings, UDisc nearby events), normalizes every result, cross-links
 * duplicates, and mirrors them into `public.event_directory` so `/events`
 * browses live events instead of only the ones a player imported.
 *
 * Server-only: uses the service-role client for writes because the directory is
 * shared app data, not per-user rows.
 */

import {
  cleanEventName,
  directoryMatchKey,
  parseSceneEventList,
  parseSceneLeagueList,
  parseUdiscEventList,
  type DirectoryEventInput,
  type DirectorySource,
} from "@/lib/event-directory-parse";
import { scrapePdgaTourEvents } from "@/lib/pdga-tour-scrape.server";
import { normalizeStateCode } from "@/lib/us-states";

const UA = "Mozilla/5.0 (compatible; DGDashboard/1.0; +https://dgdashboard.app)";

/** Geo anchors for UDisc's nearby-events feed, which has no national listing. */
export const UDISC_GEO_ANCHORS: Array<{ label: string; lat: number; lng: number }> = [
  { label: "Chicago, IL", lat: 41.88, lng: -87.63 },
  { label: "Minneapolis, MN", lat: 44.98, lng: -93.27 },
  { label: "Kansas City, MO", lat: 39.1, lng: -94.58 },
  { label: "Dallas, TX", lat: 32.78, lng: -96.8 },
  { label: "Houston, TX", lat: 29.76, lng: -95.37 },
  { label: "Denver, CO", lat: 39.74, lng: -104.99 },
  { label: "Phoenix, AZ", lat: 33.45, lng: -112.07 },
  { label: "Salt Lake City, UT", lat: 40.76, lng: -111.89 },
  { label: "Seattle, WA", lat: 47.61, lng: -122.33 },
  { label: "Portland, OR", lat: 45.52, lng: -122.68 },
  { label: "Sacramento, CA", lat: 38.58, lng: -121.49 },
  { label: "Los Angeles, CA", lat: 34.05, lng: -118.24 },
  { label: "Atlanta, GA", lat: 33.75, lng: -84.39 },
  { label: "Charlotte, NC", lat: 35.23, lng: -80.84 },
  { label: "Nashville, TN", lat: 36.16, lng: -86.78 },
  { label: "Orlando, FL", lat: 28.54, lng: -81.38 },
  { label: "Columbus, OH", lat: 39.96, lng: -83.0 },
  { label: "Detroit, MI", lat: 42.33, lng: -83.05 },
  { label: "Pittsburgh, PA", lat: 40.44, lng: -79.99 },
  { label: "Boston, MA", lat: 42.36, lng: -71.06 },
  { label: "New York, NY", lat: 40.71, lng: -74.01 },
  { label: "Richmond, VA", lat: 37.54, lng: -77.44 },
  { label: "Des Moines, IA", lat: 41.59, lng: -93.62 },
  { label: "Little Rock, AR", lat: 34.75, lng: -92.29 },
];

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Run `work` over `items` with bounded concurrency so sweeps stay polite. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await work(items[index]);
    }
  });
  await Promise.all(runners);
  return out;
}

/* ------------------------------- PDGA sweep ------------------------------- */

export async function sweepPdgaEvents(opts?: {
  from?: string;
  to?: string;
  maxPages?: number;
}): Promise<DirectoryEventInput[]> {
  const today = new Date();
  const year = today.getUTCFullYear();
  const from = opts?.from ?? today.toISOString().slice(0, 10);
  const to = opts?.to ?? `${year + 1}-12-31`;
  const seasons = Array.from(new Set([year, Number(to.slice(0, 4))]));

  const batches = await mapLimit(seasons, 2, (season) =>
    scrapePdgaTourEvents({
      year: season,
      from: season === year ? from : `${season}-01-01`,
      to,
      maxPages: opts?.maxPages ?? 4,
      leaguePages: 3,
    }),
  );

  const rows: DirectoryEventInput[] = [];
  for (const scraped of batches.flat()) {
    rows.push({
      source: "pdga",
      source_event_id: scraped.pdga_event_id,
      url: scraped.url,
      name: scraped.name,
      kind: scraped.tier === "L" ? "league" : "tournament",
      tier: scraped.tier,
      sanctioning: scraped.sanctioning ?? "PDGA",
      start_date: scraped.start_date,
      end_date: scraped.end_date,
      venue_name: null,
      city: scraped.city,
      state: scraped.state ? (normalizeStateCode(scraped.state) ?? scraped.state) : null,
      country: scraped.country,
      latitude: null,
      longitude: null,
      registration_status: null,
      field_size: null,
      field_capacity: null,
      cover_url: null,
      pdga_event_ref: scraped.pdga_event_id,
      discovered_via: "pdga_tour_search",
    });
  }
  return rows;
}

/* ---------------------------- Disc Golf Scene ----------------------------- */

export async function sweepSceneEvents(opts?: {
  states?: string[];
  includeLeagues?: boolean;
}): Promise<DirectoryEventInput[]> {
  const states = opts?.states ?? [];
  const targets: Array<{ url: string; kind: "tournament" | "league"; via: string }> = [
    { url: "https://www.discgolfscene.com/tournaments", kind: "tournament", via: "dgs_national" },
  ];
  if (opts?.includeLeagues ?? true) {
    targets.push({
      url: "https://www.discgolfscene.com/leagues",
      kind: "league",
      via: "dgs_national",
    });
  }
  for (const state of states) {
    targets.push({
      url: `https://www.discgolfscene.com/tournaments/${state}`,
      kind: "tournament",
      via: `dgs_state:${state}`,
    });
    if (opts?.includeLeagues ?? true) {
      targets.push({
        url: `https://www.discgolfscene.com/leagues/${state}`,
        kind: "league",
        via: `dgs_state:${state}`,
      });
    }
  }

  const pages = await mapLimit(targets, 4, async (target) => {
    const html = await fetchText(target.url);
    if (!html) return [] as DirectoryEventInput[];
    // Leagues use a different list markup than the tournament listings.
    return target.kind === "league"
      ? parseSceneLeagueList(html, { discoveredVia: target.via })
      : parseSceneEventList(html, { kind: "tournament", discoveredVia: target.via });
  });
  return pages.flat();
}

/* --------------------------------- UDisc --------------------------------- */

export async function sweepUdiscEvents(opts?: {
  anchors?: Array<{ label: string; lat: number; lng: number }>;
}): Promise<DirectoryEventInput[]> {
  const anchors = opts?.anchors ?? UDISC_GEO_ANCHORS;
  const pages = await mapLimit(anchors, 4, async (anchor) => {
    const html = await fetchText(
      `https://udisc.com/events?latitude=${anchor.lat}&longitude=${anchor.lng}`,
    );
    if (!html) return [] as DirectoryEventInput[];
    return parseUdiscEventList(html, { discoveredVia: `udisc_geo:${anchor.label}` });
  });
  return pages.flat();
}

/* ------------------------------ Normalization ----------------------------- */

/** Collapse duplicates within a source, keeping the row with the most detail. */
export function dedupeDirectoryRows(rows: DirectoryEventInput[]): DirectoryEventInput[] {
  const byId = new Map<string, DirectoryEventInput>();
  const score = (r: DirectoryEventInput) =>
    [r.start_date, r.city, r.state, r.venue_name, r.tier, r.cover_url].filter(Boolean).length;
  for (const row of rows) {
    if (!row.name || !row.source_event_id) continue;
    const key = `${row.source}:${row.source_event_id}`;
    const prev = byId.get(key);
    if (!prev || score(row) > score(prev)) byId.set(key, row);
  }
  return Array.from(byId.values());
}

/**
 * Cross-link Scene/UDisc rows to a PDGA event ref when name + date + city line
 * up, so the browser can badge one event with every place it is listed.
 */
export function linkPdgaRefs(rows: DirectoryEventInput[]): DirectoryEventInput[] {
  const pdgaByKey = new Map<string, string>();
  for (const row of rows) {
    if (row.source !== "pdga" || !row.pdga_event_ref) continue;
    pdgaByKey.set(directoryMatchKey(row), row.pdga_event_ref);
  }
  if (!pdgaByKey.size) return rows;
  return rows.map((row) => {
    if (row.source === "pdga" || row.pdga_event_ref) return row;
    const ref = pdgaByKey.get(directoryMatchKey(row));
    return ref ? { ...row, pdga_event_ref: ref } : row;
  });
}

/* -------------------------------- Persistence ---------------------------- */

export type DirectorySweepResult = {
  source: DirectorySource;
  scope: string;
  found: number;
  upserted: number;
  ok: boolean;
  error: string | null;
};

/** Upsert normalized rows and log the sweep. */
export async function persistDirectoryRows(params: {
  source: DirectorySource;
  scope: string;
  rows: DirectoryEventInput[];
  startedAt: string;
  error?: string | null;
}): Promise<DirectorySweepResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows = params.rows;
  let upserted = 0;
  let error = params.error ?? null;

  const refreshedAt = new Date().toISOString();
  // Listings only carry a city, so resolve coordinates before writing —
  // otherwise distance filters have nothing to measure against.
  const { attachDirectoryCoords } = await import("@/lib/event-directory-geo.server");
  const placed = await attachDirectoryCoords(rows);
  // Keep each listing as an unchanged source copy (identical listings stored once).
  const { recordSnapshot } = await import("@/lib/data-intel/snapshots.server");
  await Promise.all(
    rows.filter((r) => r.url).slice(0, 500).map((r) =>
      recordSnapshot({ source: params.source, entityType: "event_listing", externalId: r.url!, sourceUrl: r.url, payload: r, parserVersion: "event-directory-parse" }).catch(() => null),
    ),
  );
  for (let i = 0; i < placed.length; i += 200) {
    const chunk = placed.slice(i, i + 200).map((r) => upsertPayload(r, refreshedAt));

    const { error: writeError } = await supabaseAdmin
      .from("event_directory")
      .upsert(chunk as never, { onConflict: "source,source_event_id" });
    if (writeError) {
      error = error ?? writeError.message;
      break;
    }
    upserted += chunk.length;
  }

  await supabaseAdmin.from("event_directory_syncs").insert({
    source: params.source,
    scope: params.scope,
    found: rows.length,
    upserted,
    ok: !error,
    error,
    started_at: params.startedAt,
    finished_at: new Date().toISOString(),
  } as never);

  return {
    source: params.source,
    scope: params.scope,
    found: rows.length,
    upserted,
    ok: !error,
    error,
  };
}

/**
 * Full directory sweep across the requested sources. Each source is swept and
 * persisted independently so one failing site never blocks the others.
 */
export async function runDirectorySweep(opts?: {
  sources?: DirectorySource[];
  states?: string[];
  anchors?: Array<{ label: string; lat: number; lng: number }>;
  includeLeagues?: boolean;
  /** Pages per PDGA tier bucket. Lower this for background refreshes. */
  pdgaMaxPages?: number;
}): Promise<DirectorySweepResult[]> {
  const sources = opts?.sources ?? ["pdga", "disc_golf_scene", "udisc"];
  const results: DirectorySweepResult[] = [];

  // PDGA is scraped first so Scene/UDisc rows can be cross-linked to its refs.
  let pdgaRows: DirectoryEventInput[] = [];
  if (sources.includes("pdga")) {
    const startedAt = new Date().toISOString();
    try {
      pdgaRows = dedupeDirectoryRows(await sweepPdgaEvents({ maxPages: opts?.pdgaMaxPages }));
      results.push(
        await persistDirectoryRows({
          source: "pdga",
          scope: "tour_search",
          rows: pdgaRows,
          startedAt,
        }),
      );
    } catch (e) {
      results.push(
        await persistDirectoryRows({
          source: "pdga",
          scope: "tour_search",
          rows: [],
          startedAt,
          error: e instanceof Error ? e.message : "PDGA sweep failed",
        }),
      );
    }
  } else {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("event_directory")
      .select("name, start_date, city, pdga_event_ref")
      .eq("source", "pdga")
      .not("pdga_event_ref", "is", null)
      .limit(4000);
    pdgaRows = (
      (data ?? []) as Array<{
        name: string;
        start_date: string | null;
        city: string | null;
        pdga_event_ref: string | null;
      }>
    ).map((r) => ({
      ...emptyRow(),
      source: "pdga" as const,
      source_event_id: r.pdga_event_ref ?? "",
      name: r.name,
      start_date: r.start_date,
      city: r.city,
      pdga_event_ref: r.pdga_event_ref,
    }));
  }

  if (sources.includes("disc_golf_scene")) {
    const startedAt = new Date().toISOString();
    try {
      const scene = dedupeDirectoryRows(
        await sweepSceneEvents({ states: opts?.states, includeLeagues: opts?.includeLeagues }),
      );
      results.push(
        await persistDirectoryRows({
          source: "disc_golf_scene",
          scope: opts?.states?.length ? `national+states:${opts.states.join(",")}` : "national",
          rows: linkPdgaRefs([...pdgaRows, ...scene]).filter((r) => r.source === "disc_golf_scene"),
          startedAt,
        }),
      );
    } catch (e) {
      results.push(
        await persistDirectoryRows({
          source: "disc_golf_scene",
          scope: "national",
          rows: [],
          startedAt,
          error: e instanceof Error ? e.message : "Disc Golf Scene sweep failed",
        }),
      );
    }
  }

  if (sources.includes("udisc")) {
    const startedAt = new Date().toISOString();
    try {
      const udisc = dedupeDirectoryRows(await sweepUdiscEvents({ anchors: opts?.anchors }));
      results.push(
        await persistDirectoryRows({
          source: "udisc",
          scope: `geo:${(opts?.anchors ?? UDISC_GEO_ANCHORS).length} anchors`,
          rows: linkPdgaRefs([...pdgaRows, ...udisc]).filter((r) => r.source === "udisc"),
          startedAt,
        }),
      );
    } catch (e) {
      results.push(
        await persistDirectoryRows({
          source: "udisc",
          scope: "geo",
          rows: [],
          startedAt,
          error: e instanceof Error ? e.message : "UDisc sweep failed",
        }),
      );
    }
  }

  // Coordinates for stored events this sweep did not refetch are filled by the
  // dedicated /api/public/sync/geo-backfill pass. Doing it here made the sweep
  // request outlive the scheduler's timeout, so the work was cut off every run
  // and stored events stayed unplaced.

  return results;
}

/**
 * Scraped markup can carry NUL bytes and unpaired surrogates, which Postgres
 * rejects outright. Scrub text fields before writing.
 */
function sanitizeRow(row: DirectoryEventInput): DirectoryEventInput {
  const clean = (value: string | null) =>
    value == null
      ? null
      : value
          .replace(/\u0000/g, "")
          .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
          .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
          .trim() || null;
  return {
    ...row,
    source_event_id: clean(row.source_event_id) ?? row.source_event_id,
    url: clean(row.url),
    name: cleanEventName(clean(row.name) ?? row.name) || row.name,
    tier: clean(row.tier),
    sanctioning: clean(row.sanctioning),
    venue_name: clean(row.venue_name),
    city: clean(row.city),
    state: clean(row.state),
    country: clean(row.country),
    registration_status: clean(row.registration_status),
    cover_url: clean(row.cover_url),
    discovered_via: clean(row.discovered_via),
  };
}

/**
 * Upsert payload. Coordinates are dropped when unresolved so a later sweep
 * never wipes a location an earlier lookup already saved.
 */
function upsertPayload(row: DirectoryEventInput, refreshedAt: string): Record<string, unknown> {
  const clean = sanitizeRow(row);
  const { latitude, longitude, ...rest } = clean;
  const payload: Record<string, unknown> = { ...rest, refreshed_at: refreshedAt };
  if (latitude != null && longitude != null) {
    payload.latitude = latitude;
    payload.longitude = longitude;
  }
  return payload;
}

function emptyRow(): DirectoryEventInput {
  return {
    source: "pdga",
    source_event_id: "",
    url: null,
    name: "",
    kind: "tournament",
    tier: null,
    sanctioning: null,
    start_date: null,
    end_date: null,
    venue_name: null,
    city: null,
    state: null,
    country: null,
    latitude: null,
    longitude: null,
    registration_status: null,
    field_size: null,
    field_capacity: null,
    cover_url: null,
    pdga_event_ref: null,
    discovered_via: null,
  };
}
