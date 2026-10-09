import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shell/page-header";
import { LeagueWizard } from "@/components/league-wizard";

export const Route = createFileRoute("/_authenticated/director/leagues/new")({
  head: () => ({
    meta: [
      { title: "New league · DG Dashboard" },
      {
        name: "description",
        content:
          "Set up a weekly or seasonal disc golf league with divisions, payouts, and PDGA-ready scoring.",
      },
      { property: "og:title", content: "Create a League — DG Dashboard" },
      {
        property: "og:description",
        content: "Run casual or sanctioned leagues from start to finish.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { draft?: string } => ({
    draft: typeof search['draft'] === "string" ? (search['draft'] as string) : undefined,
  }),
  component: NewLeagueRoute,
});

function NewLeagueRoute() {
  const { draft } = Route.useSearch();
  return (
    <>
      <PageHeader
        eyebrow="Event Director"
        title="New league"
        description="Configure schedule, format, divisions, and payouts for a full season."
      />
      <LeagueWizard initialDraftId={draft ?? null} />
    </>
  );
}
