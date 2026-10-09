import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PageHeader, ContentCard, MascotEmptyState } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { getSeries } from "@/lib/series.functions";

export const Route = createFileRoute("/series_/$slug/players/$playerId")({
  loader: async ({ params }) => {
    const series = await getSeries({ data: { slug: params.slug } });
    if (!series) throw notFound();
    const results = series.results.filter((r) => r.player_id === params.playerId);
    if (results.length === 0) throw notFound();
    return { series, results, name: results[0]!.player_name };
  },
  head: ({ params, loaderData }) => {
    const title = loaderData ? `${loaderData.name} · ${loaderData.series.name}` : "Series player";
    const description = loaderData
      ? `${loaderData.name}'s results and points across ${loaderData.series.name}.`
      : "Series results on DG Dashboard.";
    return {
      meta: [
        { title: `${title} · DG Dashboard` },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: `https://dgdashboard.app/series/${params.slug}/players/${params.playerId}` }],
    };
  },
  notFoundComponent: () => (
    <MascotEmptyState title="No series results for this player" description="They haven't finished an event in this series yet." />
  ),
  errorComponent: () => (
    <MascotEmptyState title="We couldn't load these results" description="Refresh the page, or go back to the series." />
  ),
  component: SeriesPlayerPage,
});

function SeriesPlayerPage() {
  const { series, results, name } = Route.useLoaderData();
  const { playerId } = Route.useParams();
  const order = new Map(series.stops.map((s, i) => [s.id, i]));
  const sorted = [...results].sort((a, b) => (order.get(a.event_id) ?? 0) - (order.get(b.event_id) ?? 0));
  const rows = series.standings.filter((r) => r.player_id === playerId);
  const played = new Set(results.map((r) => r.event_id));
  const remaining = series.stops.filter((s) => !played.has(s.id) && s.status !== "completed" && s.status !== "cancelled");

  return (
    <div className="space-y-6">
      <PageHeader
        title={name}
        description={`Results and points in ${series.name}.`}
        secondaryAction={
          <Link to="/series/$slug" params={{ slug: series.slug }} className="text-sm font-medium hover:underline">
            Back to series
          </Link>
        }
      />
      <div className="flex flex-wrap gap-2">
        {rows.map((r) => (
          <Badge key={r.division ?? "all"} variant="secondary">
            {r.division ? `${r.division} · ` : ""}
            {r.points} pts · {r.events_counted} of {r.events_played} counted
          </Badge>
        ))}
      </div>
      <ContentCard title="Event by event">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[13px] text-muted-foreground">
                <th className="py-2 pr-3">Event</th>
                <th className="py-2 pr-3">Division</th>
                <th className="py-2 pr-3">Place</th>
                <th className="py-2">Points</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={`${r.event_id}-${r.division}`} className="border-t border-border">
                  <td className="py-2 pr-3 font-medium">{r.event_name}</td>
                  <td className="py-2 pr-3">{r.division ?? "—"}</td>
                  <td className="py-2 pr-3">
                    {r.position}
                    {r.field_size ? <span className="text-muted-foreground"> of {r.field_size}</span> : null}
                  </td>
                  <td className="py-2">
                    {r.points}
                    {series.stops.find((x) => x.id === r.event_id)?.status !== "completed" && (
                      <span className="ml-1.5 text-[13px] text-muted-foreground">provisional</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ContentCard>
      {remaining.length > 0 && (
        <ContentCard title="Still to play">
          <ul className="space-y-1 text-sm">
            {remaining.map((s) => (
              <li key={s.id}>
                {s.kind === "tournament" ? (
                  <Link to="/tournaments/$slug" params={{ slug: s.slug }} className="hover:underline">{s.name}</Link>
                ) : (
                  <Link to="/leagues/$slug" params={{ slug: s.slug }} className="hover:underline">{s.name}</Link>
                )}
              </li>
            ))}
          </ul>
        </ContentCard>
      )}
    </div>
  );
}
