export type BillingDatabase = {
  from: (table: string) => any;
  // The generated database client predates the additive billing migration.
  rpc: (name: any, args?: any) => PromiseLike<{ data: unknown; error: unknown }>;
};

/** Never derive payment return URLs from attacker-controlled Host/forwarded headers. */
export function billingOrigin(env: Record<string, string | undefined> = process.env): string {
  const raw = env.APP_ORIGIN;
  if (!raw) throw new Error("Set APP_ORIGIN before enabling payments");
  const url = new URL(raw);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(local && env.NODE_ENV !== "production" && url.protocol === "http:"))
  ) {
    throw new Error("APP_ORIGIN must be the app's HTTPS origin");
  }
  return url.origin;
}

export async function requireBillingStorage(admin: BillingDatabase): Promise<void> {
  const { data, error } = await admin.rpc("billing_webhook_security_version");
  if (error || data !== 1) throw new Error("Payment storage setup is incomplete");
}

export async function applyBillingState(
  admin: BillingDatabase,
  args: {
    provider: "stripe" | "apple" | "google";
    eventId: string;
    eventType: string;
    stateAt: string;
    state: Record<string, unknown>;
  },
): Promise<string> {
  const { data, error } = await admin.rpc("apply_billing_webhook", {
    p_provider: args.provider,
    p_event_id: args.eventId,
    p_event_type: args.eventType,
    p_state_at: args.stateAt,
    p_state: args.state,
  });
  if (error || !["applied", "duplicate", "stale", "superseded"].includes(String(data))) {
    throw new Error("Billing transaction failed");
  }
  return String(data);
}
