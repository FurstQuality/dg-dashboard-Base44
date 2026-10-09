import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleStripeWebhook } from "../stripe-webhook.server";
import { handleIapWebhook } from "../iap-webhook.server";
import { billingOrigin } from "../billing-security.server";

const user = "11111111-1111-4111-8111-111111111111";
const secret = "whsec_local_signature_fixture_only";
const stripe = new Stripe("sk_test_local_fixture_only");
const sub = { id: "sub_one", customer: "cus_one", status: "active", livemode: false,
  metadata: { user_id: user, tier_key: "untrusted_metadata_plan" }, cancel_at_period_end: false,
  items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 86400,
    price: { id: "price_one", recurring: { interval: "month", interval_count: 1 } } }] } };
let admin: any;
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(stripe.subscriptions, "retrieve").mockResolvedValue(sub as any);
  const query: any = { select: vi.fn(() => query), eq: vi.fn(() => query), or: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: { user_id: user }, error: null })),
    limit: vi.fn(async () => ({ data: [{ key: "pro", stripe_monthly_price_id: "price_one" }], error: null })) };
  admin = { from: vi.fn(() => query), rpc: vi.fn(async () => ({ data: "applied", error: null })) };
});
afterEach(() => vi.restoreAllMocks());
const stripeRequest = (type = "customer.subscription.updated", patch = {}) => {
  const payload = JSON.stringify({ id: "evt_test", object: "event", livemode: false, type,
    data: { object: { ...sub, status: "past_due", ...patch } } });
  return new Request("https://app.example/api/public/stripe-webhook", { method: "POST", body: payload,
    headers: { "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret }) } });
};
const runStripe = (request: Request) => handleStripeWebhook(request, { stripe, admin, secret, live: false });
describe("Stripe webhook trust boundary", () => {
  it("verifies real Stripe signatures and uses the current subscription and registered price", async () => {
    expect((await runStripe(stripeRequest())).status).toBe(200);
    expect(admin.rpc).toHaveBeenCalledWith("apply_billing_webhook", expect.objectContaining({ p_state: expect.objectContaining({ status: "active", tier_key: "pro", user_id: user }) }));
  });
  it("rejects unsigned and tampered deliveries before touching the database", async () => {
    expect((await runStripe(new Request("https://app.example", { method: "POST", body: "{}" }))).status).toBe(400);
    const request = stripeRequest();
    expect((await runStripe(new Request(request.url, { method: "POST", body: "{}", headers: request.headers }))).status).toBe(400);
    expect(admin.from).not.toHaveBeenCalled(); expect(admin.rpc).not.toHaveBeenCalled();
  });
  it("returns a retryable error instead of acknowledging failed storage", async () => {
    admin.rpc.mockResolvedValue({ data: null, error: { message: "sensitive database details" } });
    const response = await runStripe(stripeRequest());
    expect(response.status).toBe(500); expect(await response.text()).toBe("processing_failed");
  });
  it("does not grant a default tier for unmapped prices", async () => {
    admin.from().limit.mockResolvedValue({ data: [], error: null });
    expect((await runStripe(stripeRequest())).status).toBe(500); expect(admin.rpc).not.toHaveBeenCalled();
  });
  it("rejects mixed owner identities and unknown subscription statuses", async () => {
    expect((await runStripe(stripeRequest("checkout.session.completed", { mode: "subscription", subscription: "sub_one", client_reference_id: "22222222-2222-4222-8222-222222222222" }))).status).toBe(500);
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({ ...sub, status: "future_status" } as any);
    expect((await runStripe(stripeRequest())).status).toBe(500); expect(admin.rpc).not.toHaveBeenCalled();
  });
  it("keeps test events out of production", async () => {
    expect((await handleStripeWebhook(stripeRequest(), { stripe, admin, secret, live: true })).status).toBe(400);
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});

const iapSecret = "local-revenuecat-fixture-secret-at-least-32";
const iapRequest = (patch = {}, authorization = iapSecret) => new Request("https://app.example/api/public/iap-webhook", {
  method: "POST", headers: { authorization }, body: JSON.stringify({ event: {
    id: "evt_iap", event_timestamp_ms: Date.now() - 1000, environment: "PRODUCTION",
    type: "RENEWAL", app_user_id: user, product_id: "pro_monthly", store: "APP_STORE",
    original_transaction_id: "unique_purchase_123", expiration_at_ms: Date.now() + 86400000, ...patch,
  } }),
});
describe("IAP webhook trust boundary", () => {
  const run = (request: Request, secret = iapSecret) => handleIapWebhook(request, { admin, secret, environment: "PRODUCTION" });
  it("rejects empty configuration and bad authentication", async () => {
    expect((await run(iapRequest({}, ""), "  ")).status).toBe(503);
    expect((await run(iapRequest({}, "wrong"))).status).toBe(401);
    expect(admin.rpc).not.toHaveBeenCalled();
  });
  it("rejects sandbox purchases, missing event identity, missing period and unsupported stores", async () => {
    for (const patch of [{ environment: "SANDBOX" }, { id: undefined }, { original_transaction_id: undefined }, { expiration_at_ms: undefined }, { store: "fake_apple_store" }]) {
      expect((await run(iapRequest(patch))).status).toBe(400);
    }
    expect(admin.rpc).not.toHaveBeenCalled();
  });
  it("uses the unique purchase, store-specific product and event time in one atomic transaction", async () => {
    admin.from.mockReturnValue({ select: vi.fn(async () => ({ data: [{ key: "pro", apple_product_id: "pro_monthly", google_product_id: null }] })) });
    expect((await run(iapRequest())).status).toBe(200);
    expect(admin.rpc).toHaveBeenCalledWith("apply_billing_webhook", expect.objectContaining({ p_event_id: "evt_iap", p_provider: "apple", p_state: expect.objectContaining({ provider_subscription_id: "unique_purchase_123" }) }));
    admin.rpc.mockResolvedValue({ error: { message: "db failure" } });
    expect((await run(iapRequest())).status).toBe(500);
  });
});
describe("payment return origin", () => {
  it("requires explicit HTTPS production origin and permits loopback only in development", () => {
    expect(billingOrigin({ APP_ORIGIN: "https://dgdashboard.app" })).toBe("https://dgdashboard.app");
    expect(billingOrigin({ APP_ORIGIN: "http://127.0.0.1:5190", NODE_ENV: "development" })).toBe("http://127.0.0.1:5190");
    for (const value of [undefined, "https://user:password@site.test", "https://site.test/path", "http://site.test", "http://127.0.0.1:5190"]) {
      expect(() => billingOrigin({ APP_ORIGIN: value, NODE_ENV: "production" })).toThrow();
    }
  });
});
