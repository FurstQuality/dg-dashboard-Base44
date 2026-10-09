import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { PageShell, PageHeader } from "@/components/shell";
import { TrackerSubnav } from "@/components/tracker/tracker-subnav";
import { EventTrackerPanel } from "@/components/tracker/event-tracker-panel";
import { EventPreviewSheet } from "@/components/tracker/event-preview-sheet";
import { TrackerAlertSettings } from "@/components/tracker/tracker-alert-settings";

import { RouteErrorBoundary } from "@/components/route-boundaries";

const searchSchema = z.object({
  /** PDGA event number whose preview panel is open. */
  event: z.string().max(40).optional(),
});

export const Route = createFileRoute("/_authenticated/tracker/events")({
  component: EventTrackerPage,
  errorComponent: RouteErrorBoundary,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Event Tracker · DG Dashboard" },
      {
        name: "description",
        content:
          "Save any tournament or league and follow it live — scores as they post, round results, and who's in the field.",
      },
      { property: "og:title", content: "Event Tracker · DG Dashboard" },
      {
        property: "og:description",
        content: "Follow the events you care about: live scores, results, and the full field.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function EventTrackerPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const openPreview = (eventRef: string | null) =>
    void navigate({
      to: "/tracker/events",
      search: eventRef ? { event: eventRef } : {},
      replace: true,
    });

  return (
    <PageShell>
      <PageHeader
        title="Event Tracker"
        description="Pick an event and follow it — live scores, round results, and everyone playing in it."
        primaryAction={<TrackerAlertSettings />}
      />
      <TrackerSubnav active="events" />

      <EventTrackerPanel onPreview={openPreview} />

      <EventPreviewSheet
        eventRef={search.event ?? null}
        onOpenChange={(open) => {
          if (!open) openPreview(null);
        }}
      />
    </PageShell>
  );
}
