import { createFileRoute, Link } from "@tanstack/react-router";
import { useSession } from "@/lib/current-user";
import { PageHeader } from "@/components/shell";
import { Plus, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DirectorCockpit } from "@/components/director/director-cockpit";
import { NowDirector } from "@/components/now/now-director";
import { DirectorPortfolio } from "@/components/director/director-portfolio";
import { DirectorDeskWidgets } from "@/components/director/director-desk-widgets";

export const Route = createFileRoute("/_authenticated/director/")({
  head: () => ({
    meta: [
      { title: "Event Director · DG Dashboard" },
      {
        name: "description",
        content:
          "One console for everything you run: tournaments, leagues, clubs, and your organizer profile.",
      },
      { property: "og:title", content: "Event Director — DG Dashboard" },
      {
        property: "og:description",
        content: "Run tournaments, leagues, and clubs from a single organizer console.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DirectorOverview,
});

function DirectorOverview() {
  const { user } = useSession();
  const userId = user?.id ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Shield className="h-3 w-3" /> Event Director
          </span>
        }
        title="Event Director"
        description="Your events, team and organization in one place."
        primaryAction={
          <Button asChild>
            <Link to="/director/new">
              <Plus className="mr-1 h-4 w-4" /> Create event
            </Link>
          </Button>
        }
        secondaryAction={
          <Link
            to="/director/leagues/new"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Create series / league
          </Link>
        }
      />

      <NowDirector />
      <DirectorPortfolio userId={userId} />
      <DirectorCockpit userId={userId} />
      <DirectorDeskWidgets userId={userId} />
    </div>
  );
}
