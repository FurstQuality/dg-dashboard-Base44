import { createFileRoute, Link } from "@tanstack/react-router";
import { SettingsPageTitle } from "@/components/settings/settings-page-title";
import { CreditCard, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/settings/billing")({
  head: () => ({
    meta: [
      { title: "Billing & Plan · DG Dashboard" },
      {
        name: "description",
        content: "Manage your DG Dashboard subscription, payment method, and plan level.",
      },
      { property: "og:title", content: "Billing & Plan · DG Dashboard" },
      {
        property: "og:description",
        content: "Manage your DG Dashboard subscription, payment method, and plan level.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BillingSettings,
});

function BillingSettings() {
  return (
    <div className="space-y-4">
      <SettingsPageTitle title="Subscription & billing" description="Review your plan, payment method, and receipts." />
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <div className="text-sm font-semibold">Subscription & billing</div>
        </div>
        <p className="text-sm text-muted-foreground">
          DG Dashboard is in open beta — every feature is unlocked while we polish the paid tiers.
          Once launch hits, your plan, invoices, and receipts will live in one place.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/billing">
              Manage subscription <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/pricing">
              <Sparkles className="mr-1.5 h-4 w-4" /> Compare plans
            </Link>
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 text-sm font-semibold">In-app purchases (iOS / Android)</div>
        <p className="text-sm text-muted-foreground">
          If you upgrade from the mobile app, purchases are billed by Apple or Google. Manage those
          from your device's App Store account.
        </p>
      </section>
    </div>
  );
}
