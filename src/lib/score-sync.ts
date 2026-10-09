/** Durable score revisions and serialized writes, independent of browser storage. */
export type QueuedScoreRow = {
  round_id: string;
  round_player_id: string;
  hole_number: number;
  strokes: number;
  c1_putts?: number | null;
  c2_putts?: number | null;
  throw_in_ft?: number | null;
  longest_throw_ft?: number | null;
  drive_distance_ft?: number | null;
  ob_strokes?: number | null;
  penalties?: number | null;
};
export type QueuedItem = QueuedScoreRow & {
  key: string;
  revision?: string; // Optional for pre-existing device queues.
  queued_at: number;
  attempts: number;
  last_error?: string;
};
export const scoreKey = (row: Pick<QueuedScoreRow, "round_player_id" | "hole_number">) =>
  `${row.round_player_id}:${row.hole_number}`;
export function scoreRow({ key: _key, revision: _rev, queued_at: _at, attempts: _tries, last_error: _err, ...row }: QueuedItem): QueuedScoreRow {
  return row;
}
export function sameRevision(current: QueuedItem, sent: QueuedItem): boolean {
  return current.revision != null || sent.revision != null
    ? current.revision === sent.revision
    : current.queued_at === sent.queued_at && JSON.stringify(scoreRow(current)) === JSON.stringify(scoreRow(sent));
}
export function mergeQueuedScores<T extends Pick<QueuedScoreRow, "round_player_id" | "hole_number" | "strokes">>(
  server: T[], queued: QueuedScoreRow[],
): (T | QueuedScoreRow)[] {
  const rows = new Map<string, T | QueuedScoreRow>(server.map(row => [scoreKey(row), row]));
  for (const row of queued) rows.set(scoreKey(row), row);
  return [...rows.values()];
}
export function createScoreSync(deps: {
  list: () => Promise<QueuedItem[]>;
  acknowledge: (items: QueuedItem[]) => Promise<void>;
  failed: (items: QueuedItem[], error: string) => Promise<void>;
  write: (rows: QueuedScoreRow[]) => Promise<void>;
  lock?: <T>(work: () => Promise<T>) => Promise<T>;
}) {
  let tail: Promise<unknown> = Promise.resolve();
  function serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = tail.then(() => deps.lock ? deps.lock(work) : work());
    tail = next.catch(() => {});
    return next;
  }
  function flush(): Promise<{ synced: number; remaining: number }> {
    return serialize(async () => {
      // Read inside the lock: edits queued during a previous request supersede it.
      const groups = new Map<string, QueuedItem[]>();
      for (const item of await deps.list()) {
        const batch = groups.get(item.round_id) ?? [];
        batch.push(item); groups.set(item.round_id, batch);
      }
      let synced = 0;
      for (const batch of groups.values()) {
        try {
          await deps.write(batch.map(scoreRow));
          await deps.acknowledge(batch);
          synced += batch.length;
        } catch (error) {
          const message = error instanceof Error ? error.message
            : typeof error === "object" && error && "message" in error ? String(error.message) : String(error);
          await deps.failed(batch, message);
        }
      }
      return { synced, remaining: (await deps.list()).length };
    });
  }
  return { flush, serialize };
}
