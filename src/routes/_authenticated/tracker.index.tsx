import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { PageShell, PageHeader } from "@/components/shell";
import { TrackerSubnav } from "@/components/tracker/tracker-subnav";
import { NowTracker } from "@/components/now/now-tracker";

import { EventPreviewSheet } from "@/components/tracker/event-preview-sheet";
import { TrackerAlertSettings } from "@/components/tracker/tracker-alert-settings";
import { TrackingSummary } from "@/components/tracker/tracking-summary";
import { TrackingFullLists } from "@/components/tracker/tracking-full-lists";
import { RouteErrorBoundary } from "@/components/route-boundaries";

const searchSchema = z.object({
  /** Legacy tab links still land here and get forwarded to the new tools. */
  tab: z.string().max(40).optional(),
  /** PDGA event number whose preview panel is open. */
  event: z.string().max(40).optional(),
});

export const Route = createFileRoute("/_authenticated/tracker/")({
  component: TrackerOverviewPage,
  errorComponent: RouteErrorBoundary,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Trackers · DG Dashboard" },
      {
        name: "description",
        content:
          "Three tools in one place: follow events for live scores and results, follow players to see how they're playing, and study courses from past PDGA events.",
      },
      { property: "og:title", content: "Trackers · DG Dashboard" },
      {
        property: "og:description",
        content: "Track events, track players, and study courses — plus who's out playing today.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

/** Old links used ?tab=… on this page; each one now has its own tool. */
const TAB_FORWARDS: Record<string, "/tracker/events" | "/tracker/players" | "/game-plan"> = {
  events: "/tracker/events",
  add: "/tracker/events",
  discover: "/tracker/events",
  tracking: "/tracker/events",
  players: "/tracker/players",
  courses: "/game-plan",
  readiness: "/game-plan",
  "game-plan": "/game-plan",
};

function TrackerOverviewPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const raw = search.tab ?? "";

  useEffect(() => {
    const target = TAB_FORWARDS[raw];
    if (target) void navigate({ to: target, replace: true });
  }, [raw, navigate]);

  const openPreview = (eventRef: string | null) =>
    void navigate({
      to: "/tracker",
      search: eventRef ? { event: eventRef } : {},
      replace: true,
    });

  return (
    <PageShell>
      <PageHeader
        title="Trackers"
        description="Everything you're tracking at a glance: events, players, and courses."
        primaryAction={<TrackerAlertSettings />}
      />
      <TrackerSubnav active="overview" />

      <NowTracker />

      <TrackingSummary limit={6} />

      <TrackingFullLists />

      <EventPreviewSheet
        eventRef={search.event ?? null}
        onOpenChange={(open) => {
          if (!open) openPreview(null);
        }}
      />
    </PageShell>
  );
}
