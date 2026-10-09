import type Stripe from "stripe";
import {
  billingOrigin,
  requireBillingStorage,
  type BillingDatabase,
} from "./billing-security.server";

type CheckoutDeps = {
  stripe: Stripe;
  admin: BillingDatabase;
  db: BillingDatabase;
  userId: string;
  email?: string;
};
export async function createHostedCheckout(
  data: { tierKey: string; interval: "month" | "year" },
  deps: CheckoutDeps,
) {
  const origin = billingOrigin();
  await requireBillingStorage(deps.admin);
  const tierResult = await deps.db
    .from("subscription_tiers")
    .select("*")
    .eq("key", data.tierKey)
    .maybeSingle();
  if (tierResult.error) throw new Error("Unable to read payment configuration");
  const tier = tierResult.data;
  if (!tier || !tier.is_active || !tier.is_public) return { error: "tier_unavailable" };
  const priceId =
    data.interval === "year" ? tier.stripe_yearly_price_id : tier.stripe_monthly_price_id;
  if (!priceId)
    return {
      error: "price_not_configured",
      message: "This plan is not available for purchase yet.",
    };
  const price = await deps.stripe.prices.retrieve(priceId);
  const amount = data.interval === "year" ? tier.yearly_price_cents : tier.monthly_price_cents;
  if (
    !price.active ||
    price.type !== "recurring" ||
    price.recurring?.interval !== data.interval ||
    price.recurring.interval_count !== 1 ||
    price.unit_amount !== amount ||
    price.currency !== tier.currency
  ) {
    throw new Error("The plan price needs to be checked by an administrator");
  }
  const existingResult = await deps.db
    .from("subscriptions")
    .select("provider, provider_customer_id, status, current_period_end")
    .eq("user_id", deps.userId)
    .maybeSingle();
  if (existingResult.error) throw new Error("Unable to check existing subscription");
  const existing = existingResult.data;
  if (
    existing &&
    ["active", "trialing", "past_due", "comp", "incomplete"].includes(existing.status) &&
    (!existing.current_period_end || new Date(existing.current_period_end).getTime() > Date.now())
  ) {
    return {
      error: "already_subscribed",
      message: "Manage your existing subscription from Billing before starting another.",
    };
  }
  let customerId = existing?.provider === "stripe" ? existing.provider_customer_id : null;
  if (!customerId) {
    const customer = await deps.stripe.customers.create(
      { email: deps.email, metadata: { supabase_user_id: deps.userId } },
      { idempotencyKey: `dgd-customer-${deps.userId}` },
    );
    customerId = customer.id;
  }
  // Also check Stripe: the webhook may not have reached our database yet.
  const subscriptions = await deps.stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  if (
    subscriptions.has_more ||
    subscriptions.data.some((sub) => !["canceled", "incomplete_expired"].includes(sub.status))
  ) {
    return {
      error: "already_subscribed",
      message: "Your subscription is already processing. Open Billing to manage it.",
    };
  }
  const openSessions = await deps.stripe.checkout.sessions.list({
    customer: customerId,
    status: "open",
    limit: 10,
  });
  if (openSessions.data.length) {
    const pending = openSessions.data.find(
      (session) =>
        session.metadata?.tier_key === tier.key && session.metadata?.interval === data.interval,
    );
    if (pending?.url) return { url: pending.url, sessionId: pending.id };
    return {
      error: "checkout_pending",
      message: "Finish or let your pending checkout expire before choosing a different plan.",
    };
  }
  const metadata = { user_id: deps.userId, tier_key: tier.key, interval: data.interval };
  const trialDays =
    !existing &&
    subscriptions.data.length === 0 &&
    Number.isInteger(tier.trial_days) &&
    tier.trial_days > 0 &&
    tier.trial_days <= 730
      ? tier.trial_days
      : undefined;
  const session = await deps.stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata, ...(trialDays ? { trial_period_days: trialDays } : {}) },
      allow_promotion_codes: true,
      client_reference_id: deps.userId,
      metadata,
      success_url: `${origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?checkout=canceled`,
    },
    {
      idempotencyKey: `dgd-checkout-${deps.userId}-${tier.key}-${data.interval}-${Math.floor(Date.now() / 1_800_000)}`,
    },
  );
  return { url: session.url, sessionId: session.id };
}

export async function createHostedPortal(deps: Pick<CheckoutDeps, "stripe" | "db" | "userId">) {
  const origin = billingOrigin();
  const result = await deps.db
    .from("subscriptions")
    .select("provider_customer_id")
    .eq("user_id", deps.userId)
    .eq("provider", "stripe")
    .maybeSingle();
  if (result.error) throw new Error("Unable to read subscription");
  if (!result.data?.provider_customer_id)
    return { error: "no_customer", message: "No Stripe subscription found." };
  const portal = await deps.stripe.billingPortal.sessions.create({
    customer: result.data.provider_customer_id,
    return_url: `${origin}/billing`,
  });
  return { url: portal.url };
}
