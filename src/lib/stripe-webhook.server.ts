import type Stripe from "stripe";
import { readBoundedText } from "./http-safety";
import { applyBillingState, type BillingDatabase } from "./billing-security.server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idOf = (value: unknown): string | null =>
  typeof value === "string"
    ? value
    : value && typeof value === "object" && "id" in value && typeof value.id === "string"
      ? value.id
      : null;
const date = (seconds: unknown): string | null =>
  typeof seconds === "number" &&
  seconds > 0 &&
  Number.isFinite(seconds) &&
  seconds < 8_640_000_000_000
    ? new Date(seconds * 1000).toISOString()
    : null;

export async function handleStripeWebhook(
  request: Request,
  deps: {
    stripe: Stripe;
    admin: BillingDatabase;
    secret: string;
    live: boolean;
  },
): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("missing_signature", { status: 400 });
  let raw: string;
  try {
    raw = await readBoundedText(request, 512 * 1024);
  } catch {
    return new Response("invalid_body", { status: 413 });
  }
  let event: Stripe.Event;
  try {
    event = await deps.stripe.webhooks.constructEventAsync(raw, signature, deps.secret);
  } catch {
    return new Response("invalid_signature", { status: 400 });
  }
  if (event.livemode !== deps.live) return new Response("wrong_environment", { status: 400 });
  const object = event.data.object as unknown as Record<string, any>;
  let subscriptionId: string | null = null;
  let checkoutUser: string | null = null;
  if (event.type.startsWith("customer.subscription.")) subscriptionId = idOf(object);
  else if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    if (object.mode !== "subscription") return new Response("ignored");
    subscriptionId = idOf(object.subscription);
    checkoutUser = object.client_reference_id ?? object.metadata?.user_id ?? null;
  } else if (
    ["invoice.payment_failed", "invoice.paid", "invoice.payment_succeeded"].includes(event.type)
  ) {
    subscriptionId =
      idOf(object.subscription) ?? idOf(object.parent?.subscription_details?.subscription);
  } else return new Response("ignored");
  if (!subscriptionId) return new Response("ignored");
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId))
    return new Response("invalid_subscription", { status: 400 });

  try {
    // Record when the read started: concurrent older reads cannot overwrite a newer one.
    // Stripe does not guarantee delivery order, so never apply the event's stale object.
    const stateAt = new Date().toISOString();
    const sub = await deps.stripe.subscriptions.retrieve(subscriptionId);
    if (sub.livemode !== deps.live) throw new Error("Environment mismatch");
    const customerId = idOf(sub.customer);
    if (!customerId) throw new Error("Missing customer");
    const existing = await deps.admin
      .from("subscriptions")
      .select("user_id")
      .eq("provider", "stripe")
      .eq("provider_customer_id", customerId)
      .maybeSingle();
    if (existing.error) throw new Error("Customer lookup failed");
    const identities = [sub.metadata?.user_id, checkoutUser, existing.data?.user_id].filter(
      Boolean,
    ) as string[];
    if (!identities.length) {
      const customer = await deps.stripe.customers.retrieve(customerId);
      if (!customer.deleted && customer.metadata?.supabase_user_id)
        identities.push(customer.metadata.supabase_user_id);
    }
    if (
      !identities.length ||
      !identities.every((value) => uuid.test(value) && value === identities[0])
    ) {
      throw new Error("Unresolved subscription owner");
    }
    if (sub.items.data.length !== 1) throw new Error("Unsupported subscription items");
    const item = sub.items.data[0];
    const priceId = item.price.id;
    if (!/^price_[A-Za-z0-9]+$/.test(priceId)) throw new Error("Invalid price");
    const tierResult = await deps.admin
      .from("subscription_tiers")
      .select("key, stripe_monthly_price_id, stripe_yearly_price_id")
      .or(`stripe_monthly_price_id.eq.${priceId},stripe_yearly_price_id.eq.${priceId}`)
      .limit(2);
    if (tierResult.error || tierResult.data?.length !== 1)
      throw new Error("Unmapped or ambiguous price");
    const tier = tierResult.data[0];
    const interval = tier.stripe_monthly_price_id === priceId ? "month" : "year";
    if (item.price.recurring?.interval !== interval || item.price.recurring.interval_count !== 1) {
      throw new Error("Price interval mismatch");
    }
    const statuses: Record<string, string> = {
      active: "active",
      trialing: "trialing",
      past_due: "past_due",
      canceled: "canceled",
      unpaid: "past_due",
      incomplete: "incomplete",
      incomplete_expired: "expired",
      paused: "past_due",
    };
    const status = statuses[sub.status];
    if (!status) throw new Error("Unsupported subscription status");
    const legacy = sub as unknown as { current_period_start?: number; current_period_end?: number };
    const periodEnd = date(legacy.current_period_end ?? item.current_period_end);
    if (["active", "trialing", "past_due"].includes(status) && !periodEnd)
      throw new Error("Missing paid period");
    await applyBillingState(deps.admin, {
      provider: "stripe",
      eventId: event.id,
      eventType: event.type,
      stateAt,
      state: {
        user_id: identities[0],
        tier_key: tier.key,
        status,
        provider_customer_id: customerId,
        provider_subscription_id: sub.id,
        interval,
        current_period_start: date(legacy.current_period_start ?? item.current_period_start),
        current_period_end: periodEnd,
        trial_end: date(sub.trial_end),
        cancel_at_period_end: sub.cancel_at_period_end,
        canceled_at: date(sub.canceled_at),
      },
    });
    return new Response("ok");
  } catch {
    // Keep the response retryable and logs free of raw customer/provider payloads.
    console.error("stripe_webhook_processing_failed", { eventId: event.id, eventType: event.type });
    return new Response("processing_failed", { status: 500 });
  }
}
