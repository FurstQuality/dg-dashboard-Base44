/**
 * Event directory read + refresh server functions.
 *
 * The directory mirrors live PDGA, Disc Golf Scene and UDisc listings so the
 * events browser shows what is actually scheduled, not just what a player has
 * imported. Reads are cheap table scans; refreshes re-sweep the sources and are
 * rate limited by staleness so a page view never hammers the upstream sites.
 */
import { createServerFn } from "@tanstack/react-start";
import { orFilterText, isoDateOrNull } from "@/lib/postgrest-safe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { DirectorySource } from "@/lib/event-directory-parse";

export type DirectoryEventRow = {
  id: string;
  source: DirectorySource;
  source_event_id: string;
  url: string | null;
  name: string;
  kind: "tournament" | "league" | "casual";
  tier: string | null;
  sanctioning: string | null;
  start_date: string | null;
  end_date: string | null;
  venue_name: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  registration_status: string | null;
  field_size: number | null;
  field_capacity: number | null;
  cover_url: string | null;
  pdga_event_ref: string | null;
  refreshed_at: string;
};

export type DirectorySyncStatus = {
  source: DirectorySource;
  scope: string | null;
  found: number;
  upserted: number;
  ok: boolean;
  error: string | null;
  finished_at: string | null;
};

export type DirectoryFeed = {
  rows: DirectoryEventRow[];
  syncs: DirectorySyncStatus[];
  /** Newest successful sweep across all sources, or null before the first one. */
  last_refreshed_at: string | null;
  stale: boolean;
  truncated: boolean;
};

/** Sweeps older than this are considered stale and trigger a background refresh. */
export const DIRECTORY_STALE_MINUTES = 180;
const ROW_LIMIT = 3000;

const filterSchema = z
  .object({
    q: z.string().max(200).optional().nullable(),
    sources: z.array(z.enum(["pdga", "disc_golf_scene", "udisc"])).optional().nullable(),
    state: z.string().max(40).optional().nullable(),
    dateFrom: z.string().max(10).optional().nullable(),
    dateTo: z.string().max(10).optional().nullable(),
    /** Re-sweep the sources when the mirror is stale before returning rows. */
    autoRefresh: z.boolean().optional().nullable(),
  })
  .default({});

export const listDirectoryEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => filterSchema.parse(raw ?? {}))
  .handler(async ({ data, context }): Promise<DirectoryFeed> => {
    const { supabase } = context;

    const syncs = await readSyncStatus(supabase);
    const lastOk = syncs.filter((s) => s.ok && s.finished_at).map((s) => s.finished_at as string);
    const lastRefreshedAt = lastOk.length ? lastOk.sort().at(-1)! : null;
    const stale =
      !lastRefreshedAt ||
      Date.now() - new Date(lastRefreshedAt).getTime() > DIRECTORY_STALE_MINUTES * 60_000;

    // Skip the automatic sweep when another one just ran or is still running, so a
    // burst of page views never stacks up requests against the upstream sites.
    const recentSweep = syncs.some(
      (sync) => sync.finished_at && Date.now() - new Date(sync.finished_at).getTime() < 10 * 60_000,
    );
    const autoSwept = stale && (data.autoRefresh ?? true) && !recentSweep;
    if (autoSwept) {
      const { runDirectorySweep } = await import("@/lib/event-directory.server");
      const states = data.state ? [data.state.toUpperCase()] : [];
      try {
        // Background sweeps stay light; the Refresh action does the deep crawl.
        await runDirectorySweep({ states, pdgaMaxPages: 2 });
      } catch {
        // A failed sweep is logged by the sweeper; still serve the mirror.
      }
    }

    let query = supabase
      .from("event_directory")
      .select(
        "id, source, source_event_id, url, name, kind, tier, sanctioning, start_date, end_date, venue_name, city, state, country, registration_status, field_size, field_capacity, cover_url, pdga_event_ref, refreshed_at",
      );
    if (data.sources?.length) query = query.in("source", data.sources);
    if (data.state) query = query.eq("state", data.state.toUpperCase());
    const dateFrom = isoDateOrNull(data.dateFrom);
    if (dateFrom) query = query.or(`end_date.gte.${dateFrom},start_date.gte.${dateFrom}`);
    if (data.dateTo) query = query.lte("start_date", data.dateTo);
    const needle = (data.q ?? "").trim();
    if (needle.length >= 3) {
      const safe = orFilterText(needle);
      query = query.or(`name.ilike.%${safe}%,venue_name.ilike.%${safe}%,city.ilike.%${safe}%`);
    }

    const { data: rows, error } = await query
      .order("start_date", { ascending: true, nullsFirst: false })
      .limit(ROW_LIMIT);
    if (error) throw new Error("We couldn't load the event directory just now. Try again shortly.");

    const refreshedSyncs = autoSwept ? await readSyncStatus(supabase) : syncs;
    const okAfter = refreshedSyncs
      .filter((s) => s.ok && s.finished_at)
      .map((s) => s.finished_at as string)
      .sort();

    return {
      rows: (rows ?? []) as DirectoryEventRow[],
      syncs: refreshedSyncs,
      last_refreshed_at: okAfter.at(-1) ?? lastRefreshedAt,
      stale: !okAfter.length,
      truncated: (rows ?? []).length >= ROW_LIMIT,
    };
  });

export const refreshDirectoryEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        sources: z.array(z.enum(["pdga", "disc_golf_scene", "udisc"])).optional().nullable(),
        state: z.string().max(40).optional().nullable(),
      })
      .default({})
      .parse(raw ?? {}),
  )
  .handler(async ({ data }) => {
    const { runDirectorySweep } = await import("@/lib/event-directory.server");
    const results = await runDirectorySweep({
      sources: data.sources ?? undefined,
      states: data.state ? [data.state.toUpperCase()] : [],
    });
    return {
      results,
      found: results.reduce((sum, r) => sum + r.found, 0),
      upserted: results.reduce((sum, r) => sum + r.upserted, 0),
      failed: results.filter((r) => !r.ok).map((r) => r.source),
    };
  });

type ReadClient = {
  from: (table: string) => {
    select: (columns: string) => {
      order: (
        column: string,
        opts: { ascending: boolean },
      ) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> };
    };
  };
};

/** Latest sweep per source. */
async function readSyncStatus(client: unknown): Promise<DirectorySyncStatus[]> {
  const { data } = await (client as ReadClient)
    .from("event_directory_syncs")
    .select("source, scope, found, upserted, ok, error, finished_at")
    .order("started_at", { ascending: false })
    .limit(30);
  const rows = (data ?? []) as DirectorySyncStatus[];
  const latest = new Map<string, DirectorySyncStatus>();
  for (const row of rows) if (!latest.has(row.source)) latest.set(row.source, row);
  return Array.from(latest.values());
}
