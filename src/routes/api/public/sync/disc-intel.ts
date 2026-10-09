/**
 * Scheduled pass for the skill-group disc survey (disc intelligence).
 *
 * Reads the next unread slice of survey pages, and once everything has been
 * read it re-reads a rotating slice each day so the numbers stay current. Every
 * pass also adds and links any survey discs still missing from the disc
 * library, so the console no longer needs anyone to press a button.
 *
 * Called by the database scheduler only — never from a browser.
 */
import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedSyncCaller } from "@/lib/live/sync-auth.server";

/** Pages per pass — small enough to stay polite and finish inside one request. */
const PAGES_PER_PASS = 16;
/** A pass claim older than this is treated as abandoned. */
const LOCK_MINUTES = 10;

async function run(request: Request): Promise<Response> {
  if (!(await isAuthorizedSyncCaller(request))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { dgpTotalPages, ingestDgpPages, relinkDgpMolds } = await import(
    "@/lib/dgp-ingest.server"
  );
  const admin = supabaseAdmin as any;

  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify({ ranAt: new Date().toISOString(), ...body }), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  // Single-flight: an unfinished recent claim means another pass is working.
  const { data: openRuns } = await admin
    .from("dgp_ingest_runs")
    .select("id, started_at, finished_at")
    .is("finished_at", null)
    .gte("started_at", new Date(Date.now() - LOCK_MINUTES * 60_000).toISOString())
    .limit(1);
  if ((openRuns ?? []).length) {
    return json({ ran: false, reason: "Another survey pass is already running" });
  }

  const totalPages = dgpTotalPages();

  // Resume point comes from stored history, so progress survives any device.
  const { data: history } = await admin
    .from("dgp_ingest_runs")
    .select("pages_fetched, notes")
    .order("started_at", { ascending: false })
    .limit(2000);

  let pagesRead = 0;
  for (const row of (history ?? []) as { pages_fetched: number | null; notes: string | null }[]) {
    const start = Number(row.notes?.match(/offset\s+(\d+)/)?.[1]);
    if (!Number.isFinite(start)) continue;
    const reached = start + (row.pages_fetched ?? 0);
    if (reached > pagesRead) pagesRead = reached;
  }
  pagesRead = Math.min(pagesRead, totalPages);

  const caughtUp = pagesRead >= totalPages;

  // While pages are still unread the job runs every hour so the whole survey is
  // read within a day. Once it's all in, one refresh slice a day is plenty —
  // skip the extra hourly passes instead of re-reading the site all day.
  if (caughtUp) {
    const { data: recent } = await admin
      .from("dgp_ingest_runs")
      .select("started_at")
      .not("finished_at", "is", null)
      .gte("started_at", new Date(Date.now() - 20 * 60 * 60_000).toISOString())
      .limit(1);
    if ((recent ?? []).length) {
      return json({
        ran: false,
        reason: "Survey already fully read; today's refresh pass is done",
        pagesRead,
        totalPages,
      });
    }
  }

  // Caught up: walk a different slice each day so stored answers stay fresh.
  const daysSinceEpoch = Math.floor(Date.now() / 86_400_000);
  const offset = caughtUp ? (daysSinceEpoch * PAGES_PER_PASS) % Math.max(1, totalPages) : pagesRead;

  const { data: claim } = await admin
    .from("dgp_ingest_runs")
    .insert({
      started_at: new Date().toISOString(),
      pages_fetched: 0,
      profiles_written: 0,
      answers_written: 0,
      failures: 0,
      notes: `scheduled claim at offset ${offset}`,
    })
    .select("id")
    .maybeSingle();

  try {
    const batch = await ingestDgpPages(admin, offset, PAGES_PER_PASS);
    const relink = await relinkDgpMolds(admin);
    return json({
      ran: true,
      mode: caughtUp ? "refresh" : "catch-up",
      offset,
      pagesRead: caughtUp ? totalPages : pagesRead + batch.pages_fetched,
      totalPages,
      pagesFetched: batch.pages_fetched,
      profiles: batch.profiles_written,
      answers: batch.answers_written,
      failures: batch.failures,
      discsAdded: batch.molds_created + relink.created,
      discsLinked: relink.linked,
      stillUnmatched: relink.still_unmatched,
      errors: batch.errors.slice(0, 3),
    });
  } catch (error) {
    return json({ ran: false, error: (error as Error).message }, 500);
  } finally {
    if (claim?.id) {
      // The claim row is only a lock; keep the real record in the run inserted
      // by the ingest itself and drop this placeholder.
      await admin.from("dgp_ingest_runs").delete().eq("id", claim.id);
    }
  }
}

export const Route = createFileRoute("/api/public/sync/disc-intel")({
  server: {
    handlers: {
      POST: ({ request }) => run(request),
      GET: ({ request }) => run(request),
    },
  },
});
