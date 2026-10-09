import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { listMySeries } from "@/lib/series.functions";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Shield, Search, Trophy, Users, ClipboardList, ArrowRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  buildDirectorList,
  filterDirectorList,
  STAGE_LABEL,
  type DirectorListItem,
  type ListFilters,
  type ListStage,
} from "@/lib/director-event-list";
import {
  PageHeader,
  ContentCard,
  StatCard,
  LoadingSkeleton,
  MascotEmptyState,
} from "@/components/shell";
import { Button } from "@/components/ui/button";
import { UnfinishedSetups } from "@/components/event-setup/unfinished-setups";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/current-user";
import { getDirectorEvents, getHostedLeagues } from "@/lib/director.functions";
import { directorKeys, DIRECTOR_STALE } from "@/lib/director-queries";

export const Route = createFileRoute("/_authenticated/director/tournaments/")({
  head: () => ({
    meta: [
      { title: "Your events · DG Dashboard" },
      {
        name: "description",
        content: "Every tournament you run in one directory — status, dates, and your role.",
      },
      { property: "og:title", content: "Your events — DG Dashboard" },
      {
        property: "og:description",
        content: "Browse and open every tournament you own or help direct.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DirectorTournaments,
});

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Dates not set";

function chicagoToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

const STAGES: { value: ListFilters["stage"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "live", label: "Now" },
  { value: "upcoming", label: "Upcoming" },
  { value: "draft", label: "Drafts" },
  { value: "past", label: "Finished" },
];

function NextStepLink({ item }: { item: DirectorListItem }) {
  const label = (
    <>
      {item.next.label}
      <ArrowRight className="ml-1 h-3.5 w-3.5" />
    </>
  );
  if (item.kind === "series")
    return (
      <Button asChild size="sm" variant="outline">
        <Link to="/director/series/$id" params={{ id: item.id }}>{label}</Link>
      </Button>
    );
  if (item.kind === "league")
    return (
      <Button asChild size="sm">
        <Link to="/director/leagues/$slug" params={{ slug: item.slug }}>{label}</Link>
      </Button>
    );
  if (item.next.target === "registrations")
    return (
      <Button asChild size="sm">
        <Link to="/director/registrations" search={{ event: item.id }}>{label}</Link>
      </Button>
    );
  if (item.next.target === "ops")
    return (
      <Button asChild size="sm">
        <Link to="/director/ops" search={{ event: item.id }}>{label}</Link>
      </Button>
    );
  return (
    <Button asChild size="sm">
      <Link to="/tournaments/$slug" params={{ slug: item.slug }}>{label}</Link>
    </Button>
  );
}

function DirectorTournaments() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const fetchEvents = useServerFn(getDirectorEvents);
  const fetchLeagues = useServerFn(getHostedLeagues);
  const [filters, setFilters] = useState<ListFilters>({
    stage: "all",
    kind: "all",
    role: "all",
    term: "",
  });

  const eventsQ = useQuery({
    queryKey: directorKeys.events(userId),
    enabled: !!userId,
    staleTime: DIRECTOR_STALE.medium,
    queryFn: () => fetchEvents(),
  });
  const fetchSeries = useServerFn(listMySeries);
  const seriesQ = useQuery({
    queryKey: ["director", "series", userId],
    enabled: !!userId,
    staleTime: DIRECTOR_STALE.short,
    queryFn: () => fetchSeries(),
  });
  const leaguesQ = useQuery({
    queryKey: directorKeys.leagues(userId),
    enabled: !!userId,
    staleTime: DIRECTOR_STALE.short,
    queryFn: () => fetchLeagues(),
  });

  const all = useMemo(
    () =>
      // Leagues and series have their own Director tabs; this one is tournaments only.
      buildDirectorList(eventsQ.data ?? [], leaguesQ.data ?? [], chicagoToday(), seriesQ.data ?? []).filter(
        (i) => i.kind === "tournament",
      ),
    [eventsQ.data, leaguesQ.data, seriesQ.data],
  );
  const filtered = useMemo(() => filterDirectorList(all, filters), [all, filters]);
  const isPending = eventsQ.isPending || leaguesQ.isPending;
  const isError = eventsQ.isError && leaguesQ.isError;
  const count = (stage: ListStage) => all.filter((i) => i.stage === stage).length;
  const set = (p: Partial<ListFilters>) => setFilters((f) => ({ ...f, ...p }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Shield className="h-3 w-3" /> Event Director
          </span>
        }
        title="Your tournaments"
        description="Every tournament you host or help direct, each with the next thing it needs."
        primaryAction={
          <Button asChild size="sm">
            <Link to="/director/new">
              <Plus className="mr-1 h-4 w-4" />
              Create event
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Happening now" value={count("live")} hint="Live tournaments" icon={Trophy} tone="gold" />
        <StatCard label="Upcoming" value={count("upcoming")} hint="Published and still to play" icon={ClipboardList} tone="primary" />
        <StatCard label="Drafts" value={count("draft")} hint="Not visible to players yet" icon={Users} tone="green" />
      </div>

      <UnfinishedSetups kind="tournament" />

      {isPending ? (
        <LoadingSkeleton variant="list" />
      ) : isError ? (
        <ContentCard title="Your events didn't load">
          <p className="text-sm text-muted-foreground">
            We couldn't reach your event list. Refresh the page and it should come right back.
          </p>
        </ContentCard>
      ) : all.length === 0 ? (
        <MascotEmptyState
          intent="official"
          title="You aren't running an event yet"
          description="Build an event once and DG Dashboard handles registrations, divisions, live scoring, and payouts."
          actions={
            <Button asChild size="sm">
              <Link to="/director/new">
                <Plus className="mr-1 h-4 w-4" />
                Create your first event
              </Link>
            </Button>
          }
        />
      ) : (
        <ContentCard
          title="All tournaments"
          subtitle="Live first, then drafts, then what's coming up."
          action={
            <div className="relative w-full max-w-[220px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filters.term}
                onChange={(e) => set({ term: e.target.value })}
                placeholder="Search your events"
                className="h-9 pl-8"
                aria-label="Search your events"
              />
            </div>
          }
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex gap-1 flex-wrap" role="group" aria-label="Filter by stage">
              {STAGES.map((s) => (
                <Button
                  key={s.value}
                  size="sm"
                  variant={filters.stage === s.value ? "default" : "outline"}
                  onClick={() => set({ stage: s.value })}
                >
                  {s.label}
                </Button>
              ))}
            </div>
            <Select value={filters.role} onValueChange={(v) => set({ role: v as ListFilters["role"] })}>
              <SelectTrigger className="h-9 w-[150px]" aria-label="Filter by role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any role</SelectItem>
                <SelectItem value="owner">You host</SelectItem>
                <SelectItem value="co_td">Co-director</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing matches these filters. Try “All” or a shorter search.
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((e) => (
                <li
                  key={`${e.kind}-${e.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border/60 px-3 py-3"
                >
                  <div className="min-w-0">
                    {e.kind === "series" ? (
                      <Link
                        to="/director/series/$id"
                        params={{ id: e.id }}
                        className="block truncate text-sm font-semibold hover:underline"
                      >
                        {e.name}
                      </Link>
                    ) : e.kind === "league" ? (
                      <Link
                        to="/director/leagues/$slug"
                        params={{ slug: e.slug }}
                        className="block truncate text-sm font-semibold hover:underline"
                      >
                        {e.name}
                      </Link>
                    ) : (
                      <Link
                        to="/director/events/$id"
                        params={{ id: e.id }}
                        className="block truncate text-sm font-semibold hover:underline"
                      >
                        {e.name}
                      </Link>
                    )}
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                      <span>
                        {fmtDate(e.startDate)}
                        {e.endDate ? ` – ${fmtDate(e.endDate)}` : ""}
                      </span>
                      <Badge variant={e.stage === "live" ? "default" : e.stage === "cancelled" ? "destructive" : "outline"}>
                        {STAGE_LABEL[e.stage]}
                      </Badge>
                      <Badge variant="outline">{e.kind === "league" ? "League" : e.kind === "series" ? "Series" : "Tournament"}</Badge>
                      {e.role === "co_td" && <Badge variant="outline">Co-director</Badge>}
                      {e.detail && <span>{e.detail}</span>}
                    </div>
                  </div>
                  <NextStepLink item={e} />
                </li>
              ))}
            </ul>
          )}
        </ContentCard>
      )}

    </div>
  );
}
