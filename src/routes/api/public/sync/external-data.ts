/**
 * Scheduled refresh of PDGA, Disc Golf Scene and UDisc data.
 *
 * Called on a timer by the database scheduler (never by a browser). Keeps the
 * shared event mirror and the live-scoring schedule current so the app never
 * depends on someone pressing a sync button.
 */
import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedSyncCaller } from "@/lib/live/sync-auth.server";
import { runExternalDataRefresh } from "@/lib/live/external-refresh.server";

async function run(request: Request): Promise<Response> {
  if (!(await isAuthorizedSyncCaller(request))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runExternalDataRefresh();
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/sync/external-data")({
  server: {
    handlers: {
      POST: ({ request }) => run(request),
      GET: ({ request }) => run(request),
    },
  },
});
