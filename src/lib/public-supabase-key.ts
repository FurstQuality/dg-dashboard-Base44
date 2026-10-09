/** Reject a service credential before it can be used by a browser client. */
export function assertBrowserSupabaseKey(value: string): void {
  if (value.startsWith("sb_publishable_")) return;
  try {
    const payload = value.split(".")[1];
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (claims.role === "anon") return;
  } catch {
    /* Reject malformed or non-public credentials without logging them. */
  }
  throw new Error(
    "The browser requires a Supabase publishable/anon key, never a secret or service-role key",
  );
}
