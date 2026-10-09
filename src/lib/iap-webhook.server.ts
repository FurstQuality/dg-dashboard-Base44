import { timingSafeEqual } from "node:crypto";
import { readBoundedText } from "./http-safety";
import { applyBillingState, type BillingDatabase } from "./billing-security.server";
import {
  iapEventSchema,
  isIgnoredIapEvent,
  mapIapSubscriptionState,
  msToIso,
  normalizeIapProvider,
  resolveIapInterval,
  resolveIapTierKey,
  resolveIapUserId,
} from "./iap-webhook";

export async function handleIapWebhook(
  request: Request,
  deps: {
    admin: BillingDatabase;
    secret?: string;
    environment: "PRODUCTION" | "SANDBOX";
  },
): Promise<Response> {
  const secret = deps.secret?.trim();
  if (!secret || secret.length < 32) return new Response("iap_not_configured", { status: 503 });
  const provided = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(secret);
  const received = Buffer.from(provided);
  if (received.length !== expected.length || !timingSafeEqual(received, expected))
    return new Response("invalid_authorization", { status: 401 });
  let raw: string;
  try {
    raw = await readBoundedText(request, 64 * 1024);
  } catch {
    return new Response("invalid_body", { status: 413 });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return new Response("invalid_json", { status: 400 });
  }
  const parsed = iapEventSchema.safeParse(json);
  if (!parsed.success) return new Response("invalid_payload", { status: 400 });
  const event = parsed.data.event;
  if (isIgnoredIapEvent(event.type)) return new Response("ignored");
  if (event.environment !== deps.environment)
    return new Response("wrong_environment", { status: 400 });
  const state = mapIapSubscriptionState(event.type, event.period_type);
  if (!state) return new Response("ignored");
  const provider = normalizeIapProvider(event.store);
  const userId = resolveIapUserId(event);
  const subscriptionId = event.original_transaction_id ?? event.transaction_id;
  const stateAt = msToIso(event.event_timestamp_ms);
  const end = msToIso(event.expiration_at_ms);
  if (
    !event.id ||
    !subscriptionId ||
    !stateAt ||
    !userId ||
    !["apple", "google"].includes(provider) ||
    event.event_timestamp_ms! > Date.now() + 300_000 ||
    (["active", "trialing", "past_due"].includes(state.status) && !end)
  ) {
    return new Response("invalid_subscription", { status: 400 });
  }
  try {
    const tiers = await deps.admin
      .from("subscription_tiers")
      .select("key, apple_product_id, google_product_id");
    if (tiers.error) throw new Error("Tier lookup failed");
    const tierKey = resolveIapTierKey(
      event.product_id,
      tiers.data ?? [],
      provider as "apple" | "google",
    );
    if (!tierKey) throw new Error("Product not mapped");
    await applyBillingState(deps.admin, {
      provider: provider as "apple" | "google",
      eventId: event.id,
      eventType: event.type,
      stateAt,
      state: {
        user_id: userId,
        tier_key: tierKey,
        status: state.status,
        provider_customer_id: userId,
        provider_subscription_id: subscriptionId,
        interval: resolveIapInterval(event.product_id),
        current_period_start: msToIso(event.purchased_at_ms),
        current_period_end: end,
        trial_end: state.status === "trialing" ? end : null,
        cancel_at_period_end: state.cancelAtPeriodEnd,
        canceled_at: ["canceled", "expired"].includes(state.status) ? stateAt : null,
      },
    });
    return new Response("ok");
  } catch {
    console.error("iap_webhook_processing_failed", { eventId: event.id, eventType: event.type });
    return new Response("processing_failed", { status: 500 });
  }
}
