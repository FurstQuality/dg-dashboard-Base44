import { Fragment } from "react";
import { formatToPar, relativeToPar } from "@/lib/score-display";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PageHeader, ContentCard, MascotEmptyState } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/current-user";
import { ExternalLink, Trophy, Settings2, Maximize2 } from "lucide-react";
import { useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSeries } from "@/lib/series.functions";
import { finaleRace, groupByDivision, sanctionLevelLabel, summarizeSeries } from "@/lib/competition-model";

export const Route = createFileRoute("/series/$slug")({
  loader: async ({ params }) => {
    const series = await getSeries({ data: { slug: params.slug } });
    if (!series) throw notFound();
    return series;
  },
  head: ({ params, loaderData }) => {
    const name = loaderData?.name ?? "Series";
    const canonical = `https://dgdashboard.app/series/${params.slug}`;
    const description = loaderData
      ? `${name} standings — ${loaderData.event_count} events. ${summarizeSeries(loaderData.settings)}`
      : "Series standings on DG Dashboard.";
    return {
      meta: [
        { title: `${name} standings · DG Dashboard` },
        { name: "description", content: description.slice(0, 158) },
        { property: "og:title", content: `${name} — series standings` },
        { property: "og:description", content: description.slice(0, 158) },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonical },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },

  errorComponent: () => (
    <MascotEmptyState
      title="We couldn't load this series"
      description="Refresh the page, or head back to the events list."
    />
  ),
  notFoundComponent: () => (
    <MascotEmptyState
      title="Series not found"
      description="This series may have been removed or made private."
    />
  ),
  component: SeriesPage,
});

function fmtDate(iso: string | null) {
  if (!iso) return "Date TBA";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SeriesPage() {
  const series = Route.useLoaderData();
  const { user } = useSession();
  const canManage = !!user && !!series.owner_id && user.id === series.owner_id;
  const doneStatus = new Set(["completed"]);
  const liveIds = new Set(series.stops.filter((x) => !doneStatus.has(x.status)).map((x) => x.id));
  const provisionalPlayers = new Set(
    series.results.filter((r) => liveIds.has(r.event_id)).map((r) => `${r.division ?? ""}|${r.player_id}`),
  );
  const raceRef = useRef<HTMLDivElement>(null);
  const finaleStop = series.finale ? series.stops.find((x) => x.id === series.finale!.id) : undefined;
  const maxFinalePts =
    Math.round(
      (series.settings.points_system === "field_size"
        ? Math.max(1, ...series.results.map((r) => r.field_size ?? 1)) + (series.settings.field_size_bonus ?? 5) - 1
        : (series.settings.points_table[0] ?? 0)) * Math.max(1, series.settings.finale_multiplier ?? 1),
    ) + (series.settings.participation_bonus ?? 0);
  const race = finaleStop
    ? finaleRace(series.results, finaleStop.id, finaleStop.status === "completed", maxFinalePts)
    : [];
  const players = (() => {
    const m = new Map<string, { id: string; name: string; events: Set<string>; points: number; divisions: Set<string> }>();
    for (const r of series.results) {
      const p = m.get(r.player_id) ?? { id: r.player_id, name: r.player_name, events: new Set(), points: 0, divisions: new Set() };
      p.events.add(r.event_id);
      p.points += r.points;
      if (r.division) p.divisions.add(r.division);
      m.set(r.player_id, p);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  })();

  return (
    <div className="space-y-6">
      <PageHeader
        title={series.name}
        description={
          series.description ||
          "A season-long points race across several events. Each event keeps its own course, schedule and results."
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {series.season && <Badge variant="secondary">{series.season}</Badge>}
        <Badge variant="outline">{sanctionLevelLabel(series.sanction_level as never)}</Badge>
        <Badge variant="outline">
          {series.event_count} {series.event_count === 1 ? "event" : "events"}
        </Badge>
        {series.first_date && (
          <Badge variant="outline">
            {fmtDate(series.first_date)}
            {series.last_date && series.last_date !== series.first_date ? ` – ${fmtDate(series.last_date)}` : ""}
          </Badge>
        )}
        {series.host && <Badge variant="outline">Hosted by {series.host}</Badge>}
      </div>
      {series.finale && (
        <p className="text-sm">
          <span className="font-semibold">Season finale:</span>{" "}
          {series.finale.kind === "tournament" ? (
            <Link to="/tournaments/$slug" params={{ slug: series.finale.slug }} className="hover:underline">
              {series.finale.name}
            </Link>
          ) : (
            <Link to="/leagues/$slug" params={{ slug: series.finale.slug }} className="hover:underline">
              {series.finale.name}
            </Link>
          )}{" "}
          <span className="text-muted-foreground">· {fmtDate(series.finale.date)}</span>
        </p>
      )}

      <Tabs defaultValue="overview">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="events">Events ({series.event_count})</TabsTrigger>
            <TabsTrigger value="standings">Standings</TabsTrigger>
            {finaleStop && <TabsTrigger value="race">Finale race</TabsTrigger>}
            <TabsTrigger value="players">Players ({players.length})</TabsTrigger>
            {canManage && <TabsTrigger value="manage">Manage</TabsTrigger>}
          </TabsList>
        </div>
        <TabsContent value="overview" className="space-y-6">
      <ContentCard title="Leaders by division">
        {series.standings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Leaders show up once the first event posts its results.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groupByDivision(series.standings, series.settings.award_places ?? 0).map(([division, rows]) => (
              <li key={division || "all"} className="rounded-lg border border-border p-3 text-sm">
                <div className="mb-1 font-semibold">{division || "Overall"}</div>
                <ol className="space-y-0.5">
                  {rows.slice(0, 3).map((r) => (
                    <li key={r.player_id} className="flex justify-between gap-2">
                      <span>{r.place}. {r.player_name}</span>
                      <span className="text-muted-foreground">{r.points} pts</span>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        )}
      </ContentCard>
      <ContentCard title="How the standings work">
        <p className="text-sm text-muted-foreground">{summarizeSeries(series.settings)}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Points from an event become final once that event is marked complete. Until then they show as provisional and can change.
        </p>
      </ContentCard>

        </TabsContent>
        <TabsContent value="events">
      <ContentCard title="Events">
        {series.stops.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No events attached yet. Organizers add stops while setting up a tournament or league.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {series.stops.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div>
                  {s.kind === "tournament" ? (
                    <Link
                      to="/tournaments/$slug"
                      params={{ slug: s.slug }}
                      className="font-medium hover:underline"
                    >
                      {s.name}
                    </Link>
                  ) : (
                    <Link
                      to="/leagues/$slug"
                      params={{ slug: s.slug }}
                      className="font-medium hover:underline"
                    >
                      {s.name}
                    </Link>
                  )}
                  <div className="text-[13px] text-muted-foreground">
                    {fmtDate(s.date)}
                    {s.end_date && s.end_date !== s.date ? ` – ${fmtDate(s.end_date)}` : ""}
                    {s.venue?.kind === "multiple"
                      ? " · Multiple courses"
                      : s.venue?.kind === "single"
                        ? ` · ${s.venue.name}`
                        : s.kind === "league"
                          ? " · Course TBD"
                          : ""}
                  </div>
                  {s.nights && s.nights.length > 0 ? (
                    <ul className="mt-1.5 space-y-1 border-l border-border pl-3 text-[13px]">
                      {s.nights.map((n) => (
                        <li key={n.id}>
                          <span className="font-medium">
                            Week {n.week_number}
                            {n.name ? ` · ${n.name}` : ""}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            {fmtDate(n.event_date)}
                            {n.start_time ? ` · ${n.start_time.slice(0, 5)}` : ""}
                            {s.venue?.kind === "multiple" ? ` · ${n.course_name ?? "Course TBD"}` : ""}
                            {n.status === "cancelled" ? " · cancelled" : ""}
                          </span>
                          {n.details ? (
                            <div className="text-muted-foreground">{n.details}</div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {s.winners && s.winners.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                      <Trophy className="h-3.5 w-3.5 text-warning" aria-hidden />
                      {s.winners.map((w) => (
                        <span key={`${w.division}-${w.player_id}`}>
                          {w.division ? <span className="text-muted-foreground">{w.division}: </span> : null}
                          <Link
                            to="/series/$slug/players/$playerId"
                            params={{ slug: series.slug, playerId: w.player_id }}
                            className="font-medium hover:underline"
                          >
                            {w.player_name}
                          </Link>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {s.status !== "completed" && s.status !== "cancelled" && (
                    s.registration?.url ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={s.registration.url} target="_blank" rel="noopener noreferrer">
                          Register <ExternalLink className="ml-1 h-3.5 w-3.5" aria-hidden />
                        </a>
                      </Button>
                    ) : (
                      <Button asChild size="sm" variant="outline">
                        {s.kind === "tournament" ? (
                          <Link to="/tournaments/$slug" params={{ slug: s.slug }}>Sign up</Link>
                        ) : (
                          <Link to="/leagues/$slug" params={{ slug: s.slug }}>Sign up</Link>
                        )}
                      </Button>
                    )
                  )}
                  {series.finale?.id === s.id && <Badge>Finale</Badge>}
                  <Badge variant="outline">{s.kind === "league" ? "League" : "Tournament"}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ContentCard>

        </TabsContent>
        <TabsContent value="standings">
      <ContentCard title="Standings">
        {series.standings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Standings appear once finishing positions are posted for a stop.
          </p>
        ) : (
          <div className="space-y-6">
            {groupByDivision(series.standings, series.settings.award_places ?? 0).map(([division, rows]) => (
              <div key={division || "all"} className="overflow-x-auto">
                {division && <h3 className="mb-1 text-sm font-semibold">{division}</h3>}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[13px] text-muted-foreground">
                      <th className="py-2 pr-3">#</th>
                      <th className="py-2 pr-3">Player</th>
                      <th className="py-2 pr-3">Points</th>
                      <th className="py-2 pr-3">Events</th>
                      <th className="py-2">Dropped</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <Fragment key={row.player_id}>
                      {i > 0 && rows[i - 1]!.award && !row.award && (
                        <tr aria-label="Award cut line">
                          <td colSpan={5} className="border-t-2 border-dashed border-primary py-1 text-[13px] font-medium text-primary">
                            Awards cut line — top {series.settings.award_places} qualified players
                          </td>
                        </tr>
                      )}
                      <tr className={`border-t border-border ${row.award ? "bg-primary/5" : ""}`}>
                        <td className="py-2 pr-3">{row.place}</td>
                        <td className="py-2 pr-3 font-medium">
                          <Link to="/series/$slug/players/$playerId" params={{ slug: series.slug, playerId: row.player_id }} className="hover:underline">
                            {row.player_name}
                          </Link>
                          {!row.qualified && (
                            <span className="ml-2 text-[13px] font-normal text-muted-foreground">
                              needs {(series.settings.qualify_min_events ?? 0) - row.events_played} more to qualify
                            </span>
                          )}
                          {(() => {
                            const line = latestScoreLine(series.results, series.stops, row.player_id, row.division ?? null);
                            return line ? <span className="block text-[13px] font-normal text-muted-foreground">{line}</span> : null;
                          })()}
                        </td>
                        <td className="py-2 pr-3">
                          {row.points}
                          {provisionalPlayers.has(`${row.division ?? ""}|${row.player_id}`) && (
                            <span className="ml-1.5 text-[13px] text-muted-foreground" title="Includes an event whose results aren't final yet">
                              provisional
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3">{row.events_counted}</td>
                        <td className="py-2 text-muted-foreground">{row.dropped}</td>
                      </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </ContentCard>
        </TabsContent>
        {finaleStop && (
          <TabsContent value="race">
            <div ref={raceRef} className="bg-background">
              <ContentCard
                title={`Finale race · ${finaleStop.name}`}
                action={
                  <button
                    type="button"
                    onClick={() => raceRef.current?.requestFullscreen?.()}
                    className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                  >
                    <Maximize2 className="h-4 w-4" aria-hidden /> Full screen
                  </button>
                }
              >
                <p className="mb-3 text-sm text-muted-foreground">
                  {finaleStop.status === "completed"
                    ? "The finale is complete. These are the final season totals."
                    : "Projected totals if the finale ended right now. A leader is marked clinched when no one can catch them, even by winning the finale."}
                </p>
                {race.length === 0 ? (
                  <p className="text-sm text-muted-foreground">The race fills in once players have points in the series.</p>
                ) : (
                  <div className="space-y-6">
                    {[...new Set(race.map((x) => x.division ?? ""))].map((division) => [division, race.filter((x) => (x.division ?? "") === division)] as const).map(([division, rows]) => (
                      <div key={division || "all"} className="overflow-x-auto">
                        {division && <h3 className="mb-1 text-base font-semibold">{division}</h3>}
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-[13px] text-muted-foreground">
                              <th className="py-2 pr-3">Rank</th>
                              <th className="py-2 pr-3">Player</th>
                              <th className="py-2 pr-3">Before finale</th>
                              <th className="py-2 pr-3">Finale place</th>
                              <th className="py-2 pr-3">Finale points</th>
                              <th className="py-2">Projected</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((x) => (
                              <tr key={x.player_id} className="border-t border-border">
                                <td className="py-2 pr-3">{x.projected_rank}</td>
                                <td className="py-2 pr-3 font-medium">
                                  {x.player_name}
                                  {x.clinched && <Badge className="ml-2">Clinched</Badge>}
                                </td>
                                <td className="py-2 pr-3">{x.before}</td>
                                <td className="py-2 pr-3">{x.finale_place ?? "—"}</td>
                                <td className="py-2 pr-3">{x.finale_points}</td>
                                <td className="py-2 font-semibold">{x.projected}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}
              </ContentCard>
            </div>
          </TabsContent>
        )}
        <TabsContent value="players">
          <ContentCard title="Players">
            {players.length === 0 ? (
              <p className="text-sm text-muted-foreground">Players show up here after they finish their first event in the series.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {players.map((p) => (
                  <li key={p.id}>
                    <Link
                      to="/series/$slug/players/$playerId"
                      params={{ slug: series.slug, playerId: p.id }}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm hover:bg-muted"
                    >
                      <span>
                        <span className="font-medium">{p.name}</span>
                        <span className="block text-[13px] text-muted-foreground">
                          {p.events.size} {p.events.size === 1 ? "event" : "events"}
                          {p.divisions.size ? ` · ${[...p.divisions].join(", ")}` : ""}
                        </span>
                      </span>
                      <span className="text-muted-foreground">{p.points} pts</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </ContentCard>
        </TabsContent>
        {canManage && (
          <TabsContent value="manage">
            <ContentCard title="Manage this series">
              <p className="mb-3 text-sm text-muted-foreground">
                Change scoring, pick the finale, add events and see participation.
              </p>
              <Button asChild>
                <Link to="/director/series/$id" params={{ id: series.id }}>
                  <Settings2 className="mr-1.5 h-4 w-4" aria-hidden /> Open series tools
                </Link>
              </Button>
            </ContentCard>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

/** "Finale -8 · 52 / Par 60" for a player's most recent in-app scored stop. */
function latestScoreLine(
  results: { player_id: string; event_id: string; division?: string | null; strokes?: number | null; par?: number | null }[],
  stops: { id: string; name: string; date: string | null }[],
  playerId: string,
  division: string | null,
): string | null {
  const order = new Map(stops.map((s, i) => [s.id, i]));
  const mine = results
    .filter((r) => r.player_id === playerId && (r.division ?? null) === division && r.strokes != null && r.strokes > 0)
    .sort((a, b) => (order.get(b.event_id) ?? 0) - (order.get(a.event_id) ?? 0));
  const r = mine[0];
  if (!r) return null;
  const stop = stops.find((s) => s.id === r.event_id);
  const rel = relativeToPar(r.strokes, r.par);
  const name = stop?.name ?? "Last event";
  return rel == null
    ? `${name} · ${r.strokes} / Par unknown`
    : `${name} ${formatToPar(rel)} · ${r.strokes} / Par ${r.par}`;
}
