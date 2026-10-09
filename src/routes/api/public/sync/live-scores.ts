/**
 * Scheduled live-scoring sync.
 *
 * Called on a timer by the database scheduler (never by a browser). It walks
 * the live sync schedule, picks the events that are in play and least recently
 * refreshed, and pulls their current live scoring into shared storage — which
 * is why nobody in the app ever has to press a sync button.
 *
 * Caller must present the shared LIVE_SYNC_SECRET.
 */
import { createFileRoute } from "@tanstack/react-router";
import { syncEventLiveScores } from "@/lib/live/pdga-live.server";
import { isAuthorizedSyncCaller } from "@/lib/live/sync-auth.server";

/** How many events one run may refresh, so a single run stays fast. */
const MAX_EVENTS_PER_RUN = 8;

function unauthorized() {
  return new Response("Unauthorized", { status: 401 });
}

async function runSync(request: Request): Promise<Response> {
  if (!(await isAuthorizedSyncCaller(request))) return unauthorized();

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from("live_sync_registry")
    .select("event_ref, start_date, end_date, priority, last_synced_at")
    .eq("active", true)
    .lte("start_date", today)
    .gte("end_date", today)
    .order("priority", { ascending: false })
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(MAX_EVENTS_PER_RUN);
  if (error) return new Response(error.message, { status: 500 });

  const events = (data ?? []) as Array<{ event_ref: string }>;
  const results = [] as Array<{ eventRef: string; ok: boolean; players: number; status: string }>;
  for (const event of events) {
    try {
      const outcome = await syncEventLiveScores(event.event_ref);
      results.push({
        eventRef: outcome.eventRef,
        ok: outcome.ok,
        players: outcome.players,
        status: outcome.status,
      });
    } catch (err) {
      results.push({
        eventRef: event.event_ref,
        ok: false,
        players: 0,
        status: err instanceof Error ? "error" : "error",
      });
    }
  }

  // Retire events whose window has passed so the schedule stays small.
  await supabaseAdmin
    .from("live_sync_registry")
    .update({ active: false })
    .eq("active", true)
    .lt("end_date", today);

  return new Response(
    JSON.stringify({ ranAt: new Date().toISOString(), events: results.length, results }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export const Route = createFileRoute("/api/public/sync/live-scores")({
  server: {
    handlers: {
      POST: ({ request }) => runSync(request),
      GET: ({ request }) => runSync(request),
    },
  },
});
