# Subscriptions & Entitlements

Free / Pro / Elite tiers backed by Stripe today and ready for Apple / Google
IAP through a native wrapper later. Every gate reads from a single database
resolver so there's exactly one source of truth in the app.

## Data model

- **`subscription_tiers`** — the tier catalog (name, prices, provider product IDs).
- **`feature_flags`** — registry of every gate-able capability.
- **`tier_features`** — which features each tier includes and their per-period limits.
- **`subscriptions`** — one row per user with tier, status, provider, and billing cycle.
- **`entitlement_overrides`** — admin comps and beta testers.
- **`feature_usage`** — per-user, per-feature counters for capped features.
- **`billing_events`** — every webhook we've received.

## Resolver

Everything routes through three SQL functions:

- `get_effective_tier(user)` — override → active subscription → `free`.
- `has_feature(user, feature)` — quick boolean check.
- `feature_limit(user, feature)` — returns `{ allowed, used, limit, reset_period }`.
- `consume_feature(user, feature, amount)` — atomic increment; refuses when
  the limit is exceeded.

## Server functions

Located in `src/lib/entitlements.functions.ts` and
`src/lib/billing.functions.ts`:

- `listTiers()` — public catalog for the pricing page.
- `getMyEntitlements()` — full snapshot for the client.
- `checkFeature({ featureKey })` — used by feature gates.
- `consumeFeature({ featureKey })` — called before an action that consumes quota.
- `createCheckoutSession({ tierKey, interval })` — Stripe checkout.
- `createBillingPortalSession()` — Stripe billing portal.
- `grantOverride({ userId, tierKey, reason, expiresAt })` — admin only.
- `revokeOverrides({ userId })` — admin only.

## Client primitives

- `useEntitlements()` (React Query) — cached snapshot for the current user.
- `useTiers()` — cached public catalog.
- `<FeatureGate feature="ai.smartcaddy">` — wraps a capability. Modes: `block`, `preview`, `inline`.
- `<UsageMeter feature="rounds.import" />` — small "8 / 10" pill.

## Retrofit checklist

Wrap any premium surface with `<FeatureGate>` using the feature keys from
`feature_flags`. Common ones:

| Feature key | Where to add the gate |
| --- | --- |
| `ai.smartcaddy` | Ask Ace chat send button |
| `stats.rating_studio` | Rating Studio history & advanced tools |
| `stats.statlink_full` | StatLink history when data is older than 5 rounds |
| `events.host_tournament` | `/tournaments/new` create button |
| `events.host_league` | `/leagues/new` create button |
| `gameplan.simulate` | Game Plan simulate button (also call `consumeFeature`) |
| `rounds.import` | `/import` submit (call `consumeFeature`) |
| `players.track` | Tracker "Add player" button |
| `leaderboards.host` | Live leaderboard host toggle |
| `admin.exports` | TD Pro CSV exports |

## Stripe setup

1. Add secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
2. In Stripe dashboard, create one **Product** per tier and one **Price** per
   billing interval (monthly + annual).
3. Paste the product ID and both price IDs into `/admin/tiers` for the tier.
4. Point Stripe's webhook at `https://<published-host>/api/public/stripe-webhook`
   and subscribe to: `checkout.session.completed`,
   `customer.subscription.*`, `invoice.payment_failed`.
5. Test in Stripe test mode; subscriptions auto-write via the webhook.

## Native app (RevenueCat)

When wrapping in Capacitor / React Native for the App Store and Play Store:

1. Configure products in App Store Connect and Google Play Console. Paste the
   product IDs into `/admin/tiers` (`apple_product_id`, `google_product_id`).
2. Add RevenueCat's SDK to the wrapper and configure both stores' shared keys.
3. Point RevenueCat's server-to-server webhook at
   `https://<published-host>/api/public/iap-webhook`. Update
   `src/routes/api/public/iap-webhook.ts` to verify the RevenueCat signature
   and upsert the `subscriptions` row with `provider = 'apple'` / `'google'`.
4. `detectNativePlatform()` in `src/lib/native-bridge.ts` already routes
   checkout to native IAP when the app is loaded inside Capacitor — replace
   the `launchNativePurchase` stub with the RevenueCat purchase call.

Entitlements resolve identically whether the source is Stripe, Apple, or
Google — the `FeatureGate` component doesn't care.

## Beta mode

While `BETA_MODE` is `true` in `src/lib/smartcaddy-tier.ts`:

- `FeatureGate` always renders its children.
- The pricing page shows a beta banner but is otherwise fully functional.
- Usage counters still record so admins can see real-world caps before launch.

Flip `BETA_MODE = false` when the beta ends. No other code changes required.
