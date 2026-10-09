import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageShell } from "@/components/shell";
import { DirectorSubnav } from "@/components/director/director-subnav";
import { DirectorApplicationCard } from "@/components/director/director-application-card";
import { useDirectorAccess } from "@/lib/director-access";

export const Route = createFileRoute("/_authenticated/director")({
  component: DirectorLayout,
});

function DirectorLayout() {
  const { isDirector, loading } = useDirectorAccess();

  if (loading) {
    return (
      <PageShell section="tournaments">
        <div className="h-40 animate-pulse rounded-2xl border border-border/60 bg-card/60" />
      </PageShell>
    );
  }

  if (!isDirector) {
    return (
      <PageShell section="tournaments">
        <DirectorApplicationCard />
      </PageShell>
    );
  }

  return (
    <PageShell section="tournaments">
      <DirectorSubnav />
      <Outlet />
    </PageShell>
  );
}
