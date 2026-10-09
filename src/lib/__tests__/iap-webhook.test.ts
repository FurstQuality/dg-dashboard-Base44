import { describe, expect, it } from "vitest";
import {
  isIgnoredIapEvent,
  mapIapSubscriptionState,
  msToIso,
  normalizeIapProvider,
  resolveIapInterval,
  resolveIapTierKey,
  resolveIapUserId,
} from "@/lib/iap-webhook";

const tiers = [
  { key: "pro", apple_product_id: "dgd.pro.monthly", google_product_id: null },
  {
    key: "elite",
    apple_product_id: null,
    google_product_id: "dgd_elite_yearly",
  },
];

describe("mapIapSubscriptionState", () => {
  it("treats renewals as active", () => {
    expect(mapIapSubscriptionState("RENEWAL")).toEqual({
      status: "active",
      cancelAtPeriodEnd: false,
    });
  });

  it("keeps access through the paid period after a cancellation", () => {
    expect(mapIapSubscriptionState("CANCELLATION")).toEqual({
      status: "active",
      cancelAtPeriodEnd: true,
    });
  });

  it("marks trial purchases as trialing", () => {
    expect(mapIapSubscriptionState("INITIAL_PURCHASE", "TRIAL")?.status).toBe("trialing");
  });

  it("maps billing issues and expirations", () => {
    expect(mapIapSubscriptionState("BILLING_ISSUE")?.status).toBe("past_due");
    expect(mapIapSubscriptionState("EXPIRATION")?.status).toBe("expired");
  });

  it("returns null for unknown event types", () => {
    expect(mapIapSubscriptionState("SOMETHING_NEW")).toBeNull();
  });
});

describe("isIgnoredIapEvent", () => {
  it("ignores test and transfer events", () => {
    expect(isIgnoredIapEvent("TEST")).toBe(true);
    expect(isIgnoredIapEvent("transfer")).toBe(true);
    expect(isIgnoredIapEvent("RENEWAL")).toBe(false);
  });
});

describe("resolveIapUserId", () => {
  it("accepts a real account id", () => {
    const id = "0f2a4e1c-7b8d-4c2a-9f11-2c3d4e5f6071";
    expect(resolveIapUserId({ type: "RENEWAL", app_user_id: id })).toBe(id);
  });

  it("rejects anonymous store ids", () => {
    expect(resolveIapUserId({ type: "RENEWAL", app_user_id: "$RCAnonymousID:abc" })).toBeNull();
  });
});

describe("resolveIapTierKey", () => {
  it("matches apple and google product ids case-insensitively", () => {
    expect(resolveIapTierKey("DGD.Pro.Monthly", tiers)).toBe("pro");
    expect(resolveIapTierKey("dgd_elite_yearly", tiers)).toBe("elite");
  });

  it("returns null for products no tier claims", () => {
    expect(resolveIapTierKey("dgd.legacy.lifetime", tiers)).toBeNull();
    expect(resolveIapTierKey(undefined, tiers)).toBeNull();
  });
});

describe("resolveIapInterval", () => {
  it("reads the period from the product id", () => {
    expect(resolveIapInterval("dgd_elite_yearly")).toBe("year");
    expect(resolveIapInterval("dgd.pro.monthly")).toBe("month");
    expect(resolveIapInterval("dgd.pro")).toBeNull();
  });
});

describe("msToIso / normalizeIapProvider", () => {
  it("converts store timestamps and ignores empty values", () => {
    expect(msToIso(1_756_000_000_000)).toBe(new Date(1_756_000_000_000).toISOString());
    expect(msToIso(0)).toBeNull();
    expect(msToIso(null)).toBeNull();
  });

  it("normalizes store names", () => {
    expect(normalizeIapProvider("APP_STORE")).toBe("apple");
    expect(normalizeIapProvider("PLAY_STORE")).toBe("google");
    expect(normalizeIapProvider(undefined)).toBe("iap");
  });
});
