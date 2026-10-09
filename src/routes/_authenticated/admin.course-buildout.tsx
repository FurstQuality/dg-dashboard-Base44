import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CourseAtlasOverview, useAtlasOverview } from "@/components/admin/course-atlas-overview";
import { Hammer } from "lucide-react";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { DataIntelTabs } from "@/components/admin/data-intel-tabs";
import { useAdminAccess } from "@/lib/admin-access";
import { AdminErrorState, AdminPanelSkeleton } from "@/components/admin/admin-states";
import { CourseBuildoutTool } from "@/components/admin/course-buildout-tool";
import { UnlocatedCoursesQueue } from "@/components/admin/unlocated-courses-queue";
import { CourseDataSummary } from "@/components/admin/course-data-summary";
import { DirectoryMapCoverage } from "@/components/admin/directory-map-coverage";
import { CourseSourceReview } from "@/components/admin/course-source-review";
import { FullCourseScan } from "@/components/admin/full-course-scan";
import { GeometryHarvestPanel } from "@/components/admin/geometry-harvest-panel";
import { MapCoverageByState } from "@/components/admin/map-coverage-by-state";
import { CourseMatchesQueue } from "@/components/admin/course-matches-queue";

export const Route = createFileRoute("/_authenticated/admin/course-buildout")({
  component: CourseBuildout,
  head: () => ({
    meta: [
      { title: "Course build-out · Admin · DG Dashboard" },
      {
        name: "description",
        content:
          "One tool to find every course, give it the layouts it really plays, and map tee pads and baskets.",
      },
      { property: "og:title", content: "Course build-out · DG Dashboard" },
      {
        property: "og:description",
        content: "Find courses, build real layouts, then map tee pads and baskets area by area.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CourseBuildout() {
  const { isAdmin, checking } = useAdminAccess();

  if (checking) return <AdminPanelSkeleton />;
  if (!isAdmin) {
    return (
      <PageShell>
        <AdminErrorState message="Course build-out is limited to admins." />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Course Atlas"
        description="Build and maintain the course database automatically."
        leading={<Hammer className="h-5 w-5 text-primary" />}
      />
      <DataIntelTabs />
      <AtlasViews />
    </PageShell>
  );
}

type AtlasView = "overview" | "review" | "reports" | "advanced";

function AtlasViews() {
  const [view, setView] = useState<AtlasView>("overview");
  const { data } = useAtlasOverview();
  const r = data?.review;
  const tabs: Array<[AtlasView, string]> = [
    ["overview", "Overview"],
    ["review", r?.total ? `Needs review (${r.total.toLocaleString()})` : "Needs review"],
    ["reports", "Reports"],
    ["advanced", "Advanced"],
  ];
  return (
    <div className="space-y-4">
      <div role="tablist" className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={view === k} type="button" onClick={() => setView(k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
            {label}
          </button>
        ))}
      </div>
      {view === "overview" ? <CourseAtlasOverview onReview={() => setView("review")} /> : null}
      {view === "review" ? (
        <div className="space-y-6">
          {r ? (
            <p className="text-sm text-muted-foreground">
              {r.location.toLocaleString()} need a location · {r.courseMap.toLocaleString()} map pins need a hole · {r.duplicate.toLocaleString()} possible duplicates
            </p>
          ) : null}
          <CourseMatchesQueue />
          <UnlocatedCoursesQueue />
          <GeometryHarvestPanel />
        </div>
      ) : null}
      {view === "reports" ? (
        <div className="space-y-6">
          <MapCoverageByState />
          <DirectoryMapCoverage />
          <CourseDataSummary />
        </div>
      ) : null}
      {view === "advanced" ? (
        <div className="space-y-6">
          <FullCourseScan />
          <CourseBuildoutTool />
          <CourseSourceReview />
        </div>
      ) : null}
    </div>
  );
}
