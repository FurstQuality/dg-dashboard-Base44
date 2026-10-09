import { CopySeriesButton } from "@/components/director/copy-series-button";
import { EventCancelActions } from "@/components/director/event-cancel-actions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DIRECTOR_STALE, directorKeys } from "@/lib/director-queries";
import { downloadCsv, toCsv } from "@/lib/csv";
import { useState } from "react";
import { CalendarDays, Crown, Download, Layers, Trophy, Users } from "lucide-react";
import type { SeriesStandingRow } from "@/lib/competition-model";
import {
  ContentCard,
  LoadingSkeleton,
  MascotEmptyState,
  PageHeader,
  StatCard,
} from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SeriesStopLinker } from "@/components/director/series-stop-linker";
import { SeriesScoringCard } from "@/components/director/series-scoring-card";
import { getSeriesReport } from "@/lib/series.functions";
import { summarizeSeries } from "@/lib/competition-model";

export const Route = createFileRoute("/_authenticated/director/series/$id")({
  head: () => ({
    meta: [
      { title: "Series report · DG Dashboard" },
      {
        name: "description",
        content:
          "Track a season series: linked stops, field sizes, points awarded, and live standings.",
      },
      { property: "og:title", content: "Series report — DG Dashboard" },
      {
        property: "og:description",
        content: "Participation and points reporting for every stop in your series.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SeriesReportPage,
});

function fmtDate(iso: string | null) {
  if (!iso) return "Date TBA";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}


type StandingRow = SeriesStandingRow;

function groupByDivision(rows: StandingRow[]) {
  const map = new Map<string, StandingRow[]>();
  for (const r of rows) {
    const key = r.division?.trim() || "Open";
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  return [...map.entries()]
    .map(([division, list]) => ({
      division,
      rows: [...list].sort(
        (a, b) => b.points - a.points || (a.best_finish ?? 999) - (b.best_finish ?? 999),
      ),
    }))
    .sort((a, b) => b.rows.length - a.rows.length || a.division.localeCompare(b.division));
}

/** Tie-aware rank: players with equal points share a place. */
function rankOf(sorted: StandingRow[], row: StandingRow) {
  return sorted.findIndex((r) => r.points === row.points) + 1;
}

function DivisionStandings({ rows }: { rows: StandingRow[] }) {
  const groups = groupByDivision(rows);
  const [active, setActive] = useState<string>("all");
  const shown = active === "all" ? groups : groups.filter((g) => g.division === active);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => {
          const leader = g.rows[0]!;
          const second = g.rows[1];
          const lead = second ? leader.points - second.points : null;
          return (
            <button
              key={g.division}
              type="button"
              onClick={() => setActive(active === g.division ? "all" : g.division)}
              className={`rounded-xl border p-3 text-left transition-colors hover:bg-muted/50 ${
                active === g.division ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline">{g.division}</Badge>
                <span className="text-xs text-muted-foreground">{g.rows.length} players</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Crown className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                <span className="truncate font-semibold">{leader.player_name}</span>
                <span className="ml-auto font-display text-lg">{leader.points}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {lead === null
                  ? "Only player in this division"
                  : lead === 0
                    ? `Tied with ${second!.player_name}`
                    : `Leads ${second!.player_name} by ${lead} pts`}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex gap-1.5 flex-wrap pb-1">
        <Button size="sm" variant={active === "all" ? "default" : "secondary"} onClick={() => setActive("all")}>
          All divisions
        </Button>
        {groups.map((g) => (
          <Button
            key={g.division}
            size="sm"
            variant={active === g.division ? "default" : "secondary"}
            onClick={() => setActive(g.division)}
          >
            {g.division}
          </Button>
        ))}
      </div>

      {shown.map((g) => {
        const top = g.rows[0]!.points;
        return (
          <section key={g.division} className="space-y-2">
            <h3 className="flex items-center gap-2 font-display text-base">
              <Trophy className="h-4 w-4 text-warning" aria-hidden />
              {g.division}
              <span className="text-sm font-normal text-muted-foreground">· {g.rows.length} players</span>
            </h3>
            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                    <TableHead className="text-right">Behind</TableHead>
                    <TableHead className="text-right">Played</TableHead>
                    <TableHead className="text-right">Counted</TableHead>
                    <TableHead className="text-right">Dropped</TableHead>
                    <TableHead className="text-right">Best</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.rows.map((row) => {
                    const rank = rankOf(g.rows, row);
                    const podium =
                      rank === 1 ? "text-warning" : rank <= 3 ? "text-primary" : "text-muted-foreground";
                    return (
                      <TableRow
                        key={`${g.division}-${row.player_id}`}
                        className={rank === 1 ? "bg-warning/5" : undefined}
                      >
                        <TableCell className={`font-display ${podium}`}>
                          {rank === 1 ? <Crown className="inline h-4 w-4" aria-label="Leader" /> : rank}
                        </TableCell>
                        <TableCell className="font-medium">{row.player_name}</TableCell>
                        <TableCell className="text-right font-semibold">{row.points}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {top - row.points === 0 ? "—" : `-${top - row.points}`}
                        </TableCell>
                        <TableCell className="text-right">{row.events_played}</TableCell>
                        <TableCell className="text-right">{row.events_counted}</TableCell>
                        <TableCell className="text-right">{row.dropped}</TableCell>
                        <TableCell className="text-right">{row.best_finish ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SeriesReportPage() {
  const { id } = Route.useParams();
  const fetchReport = useServerFn(getSeriesReport);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: directorKeys.seriesReport(id),
    staleTime: DIRECTOR_STALE.medium,
    queryFn: () => fetchReport({ data: { series_id: id } }),
  });

  if (isLoading) return <LoadingSkeleton />;
  if (error) {
    return (
      <MascotEmptyState
        title="We couldn't load this series report"
        description="Refresh the page, or head back to the Tournaments desk."
      />
    );
  }
  if (!data) {
    return (
      <MascotEmptyState
        title="Series not found"
        description="This series may have been removed, or it belongs to another organizer."
      />
    );
  }

  function exportStandings() {
    const csv = toCsv(
      ["Division", "Rank", "Player", "Points", "Stops played", "Stops counted", "Dropped", "Best finish"],
      groupByDivision(data!.standings).flatMap((g) => g.rows.map((row) => ({ row, div: g.division, rank: rankOf(g.rows, row) }))).map(({ row, div, rank }) => [
        div,
        rank,
        row.player_name,
        row.points,
        row.events_played,
        row.events_counted,
        row.dropped,
        row.best_finish ?? "",
      ]),
    );
    downloadCsv(`${data!.slug}-standings.csv`, csv);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.name}
        description={`${summarizeSeries(data.settings)}. Reporting updates as linked stops post scores.`}
        primaryAction={<SeriesStopLinker seriesId={data.id} seriesName={data.name} />}
        secondaryAction={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link to="/series/$slug" params={{ slug: data.slug }}>
                Public standings
              </Link>
            </Button>
            <CopySeriesButton id={data.id} name={data.name} season={data.season} />
            <EventCancelActions
              kind="series"
              id={data.id}
              name={data.name}
              cancelled={data.status === "cancelled"}
              onChanged={() => void refetch()}
            />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Linked stops"
          value={data.totals.stops}
          hint={`${data.totals.scored_stops} with scores posted`}
          icon={Layers}
          tone="cyan"
        />
        <StatCard
          label="Entries"
          value={data.totals.entries}
          hint={`Average field of ${data.totals.avg_field} scored players`}
          icon={Users}
          tone="green"
        />
        <StatCard
          label="Players in the race"
          value={data.totals.unique_players}
          hint="Anyone with at least one scored stop"
          icon={Trophy}
          tone="gold"
        />
        <StatCard
          label="Points awarded"
          value={data.totals.points_awarded}
          hint="Across every stop, before drops"
          icon={CalendarDays}
          tone="primary"
        />
      </div>

      <ContentCard
        title="Stops"
        subtitle="Every event linked to this series, with the field it drew and the points it paid out."
        action={<SeriesStopLinker seriesId={data.id} seriesName={data.name} />}
      >
        {data.stops.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No stops linked yet. Use Manage stops to pull in tournaments and leagues you already
            run.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stop</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Scored</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.stops.map((stop) => (
                  <TableRow key={`${stop.kind}-${stop.id}`}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{stop.name}</span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline">
                            {stop.kind === "tournament" ? "Tournament" : "League"}
                          </Badge>
                          <Badge variant="secondary">{stop.status.replace(/_/g, " ")}</Badge>
                          {stop.divisions > 1 ? (
                            <Badge variant="outline">{stop.divisions} divisions</Badge>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(stop.date)}</TableCell>
                    <TableCell className="text-right">{stop.entries}</TableCell>
                    <TableCell className="text-right">{stop.scored_players}</TableCell>
                    <TableCell className="text-right">{stop.points_awarded}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </ContentCard>

      <SeriesScoringCard
        seriesId={data.id}
        settings={data.settings}
        finaleEventId={data.finale_event_id}
        stops={data.stops.map((st) => ({ id: st.id, name: st.name }))}
      />

      <ContentCard
        title="Season standings"
        subtitle="Season points by player, after any drops your scoring rules allow."
        action={
          data.standings.length ? (
            <Button variant="secondary" size="sm" onClick={exportStandings}>
              <Download className="mr-1.5 h-4 w-4" />
              Export CSV
            </Button>
          ) : null
        }
      >
        {data.standings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Standings fill in as linked stops post scores. Nothing scored yet.
          </p>
        ) : (
          <DivisionStandings rows={data.standings} />
        )}
      </ContentCard>
    </div>
  );
}
