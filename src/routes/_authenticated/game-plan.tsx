import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  Calendar,
  Target,
  MapPin,
  Trophy,
  TrendingUp,
  Info,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  Gauge,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageShell, PageHeader } from "@/components/shell";
import { TrackerSubnav } from "@/components/tracker/tracker-subnav";
import { DivisionAdvisor } from "@/components/game-plan/division-advisor";
import { EventPrepPanel } from "@/components/game-plan/event-prep-panel";
import { EventCourseCard } from "@/components/game-plan/event-course-card";
import { useTargetRating } from "@/lib/use-target-rating";
import {
  listGamePlanEvents,
  analyzeEventOdds,
  computeEventTargets,
  setPreferredDivision,
  getPreferredDivision,
  type GamePlanEvent,
  type OddsResult,
  type CourseTarget,
} from "@/lib/game-plan.functions";
import { syncPdgaEventField } from "@/lib/pdga-field.functions";
import { backfillPdgaEventCourses } from "@/lib/calendar-sync.functions";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Users, DollarSign, Swords, Lock } from "lucide-react";
import { useSession, useMyProfile } from "@/lib/current-user";
import { CourseRatingCheck } from "@/components/game-plan/data-readiness-panel";
import { PastEventResultsDialog } from "@/components/past-event-results-dialog";
import { CourseFitPanel } from "@/components/game-plan/course-fit-panel";
import { PastScoresCard } from "@/components/tracker/past-scores-card";
import { listTrackedCourses } from "@/lib/tracked-courses.functions";

export const Route = createFileRoute("/_authenticated/game-plan")({
  validateSearch: (search: Record<string, unknown>): { event?: string; pdga?: string } => ({
    event: typeof search.event === "string" ? search.event : undefined,
    pdga: typeof search.pdga === "string" ? search.pdga : undefined,
  }),

  head: () => ({
    meta: [
      { title: "Course Analytics · DG Dashboard" },
      {
        name: "description",
        content:
          "Prep for the courses hosting your events: verified course facts and PDGA-rated scoring data, plus readiness and practice tools when you want to dig deeper.",
      },
      { property: "og:title", content: "Course Analytics · DG Dashboard" },
      {
        property: "og:description",
        content: "Verified course data and prep tools for every event on your schedule.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GamePlanPage,
});

function GamePlanPage() {
  const list = useServerFn(listGamePlanEvents);
  const backfillCourses = useServerFn(backfillPdgaEventCourses);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["game-plan", "events"],
    queryFn: () => list(),
  });
  const events = data?.events ?? [];

  // Courses the player saved to Course Analytics belong in the quick picks too.
  const loadTracked = useServerFn(listTrackedCourses);
  const trackedQuery = useQuery({
    queryKey: ["tracked-courses", "game-plan"],
    queryFn: () => loadTracked(),
    staleTime: 5 * 60_000,
  });
  const trackedCourses = trackedQuery.data?.courses ?? [];
  const search = Route.useSearch();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Deep-link support — the SmartLink surfaces across the app open
  // /game-plan?event=<id> or /game-plan?pdga=<ref>. Resolve once the events
  // list arrives and pre-select the matching row.
  const deepLinkId = useMemo(() => {
    if (!events.length) return null;
    if (search.event && events.some((e) => e.id === search.event)) return search.event;
    if (search.pdga) return events.find((e) => e.pdga_event_ref === search.pdga)?.id ?? null;
    return null;
  }, [events, search.event, search.pdga]);

  const selected = useMemo(
    () =>
      events.find((e) => e.id === selectedId) ??
      events.find((e) => e.id === deepLinkId) ??
      events[0] ??
      null,
    [events, selectedId, deepLinkId],
  );

  const missingCourseCount = useMemo(
    () => events.filter((e) => e.pdga_event_ref && e.courses.length === 0).length,
    [events],
  );

  // Quick-pick chips: every course on the upcoming schedule, nearest date first.
  const upcomingCourses = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ courseId: string | null; courseName: string; note?: string }> = [];
    for (const e of events) {
      for (const c of e.courses) {
        const name = (c.course_name ?? "").trim();
        if (name.length < 2) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const when = e.starts_on
          ? new Date(`${e.starts_on}T12:00:00`).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })
          : null;
        out.push({
          courseId: c.course_id,
          courseName: name,
          ...(when ? { note: when } : {}),
        });
      }
      if (out.length >= 10) break;
    }
    for (const t of trackedCourses) {
      const name = (t.course_name ?? "").trim();
      if (name.length < 2) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ courseId: t.course_id, courseName: name, note: "Saved" });
    }
    return out;
  }, [events, trackedCourses]);

  const backfillMutation = useMutation({
    mutationFn: () => backfillCourses(),
    onSuccess: (r) => {
      const res = (r ?? {}) as { updated?: number; unresolved?: number; alreadyHad?: number };
      const updated = res.updated ?? 0;
      const unresolved = res.unresolved ?? 0;
      if (updated > 0 && unresolved === 0) {
        toast.success(`Wired course data into ${updated} PDGA event${updated === 1 ? "" : "s"}.`);
      } else if (updated > 0 && unresolved > 0) {
        toast.success(
          `Wired ${updated} event${updated === 1 ? "" : "s"}. ${unresolved} still have no course schedule published on PDGA.`,
        );
      } else if (unresolved > 0) {
        toast.message(
          `PDGA hasn't published a round-by-round course schedule for ${unresolved} event${unresolved === 1 ? "" : "s"} yet. Try again closer to the event date.`,
        );
      } else {
        toast.success("All PDGA events already have course data.");
      }
      qc.invalidateQueries({ queryKey: ["game-plan"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Course sync failed"),
  });

  const [autoSynced, setAutoSynced] = useState(false);
  useEffect(() => {
    if (autoSynced || missingCourseCount === 0 || backfillMutation.isPending) return;
    setAutoSynced(true);
    backfillMutation.mutate();
  }, [autoSynced, missingCourseCount, backfillMutation]);

  return (
    <PageShell>
      <PageHeader
        title="Course Analytics"
        description="Pick a course or an event and see how it plays — real course facts, PDGA-rated scoring, and what each rating shot there."
        primaryAction={
          <Button asChild size="sm" variant="outline">
            <Link to="/courses">Course directory</Link>
          </Button>
        }
      />
      <TrackerSubnav active="courses" />



      <PastScoresCard allowSave courseNames={upcomingCourses.map((c) => c.courseName)} />

      {missingCourseCount > 0 ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-amber-500/40 bg-amber-500/10 p-3">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div>
              <div className="font-medium text-foreground">
                {missingCourseCount} PDGA event{missingCourseCount === 1 ? "" : "s"} missing course
                data
              </div>
              <div className="text-xs text-muted-foreground">
                Sync to pull the PDGA-published round schedule. If PDGA hasn't posted courses yet,
                they'll appear closer to the event date.
              </div>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => backfillMutation.mutate()}
            disabled={backfillMutation.isPending}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${backfillMutation.isPending ? "animate-spin" : ""}`}
            />
            {backfillMutation.isPending ? "Syncing courses…" : "Sync PDGA course schedule"}
          </Button>
        </Card>
      ) : null}

      {isLoading ? (
        <Card className="p-6 text-muted-foreground">Pulling in your upcoming events…</Card>
      ) : events.length === 0 ? null : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <EventList events={events} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          {selected ? <EventPanel event={selected} /> : null}
        </div>
      )}
    </PageShell>
  );
}

function EventList({
  events,
  selectedId,
  onSelect,
}: {
  events: GamePlanEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Card className="min-w-0 p-2 lg:sticky lg:top-4 lg:self-start">
      <div className="text-xs uppercase tracking-wide text-muted-foreground px-2 py-1">
        My events ({events.length})
      </div>
      <div className="max-h-[70vh] overflow-y-auto space-y-1">
        {events.map((e) => {
          const active = e.id === selectedId;
          return (
            <button
              key={e.id}
              onClick={() => onSelect(e.id)}
              className={
                "w-full text-left rounded-md px-3 py-2 text-sm transition-colors " +
                (active ? "bg-primary/10 border border-primary/30" : "hover:bg-muted")
              }
            >
              <div className="font-medium truncate">{e.title}</div>
              <div className="text-muted-foreground text-xs flex items-center gap-1.5 mt-0.5">
                <Calendar className="h-3 w-3" />
                {e.starts_on ?? "TBD"}
                {e.tier ? (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
                    {e.tier}
                  </Badge>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function EventPanel({ event }: { event: GamePlanEvent }) {
  const [panelTarget] = useTargetRating();
  const [showTools, setShowTools] = useState(false);

  return (
    <div className="min-w-0 space-y-4">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-semibold">{event.title}</h2>
              {event.tier ? <Badge variant="secondary">{event.tier}</Badge> : null}
              {event.division ? <Badge variant="outline">{event.division}</Badge> : null}
            </div>
            <div className="text-muted-foreground text-sm mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {event.starts_on ?? "TBD"}
                {event.ends_on && event.ends_on !== event.starts_on ? ` – ${event.ends_on}` : ""}
              </span>
              {event.location ? (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {event.location}
                </span>
              ) : null}
              <span className="text-xs uppercase tracking-wide">{sourceLabel(event.source)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {event.event_url ? (
              <Button asChild size="sm" variant="outline">
                <a href={event.event_url} target="_blank" rel="noreferrer">
                  Event page <ExternalLink className="h-3.5 w-3.5 ml-1" />
                </a>
              </Button>
            ) : null}
            {event.tournament_id ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/events">Tournaments</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {event.courses.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          No course is attached to this event yet. Once the course schedule is published, its data
          and prep tools show up here.
        </Card>
      ) : (
        <div className="space-y-3">
          {event.courses.map((c, i) => (
            <EventCourseCard
              key={`${c.course_id ?? c.course_name ?? i}-${c.round_number ?? i}`}
              roundNumber={c.round_number}
              courseId={c.course_id}
              courseName={c.course_name ?? "Course to be announced"}
              layoutName={c.layout_name}
              eventRefs={event.pdga_event_ref ? [event.pdga_event_ref] : undefined}
            />
          ))}
        </div>
      )}

      <Button
        variant="outline"
        className="w-full justify-between"
        onClick={() => setShowTools((v) => !v)}
      >
        <span className="flex items-center gap-2">
          <Gauge className="h-4 w-4" />
          Course readiness &amp; prep tools
        </span>
        {showTools ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </Button>

      {showTools ? (
        <div className="space-y-4">
          <CourseRatingCheck event={event} />

          <Tabs defaultValue="fit" className="space-y-4">
            <TabsList>
              <TabsTrigger value="fit">
                <Gauge className="h-3.5 w-3.5 mr-1.5" />
                Your fit
              </TabsTrigger>
              <TabsTrigger value="prep">
                <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                Prep &amp; training
              </TabsTrigger>
              <TabsTrigger value="division">
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Division
              </TabsTrigger>
              <TabsTrigger value="odds">
                <Trophy className="h-3.5 w-3.5 mr-1.5" />
                Odds
              </TabsTrigger>
              <TabsTrigger value="targets">
                <Target className="h-3.5 w-3.5 mr-1.5" />
                Course targets
              </TabsTrigger>
            </TabsList>

            <TabsContent value="fit">
              <CourseFitPanel event={event} targetRating={Math.round(panelTarget ?? 900)} />
            </TabsContent>
            <TabsContent value="prep">
              <EventPrepPanel eventId={event.id} />
            </TabsContent>
            <TabsContent value="division">
              <DivisionAdvisor eventId={event.id} />
            </TabsContent>
            <TabsContent value="odds">
              <OddsSection event={event} />
            </TabsContent>
            <TabsContent value="targets">
              <TargetsSection event={event} />
            </TabsContent>
          </Tabs>
        </div>
      ) : null}
    </div>
  );
}

function OddsSection({ event }: { event: GamePlanEvent }) {
  const { user } = useSession();
  const { profile: myProfile } = useMyProfile(user);
  const myPdga = myProfile?.pdga_number ?? null;
  const analyze = useServerFn(analyzeEventOdds);
  const syncField = useServerFn(syncPdgaEventField);
  const getPref = useServerFn(getPreferredDivision);
  const setPref = useServerFn(setPreferredDivision);
  const qc = useQueryClient();
  const [division, setDivision] = useState<string | undefined>(event.division ?? undefined);

  const { data: pref } = useQuery({
    queryKey: ["game-plan", "preferred-division"],
    queryFn: () => getPref(),
    staleTime: 5 * 60_000,
  });
  const preferredDivision = pref?.preferred_division ?? null;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["game-plan", "odds", event.id, division ?? "auto", preferredDivision ?? "none"],
    queryFn: () => analyze({ data: { eventId: event.id, division } }),
  });

  const sync = useMutation({
    mutationFn: () => {
      if (!event.pdga_event_ref) throw new Error("Not a PDGA event");
      return syncField({ data: { eventRef: event.pdga_event_ref } });
    },
    onSuccess: (res) => {
      toast.success(res.message ?? "Field synced");
      qc.invalidateQueries({ queryKey: ["game-plan", "odds", event.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  const lockDivision = useMutation({
    mutationFn: (code: string | null) => setPref({ data: { division: code } }),
    onSuccess: (res) => {
      toast.success(
        res.preferred_division
          ? `Locked ${res.preferred_division} as your division`
          : "Cleared your division",
      );
      qc.invalidateQueries({ queryKey: ["game-plan", "preferred-division"] });
      qc.invalidateQueries({ queryKey: ["game-plan", "odds"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  if (isLoading)
    return <Card className="p-4 text-muted-foreground text-sm">Analyzing the field…</Card>;
  const odds: OddsResult | undefined = data;
  if (!odds)
    return (
      <Card className="p-4 text-muted-foreground text-sm">
        Sync the field to see win probability.
      </Card>
    );

  const canSyncPdga = !!event.pdga_event_ref;
  const meLabel = odds.meRating != null ? `You (${odds.meRating})` : "You (unrated)";
  const lastSyncedLabel = odds.competition.lastSyncedAt
    ? new Date(odds.competition.lastSyncedAt).toLocaleString()
    : null;
  const currentDivision = division ?? odds.divisionCode ?? undefined;
  const isPreferred = !!(currentDivision && currentDivision === preferredDivision);
  // Ensure the caller's preferred division is offered even if it's not in the
  // synced field yet (helps first-time setup).
  const divisionOptions = Array.from(
    new Set([
      ...odds.divisionsAvailable,
      ...(preferredDivision ? [preferredDivision] : []),
      ...(currentDivision ? [currentDivision] : []),
    ]),
  );

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users className="h-4 w-4 text-primary" />
            Field ({odds.competition.fieldSize})
            {odds.divisionCode ? (
              <Badge variant="outline" className="ml-1">
                {odds.divisionCode}
              </Badge>
            ) : null}
            {isPreferred ? (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" />
                Your division
              </Badge>
            ) : null}
            {odds.fieldSource === "pdga_cache" ? (
              <Badge variant="secondary">PDGA cache</Badge>
            ) : null}
            {odds.fieldSource === "internal" ? (
              <Badge variant="secondary">In-app roster</Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {divisionOptions.length > 0 ? (
              <Select value={currentDivision} onValueChange={(v) => setDivision(v)}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue placeholder="Division" />
                </SelectTrigger>
                <SelectContent>
                  {divisionOptions.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                      {d === preferredDivision ? " ★" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {currentDivision && !isPreferred ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => lockDivision.mutate(currentDivision)}
                disabled={lockDivision.isPending}
                title="Save this as your division across every event"
              >
                <Lock className="h-3.5 w-3.5 mr-1" />
                {lockDivision.isPending ? "Saving…" : "Lock as my division"}
              </Button>
            ) : null}
            {canSyncPdga ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => sync.mutate()}
                disabled={sync.isPending}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${sync.isPending ? "animate-spin" : ""}`} />
                {sync.isPending ? "Syncing field…" : "Sync PDGA field"}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
          {preferredDivision ? (
            <span>
              Auto-scoping every event to{" "}
              <strong className="text-foreground">{preferredDivision}</strong>.
            </span>
          ) : (
            <span>
              Pick a division and tap <em>Lock as my division</em> so every event auto-filters to
              your competition.
            </span>
          )}
          {lastSyncedLabel ? <span>Field last synced {lastSyncedLabel}.</span> : null}
        </div>
      </Card>

      {!odds.players.length ? (
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4 text-muted-foreground" />
            {canSyncPdga
              ? "Field not synced yet. Tap “Sync PDGA field” to pull registered players and ratings."
              : "No roster available yet. Once players register in-app, odds will appear."}
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Win" value={`${odds.odds.winPct}%`} />
              <Stat label="Top 3" value={`${odds.odds.top3Pct}%`} />
              <Stat label={`Cash (top ${odds.cashLine})`} value={`${odds.odds.cashPct}%`} />
            </div>
            <p className="text-muted-foreground text-xs mt-3">
              Monte-Carlo simulation against {odds.players.length} rated opponents in{" "}
              {odds.divisionCode ?? "your division"}, with per-round rating variance of ±45. Powered
              by DG Statboard.
            </p>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="text-sm font-medium">Competition details</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <Stat label="Avg rating" value={String(odds.competition.avgRating ?? "—")} />
              <Stat label="Median" value={String(odds.competition.medianRating ?? "—")} />
              <Stat label="Top rated" value={String(odds.competition.topRating ?? "—")} />
              <Stat
                label="You vs field"
                value={
                  odds.competition.strengthDelta == null
                    ? "—"
                    : `${odds.competition.strengthDelta > 0 ? "+" : ""}${odds.competition.strengthDelta}`
                }
              />
            </div>
            {odds.competition.prizePurse ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <DollarSign className="h-3.5 w-3.5" />
                Prize purse (this division): ${odds.competition.prizePurse.toLocaleString()}
              </div>
            ) : null}
            {odds.competition.top5.length ? (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {odds.competition.top5[0].place != null ? "Podium & top 5" : "Top rated in field"}
                </div>
                <div className="divide-y">
                  {odds.competition.top5.map((p, i) => {
                    const canFaceOff = !!(myPdga && p.pdga_number && p.pdga_number !== myPdga);
                    const row = (
                      <div className="flex items-center justify-between py-1.5 text-sm">
                        <div className="truncate">
                          {p.place != null ? (
                            <span className="text-muted-foreground mr-2">#{p.place}</span>
                          ) : null}
                          <span className={canFaceOff ? "group-hover:text-primary" : ""}>
                            {p.name}
                          </span>
                          {p.pdga_number ? (
                            <span className="text-muted-foreground text-xs ml-2">
                              #{p.pdga_number}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2 font-medium tabular-nums">
                          {p.rating ?? "—"}
                          {canFaceOff ? (
                            <Swords className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                          ) : null}
                        </div>
                      </div>
                    );
                    return canFaceOff ? (
                      <a
                        key={`${p.pdga_number}-${i}`}
                        href={`/compare?a=${encodeURIComponent(myPdga!)}&b=${encodeURIComponent(p.pdga_number!)}&ref=gameplan`}
                        target="_blank"
                        rel="noreferrer"
                        className="group block hover:bg-muted/40 -mx-2 px-2"
                      >
                        {row}
                      </a>
                    ) : (
                      <div key={`${p.pdga_number}-${i}`}>{row}</div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </Card>

          <Card className="p-4">
            <div className="text-sm font-medium mb-2">Rating distribution</div>
            <div className="space-y-1">
              {odds.distribution.map((b) => {
                const max = Math.max(...odds.distribution.map((x) => x.count), 1);
                return (
                  <div key={b.bucket} className="flex items-center gap-2 text-xs">
                    <div className="w-16 text-right text-muted-foreground">{b.bucket}</div>
                    <div
                      className="h-3 bg-primary/70 rounded-sm"
                      style={{ width: `${(b.count / max) * 100}%` }}
                    />
                    <div className="text-muted-foreground">{b.count}</div>
                  </div>
                );
              })}
            </div>
            <p className="text-muted-foreground text-xs mt-2">You: {meLabel}</p>
          </Card>

          <Card className="p-2">
            <div className="flex items-center justify-between px-2 py-1">
              <div className="text-sm font-medium">Full field ({odds.players.length})</div>
              {myPdga ? (
                <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <Swords className="h-3 w-3" /> Click any player to face off
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground">
                  Add your PDGA # in Settings to enable face-offs
                </div>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto divide-y">
              {odds.players.map((p) => {
                const canFaceOff = !!(myPdga && p.pdga_number && p.pdga_number !== myPdga);
                const inner = (
                  <div className="flex items-center justify-between px-2 py-1.5 text-sm">
                    <div className="truncate">
                      <span className={canFaceOff ? "group-hover:text-primary" : ""}>
                        {p.display_name}
                      </span>
                      {p.pdga_number ? (
                        <span className="text-muted-foreground text-xs ml-2">#{p.pdga_number}</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="font-medium tabular-nums">{p.rating ?? "—"}</div>
                        {!p.synced ? (
                          <div className="text-[10px] text-muted-foreground">unsynced</div>
                        ) : null}
                      </div>
                      {canFaceOff ? (
                        <Swords className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                      ) : null}
                    </div>
                  </div>
                );
                return canFaceOff ? (
                  <a
                    key={p.key}
                    href={`/compare?a=${encodeURIComponent(myPdga!)}&b=${encodeURIComponent(p.pdga_number!)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group block hover:bg-muted/40"
                    title={`Face off ${myProfile?.display_name ?? "you"} vs ${p.display_name}`}
                  >
                    {inner}
                  </a>
                ) : (
                  <div key={p.key}>{inner}</div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function TargetsSection({ event }: { event: GamePlanEvent }) {
  // Event-specific goal round rating. Seeded from the player's saved overall
  // rating goal, but editing it here never changes that goal.
  const [savedGoal] = useTargetRating();
  const [targetRating, setTargetRating] = useState<number>(savedGoal ?? 950);
  useEffect(() => {
    if (savedGoal != null) setTargetRating(savedGoal);
    // Only re-seed when the saved goal itself changes.
  }, [savedGoal]);
  const compute = useServerFn(computeEventTargets);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["game-plan", "targets", event.id, targetRating],
    queryFn: () => compute({ data: { eventId: event.id, targetRating } }),
  });
  const targets: CourseTarget[] = data?.targets ?? [];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label htmlFor="target-rating" className="text-xs">
              Goal round rating
            </Label>
            <Input
              id="target-rating"
              type="number"
              value={targetRating}
              onChange={(e) => setTargetRating(Number(e.target.value) || 0)}
              min={500}
              max={1100}
              className="w-32"
            />
          </div>
          <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Recomputing…" : "Recalculate"}
          </Button>
          <PastEventResultsDialog event={event} triggerLabel="Course Ratings Analyzer" size="sm" />
          <p className="text-muted-foreground text-xs flex-1 min-w-[16rem]">
            We fit an SSA + stroke value to your past rounds at each course (or use the stored
            layout ratings), then invert the PDGA formula:
            <br />
            <code className="text-[11px]">
              required_score = SSA + (1000 − target) / stroke_value
            </code>
          </p>
        </div>
        <div className="mt-3 rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Never played this course?</strong> Open the Course
          Ratings Analyzer and paste the URL of a past PDGA event held at the same venue (with round
          ratings visible). We'll pull the real field data and compute your target score.
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-4 text-muted-foreground text-sm">Building course targets…</Card>
      ) : targets.length === 0 ? (
        <Card className="p-4 space-y-3">
          <div className="text-sm">
            No linked course data yet. If this is a PDGA event, use the{" "}
            <strong>Course Ratings Analyzer</strong> to pull rated rounds from a past event at this
            venue.
          </div>
          <PastEventResultsDialog
            event={event}
            triggerLabel="Open Course Ratings Analyzer"
            size="default"
            variant="default"
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {targets.map((t) => (
            <TargetCard key={`${t.round_number}-${t.course_name}-${t.layout_name}`} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function TargetCard({ t }: { t: CourseTarget }) {
  const badgeVariant: Record<CourseTarget["confidence"], string> = {
    very_likely: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    likely: "bg-blue-500/15 text-blue-600 border-blue-500/30",
    stretch: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    unlikely: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  };
  const confLabel: Record<CourseTarget["confidence"], string> = {
    very_likely: "Very likely",
    likely: "Likely",
    stretch: "Stretch",
    unlikely: "Unlikely",
  };
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">Round {t.round_number ?? "—"}</div>
          <div className="font-medium truncate">{t.course_name}</div>
          {t.layout_name ? (
            <div className="text-muted-foreground text-xs truncate">{t.layout_name}</div>
          ) : null}
        </div>
        <span
          className={`text-[11px] px-2 py-0.5 rounded-full border ${badgeVariant[t.confidence]}`}
        >
          {confLabel[t.confidence]}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <MiniStat label="Target rating" value={t.required_round_rating} />
        <MiniStat label="Score" value={t.required_score} />
        <MiniStat
          label="vs par"
          value={t.required_to_par > 0 ? `+${t.required_to_par}` : `${t.required_to_par}`}
        />
      </div>

      <p className="text-xs text-muted-foreground">{t.confidence_message}</p>

      <div className="text-[11px] text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-0.5 border-t pt-2">
        <div>
          SSA <span className="tabular-nums">{t.ssa}</span>
        </div>
        <div>
          Stroke value <span className="tabular-nums">{t.stroke_value}</span>
        </div>
        <div>
          Best here <span className="tabular-nums">{t.history_best_rating ?? "—"}</span>
        </div>
        <div>
          Median <span className="tabular-nums">{t.history_median_rating ?? "—"}</span>
        </div>
        <div>
          Rounds used <span className="tabular-nums">{t.history_n}</span>
        </div>
        <div>
          Times hit <span className="tabular-nums">{t.hits_at_or_above}</span>
        </div>
        <div className="col-span-2">
          Model source: <span className="uppercase tracking-wide">{t.model_source}</span>
        </div>
      </div>
    </Card>
  );
}

/* -------------------------- small helpers ------------------------------ */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}
function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
function sourceLabel(s: GamePlanEvent["source"]): string {
  switch (s) {
    case "internal_tournament":
      return "In-app tournament";
    case "internal_league":
      return "In-app league";
    case "pdga":
      return "PDGA event";
    default:
      return "Manual entry";
  }
}
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso + "T00:00:00").getTime();
  if (!Number.isFinite(target)) return null;
  return Math.ceil((target - Date.now()) / 86_400_000);
}
