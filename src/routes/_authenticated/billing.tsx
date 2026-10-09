import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Calendar,
  CreditCard,
  ExternalLink,
  Heart,
  Sparkles,
  ShieldAlert,
} from "lucide-react";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { useEntitlements, useTiers, formatPrice } from "@/hooks/use-entitlements";
import { createBillingPortalSession } from "@/lib/billing.functions";
import { detectNativePlatform } from "@/lib/native-bridge";
import { BETA_MODE } from "@/lib/ace-tier";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/billing")({
  component: BillingPage,
  validateSearch: (
    s: Record<string, unknown>,
  ): { checkout?: "success" | "canceled"; session_id?: string } => ({
    checkout: s.checkout as "success" | "canceled" | undefined,
    session_id: s.session_id as string | undefined,
  }),
  head: () => ({
    meta: [
      { title: "Billing · DG Dashboard" },
      {
        name: "description",
        content:
          "Manage your DG Dashboard subscription — see your plan, renewal date, invoices, and cancel or resume anytime.",
      },
      { property: "og:title", content: "Billing · DG Dashboard" },
      {
        property: "og:description",
        content:
          "Manage your DG Dashboard subscription — see your plan, renewal date, invoices, and cancel or resume anytime.",
      },
    ],
  }),
});

function BillingPage() {
  const search = useSearch({ from: "/_authenticated/billing" });
  const { data: snap, refetch } = useEntitlements();
  const { data: tiersData } = useTiers();
  const portalFn = useServerFn(createBillingPortalSession);
  const platform = detectNativePlatform();

  useEffect(() => {
    if (search.checkout === "success") {
      toast.success("Welcome aboard! Your plan is being activated.");
      // Give the webhook a beat to write, then re-fetch.
      const t = setTimeout(() => refetch(), 2500);
      return () => clearTimeout(t);
    }
    if (search.checkout === "canceled") {
      toast.info("Checkout canceled. You can try again anytime.");
    }
  }, [search.checkout, refetch]);

  async function openPortal() {
    try {
      const res = await portalFn();
      if ("url" in res && res.url) window.location.href = res.url;
      else toast.error(res.message ?? "Billing portal unavailable.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const tier = tiersData?.tiers.find((t) => t.key === snap?.tierKey);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Account"
        title="Billing"
        description="Your current plan, renewal date, and payment method."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <BadgeCheck className="h-3.5 w-3.5" />
                Current plan
              </div>
              <div className="mt-1 font-display text-2xl font-semibold">
                {tier?.name ?? snap?.tierKey ?? "Free"}
              </div>
              <div className="text-sm text-muted-foreground">{tier?.tagline}</div>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                snap?.status === "active"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : snap?.status === "trialing"
                    ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                    : snap?.status === "past_due"
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                      : snap?.status === "comp"
                        ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                        : "bg-muted text-muted-foreground",
              )}
            >
              {snap?.status ?? "free"}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Provider" value={snap?.provider ?? "—"} />
            <Info
              label="Renews"
              icon={Calendar}
              value={
                snap?.currentPeriodEnd ? new Date(snap.currentPeriodEnd).toLocaleDateString() : "—"
              }
            />
            <Info label="Cancels at period end" value={snap?.cancelAtPeriodEnd ? "Yes" : "No"} />
            <Info
              label="Trial ends"
              value={snap?.trialEnd ? new Date(snap.trialEnd).toLocaleDateString() : "—"}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {snap?.provider === "stripe" ? (
              <Button onClick={openPortal}>
                <CreditCard className="mr-2 h-4 w-4" />
                Manage in Stripe
                <ExternalLink className="ml-1.5 h-3 w-3" />
              </Button>
            ) : (
              <Button asChild>
                <Link to="/pricing">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Upgrade your plan
                </Link>
              </Button>
            )}
            <Button variant="ghost" asChild>
              <Link to="/pricing">Compare all plans</Link>
            </Button>
          </div>

          {platform !== "web" ? (
            <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <ShieldAlert className="mr-1 inline h-3 w-3" />
              You're on the {platform === "ios" ? "iOS" : "Android"} app. Subscriptions purchased in
              the store are managed in your device's settings.
            </div>
          ) : null}

          {BETA_MODE ? (
            <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
              <strong className="text-primary">Beta:</strong> everyone has full access during the DG
              Dashboard beta. Real billing kicks in at launch.
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            What's included
          </div>
          {tier && tiersData ? (
            <ul className="mt-3 space-y-1.5 text-sm">
              {tiersData.features
                .filter((f) =>
                  tiersData.tierFeatures.some(
                    (tf) => tf.tier_id === tier.id && tf.feature_key === f.key && tf.enabled,
                  ),
                )
                .slice(0, 8)
                .map((f) => (
                  <li key={f.key} className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary" />
                    <span>{f.label}</span>
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      </div>

      <DonateCard />
    </PageShell>
  );
}

/**
 * Optional support card. DONATE_URL is the only thing to change when a real
 * donation page (Buy Me a Coffee, Ko-fi, PayPal, Stripe link) is ready.
 */
const DONATE_URL = "";

function DonateCard() {
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-primary">
        <Heart className="h-3.5 w-3.5" />
        Support the developer
      </div>
      <h2 className="mt-1 font-display text-xl font-semibold">Buy the developer a disc</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        DG Dashboard is built by one disc golfer — thousands of hours of nights and weekends went
        into the scoring engine, course and event data from PDGA, UDisc, and Disc Golf Scene, your
        stats and ratings, the crew trackers, and every screen you use. It stays free during the
        beta. If it has made your rounds better, a small tip helps cover the data, hosting, and
        development costs that keep it running and growing.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {DONATE_URL ? (
          <Button asChild>
            <a href={DONATE_URL} target="_blank" rel="noopener noreferrer">
              <Heart className="mr-2 h-4 w-4" />
              Donate to the developer
              <ExternalLink className="ml-1.5 h-3 w-3" />
            </a>
          </Button>
        ) : (
          <Button disabled title="Donation link coming soon">
            <Heart className="mr-2 h-4 w-4" />
            Donate to the developer
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          Completely optional — nothing in the app is locked behind a donation.
        </span>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}
