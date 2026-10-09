/**
 * Scheduled knowledge pass for Ace.
 *
 * Called on a timer by the database scheduler, never by a browser. Each call
 * refreshes a batch of Ace's disc golf knowledge from the app's own course,
 * event, player and disc records.
 */
import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedSyncCaller } from "@/lib/live/sync-auth.server";
import { runAceKnowledgeIngest } from "@/lib/ace/knowledge-ingest.server";

async function run(request: Request): Promise<Response> {
  if (!(await isAuthorizedSyncCaller(request))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runAceKnowledgeIngest();
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/sync/ace-knowledge")({
  server: {
    handlers: {
      POST: ({ request }) => run(request),
      GET: ({ request }) => run(request),
    },
  },
});
