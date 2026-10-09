/**
 * Scheduled tick for the outside-data crawler.
 *
 * Called on a timer by the database scheduler, never by a browser. Each call
 * processes one small batch, so cadence controls throughput.
 */
import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedSyncCaller } from "@/lib/live/sync-auth.server";
import { runIngestTick } from "@/lib/ingest/run.server";

async function run(request: Request): Promise<Response> {
  if (!(await isAuthorizedSyncCaller(request))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runIngestTick();
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/sync/ingest")({
  server: {
    handlers: {
      POST: ({ request }) => run(request),
      GET: ({ request }) => run(request),
    },
  },
});
