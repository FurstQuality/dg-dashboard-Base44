import { createFileRoute } from "@tanstack/react-router";
import { MessengerPanel } from "@/components/dgim/messenger-panel";

/**
 * Standalone DGIM app surface — the messenger-app half of the split.
 * Inside the main app, links to /dgim open the docked popup window instead
 * (see MessengerDock); this route serves direct visits, the installed app
 * icon, and popped-out windows.
 */
export const Route = createFileRoute("/_authenticated/dgim")({
  component: DgimApp,
  validateSearch: (s: Record<string, unknown>): { conv?: string } => ({
    conv: typeof s.conv === "string" ? s.conv : undefined,
  }),
  head: () => ({
    meta: [
      { title: "DGIM · Disc Golf Instant Messenger" },
      {
        name: "description",
        content:
          "DGIM is the disc golf messenger: chat with friends, join event rooms, and get tournament updates from your TD instantly.",
      },
      { property: "og:title", content: "DGIM · Disc Golf Instant Messenger" },
      {
        property: "og:description",
        content: "Instant messaging for disc golfers — friends, crews, and live event chat.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function DgimApp() {
  const { conv } = Route.useSearch();
  return <MessengerPanel layout="app" initialConv={conv ?? null} />;
}
