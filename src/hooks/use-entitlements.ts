import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMyEntitlements,
  listTiers,
  type EntitlementSnapshot,
} from "@/lib/entitlements.functions";
import { BETA_MODE } from "@/lib/ace-tier";

export function useEntitlements() {
  const fn = useServerFn(getMyEntitlements);
  return useQuery({
    queryKey: ["entitlements", "me"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });
}

export function useTiers() {
  const fn = useServerFn(listTiers);
  return useQuery({
    queryKey: ["subscription-tiers", "public"],
    queryFn: () => fn(),
    staleTime: 5 * 60_000,
  });
}

/**
 * Feature-gate helper. During beta everything is unlocked but usage is
 * still surfaced so admins can see how limits would land at launch.
 */
export function hasFeature(snap: EntitlementSnapshot | undefined, featureKey: string): boolean {
  if (BETA_MODE) return true;
  return !!snap?.features?.[featureKey]?.enabled;
}

export function featureUsage(snap: EntitlementSnapshot | undefined, featureKey: string) {
  const feature = snap?.features?.[featureKey];
  const usage = snap?.usage?.[featureKey];
  const used = usage?.used ?? 0;
  const limit = feature?.limit ?? null;
  const unlimited = feature?.enabled && limit === null;
  const remaining = limit === null ? null : Math.max(0, limit - used);
  const atLimit = limit !== null && used >= limit;
  return { enabled: !!feature?.enabled, used, limit, unlimited, remaining, atLimit };
}

export function formatPrice(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
