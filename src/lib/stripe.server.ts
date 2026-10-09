/**
 * Server-only Stripe client. Reads STRIPE_SECRET_KEY at call time.
 * Callers MUST handle the "not configured" case gracefully so the app
 * degrades cleanly until the workspace admin adds the secret.
 */
import Stripe from "stripe";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_NOT_CONFIGURED");
  cached = new Stripe(key, {
    apiVersion: "2024-11-20.acacia" as Stripe.LatestApiVersion,
    typescript: true,
    appInfo: { name: "DG Dashboard", version: "1.0.0" },
  });
  return cached;
}

export function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}
