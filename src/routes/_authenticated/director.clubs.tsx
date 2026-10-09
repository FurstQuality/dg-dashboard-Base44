import { createFileRoute, Link } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { clubDashboard, clubRegistry } from "@/components/dashboard/widgets/club";
import { PageHeader } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Shield, Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/director/clubs")({
  head: () => ({
    meta: [
      { title: "Club desk · DG Dashboard" },
      {
        name: "description",
        content: "Manage the clubs you lead — members, announcements, events, and club leagues.",
      },
      { property: "og:title", content: "Club desk — DG Dashboard" },
      {
        property: "og:description",
        content: "Members, announcements, events, and leagues for the clubs you lead.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DirectorClubs,
});

function DirectorClubs() {
  return (
    <DashboardShell
      def={clubDashboard}
      registry={clubRegistry}
      header={
        <PageHeader
          eyebrow={
            <span className="inline-flex items-center gap-1.5">
              <Shield className="h-3 w-3" /> Event Director
            </span>
          }
          title="Clubs"
          description="Club activity in one dashboard — members, announcements, events, leagues, and join requests."
          primaryAction={
            <Button asChild size="sm">
              <Link to="/clubs">
                <Building2 className="mr-1 h-4 w-4" />
                Browse clubs
              </Link>
            </Button>
          }
        />
      }
    />
  );
}
