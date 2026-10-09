import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { PageShell, PageHeader } from "@/components/shell";
import { TrackerSubnav } from "@/components/tracker/tracker-subnav";
import { EventPreviewSheet } from "@/components/tracker/event-preview-sheet";
import { TrackerAlertSettings } from "@/components/tracker/tracker-alert-settings";
import { PlayerTrackerPanel } from "@/components/tracker/player-tracker-panel";
import { RouteErrorBoundary } from "@/components/route-boundaries";

const searchSchema = z.object({
  /** PDGA event number whose preview panel is open. */
  event: z.string().max(40).optional(),
});

export const Route = createFileRoute("/_authenticated/tracker/players")({
  component: PlayerTrackerPage,
  errorComponent: RouteErrorBoundary,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Player Tracker · DG Dashboard" },
      {
        name: "description",
        content:
          "Follow any player by name or PDGA number — the events they're playing, their recent rounds, and how they're trending.",
      },
      { property: "og:title", content: "Player Tracker · DG Dashboard" },
      {
        property: "og:description",
        content: "Track the players you follow: upcoming events, recent rounds, and current form.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function PlayerTrackerPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const openPreview = (eventRef: string | null) =>
    void navigate({
      to: "/tracker/players",
      search: eventRef ? { event: eventRef } : {},
      replace: true,
    });

  return (
    <PageShell>
      <PageHeader
        title="Players & crews"
        description="Follow players, organize them into crews, and see who's on the course right now."
        primaryAction={<TrackerAlertSettings />}
      />
      <TrackerSubnav active="players" />
      <PlayerTrackerPanel onPreview={openPreview} />

      <EventPreviewSheet
        eventRef={search.event ?? null}
        onOpenChange={(open) => {
          if (!open) openPreview(null);
        }}
      />
    </PageShell>
  );
}
