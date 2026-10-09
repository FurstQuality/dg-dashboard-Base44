import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shell/page-header";
import { TournamentWizard } from "@/components/tournament-wizard";

export const Route = createFileRoute("/_authenticated/director/tournaments/new")({
  head: () => ({
    meta: [
      { title: "New tournament · DG Dashboard" },
      {
        name: "description",
        content:
          "Build a PDGA-sanctioned or casual tournament: courses, rounds, divisions, entry fees, and payouts.",
      },
      { property: "og:title", content: "Create a Tournament — DG Dashboard" },
      {
        property: "og:description",
        content: "Run a full-featured disc golf tournament from setup to finals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { draft?: string } => ({
    draft: typeof search['draft'] === "string" ? (search['draft'] as string) : undefined,
  }),
  component: NewTournamentRoute,
});

function NewTournamentRoute() {
  const { draft } = Route.useSearch();
  return (
    <>
      <PageHeader
        eyebrow="Event Director"
        title="New tournament"
        description="Walk through every decision needed to run a professional, PDGA-caliber event."
      />
      <TournamentWizard initialDraftId={draft ?? null} />
    </>
  );
}
