/**
 * Offline snapshot cache for Friend Tracker groups.
 *
 * Rationale:
 * - Crews often check tee times, courses, and alerts on-site at events where
 *   cell signal is spotty (parking lots, wooded venues, out-of-market travel).
 * - The tracker payload is read-mostly (only "Sync from PDGA" mutates it) so
 *   a whole-bundle IDB cache is sufficient — no per-field merge needed.
 * - We hydrate instantly from IDB, then race a network fetch in the
 *   background and swap in the fresh bundle when it arrives. If the network
 *   fetch fails (offline), the UI keeps the cached bundle plus a badge
 *   showing when it was last synced.
 */

const DB_NAME = "chainlink-offline";
const DB_VERSION = 2;
const STORE = "tracker_snapshots";

export type TrackerCacheEntry<T> = {
  group_id: string;
  bundle: T;
  cached_at: number;
};

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // v1 store from offline-queue.ts
      if (!db.objectStoreNames.contains("score_queue")) {
        db.createObjectStore("score_queue", { keyPath: "key" });
      }
      // v2 store for tracker snapshots
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "group_id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function readTrackerCache<T>(groupId: string): Promise<TrackerCacheEntry<T> | null> {
  const db = await openDB();
  if (!db) return null;
  try {
    const t = db.transaction(STORE, "readonly");
    const store = t.objectStore(STORE);
    const row = (await reqToPromise(store.get(groupId))) as TrackerCacheEntry<T> | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

export async function writeTrackerCache<T>(groupId: string, bundle: T): Promise<void> {
  const db = await openDB();
  if (!db) return;
  try {
    const t = db.transaction(STORE, "readwrite");
    const store = t.objectStore(STORE);
    const entry: TrackerCacheEntry<T> = { group_id: groupId, bundle, cached_at: Date.now() };
    store.put(entry);
  } catch {
    // best-effort — offline cache is a nicety, not correctness-critical
  }
}

export async function clearTrackerCache(groupId?: string): Promise<void> {
  const db = await openDB();
  if (!db) return;
  try {
    const t = db.transaction(STORE, "readwrite");
    const store = t.objectStore(STORE);
    if (groupId) store.delete(groupId);
    else store.clear();
  } catch {
    /* noop */
  }
}
