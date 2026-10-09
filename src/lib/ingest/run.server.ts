/**
 * The crawler tick.
 *
 * Called on a timer. One tick: take the single-run lock, top up the queue,
 * process a small batch inside the daily page budget, log what happened, and
 * let go. A denial from the page reader pauses everything until an admin
 * resumes or a later probe succeeds.
 */
import {
  acquireLease,
  claimBatch,
  completeItem,
  loadIngestState,
  pauseIngest,
  releaseClaimed,
  releaseLease,
  reserveBudget,
  resumeIngest,
  ScrapeDenied,
  type QueueItem,
} from "./queue.server";
import { runDiscovery } from "./discovery.server";
import { estimatedPages, runQueueItem } from "./workers.server";

export type IngestTickResult = {
  ran: boolean;
  reason?: string;
  claimed: number;
  succeeded: number;
  failed: number;
  discovered: number;
  pagesUsed: number;
  batches: number;
  errors: string[];
};

/** How long one pass may keep working before handing back control. */
const DEFAULT_MAX_MS = 45_000;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runIngestTick(options?: {
  /** Wall-clock ceiling for the whole pass. */
  maxMs?: number;
  /** Hard cap on batches, mostly for tests. */
  maxBatches?: number;
}): Promise<IngestTickResult> {
  const empty: IngestTickResult = {
    ran: false,
    claimed: 0,
    succeeded: 0,
    failed: 0,
    discovered: 0,
    pagesUsed: 0,
    batches: 0,
    errors: [],
  };

  const deadline = Date.now() + Math.max(5_000, options?.maxMs ?? DEFAULT_MAX_MS);
  const maxBatches = Math.max(1, options?.maxBatches ?? 40);

  const state = await loadIngestState();
  // Paused: allow a single probe item per tick to detect that the block cleared.
  const probeOnly = state.paused;

  const owner = `tick-${Date.now()}`;
  if (!(await acquireLease(owner))) {
    return { ...empty, reason: "Another sync pass is already running" };
  }

  const startedAt = new Date().toISOString();
  const result: IngestTickResult = { ...empty, ran: true };
  const claimedIds: string[] = [];
  let rateLimitHits = 0;

  try {
    if (!probeOnly) {
      const discovery = await runDiscovery();
      result.discovered = discovery.enqueued;
    }

    const batchSize = probeOnly ? 1 : Math.max(1, state.batch_size);

    // Keep working through the queue until it is empty, the day's allowance is
    // gone, or the time ceiling is reached. One pass therefore catches up a
    // large backlog instead of nibbling twelve items at a time.
    for (let pass = 0; pass < maxBatches; pass += 1) {
      if (Date.now() >= deadline) {
        result.errors.push("Time limit for this pass reached — picking up where it left off");
        break;
      }

      let budget = await reserveBudget(state, batchSize);
      const batch = await claimBatch(batchSize);
      if (!batch.length) break;

      result.batches += 1;
      result.claimed += batch.length;
      claimedIds.push(...batch.map((b) => b.id));

      let stop = false;
      let outOfBudget = false;

      for (const item of batch) {
        const cost = estimatedPages(item);
        if (cost > budget) {
          // Out of page allowance for today — hand the rest back for later.
          await releaseClaimed([item.id]);
          claimedIds.splice(claimedIds.indexOf(item.id), 1);
          result.errors.push("Daily page allowance reached");
          outOfBudget = true;
          break;
        }
        try {
          const outcome = await runQueueItem(item);
          budget -= outcome.pages;
          result.pagesUsed += outcome.pages;
          result.succeeded += 1;
          await completeItem(item, { ok: true, refreshInMinutes: outcome.refreshInMinutes });
          if (probeOnly) {
            await resumeIngest();
            result.errors.push("Data sync resumed after a successful test fetch");
          }
        } catch (error) {
          const failure = await handleFailure(item, error, result);
          if (failure === "rate-limited") {
            rateLimitHits += 1;
            // Ease off, then keep going; only a run of refusals stops the pass.
            await sleep(Math.min(5_000, 1_000 * rateLimitHits));
            if (rateLimitHits >= 5) {
              result.errors.push("Backing off — the source kept refusing requests");
              stop = true;
            }
          } else if (failure === "stop") {
            stop = true;
          }
        }
        const at = claimedIds.indexOf(item.id);
        if (at >= 0) claimedIds.splice(at, 1);
        if (stop) break;
        if (Date.now() >= deadline) break;
      }

      if (stop || outOfBudget || probeOnly) break;
    }
  } finally {
    await releaseClaimed(claimedIds.filter(Boolean));
    await releaseLease();
    const db = await admin();
    await db.from("ingest_runs").insert({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      claimed: result.claimed,
      succeeded: result.succeeded,
      failed: result.failed,
      discovered: result.discovered,
      pages_used: result.pagesUsed,
      errors: result.errors.slice(0, 10) as never,
      detail: { probe: probeOnly, batches: result.batches } as never,
    } as never);
  }

  return result;
}

/** Record one item's failure; says whether the pass can keep going. */
async function handleFailure(
  item: QueueItem,
  error: unknown,
  result: IngestTickResult,
): Promise<"continue" | "stop" | "rate-limited"> {
  const message = error instanceof Error ? error.message : "Unknown error";
  result.failed += 1;
  if (result.errors.length < 20) result.errors.push(message);

  if (error instanceof ScrapeDenied) {
    await pauseIngest(message);
    await completeItem(item, { ok: false, error: message });
    return "stop";
  }
  await completeItem(item, { ok: false, error: message });
  if (/\b429\b|rate limit/i.test(message)) return "rate-limited";
  return "continue";
}
