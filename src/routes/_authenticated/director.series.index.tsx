import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Shield } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { SeriesDesk } from "@/components/director/series-desk";

export const Route = createFileRoute("/_authenticated/director/series/")({
  head: () => ({
    meta: [
      { title: "Series desk · DG Dashboard" },
      { name: "description", content: "Series you run: combined points and results across tournaments and leagues." },
      { property: "og:title", content: "Series desk — DG Dashboard" },
      { property: "og:description", content: "Combined points and results across your tournaments and leagues." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DirectorSeries,
});

function DirectorSeries() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Shield className="h-3 w-3" /> Event Director
          </span>
        }
        title="Your series"
        description="Combined points and results across the tournaments and leagues you link together."
        primaryAction={
          <Button asChild size="sm">
            <Link to="/director/new">
              <Plus className="mr-1 h-4 w-4" />
              Create event
            </Link>
          </Button>
        }
      />
      <SeriesDesk />
    </div>
  );
}
