import { z } from "zod";

/**
 * Pure helpers for the Apple / Google in-app-purchase webhook
 * (RevenueCat-shaped payloads). Kept free of runtime imports so the logic can
 * be unit tested without a server environment.
 */

export const iapEventSchema = z.object({
  event: z.object({
    id: z.string().min(1).max(200).optional(),
    event_timestamp_ms: z.number().int().positive().optional(),
    original_transaction_id: z.string().min(1).max(255).optional(),
    transaction_id: z.string().min(1).max(255).optional(),
    type: z.string().min(1).max(60),
    app_user_id: z.string().min(1).max(200).optional(),
    original_app_user_id: z.string().min(1).max(200).optional(),
    product_id: z.string().min(1).max(200).optional(),
    store: z.string().max(40).optional(),
    period_type: z.string().max(40).optional(),
    environment: z.string().max(40).optional(),
    entitlement_ids: z.array(z.string().max(200)).nullish(),
    purchased_at_ms: z.number().finite().nullish(),
    expiration_at_ms: z.number().finite().nullish(),
  }),
  api_version: z.string().max(20).optional(),
});

export type IapEvent = z.infer<typeof iapEventSchema>["event"];

export type IapSubscriptionState = {
  status: "active" | "trialing" | "past_due" | "canceled" | "expired";
  cancelAtPeriodEnd: boolean;
};

/** Events that carry no subscription state change worth persisting. */
const IGNORED_EVENT_TYPES = new Set([
  "TEST",
  "TRANSFER",
  "SUBSCRIBER_ALIAS",
  "NON_RENEWING_PURCHASE",
  // A scheduled product change does not grant the replacement plan yet.
  "PRODUCT_CHANGE",
]);

export function isIgnoredIapEvent(type: string): boolean {
  return IGNORED_EVENT_TYPES.has(type.toUpperCase());
}

/**
 * Maps a RevenueCat event type (plus its period type) onto the subscription
 * status vocabulary already used by the Stripe webhook.
 */
export function mapIapSubscriptionState(
  type: string,
  periodType?: string | null,
): IapSubscriptionState | null {
  const normalized = type.toUpperCase();
  const trial = (periodType ?? "").toUpperCase() === "TRIAL";

  switch (normalized) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "SUBSCRIPTION_PAUSED":
      return {
        status: trial ? "trialing" : "active",
        cancelAtPeriodEnd: false,
      };
    case "CANCELLATION":
      // Access continues until the paid period ends.
      return { status: trial ? "trialing" : "active", cancelAtPeriodEnd: true };
    case "BILLING_ISSUE":
      return { status: "past_due", cancelAtPeriodEnd: false };
    case "EXPIRATION":
      return { status: "expired", cancelAtPeriodEnd: false };
    case "REFUND":
      return { status: "canceled", cancelAtPeriodEnd: false };
    default:
      return null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * RevenueCat app user ids are set by the mobile wrapper to the signed-in
 * account id. Anything that is not a real account id (anonymous ids, aliases)
 * is rejected rather than guessed at.
 */
export function resolveIapUserId(event: IapEvent): string | null {
  for (const candidate of [event.app_user_id, event.original_app_user_id]) {
    if (candidate && UUID_RE.test(candidate.trim())) return candidate.trim();
  }
  return null;
}

export type TierProductRow = {
  key: string;
  apple_product_id: string | null;
  google_product_id: string | null;
};

/**
 * Resolves the paid tier from the store product id. Returns null when the
 * product is not registered on any tier, so the caller can log the event
 * instead of granting the wrong plan.
 */
export function resolveIapTierKey(
  productId: string | null | undefined,
  tiers: TierProductRow[],
  provider?: "apple" | "google",
): string | null {
  const product = productId?.trim().toLowerCase();
  if (!product) return null;
  const matches = tiers.filter((tier) => {
    const ids = (provider === "apple" ? [tier.apple_product_id] : provider === "google" ? [tier.google_product_id] : [tier.apple_product_id, tier.google_product_id])
      .filter((id): id is string => Boolean(id))
      .map((id) => id.trim().toLowerCase());
    return ids.includes(product);
  });
  return matches.length === 1 ? matches[0].key : null;
}

/** Store product ids conventionally encode the billing period. */
export function resolveIapInterval(productId: string | null | undefined): "month" | "year" | null {
  const product = productId?.toLowerCase() ?? "";
  if (!product) return null;
  if (/(year|annual|12m|yr)/.test(product)) return "year";
  if (/(month|monthly|1m|mo)/.test(product)) return "month";
  return null;
}

export function msToIso(ms: number | null | undefined): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeIapProvider(store: string | null | undefined): string {
  const value = (store ?? "").toLowerCase();
  if (["app_store", "apple", "mac_app_store"].includes(value)) return "apple";
  if (["play_store", "google"].includes(value)) return "google";
  return "iap";
}
