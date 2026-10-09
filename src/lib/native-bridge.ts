/**
 * Native-wrapper bridge. When the app is loaded inside a Capacitor / RN
 * wrapper on iOS or Android, in-app purchases must go through Apple / Google
 * IAP — not Stripe checkout — to comply with App Store rules.
 *
 * Today the app runs as a web PWA and we always use Stripe. This module
 * exposes the detection + purchase-router primitives so the wrapper team
 * can hand off to RevenueCat / StoreKit later with a single wiring step.
 */

export type NativePlatform = "web" | "ios" | "android";

export function detectNativePlatform(): NativePlatform {
  if (typeof window === "undefined") return "web";
  const w = window as unknown as {
    Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean };
  };
  const cap = w.Capacitor;
  if (cap?.isNativePlatform?.()) {
    const platform = cap.getPlatform?.() ?? "";
    if (platform === "ios") return "ios";
    if (platform === "android") return "android";
  }
  return "web";
}

export function isNativeApp(): boolean {
  return detectNativePlatform() !== "web";
}

/**
 * Route a checkout intent to the correct provider.
 *  - Web: caller uses Stripe checkout via createCheckoutSession.
 *  - iOS/Android: caller must invoke the native IAP bridge with the
 *    tier's apple_product_id / google_product_id.
 */
export function checkoutProviderFor(tier: {
  apple_product_id?: string | null;
  google_product_id?: string | null;
}): "stripe" | "apple" | "google" {
  const platform = detectNativePlatform();
  if (platform === "ios" && tier.apple_product_id) return "apple";
  if (platform === "android" && tier.google_product_id) return "google";
  return "stripe";
}

/**
 * Placeholder for the native IAP call. When the Capacitor wrapper is
 * built, replace this with a real call to a RevenueCat / StoreKit
 * plugin that returns { transactionId, receipt } for backend verification.
 */
export async function launchNativePurchase(_productId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  return {
    ok: false,
    error:
      "Native in-app purchase isn't wired up yet. Open this app on the web to subscribe, or wait for the App Store release.",
  };
}
