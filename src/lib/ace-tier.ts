/**
 * Ace tier configuration.
 *
 * Product model:
 * - Free tier: local answer database only (no AI gateway calls, no cost).
 * - Paid tier: full Ace caddy powered by the configured server AI provider,
 *   personalized to the player's bag/rounds/rating, plus access to
 *   the full suite of premium DG Dashboard features.
 *
 * Beta mode:
 * - While the app is in beta, ALL features (including full Ace caddy)
 *   are unlocked for every signed-in user so we can validate the whole
 *   experience before splitting free vs paid.
 * - When beta ends, flip BETA_MODE to false and the free tier will
 *   automatically fall back to the local answer engine unless a user
 *   has an active paid subscription.
 */

export const BETA_MODE = true;

export type AceTier = "free" | "paid" | "beta";

export type AceAccess = {
  tier: AceTier;
  /** True when the caller should get full AI (paid) responses. */
  aiUnlocked: boolean;
  /** Human-readable label for badges/UI. */
  label: string;
  /** Short description shown in banners/upgrade prompts. */
  description: string;
};

/**
 * Resolve access for a given user. Today this is a pure config check
 * (beta unlocks everything). When paid subscriptions ship, plug the
 * subscription lookup into `isPaidSubscriber` below.
 */
export function resolveAceAccess(
  _userId: string | null | undefined,
  opts?: { paid?: boolean },
): AceAccess {
  if (BETA_MODE) {
    return {
      tier: "beta",
      aiUnlocked: true,
      label: "Beta - Full AI",
      description:
        "You have full Ace caddy access during the DG Dashboard beta. After launch, full AI will require a paid subscription; a free local caddy will remain available to everyone.",
    };
  }
  if (opts?.paid) {
    return {
      tier: "paid",
      aiUnlocked: true,
      label: "Pro - Full AI",
      description: "The full Ace caddy is enabled on your paid DG Dashboard subscription.",
    };
  }
  return {
    tier: "free",
    aiUnlocked: false,
    label: "Free - Local Caddy",
    description:
      "You're on the free Ace. Answers come from an on-device disc golf knowledge base. Upgrade for the full AI caddy tuned to your bag, rounds, and rating.",
  };
}
