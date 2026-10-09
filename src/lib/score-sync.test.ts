import { describe, expect, it } from "vitest";
import { createScoreSync, mergeQueuedScores, sameRevision, scoreRow, type QueuedItem } from "./score-sync";

const item = (revision: string, strokes = 3, round = "round"): QueuedItem => ({
  round_id: round, round_player_id: "player", hole_number: 1, strokes,
  key: "player:1", revision, queued_at: 1, attempts: 0,
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
describe("durable score synchronization", () => {
  it("keeps a newer edit queued while an earlier revision is in flight, then sends it last", async () => {
    const started = deferred(), release = deferred();
    const queue = new Map([["player:1", item("old")]]);
    const writes: number[] = [];
    const sync = createScoreSync({
      list: async () => [...queue.values()],
      acknowledge: async batch => {
        for (const sent of batch) if (sameRevision(queue.get(sent.key)!, sent)) queue.delete(sent.key);
      },
      failed: async () => {},
      write: async rows => { writes.push(rows[0].strokes); if (writes.length === 1) { started.resolve(); await release.promise; } },
    });
    const first = sync.flush();
    await started.promise;
    queue.set("player:1", item("new", 5));
    const second = sync.flush();
    expect(writes).toEqual([3]);
    release.resolve();
    expect((await first).remaining).toBe(1);
    expect((await second).remaining).toBe(0);
    expect(writes).toEqual([3, 5]);
  });
  it("retains failed rounds and continues syncing other rounds", async () => {
    const failed = item("failed");
    const valid = { ...item("valid", 4, "other"), key: "other-player:1", round_player_id: "other-player" };
    const queue = new Map([failed, valid].map(row => [row.key, row]));
    const sync = createScoreSync({
      list: async () => [...queue.values()],
      acknowledge: async rows => { for (const row of rows) queue.delete(row.key); },
      failed: async (rows, error) => { for (const row of rows) queue.set(row.key, { ...row, last_error: error }); },
      write: async rows => { if (rows[0].round_id === "round") throw { message: "Permission denied" }; },
    });
    expect(await sync.flush()).toEqual({ synced: 1, remaining: 1 });
    expect(queue.get(failed.key)?.last_error).toBe("Permission denied");
  });
  it("a failed read does not poison later synchronization", async () => {
    let fail = true;
    const sync = createScoreSync({ list: async () => { if (fail) throw new Error("Storage"); return []; },
      acknowledge: async () => {}, failed: async () => {}, write: async () => {} });
    await expect(sync.flush()).rejects.toThrow("Storage");
    fail = false;
    expect(await sync.flush()).toEqual({ synced: 0, remaining: 0 });
  });
  it("recognizes legacy rows but never acknowledges different revisions, even at the same millisecond", () => {
    expect(sameRevision(item("one"), item("two"))).toBe(false);
    const legacy = { ...item("old"), revision: undefined };
    expect(sameRevision(legacy, { ...legacy })).toBe(true);
    expect(sameRevision(legacy, { ...legacy, strokes: 5 })).toBe(false);
    expect(sameRevision(legacy, item("new"))).toBe(false);
    expect(scoreRow(item("new"))).toEqual({ round_id: "round", round_player_id: "player", hole_number: 1, strokes: 3 });
  });
  it("restores locally queued scores over stale server values without duplicating a score cell", () => {
    expect(mergeQueuedScores([scoreRow(item("server"))], [scoreRow(item("device", 5))])).toEqual([scoreRow(item("device", 5))]);
  });
});
