import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { secureResponse } from "./lib/security-headers";
import { sandboxRuntimeStatus } from "./lib/sandbox-runtime";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// The browser closed the connection (reload, navigation, dev reload) — not an app error.
function clientAborted(request: Request): Response | null {
  if (!request.signal?.aborted) return null;
  return new Response(null, { status: 499 });
}

// Send page visits on the old lovable.app address to the custom domain so
// search engines index one canonical host. API/webhook paths are left alone.
const LEGACY_HOST = "dgdashboard.lovable.app";
const CANONICAL_ORIGIN = "https://dgdashboard.app";
function canonicalRedirect(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  if (url.hostname !== LEGACY_HOST) return null;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/lovable/")) return null;
  return Response.redirect(`${CANONICAL_ORIGIN}${url.pathname}${url.search}`, 301);
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    if (process.env.DGD_SANDBOX === "1" && !sandboxRuntimeStatus(process.env).isolated) {
      return secureResponse(new Response("Sandbox database isolation is not configured. No app request was executed.", { status: 503 }), request);
    }
    const redirect = canonicalRedirect(request);
    if (redirect) return secureResponse(redirect, request);
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const aborted = clientAborted(request);
      if (aborted) return aborted;
      return secureResponse(await normalizeCatastrophicSsrResponse(response), request);
    } catch (error) {
      const aborted = clientAborted(request);
      if (aborted) return aborted;
      console.error(error);
      return secureResponse(new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      }), request);
    }
  },
};
