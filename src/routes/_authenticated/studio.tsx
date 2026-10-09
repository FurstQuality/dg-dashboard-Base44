import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { PageShell } from "@/components/shell/page-shell";
import { StudioSubnav } from "@/components/studio/studio-subnav";
import { CreatorAccessGate } from "@/components/studio/creator-access-gate";
import { useCreatorAccess } from "@/lib/creator-access";

export const Route = createFileRoute("/_authenticated/studio")({
  head: () => ({
    meta: [
      { title: "Creator Studio · DG Dashboard" },
      {
        name: "description",
        content: "Create, schedule, and publish disc golf content to the DG Dashboard home feed.",
      },
      { property: "og:title", content: "Creator Studio · DG Dashboard" },
      {
        property: "og:description",
        content: "Create, schedule, and publish disc golf content to the DG Dashboard home feed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudioLayout,
});

/**
 * Publishing tools are approved-creator only. The overview and the application
 * form stay open so a player can see what the studio is and apply for it.
 */
const OPEN_TO_APPLICANTS = new Set(["/studio", "/studio/", "/studio/settings"]);

function StudioLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isCreator, loading } = useCreatorAccess();
  const publishingTool = !OPEN_TO_APPLICANTS.has(pathname);

  if (loading) {
    return (
      <PageShell>
        <div className="h-40 animate-pulse rounded-2xl border border-border/60 bg-card/60" />
      </PageShell>
    );
  }

  if (!isCreator && publishingTool) {
    return (
      <PageShell>
        <CreatorAccessGate />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <StudioSubnav approved={isCreator} />
      <Outlet />
    </PageShell>
  );
}
