/**
 * DG Dashboard — the ONE true PDGA sync entrypoint.
 *
 * Every "Sync PDGA" button in the app should call `syncAllPdgaData` so that a
 * single click refreshes the user's official rating, sanctioned rounds, and
 * upcoming PDGA event schedule together, then invalidates every react-query
 * cache that depends on that data.
 *
 * The canonical UI trigger is the "Sync now" button on
 * /settings/imports (PdgaConnectionHero). Other sync buttons across the app
 * (StatLink, Rating Studio, Schedule, Game Plan, Profile, Add Data modal) are
 * shortcuts to the same function.
 */

import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { syncMyPdgaFromProfile } from "@/lib/pdga-lab.functions";
import { syncMyPdgaEvents } from "@/lib/scheduled-events.functions";

const LAST_SYNC_KEY = "dgd:pdga:last-sync-at";

export type PdgaSyncResult = {
  ok: boolean;
  roundsSynced: number;
  eventsAdded: number;
  eventsUpdated: number;
  cached: boolean;
  syncedAt: string;
  errors: string[];
};

export type PdgaSyncOptions = {
  /** Force a full refetch even if the server cache is fresh. */
  force?: boolean;
  /** Skip toast notifications when the caller shows its own status UI. */
  silent?: boolean;
  /** react-query client — passed in so query keys refetch after sync. */
  queryClient?: QueryClient;
};

/**
 * Server fns are already useServerFn-wrapped at the call site. We accept the
 * wrapped versions so this helper works from any component without pulling in
 * `useServerFn` here.
 */
export type SyncMyPdgaFromProfileFn = (args: { data: { force?: boolean } }) => Promise<{
  ok: boolean;
  cached?: boolean;
  roundsSynced?: number;
  reason?: string;
}>;

export type SyncMyPdgaEventsFn = () => Promise<{
  added?: number;
  updated?: number;
  total?: number;
}>;

/** Direct server-fn references so callers can pass them to `useServerFn`. */
export const PDGA_SERVER_FUNCTIONS = {
  syncMyPdgaFromProfile,
  syncMyPdgaEvents,
} as const;

/**
 * Every react-query key touched by PDGA data. Any new PDGA-dependent query
 * should add its prefix here so `Sync now` reliably refreshes the whole app.
 */
const PDGA_QUERY_PREFIXES: readonly string[] = [
  "pdga",
  "pdga-lab",
  "pdga-events",
  "pdga-rounds",
  "external-rounds",
  "player-rating",
  "player-rating-details",
  "rating-forecast",
  "rating-projection",
  "settings-imports",
  "scheduled-events",
  "schedule",
  "schedule-compare",
  "stats-hero",
  "stats-overview",
  "statlink",
  "round-history",
  "game-plan",
  "rating-studio",
  "profile-hero",
  "my-profile",
  "data-health",
  // Native DG Dashboard rounds and everything computed from them, so a round
  // finished on another device shows up in stats without a manual refresh.
  "rounds",
  "rounds-count",
  "dash-recent-rounds",
  "round",
  "active-round",
  "stats",
  "all-ratings",
  "me-profile-pdga",
  "profile-editor-stats",
  "progress",
  "goals",
  "home",
];

/**
 * Refresh every cached view of a player's own rounds, ratings and stats —
 * whether the new data arrived from a PDGA sync, a UDisc import, or a round
 * finished on another device.
 */
export function invalidatePlayerDataQueries(queryClient: QueryClient) {
  for (const prefix of PDGA_QUERY_PREFIXES) {
    try {
      queryClient.invalidateQueries({ queryKey: [prefix], exact: false });
    } catch {
      /* no-op */
    }
  }
}

function readLastSyncAt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

function writeLastSyncAt(iso: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_SYNC_KEY, iso);
    // Fire a same-tab event so other components can update without polling.
    window.dispatchEvent(new CustomEvent("dgd:pdga-synced", { detail: { at: iso } }));
  } catch {
    /* storage disabled — ignore */
  }
}

/** Read the last successful sync timestamp (ISO) or null. */
export function getLastPdgaSyncAt(): string | null {
  return readLastSyncAt();
}

/** Human-friendly "5 minutes ago" from an ISO timestamp. */
export function formatRelativeSyncAt(iso: string | null): string {
  if (!iso) return "Never synced yet";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "Never synced yet";
  const diff = Date.now() - then;
  if (diff < 30_000) return "Just synced";
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "Just synced";
  if (mins < 60) return `Synced ${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Synced ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `Synced ${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Run the full PDGA sync in parallel: rating + rounds, and upcoming events.
 * Then invalidate every react-query cache prefix known to depend on PDGA data.
 */
export async function syncAllPdgaData(
  fns: { syncProfile: SyncMyPdgaFromProfileFn; syncEvents: SyncMyPdgaEventsFn },
  opts: PdgaSyncOptions = {},
): Promise<PdgaSyncResult> {
  const { force = false, silent = false, queryClient } = opts;

  const errors: string[] = [];
  let roundsSynced = 0;
  let cached = false;
  let eventsAdded = 0;
  let eventsUpdated = 0;
  let profileOk = false;
  let eventsOk = false;

  // Run both in parallel — one failing does not block the other.
  const [profileRes, eventsRes] = await Promise.allSettled([
    fns.syncProfile({ data: { force } }),
    fns.syncEvents(),
  ]);

  if (profileRes.status === "fulfilled") {
    const r = profileRes.value;
    profileOk = !!r?.ok;
    if (r?.ok) {
      roundsSynced = r.roundsSynced ?? 0;
      cached = !!r.cached;
    } else if (r?.reason === "no_pdga") {
      errors.push("Link your PDGA number in your profile before syncing.");
    } else {
      errors.push("PDGA rating & rounds sync did not complete.");
    }
  } else {
    errors.push(
      profileRes.reason instanceof Error
        ? profileRes.reason.message
        : "PDGA rating & rounds sync failed.",
    );
  }

  if (eventsRes.status === "fulfilled") {
    eventsOk = true;
    eventsAdded = eventsRes.value?.added ?? 0;
    eventsUpdated = eventsRes.value?.updated ?? 0;
  } else {
    // Events are optional — surface but don't block success on rounds.
    const msg =
      eventsRes.reason instanceof Error ? eventsRes.reason.message : "Event schedule sync failed.";
    // Only report if it's not the "no pdga number" case already surfaced.
    if (!errors.some((e) => e.toLowerCase().includes("pdga number"))) {
      errors.push(msg);
    }
  }

  const syncedAt = new Date().toISOString();
  const ok = profileOk || eventsOk;

  if (ok) {
    writeLastSyncAt(syncedAt);
    // Broad invalidation across every prefix — safe because react-query
    // dedupes and only refetches active queries.
    if (queryClient) invalidatePlayerDataQueries(queryClient);
  }

  if (!silent) {
    if (ok && errors.length === 0) {
      toast.success("PDGA data synced", {
        description: cached
          ? "Already up to date — rating, rounds, and schedule are current."
          : buildSuccessDescription(roundsSynced, eventsAdded, eventsUpdated),
      });
    } else if (ok && errors.length > 0) {
      toast.warning("PDGA sync finished with warnings", {
        description: errors.join(" "),
      });
    } else {
      toast.error("PDGA sync failed", {
        description: errors[0] ?? "Please try again in a moment.",
      });
    }
  }

  return { ok, roundsSynced, eventsAdded, eventsUpdated, cached, syncedAt, errors };
}

function buildSuccessDescription(rounds: number, added: number, updated: number): string {
  const parts: string[] = [];
  if (rounds > 0) parts.push(`${rounds} round${rounds === 1 ? "" : "s"} refreshed`);
  if (added > 0) parts.push(`${added} event${added === 1 ? "" : "s"} added`);
  if (updated > 0) parts.push(`${updated} event${updated === 1 ? "" : "s"} updated`);
  if (parts.length === 0) return "Rating, rounds, and schedule are current.";
  return parts.join(" · ");
}
