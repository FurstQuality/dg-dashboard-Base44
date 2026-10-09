import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { PageShell, PageHeader } from "@/components/shell";
import { LostFoundPanel } from "@/components/marketplace/lost-found-panel";

export const Route = createFileRoute("/_authenticated/lost-found")({
  component: LostFoundPage,
  head: () => ({
    meta: [
      { title: "Lost & Found · Get discs back to their owners · DG Dashboard" },
      {
        name: "description",
        content:
          "Report a lost disc, post one you found, and match them up with players at your local courses.",
      },
      { property: "og:title", content: "Disc golf Lost & Found · DG Dashboard" },
      {
        property: "og:description",
        content: "Report lost discs, post found ones, and reunite them with their owners.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function LostFoundPage() {
  return (
    <PageShell section="community">
      <PageHeader
        eyebrow="Community"
        title="Lost &amp; Found"
        description="Report a disc you lost, post one you found, and get it back to whoever inked it. Claims are handled player to player through messages."
        leading={
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
            <Search className="h-5 w-5" />
          </div>
        }
      />
      <LostFoundPanel />
    </PageShell>
  );
}
