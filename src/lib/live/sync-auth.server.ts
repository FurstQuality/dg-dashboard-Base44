/**
 * Shared authentication for the scheduled sync endpoints.
 *
 * Only the database scheduler calls these routes. It presents either the shared
 * LIVE_SYNC_SECRET or its own stored token from a table no app user can read.
 */

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function readSyncCredential(request: Request): string {
  return (
    request.headers.get("x-live-sync-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    ""
  );
}

/** True when the caller is the scheduler. */
export async function isAuthorizedSyncCaller(request: Request): Promise<boolean> {
  const provided = readSyncCredential(request);
  if (!provided) return false;

  const secret = process.env["LIVE_SYNC_SECRET"];
  if (secret && timingSafeEqual(provided, secret)) return true;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("live_sync_tokens")
    .select("token")
    .eq("token", provided)
    .maybeSingle();
  return !!data;
}
