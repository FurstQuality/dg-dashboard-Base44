import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TierRow = {
  id: string;
  key: string;
  name: string;
  tagline: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  is_public: boolean;
  color: string | null;
  icon: string | null;
  monthly_price_cents: number;
  yearly_price_cents: number;
  currency: string;
  trial_days: number;
  stripe_product_id: string | null;
  stripe_monthly_price_id: string | null;
  stripe_yearly_price_id: string | null;
  apple_product_id: string | null;
  google_product_id: string | null;
};

export type FeatureFlagRow = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  category: string;
  unit: "boolean" | "count" | "per_month" | "per_day";
  sort_order: number;
  is_active: boolean;
};

export type TierFeatureRow = {
  id: string;
  tier_id: string;
  feature_key: string;
  enabled: boolean;
  limit_value: number | null;
  reset_period: "month" | "day" | "never";
};

export type SubscriptionRow = {
  id: string;
  user_id: string;
  tier_key: string;
  status: string;
  provider: string;
  interval: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
};

export type EntitlementSnapshot = {
  tierKey: string;
  status: string;
  provider: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
  overrideExpiresAt: string | null;
  features: Record<string, { enabled: boolean; limit: number | null; resetPeriod: string }>;
  usage: Record<string, { used: number; limit: number | null; periodStart: string | null }>;
};

/** Public: list all active, public tiers with their feature matrix. */
export const listTiers = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const sb = createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });

  const { data: tiers } = await sb
    .from("subscription_tiers")
    .select("*")
    .eq("is_active", true)
    .eq("is_public", true)
    .order("sort_order");
  const { data: features } = await sb
    .from("feature_flags")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  const { data: tierFeatures } = await sb.from("tier_features").select("*");

  return {
    tiers: (tiers ?? []) as TierRow[],
    features: (features ?? []) as FeatureFlagRow[],
    tierFeatures: (tierFeatures ?? []) as TierFeatureRow[],
  };
});

/** Authenticated: full entitlement snapshot for the current user. */
export const getMyEntitlements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    const { data: tierKeyRow } = await supabase.rpc("get_effective_tier", { _user: userId });
    const tierKey: string = tierKeyRow ?? "free";

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: override } = await supabase
      .from("entitlement_overrides")
      .select("expires_at, tier_key")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: tier } = await supabase
      .from("subscription_tiers")
      .select("id, key")
      .eq("key", tierKey)
      .maybeSingle();

    const features: EntitlementSnapshot["features"] = {};
    if (tier) {
      const { data: tfs } = await supabase.from("tier_features").select("*").eq("tier_id", tier.id);
      for (const t of tfs ?? []) {
        features[t.feature_key] = {
          enabled: t.enabled,
          limit: t.limit_value,
          resetPeriod: t.reset_period,
        };
      }
    }

    const { data: usage } = await supabase.from("feature_usage").select("*").eq("user_id", userId);
    const usageMap: EntitlementSnapshot["usage"] = {};
    for (const u of usage ?? []) {
      const existing = usageMap[u.feature_key];
      if (
        !existing ||
        (u.period_start && (!existing.periodStart || u.period_start > existing.periodStart))
      ) {
        usageMap[u.feature_key] = {
          used: u.count,
          limit: features[u.feature_key]?.limit ?? null,
          periodStart: u.period_start,
        };
      }
    }

    return {
      tierKey,
      status: sub?.status ?? (override ? "comp" : "active"),
      provider: sub?.provider ?? (override ? "manual" : "manual"),
      currentPeriodEnd: sub?.current_period_end ?? null,
      cancelAtPeriodEnd: !!sub?.cancel_at_period_end,
      trialEnd: sub?.trial_end ?? null,
      overrideExpiresAt: override?.expires_at ?? null,
      features,
      usage: usageMap,
    } satisfies EntitlementSnapshot;
  });

/** Authenticated: check a feature's live limit for the current user. */
export const checkFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { featureKey: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: result } = await supabase.rpc("feature_limit", {
      _user: userId,
      _feature: data.featureKey,
    });
    return result as {
      allowed: boolean;
      used?: number;
      limit?: number;
      unlimited?: boolean;
      reset_period?: string;
      period_start?: string;
      tier?: string;
      reason?: string;
    };
  });

/** Authenticated: atomically consume 1 unit of a capped feature. */
export const consumeFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { featureKey: string; amount?: number }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: result } = await supabase.rpc("consume_feature", {
      _user: userId,
      _feature: data.featureKey,
      _amount: data.amount ?? 1,
    });
    return result as {
      allowed: boolean;
      used?: number;
      limit?: number;
      unlimited?: boolean;
      tier?: string;
      reason?: string;
    };
  });
