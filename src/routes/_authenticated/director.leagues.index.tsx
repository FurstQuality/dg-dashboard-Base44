import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSession } from "@/lib/current-user";
import { getHostedLeagues } from "@/lib/director.functions";
import { DIRECTOR_STALE, directorKeys } from "@/lib/director-queries";
import {
  PageHeader,
  ContentCard,
  StatCard,
  LoadingSkeleton,
  MascotEmptyState,
} from "@/components/shell";
import { Button } from "@/components/ui/button";
import { UnfinishedSetups } from "@/components/event-setup/unfinished-setups";
import { DirectorErrorState } from "@/components/director/director-error-state";
import { Badge } from "@/components/ui/badge";
import { CalendarRange, Plus, Users, Repeat, Shield } from "lucide-react";

export const Route = createFileRoute("/_authenticated/director/leagues/")({
  head: () => ({
    meta: [
      { title: "League desk · DG Dashboard" },
      {
        name: "description",
        content: "Manage the leagues you run — weeks, divisions, standings, and player sign-ups.",
      },
      { property: "og:title", content: "League desk — DG Dashboard" },
      {
        property: "og:description",
        content: "Weekly league management for organizers: weeks, divisions, and standings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DirectorLeagues,
});

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function fmtDate(iso: string | null) {
  if (!iso) return "Dates not set";
  return new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function useHostedLeaguesQuery() {
  const { user } = useSession();
  const fetchLeagues = useServerFn(getHostedLeagues);
  return useQuery({
    queryKey: directorKeys.leagues(user?.id),
    enabled: !!user?.id,
    staleTime: DIRECTOR_STALE.short,
    queryFn: () => fetchLeagues(),
  });
}

function DirectorLeagues() {
  const { data, isLoading, isError, refetch } = useHostedLeaguesQuery();
  const leagues = data ?? [];
  const active = leagues.filter((l) => l.status !== "completed" && l.status !== "cancelled");
  const totalPlayers = leagues.reduce((sum, l) => sum + l.players, 0);
  const totalWeeks = leagues.reduce((sum, l) => sum + l.weeks, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Shield className="h-3 w-3" /> Event Director
          </span>
        }
        title="Leagues"
        description="Every league you run — weeks on the schedule, sign-ups, and standings."
        primaryAction={
          <Button asChild size="sm">
            <Link to="/director/leagues/new">
              <Plus className="mr-1 h-4 w-4" />
              New league
            </Link>
          </Button>
        }
        secondaryAction={
          <Button asChild variant="outline" size="sm">
            <Link to="/director/tournaments">Tournament desk</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Active leagues"
          value={active.length}
          hint={`${leagues.length} total run by you`}
          icon={CalendarRange}
          tone="primary"
        />
        <StatCard
          label="Players signed up"
          value={totalPlayers}
          hint="Across every league you host"
          icon={Users}
          tone="green"
        />
        <StatCard
          label="Weeks scheduled"
          value={totalWeeks}
          hint="League nights on the calendar"
          icon={Repeat}
          tone="cyan"
        />
      </div>

      <UnfinishedSetups kind="league" />

      {isLoading ? (
        <LoadingSkeleton variant="list" />
      ) : isError ? (
        <DirectorErrorState
          title="Your leagues didn't load"
          message="We couldn't reach your league list just now."
          onRetry={() => void refetch()}
        />
      ) : leagues.length === 0 ? (
        <MascotEmptyState
          intent="official"
          title="You aren't running a league yet"
          description="Set up a weekly league once and DG Dashboard handles sign-ups, weeks, divisions, and standings for the whole season."
          actions={
            <Button asChild size="sm">
              <Link to="/director/leagues/new">
                <Plus className="mr-1 h-4 w-4" />
                Create your first league
              </Link>
            </Button>
          }
        />
      ) : (
        <ContentCard
          title="Your leagues"
          subtitle="Open a league to edit weeks, divisions, and payouts."
        >
          <ul className="space-y-2">
            {leagues.map((l) => (
              <li key={l.id}>
                <Link
                  to="/director/leagues/$slug"
                  params={{ slug: l.slug }}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border/60 px-3 py-2.5 transition-colors hover:border-primary/60"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">{l.name}</span>
                      <Badge variant="outline" className="capitalize">
                        {l.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                      {l.dayOfWeek != null ? `${DAYS[l.dayOfWeek]} nights · ` : ""}
                      {l.season ? `${l.season} · ` : ""}
                      {fmtDate(l.startDate)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-[13px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {l.players}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Repeat className="h-3.5 w-3.5" />
                      {l.weeks} weeks
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </ContentCard>
      )}
    </div>
  );
}
