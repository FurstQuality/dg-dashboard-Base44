/**
 * Offline write queue for the Fullscreen Scorer.
 *
 * Design:
 * - Score upserts always land in IndexedDB first (so a reload preserves them
 *   even when we're online — belt and suspenders).
 * - When online we immediately flush; when offline the queue holds rows and
 *   `syncOfflineQueue()` flushes them as soon as the browser fires `online`.
 * - Conflict shape matches the server: `onConflict: "round_player_id,hole_number"`
 *   and only the exact acknowledged device revision leaves the queue.
 *
 * We deliberately avoid a Service Worker for MVP offline scoring — the scorer
 * page and round data are already loaded when signal drops in the woods, and
 * IDB survives reloads independently of the page cache. A SW app-shell cache can come
 * later without touching this queue.
 */

import { supabase } from "@/integrations/supabase/client";
import { createScoreSync, sameRevision, scoreKey, type QueuedItem, type QueuedScoreRow } from "./score-sync";
export type { QueuedScoreRow } from "./score-sync";
export { mergeQueuedScores } from "./score-sync";

const DB_NAME = "chainlink-offline";
const DB_VERSION = 1;
const STORE = "score_queue";

// --- IndexedDB plumbing ------------------------------------------------------

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); }
    catch { resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T | null> {
  const db = await openDB();
  if (!db) return null;
  return new Promise<T | null>((resolve) => {
    let t: IDBTransaction;
    try { t = db.transaction(STORE, mode); }
    catch { db.close(); resolve(null); return; }
    const store = t.objectStore(STORE);
    let result: T | null = null;
    let job: Promise<T> | T;
    try { job = fn(store); }
    catch { t.abort(); db.close(); resolve(null); return; }
    Promise.resolve(job)
      .then((r) => {
        result = r as T;
      })
      .catch(() => {
        result = null;
        try { t.abort(); } catch { /* already finished */ }
      });
    t.oncomplete = () => { db.close(); resolve(result); };
    t.onerror = () => { db.close(); resolve(null); };
    t.onabort = () => { db.close(); resolve(null); };
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// --- Public API --------------------------------------------------------------

export async function enqueueScoreRows(rows: QueuedScoreRow[]): Promise<boolean> {
  if (!rows.length) return true;
  const now = Date.now();
  const stored = await tx("readwrite", (store) => {
    for (const row of rows) {
      const item: QueuedItem = {
        ...row,
        key: scoreKey(row),
        revision: crypto.randomUUID(),
        queued_at: now,
        attempts: 0,
      };
      store.put(item);
    }
    return true;
  });
  return stored === true;
}

export async function getQueuedItems(roundId?: string, strict = false): Promise<QueuedItem[]> {
  const items = await tx<QueuedItem[]>("readonly", async (store) => {
    const all = await reqToPromise(store.getAll());
    return (all as QueuedItem[]) ?? [];
  });
  if (strict && items == null) throw new Error("Device score storage could not be read. Your queued scores have not been cleared.");
  const list = items ?? [];
  return roundId ? list.filter((i) => i.round_id === roundId) : list;
}

export async function getQueuedCount(roundId?: string): Promise<number> {
  const items = await getQueuedItems(roundId);
  return items.length;
}

/** Acknowledge only the exact revision sent; a newer edit must survive. */
async function updateSentItems(items: QueuedItem[], error?: string): Promise<void> {
  const updated = await tx("readwrite", async (store) => {
    await Promise.all(items.map(async item => {
      const existing = (await reqToPromise(store.get(item.key))) as QueuedItem | undefined;
      if (existing && sameRevision(existing, item)) {
        if (error == null) store.delete(item.key);
        else store.put({ ...existing, attempts: (existing.attempts ?? 0) + 1, last_error: error });
      }
    }));
    return true;
  });
  if (!updated) throw new Error("Could not update the device queue. Scores remain pending.");
}

const writer = createScoreSync({
  list: () => getQueuedItems(undefined, true),
  acknowledge: items => updateSentItems(items),
  failed: (items, error) => updateSentItems(items, error),
  write: async rows => {
    const { error } = await supabase.from("round_scores").upsert(rows, { onConflict: "round_player_id,hole_number" });
    if (error) throw error;
  },
  // Coordinate tabs as well as mount/online/save callbacks where supported.
  lock: async <T,>(work: () => Promise<T>): Promise<T> => {
    return typeof navigator !== "undefined" && navigator.locks
      ? await navigator.locks.request("chainlink-score-sync", work) : await work();
  },
});

/**
 * Try to upsert a batch of score rows. Returns { synced: true } when the
 * network write succeeded (and clears the corresponding queue entries), or
 * { synced: false, queued: n } when we fell back to the offline queue.
 */
export async function upsertScoresWithOfflineFallback(
  rows: QueuedScoreRow[],
): Promise<{ synced: boolean; queued: number; error?: string }> {
  if (!rows.length) return { synced: true, queued: 0 };

  // Always mirror to the queue first so a mid-flight tab close is safe.
  const stored = await enqueueScoreRows(rows);

  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  if (!online) {
    return stored ? { synced: false, queued: rows.length }
      : { synced: false, queued: 0, error: "Device storage is unavailable. This score has not been saved. Reconnect and try again." };
  }

  try {
    if (!stored) {
      // With no durable storage, only a successful network write counts as saved.
      await writer.serialize(async () => {
        const { error } = await supabase.from("round_scores").upsert(rows, { onConflict: "round_player_id,hole_number" });
        if (error) throw error;
      });
      return { synced: true, queued: 0 };
    }
    await writer.flush();
    const keys = new Set(rows.map(scoreKey));
    const pending = (await getQueuedItems(undefined, true)).filter(item => keys.has(item.key));
    return { synced: pending.length === 0, queued: pending.length, error: pending.find(item => item.last_error)?.last_error };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { synced: false, queued: stored ? rows.length : 0, error: message };
  }
}

/**
 * Flush every queued item. Called on `online` events and on scorer mount.
 * Returns the number of rows successfully synced.
 */
export async function syncOfflineQueue(): Promise<{ synced: number; remaining: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const remaining = await getQueuedCount();
    return { synced: 0, remaining };
  }
  return writer.flush();
}

/**
 * React-friendly online/offline listener. Auto-flushes when connection returns.
 */
export function subscribeOnlineFlush(
  onFlushed?: (result: { synced: number; remaining: number }) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = async () => {
    try { const result = await syncOfflineQueue(); onFlushed?.(result); }
    catch { /* Retain the queue when device storage is temporarily unavailable. */ }
  };
  window.addEventListener("online", handler);
  return () => window.removeEventListener("online", handler);
}
