import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { DataHealthWidgets, DataSourceTrustPanel } from "@/components/import/data-health-widgets";
import { ReviewNeededPanel } from "@/components/import/review-needed-panel";

export const Route = createFileRoute("/_authenticated/settings/data-health")({
  head: () => ({
    meta: [
      { title: "Data health · Settings · DG Dashboard" },
      { name: "description", content: "See what's synced, what's missing, and what needs a refresh." },
      { property: "og:title", content: "Data health · Settings · DG Dashboard" },
      { property: "og:description", content: "See what's synced, what's missing, and what needs a refresh." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DataHealthPage,
});

function DataHealthPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Data health</h1>
          <p className="text-sm text-muted-foreground">
            What's synced, what's missing, and what needs a refresh.
          </p>
        </div>
        <Button asChild>
          <Link to="/settings/imports">Add data</Link>
        </Button>
      </div>
      <DataHealthWidgets />
      <DataSourceTrustPanel />
      <ReviewNeededPanel />
    </div>
  );
}
