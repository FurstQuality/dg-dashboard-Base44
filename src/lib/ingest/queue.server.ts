/**
 * Shared work queue for the always-on outside-data crawler.
 *
 * Every unit of scraping work (a course page, an event page, a player page, a
 * state directory scan, a geocode lookup) is one row in `ingest_queue`. This
 * module owns the queue mechanics only: the single-run lease, the daily page
 * budget, claiming a bounded batch, and recording the outcome. Workers live in
 * `workers.server.ts`; the tick orchestration lives in `run.server.ts`.
 *
 * Server-only: writes use the service-role client because the crawl state is
 * shared app data, not per-user rows.
 */

export type IngestSource = "pdga" | "disc_golf_scene" | "udisc" | "dgcr" | "internal";
export type IngestKind = "course" | "event" | "player" | "directory" | "geocode";

export type QueueItem = {
  id: string;
  source: IngestSource;
  kind: IngestKind;
  target: string;
  region: string | null;
  priority: number;
  attempts: number;
  payload: Record<string, unknown>;
};

export type EnqueueItem = {
  source: IngestSource;
  kind: IngestKind;
  target: string;
  region?: string | null;
  priority?: number;
  payload?: Record<string, unknown>;
  /** Delay the first attempt by this many minutes. */
  delayMinutes?: number;
};

export type IngestState = {
  paused: boolean;
  pause_reason: string | null;
  lease_until: string | null;
  daily_page_budget: number;
  pages_used_today: number;
  budget_day: string;
  batch_size: number;
  last_run_at: string | null;
};

/** How many attempts before an item is parked as dead. */
export const MAX_ATTEMPTS = 4;

/** Backoff between attempts, in minutes, indexed by attempt count. */
const BACKOFF_MINUTES = [10, 60, 360, 1440];

/** Thrown when the scraping service refuses the request outright. */
export class ScrapeDenied extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ScrapeDenied";
  }
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function isoIn(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/* --------------------------------- state --------------------------------- */

export async function loadIngestState(): Promise<IngestState> {
  const db = await admin();
  const { data } = await db
    .from("ingest_state")
    .select(
      "paused, pause_reason, lease_until, daily_page_budget, pages_used_today, budget_day, batch_size, last_run_at",
    )
    .eq("id", "singleton")
    .maybeSingle();
  return (data ?? {
    paused: false,
    pause_reason: null,
    lease_until: null,
    daily_page_budget: 600,
    pages_used_today: 0,
    budget_day: new Date().toISOString().slice(0, 10),
    batch_size: 12,
    last_run_at: null,
  }) as IngestState;
}

/**
 * Take the single-flight lease. A second concurrent tick sees a live lease and
 * exits instead of crawling in parallel.
 */
export async function acquireLease(owner: string, holdMinutes = 10): Promise<boolean> {
  const db = await admin();
  const now = new Date().toISOString();
  const { data } = await db
    .from("ingest_state")
    .update({ lease_until: isoIn(holdMinutes), lease_owner: owner, last_run_at: now })
    .eq("id", "singleton")
    .or(`lease_until.is.null,lease_until.lt.${now}`)
    .select("lease_owner");
  return !!data?.length;
}

export async function releaseLease(): Promise<void> {
  const db = await admin();
  await db
    .from("ingest_state")
    .update({ lease_until: null, lease_owner: null })
    .eq("id", "singleton");
}

/** Halt the whole crawler until an admin resumes it or a probe succeeds. */
export async function pauseIngest(reason: string): Promise<void> {
  const db = await admin();
  await db
    .from("ingest_state")
    .update({ paused: true, pause_reason: reason, paused_at: new Date().toISOString() })
    .eq("id", "singleton");
}

export async function resumeIngest(): Promise<void> {
  const db = await admin();
  await db
    .from("ingest_state")
    .update({ paused: false, pause_reason: null, paused_at: null })
    .eq("id", "singleton");
}

/**
 * Reserve `pages` against today's budget. Returns how many were actually
 * granted (0 when the budget is spent), so a run can shrink instead of stop.
 */
export async function reserveBudget(state: IngestState, pages: number): Promise<number> {
  const db = await admin();
  const today = new Date().toISOString().slice(0, 10);
  const used = state.budget_day === today ? state.pages_used_today : 0;
  const granted = Math.max(0, Math.min(pages, state.daily_page_budget - used));
  if (!granted) {
    if (state.budget_day !== today) {
      await db
        .from("ingest_state")
        .update({ budget_day: today, pages_used_today: 0 })
        .eq("id", "singleton");
      return Math.min(pages, state.daily_page_budget);
    }
    return 0;
  }
  await db
    .from("ingest_state")
    .update({ budget_day: today, pages_used_today: used + granted })
    .eq("id", "singleton");
  return granted;
}

/* --------------------------------- queue ---------------------------------- */

/** Add work. Duplicate targets are ignored, so re-discovery is free. */
export async function enqueue(items: EnqueueItem[]): Promise<number> {
  if (!items.length) return 0;
  const db = await admin();
  const rows = items.map((item) => ({
    source: item.source,
    kind: item.kind,
    target: item.target,
    region: item.region ?? null,
    priority: item.priority ?? 100,
    payload: (item.payload ?? {}) as never,
    status: "pending",
    next_run_at: isoIn(item.delayMinutes ?? 0),
  }));

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { data } = await db
      .from("ingest_queue")
      .upsert(rows.slice(i, i + 200) as never, {
        onConflict: "source,kind,target",
        ignoreDuplicates: true,
      })
      .select("id");
    inserted += data?.length ?? 0;
  }
  return inserted;
}

/** Re-queue a finished item for its next refresh pass. */
export async function scheduleRefresh(id: string, minutes: number): Promise<void> {
  const db = await admin();
  await db
    .from("ingest_queue")
    .update({ status: "pending", next_run_at: isoIn(minutes), attempts: 0, last_error: null })
    .eq("id", id);
}

/** Claim up to `limit` due items, highest priority first, and mark them running. */
export async function claimBatch(limit: number): Promise<QueueItem[]> {
  const db = await admin();
  const { data } = await db
    .from("ingest_queue")
    .select("id, source, kind, target, region, priority, attempts, payload")
    .eq("status", "pending")
    .lte("next_run_at", new Date().toISOString())
    .order("priority", { ascending: true })
    .order("next_run_at", { ascending: true })
    .limit(limit);

  const rows = (data ?? []) as QueueItem[];
  if (!rows.length) return [];
  await db
    .from("ingest_queue")
    .update({ status: "running", started_at: new Date().toISOString() })
    .in(
      "id",
      rows.map((r) => r.id),
    );
  return rows.map((r) => ({ ...r, payload: (r.payload ?? {}) as Record<string, unknown> }));
}

/** Mark an item done and set when (if ever) it should be looked at again. */
export async function completeItem(
  item: QueueItem,
  outcome: { ok: boolean; error?: string | null; refreshInMinutes?: number | null },
): Promise<void> {
  const db = await admin();
  const now = new Date().toISOString();

  if (outcome.ok) {
    const refresh = outcome.refreshInMinutes ?? null;
    await db
      .from("ingest_queue")
      .update({
        status: refresh ? "pending" : "success",
        attempts: 0,
        last_error: null,
        finished_at: now,
        next_run_at: refresh ? isoIn(refresh) : now,
      })
      .eq("id", item.id);
    return;
  }

  const attempts = item.attempts + 1;
  const dead = attempts >= MAX_ATTEMPTS;
  await db
    .from("ingest_queue")
    .update({
      status: dead ? "dead" : "pending",
      attempts,
      last_error: (outcome.error ?? "Unknown error").slice(0, 500),
      finished_at: dead ? now : null,
      next_run_at: isoIn(BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length) - 1] ?? 60),
    })
    .eq("id", item.id);
}

/** Release items claimed by a run that ended early. */
export async function releaseClaimed(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await admin();
  await db
    .from("ingest_queue")
    .update({ status: "pending", started_at: null, next_run_at: isoIn(5) })
    .in("id", ids)
    .eq("status", "running");
}
