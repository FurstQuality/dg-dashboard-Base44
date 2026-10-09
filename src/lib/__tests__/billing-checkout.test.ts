import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHostedCheckout, createHostedPortal } from "../billing-checkout.server";

let deps: any;
let tier: any;
let existing: any;
beforeEach(() => {
  vi.stubEnv("APP_ORIGIN", "https://dgdashboard.app");
  tier = { key: "pro", is_active: true, is_public: true, currency: "usd", monthly_price_cents: 500, stripe_monthly_price_id: "price_one", trial_days: 7 };
  existing = null;
  deps = {
    userId: "verified-user", email: "fixture@example.test",
    admin: { rpc: vi.fn(async () => ({ data: 1, error: null })) },
    db: { from: vi.fn((table) => { const q: any = { select: () => q, eq: vi.fn(() => q), maybeSingle: async () => ({ data: table === "subscription_tiers" ? tier : existing, error: null }) }; return q; }) },
    stripe: {
      prices: { retrieve: vi.fn(async () => ({ active: true, type: "recurring", recurring: { interval: "month", interval_count: 1 }, currency: "usd", unit_amount: 500 })) },
      customers: { create: vi.fn(async () => ({ id: "cus_one" })) },
      subscriptions: { list: vi.fn(async () => ({ data: [], has_more: false })) },
      checkout: { sessions: { list: vi.fn(async () => ({ data: [] })), create: vi.fn(async () => ({ id: "cs_one", url: "https://checkout.stripe.com/fixture" })) } },
      billingPortal: { sessions: { create: vi.fn(async () => ({ url: "https://billing.stripe.com/fixture" })) } },
    },
  };
});
afterEach(() => vi.unstubAllEnvs());
const input = { tierKey: "pro", interval: "month" as const };
describe("hosted payment creation", () => {
  it("requires transactional billing setup before contacting Stripe", async () => {
    deps.admin.rpc.mockResolvedValue({ error: { message: "missing migration" } });
    await expect(createHostedCheckout(input, deps)).rejects.toThrow("setup is incomplete");
    expect(deps.stripe.prices.retrieve).not.toHaveBeenCalled(); expect(deps.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("checks the registered amount and recurring interval", async () => {
    deps.stripe.prices.retrieve.mockResolvedValue({ active: true, type: "recurring", recurring: { interval: "month", interval_count: 1 }, currency: "usd", unit_amount: 5000 });
    await expect(createHostedCheckout(input, deps)).rejects.toThrow("price needs");
    expect(deps.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("does not sell inactive tiers or create another active subscription", async () => {
    tier.is_active = false;
    expect(await createHostedCheckout(input, deps)).toMatchObject({ error: "tier_unavailable" });
    tier.is_active = true; existing = { provider: "apple", status: "active" };
    expect(await createHostedCheckout(input, deps)).toMatchObject({ error: "already_subscribed" });
    expect(deps.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("reuses pending checkout and detects subscriptions before webhook delivery", async () => {
    deps.stripe.subscriptions.list.mockResolvedValue({ data: [{ status: "active" }] });
    expect(await createHostedCheckout(input, deps)).toMatchObject({ error: "already_subscribed" });
    deps.stripe.subscriptions.list.mockResolvedValue({ data: [] });
    deps.stripe.checkout.sessions.list.mockResolvedValue({ data: [{ metadata: { tier_key: "pro", interval: "month" }, id: "cs_existing", url: "https://checkout.stripe.com/existing" }] });
    expect(await createHostedCheckout(input, deps)).toMatchObject({ sessionId: "cs_existing" });
    expect(deps.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("sets subscription ownership, fixed return URLs and idempotency keys", async () => {
    await createHostedCheckout(input, deps);
    expect(deps.stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      subscription_data: { metadata: { user_id: "verified-user", tier_key: "pro", interval: "month" }, trial_period_days: 7 },
      success_url: "https://dgdashboard.app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}",
    }), expect.objectContaining({ idempotencyKey: expect.stringContaining("verified-user-pro-month") }));
  });
  it("does not open a customer portal when subscription lookup fails", async () => {
    deps.db.from.mockReturnValue({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: {} }) });
    await expect(createHostedPortal(deps)).rejects.toThrow("Unable to read");
    expect(deps.stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });
});
