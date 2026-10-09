import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, X, Crown, Zap, Circle, Sparkles } from "lucide-react";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useEntitlements, useTiers, formatPrice } from "@/hooks/use-entitlements";
import { createCheckoutSession } from "@/lib/billing.functions";
import { BETA_MODE } from "@/lib/ace-tier";

export const Route = createFileRoute("/_authenticated/pricing")({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "Plans & pricing · DG Dashboard" },
      {
        name: "description",
        content:
          "Compare Free, Pro, and Elite plans for DG Dashboard | Ace — pick the plan that matches how you play, compete, and host.",
      },
      { property: "og:title", content: "Plans & pricing · DG Dashboard" },
      {
        property: "og:description",
        content:
          "Compare Free, Pro, and Elite plans for DG Dashboard | Ace — pick the plan that matches how you play, compete, and host.",
      },
    ],
  }),
});

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Circle,
  Zap,
  Crown,
  Sparkles,
};

function PricingPage() {
  const [interval, setInterval] = useState<"month" | "year">("month");
  const { data: tiersData, isLoading } = useTiers();
  const { data: snap } = useEntitlements();
  const checkoutFn = useServerFn(createCheckoutSession);

  async function handleCheckout(tierKey: string) {
    if (tierKey === "free") return;
    try {
      const res = await checkoutFn({ data: { tierKey, interval } });
      if ("url" in res && res.url) {
        window.location.href = res.url;
      } else {
        toast.error(res.message ?? "Checkout unavailable right now.");
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const tiers = tiersData?.tiers ?? [];
  const features = tiersData?.features ?? [];
  const tierFeatures = tiersData?.tierFeatures ?? [];

  return (
    <PageShell>
      <PageHeader
        eyebrow="Plans"
        title="Pick the plan that fits how you play"
        description="Every feature is previewable on Free — upgrade to lift caps, unlock the full Ace caddy, and host serious events."
      />

      {BETA_MODE ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
          <strong className="text-primary">Beta mode:</strong> every plan is fully unlocked for all
          users during the beta. Pricing shown reflects the plans that will be enforced at launch.
        </div>
      ) : null}

      <div className="flex items-center justify-center gap-2">
        <IntervalToggle interval={interval} onChange={setInterval} />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-96 animate-pulse rounded-2xl border bg-card" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {tiers.map((tier) => {
            const Icon = ICONS[tier.icon ?? "Sparkles"] ?? Sparkles;
            const isCurrent = snap?.tierKey === tier.key;
            const price = interval === "year" ? tier.yearly_price_cents : tier.monthly_price_cents;
            const priceLabel =
              price === 0 ? "Free" : `${formatPrice(price)}${interval === "year" ? "/yr" : "/mo"}`;
            const monthlyEq =
              interval === "year" && price > 0
                ? `${formatPrice(Math.round(price / 12))}/mo billed annually`
                : null;

            const featureRows = features.map((f) => {
              const tf = tierFeatures.find((t) => t.tier_id === tier.id && t.feature_key === f.key);
              return { feature: f, tf };
            });

            const highlight = tier.key === "pro";

            return (
              <div
                key={tier.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border bg-card p-5 shadow-sm",
                  highlight && "border-primary/50 ring-2 ring-primary/30",
                )}
              >
                {highlight ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold text-primary-foreground shadow">
                    Most popular
                  </span>
                ) : null}
                <div className="flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-display text-lg font-semibold">{tier.name}</div>
                    <div className="text-xs text-muted-foreground">{tier.tagline}</div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="font-display text-3xl font-bold tabular-nums">{priceLabel}</div>
                  {monthlyEq ? (
                    <div className="text-xs text-muted-foreground">{monthlyEq}</div>
                  ) : null}
                </div>

                <div className="mt-4">
                  {tier.key === "free" ? (
                    <Button
                      disabled={isCurrent}
                      variant="secondary"
                      className="w-full"
                      asChild={!isCurrent}
                    >
                      {isCurrent ? <span>Current plan</span> : <Link to="/home">Get started</Link>}
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={() => handleCheckout(tier.key)}
                      disabled={isCurrent}
                    >
                      {isCurrent ? "Current plan" : `Choose ${tier.name}`}
                    </Button>
                  )}
                </div>

                <ul className="mt-5 space-y-2 text-sm">
                  {featureRows.map(({ feature, tf }) => (
                    <li key={feature.key} className="flex items-start gap-2">
                      {tf?.enabled ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      ) : (
                        <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className={cn(!tf?.enabled && "text-muted-foreground")}>
                        <strong className="font-medium">{feature.label}</strong>
                        {tf?.enabled && tf.limit_value !== null ? (
                          <span className="text-muted-foreground">
                            {" "}
                            — {tf.limit_value}
                            {tf.reset_period === "day"
                              ? "/day"
                              : tf.reset_period === "month"
                                ? "/month"
                                : ""}
                          </span>
                        ) : tf?.enabled ? (
                          <span className="text-muted-foreground"> — unlimited</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        <p>
          Prices billed by Stripe. Cancel anytime from the{" "}
          <Link className="font-medium text-primary" to="/billing">
            billing page
          </Link>
          . Apple / Google in-app purchases will be available when the native app ships — your
          entitlement carries across web and native automatically.
        </p>
      </div>
    </PageShell>
  );
}

function IntervalToggle({
  interval,
  onChange,
}: {
  interval: "month" | "year";
  onChange: (v: "month" | "year") => void;
}) {
  return (
    <div className="inline-flex rounded-full border bg-card p-1">
      <button
        type="button"
        onClick={() => onChange("month")}
        className={cn(
          "rounded-full px-4 py-1.5 text-sm font-medium transition",
          interval === "month"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => onChange("year")}
        className={cn(
          "rounded-full px-4 py-1.5 text-sm font-medium transition",
          interval === "year"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Annual
        <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
          Save ~17%
        </span>
      </button>
    </div>
  );
}
