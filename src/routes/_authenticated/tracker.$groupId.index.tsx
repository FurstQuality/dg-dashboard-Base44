import { createFileRoute, Link } from "@tanstack/react-router";
import { formatTeeTime } from "@/lib/tee-time";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft,
  Users,
  Plus,
  Pencil,
  RefreshCw,
  Trophy,
  CalendarDays,
  MapPin,
  Trash2,
  ExternalLink,
  Clock,
  Sparkles,
  TrendingDown,
  Star,
  Send,
  Copy,
  UserPlus,
} from "lucide-react";

import {
  getTrackerGroup,
  addTrackerMember,
  updateTrackerMember,
  removeTrackerMember,
  addTrackerEvent,
  importTrackerEventFromUrl,
  removeTrackerEvent,
  updateTrackerEvent,
  setTrackerTeeTime,
  refreshTrackerGroup,
  seedTrackerFromFriends,
  type TrackerMember,
  type TrackerEvent,
  type TrackerTeeTime,
  type MemberSnapshot,
  type TrackerEventRound,
  type TrackerLiveScoreRow,
} from "@/lib/tracker.functions";
import { addPdgaFriend } from "@/lib/pdga-friends.functions";
import { searchCrewCandidates, type CrewCandidate } from "@/lib/tracker-player-search.functions";
import { readTrackerCache, writeTrackerCache } from "@/lib/tracker-offline";
import { WifiOff } from "lucide-react";

import { RouteErrorBoundary, RouteNotFound } from "@/components/route-boundaries";
import { CrewCalendar } from "@/components/tracker/crew-calendar";
import { LiveScoringPanel } from "@/components/tracker/live-scoring-panel";
import { LiveRoundBanner } from "@/components/tracker/live-round-banner";
import { LiveRoundBadge } from "@/components/tracker/live-round-badge";
import { EventResultsBoard } from "@/components/tracker/event-results-board";
import { PlayerActivityBoard } from "@/components/tracker/player-activity-board";
import { HoleByHoleCard } from "@/components/tracker/hole-by-hole-card";
import {
  buildLiveMemberIndex,
  buildLiveEventIndex,
  type LiveMemberStatus,
  type LiveEventStatus,
} from "@/lib/tracker-live-status";
import { refreshTrackerEventLive } from "@/lib/tracker-live.functions";
import { PdgaEventLinks } from "@/components/shared/pdga-links";
import { TeeSheetView } from "@/components/tracker/tee-sheet-view";
import { CoursesView } from "@/components/tracker/courses-view";
import {
  AlertsView,
  buildTrackerAlerts,
  readDismissedAlertIds,
} from "@/components/tracker/alerts-view";
import { fmtDate, KpiTile, SectionIntro, SegmentedControl } from "@/components/tracker/tracker-ui";

import {
  estimateEventWindow,
  evaluateSameDayConflict,
  inferFormat,
} from "@/lib/tournament-knowledge";

export const Route = createFileRoute("/_authenticated/tracker/$groupId/")({
  component: TrackerDetail,
  errorComponent: RouteErrorBoundary,
  notFoundComponent: () => <RouteNotFound label="This tracker group" />,
  head: () => ({
    meta: [
      { title: "Tournament Tracker · Standings & tee times · DG Dashboard" },
      {
        name: "description",
        content:
          "Follow your crew's PDGA tee times, divisions, and round-by-round performance in one dashboard.",
      },
      {
        property: "og:title",
        content: "Tournament Tracker · Standings & tee times · DG Dashboard",
      },
      {
        property: "og:description",
        content: "Real-time PDGA standings and tee times for your travel crew.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const DIVISIONS = [
  "MPO",
  "FPO",
  "MP40",
  "FP40",
  "MP50",
  "FP50",
  "MA1",
  "FA1",
  "MA2",
  "FA2",
  "MA3",
  "FA3",
  "MA4",
  "FA4",
  "MA40",
  "MA50",
];
import { MEMBER_COLORS, crewSwatchStyle, parseCrewColor } from "@/lib/tracker-colors";
import { PageShell } from "@/components/shell/page-shell";
import { blockedByOffline } from "@/lib/tracker-offline-guard";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TRACKER_STALE, trackerKeys } from "@/lib/tracker-queries";
import { TrackerErrorState, TrackerPageSkeleton } from "@/components/tracker/tracker-states";

function TrackerDetail() {
  const { groupId } = Route.useParams();
  const get = useServerFn(getTrackerGroup);
  const addMember = useServerFn(addTrackerMember);
  const updateMember = useServerFn(updateTrackerMember);
  const removeMember = useServerFn(removeTrackerMember);
  const addEvent = useServerFn(addTrackerEvent);
  const importEvent = useServerFn(importTrackerEventFromUrl);
  const removeEvent = useServerFn(removeTrackerEvent);
  const editEvent = useServerFn(updateTrackerEvent);
  const setTeeTime = useServerFn(setTrackerTeeTime);
  const refresh = useServerFn(refreshTrackerGroup);

  type Bundle = NonNullable<Awaited<ReturnType<typeof getTrackerGroup>>>;
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TrackerTab>("overview");
  const [scheduleView, setScheduleView] = useState<"calendar" | "teesheet" | "courses">("calendar");
  // Offline snapshot read from IndexedDB so on-site crews see their tracker even
  // before (or without) a successful network round-trip.
  const [snapshot, setSnapshot] = useState<{ bundle: Bundle; cached_at: number } | null>(null);
  const [snapshotChecked, setSnapshotChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readTrackerCache<Bundle>(groupId).then((cached) => {
      if (cancelled) return;
      if (cached) setSnapshot({ bundle: cached.bundle, cached_at: cached.cached_at });
      setSnapshotChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const query = useQuery({
    queryKey: trackerKeys.group(groupId),
    staleTime: TRACKER_STALE.group,
    queryFn: async () => {
      const fresh = await get({ data: { id: groupId } });
      if (fresh) void writeTrackerCache(groupId, fresh);
      return fresh ?? null;
    },
  });

  const bundle: Bundle | null = (query.data as Bundle | null) ?? snapshot?.bundle ?? null;
  // Only treat this as offline when the network failed but a snapshot saved us.
  const offline = query.isError && !!snapshot;
  const cachedAt = query.data ? query.dataUpdatedAt : (snapshot?.cached_at ?? null);
  const loading = (query.isPending || !snapshotChecked) && !bundle;

  const load = useCallback(async () => {
    await query.refetch();
  }, [query]);

  // Reload the moment connectivity returns so the crew never has to remember to
  // hit Sync after leaving a signal dead zone.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => {
      void queryClient.invalidateQueries({ queryKey: trackerKeys.group(groupId) });
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [groupId, queryClient]);

  const refreshBundle = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: trackerKeys.group(groupId) });
  }, [groupId, queryClient]);

  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await refresh({ data: { id: groupId } });
      const bits = [`Refreshed ${r.refreshed}/${r.total} players`];
      if (r.eventsAdded) bits.push(`${r.eventsAdded} new event${r.eventsAdded === 1 ? "" : "s"}`);
      if (r.teeTimesAdded)
        bits.push(`${r.teeTimesAdded} registration${r.teeTimesAdded === 1 ? "" : "s"}`);
      if (r.teeTimesUpdated)
        bits.push(`${r.teeTimesUpdated} tee time${r.teeTimesUpdated === 1 ? "" : "s"} updated`);
      toast.success("Synced from PDGA", { description: bits.join(" · ") });
      await refreshBundle();
    } catch (e) {
      toast.error("Sync failed", { description: (e as Error).message });
    } finally {
      setRefreshing(false);
    }
  }, [groupId, refreshBundle, refresh]);

  // Auto-sync when opening a tracker whose latest snapshot is >12h old (once per mount).
  const [autoSyncedRef] = useState(() => ({ done: false }));
  useEffect(() => {
    if (!bundle || autoSyncedRef.done || refreshing || offline) return;
    if (bundle.members.length === 0) return;
    const latest = bundle.snapshots
      .map((s) => s.refreshed_at)
      .filter(Boolean)
      .sort()
      .pop() as string | undefined;
    const stale = !latest || Date.now() - new Date(latest).getTime() > 12 * 60 * 60 * 1000;
    if (stale) {
      autoSyncedRef.done = true;
      void doRefresh();
    }
  }, [bundle, refreshing, offline, doRefresh, autoSyncedRef]);

  // While any tracked player is actively on the course, quietly repoll live
  // scores every 45s so the LIVE banner, KPI tile, and event card indicators
  // stay accurate without a page refresh. Polling pauses in a hidden tab.
  const refreshLive = useServerFn(refreshTrackerEventLive);
  useEffect(() => {
    if (!bundle || typeof document === "undefined") return;
    const b = bundle as typeof bundle & { liveScores?: TrackerLiveScoreRow[] };
    const scores = b.liveScores ?? [];
    // Find events that currently have any active card (round started, not
    // completed). Only those need polling.
    const activeEventIds = new Set<string>();
    const seen = new Set<string>();
    for (const s of scores) {
      const dedupe = `${s.event_id}:${s.pdga_number}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      if (s.round_started && !s.completed) activeEventIds.add(s.event_id);
    }
    if (activeEventIds.size === 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      // Refresh every live event in one pass rather than one after another.
      await Promise.all(
        Array.from(activeEventIds).map((eventId) =>
          refreshLive({ data: { eventId } }).catch(() => null),
        ),
      );
      if (!cancelled) await refreshBundle();
    };
    const start = () => {
      if (timer) return;
      timer = setInterval(() => void tick(), 45_000);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void tick();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [bundle, refreshLive, refreshBundle]);

  if (loading) {
    return (
      <PageShell>
        <TrackerPageSkeleton />
      </PageShell>
    );
  }

  if (!bundle) {
    return (
      <PageShell>
        <TrackerErrorState
          message={
            query.isError
              ? "We couldn't reach this tracker. Check your connection and try again."
              : "This tracker isn't available anymore."
          }
          onRetry={() => void load()}
          retrying={query.isFetching}
        />
      </PageShell>
    );
  }

  const {
    group,
    members: rawMembers,
    events,
    teeTimes,
    eventRounds,
    liveScores,
    snapshots,
    changes,
  } = bundle as typeof bundle & { liveScores?: TrackerLiveScoreRow[] };
  const liveScoreRows: TrackerLiveScoreRow[] = liveScores ?? [];
  const snapByNum = new Map(snapshots.map((s) => [s.pdga_number, s]));
  // Alphabetical by display name (falls back to PDGA snapshot name, then #num).
  const nameFor = (m: (typeof rawMembers)[number]) =>
    (
      m.display_name ||
      snapByNum.get(m.pdga_number)?.name ||
      `#${m.pdga_number}`
    ).toLocaleLowerCase();
  const members = [...rawMembers].sort((a, b) => nameFor(a).localeCompare(nameFor(b)));
  const memberById = new Map(members.map((m) => [m.id, m]));
  // Aggregate every tee-time row per (event, member) so R1/R2/... can be listed on one line.
  const teesByKey = new Map<string, TrackerTeeTime[]>();
  for (const t of teeTimes) {
    const k = `${t.event_id}:${t.member_id}`;
    const arr = teesByKey.get(k) ?? [];
    arr.push(t);
    teesByKey.set(k, arr);
  }
  const teeByKey = new Map<string, TrackerTeeTime>();
  for (const [k, arr] of teesByKey) {
    // Pre-draw "aggregate" row (round_number null) or the first round.
    const primary =
      arr.find((t) => t.round_number == null) ??
      arr.sort((a, b) => (a.round_number ?? 0) - (b.round_number ?? 0))[0];
    if (primary) teeByKey.set(k, primary);
  }
  const roundsByEvent = new Map<string, typeof eventRounds>();
  for (const r of eventRounds) {
    const arr = roundsByEvent.get(r.event_id) ?? [];
    arr.push(r);
    roundsByEvent.set(r.event_id, arr);
  }

  // Live-scoring indexes: latest row per player + per-event roll-ups. These
  // drive the top-of-page LIVE banner, the KPI tile, event card headers, and
  // per-member row indicators. Recomputed on every bundle change (cheap).
  const liveByMember = buildLiveMemberIndex(liveScoreRows);
  const liveByEvent = buildLiveEventIndex(liveScoreRows);
  const eventById = new Map(events.map((e) => [e.id, e]));
  const activeStatuses: Array<{ member: TrackerMember; status: LiveMemberStatus }> = [];
  for (const m of members) {
    const st = liveByMember.get(m.pdga_number);
    if (st?.active) activeStatuses.push({ member: m, status: st });
  }
  const anyActive = activeStatuses.length > 0;
  const clearedAlertIds = new Set(readDismissedAlertIds(groupId));
  const alertCount = buildTrackerAlerts({
    changes,
    events,
    memberById,
    snapByNum,
    teeTimes,
    rounds: eventRounds,
  }).filter((a) => !clearedAlertIds.has(a.id)).length;

  return (
    <PageShell>
      {/* ------------------------ Header ------------------------ */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            to="/tracker"
            aria-label="Back to trackers"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold sm:text-xl">{group.name}</h1>
              {(group.trip_start || group.trip_end) && (
                <Badge variant="secondary" className="gap-1">
                  <CalendarDays className="h-3 w-3" />
                  {fmtDate(group.trip_start)}
                  {group.trip_end && ` – ${fmtDate(group.trip_end)}`}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Follow your crew's tee times, results, and rating moves in one place.
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {members.length} players · {events.length} events
              {snapshots.length > 0 &&
                (() => {
                  const latest = snapshots
                    .map((s) => s.refreshed_at)
                    .filter(Boolean)
                    .sort()
                    .pop() as string | undefined;
                  return latest
                    ? ` · Synced ${new Date(latest).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                    : "";
                })()}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
          {offline && (
            <Badge
              variant="outline"
              className="gap-1 border-amber-500/50 text-amber-700 dark:text-amber-300"
            >
              <WifiOff className="h-3 w-3" />
              Offline
              {cachedAt
                ? ` · cached ${new Date(cachedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                : ""}
            </Badge>
          )}
          <Button size="lg" className="w-full gap-2 sm:w-auto" onClick={() => setActiveTab("crew")}>
            <UserPlus className="h-5 w-5" />
            Add / edit crew members
          </Button>
          <Button
            size="sm"
            onClick={doRefresh}
            disabled={refreshing || offline || members.length === 0}
            title={offline ? "You're offline — reconnect to sync" : undefined}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Sync from
            PDGA
          </Button>
        </div>
      </div>

      {anyActive && (
        <LiveRoundBanner
          groupId={groupId}
          activeStatuses={activeStatuses}
          eventById={eventById}
          refreshing={refreshing}
          onRefresh={() => void load()}
        />
      )}

      <TrackerTabs value={activeTab} onChange={setActiveTab} alertCount={alertCount} />

      {activeTab === "overview" && (
        <>
          <CrewDashboard
            members={members}
            events={events}
            teeTimes={teeTimes}
            snapshots={snapshots}
            tripStart={group.trip_start}
            tripEnd={group.trip_end}
            liveByMember={liveByMember}
            activeCount={activeStatuses.length}
          />

          {members.length > 0 && events.length > 0 && (
            <section className="space-y-2">
              <SectionIntro
                title="Where is everyone?"
                description="Your crew's next tee times at a glance. Open Schedule for the full calendar, tee sheet, and course list."
                compact
                action={
                  <Button variant="outline" size="sm" onClick={() => setActiveTab("schedule")}>
                    Open schedule
                  </Button>
                }
              />
              <CrewCalendar
                groupId={groupId}
                members={members}
                events={events}
                teeTimes={teeTimes}
                eventRounds={eventRounds}
                snapshots={snapshots}
                tripStart={group.trip_start}
                tripEnd={group.trip_end}
              />
            </section>
          )}

          {alertCount > 0 && (
            <Card className="border-amber-500/40">
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingDown className="h-4 w-4 text-amber-500" /> Needs attention
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {alertCount} scheduling conflict{alertCount === 1 ? "" : "s"} or change
                    {alertCount === 1 ? "" : "s"} from the last sync.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setActiveTab("alerts")}>
                  Review all
                </Button>
              </CardHeader>
            </Card>
          )}
        </>
      )}

      {activeTab === "results" && (
        <section className="space-y-3">
          <SectionIntro
            title="Results & live scoring"
            description="Division leaderboards, hole-by-hole detail, and every tracked player's current round."
            compact
          />
          <LatestResultsWidget
            groupId={groupId}
            members={members}
            snapByNum={snapByNum}
            liveScoreRows={liveScoreRows}
            eventById={eventById}
          />
          {liveScoreRows.length > 0 ? (
            <PlayerActivityBoard
              groupId={groupId}
              members={members}
              scores={liveScoreRows}
              eventNameById={new Map(events.map((e) => [e.id, e.name]))}
            />
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No scores yet. Once your crew tees off in a tracked event, live leaderboards land
                here.
              </CardContent>
            </Card>
          )}
        </section>
      )}

      {activeTab === "alerts" && (
        <section className="space-y-3">
          <SectionIntro
            title="Needs attention"
            description="Scheduling conflicts, travel gaps, rating moves, and registration changes picked up on the last sync."
            compact
          />
          <AlertsView
            embedded
            groupId={groupId}
            onCleared={load}
            changes={changes}
            events={events}
            memberById={memberById}
            snapByNum={snapByNum}
            teeTimes={teeTimes}
            rounds={eventRounds}
          />
        </section>
      )}

      {activeTab === "schedule" && (
        <section className="space-y-3">
          <SectionIntro
            title="Schedule"
            description="Calendar, tee sheet, and courses for every tracked event in your trip window."
            compact
            action={
              <SegmentedControl
                value={scheduleView}
                onChange={setScheduleView}
                options={[
                  { value: "calendar", label: "Calendar" },
                  { value: "teesheet", label: "Tee sheet" },
                  { value: "courses", label: "Courses" },
                ]}
              />
            }
          />
          {scheduleView === "calendar" && (
            <CrewCalendar
              groupId={groupId}
              members={members}
              events={events}
              teeTimes={teeTimes}
              eventRounds={eventRounds}
              snapshots={snapshots}
              tripStart={group.trip_start}
              tripEnd={group.trip_end}
            />
          )}
          {scheduleView === "teesheet" && (
            <TeeSheetView
              embedded
              events={events}
              teeTimes={teeTimes}
              eventRounds={eventRounds}
              memberById={memberById}
              tripStart={group.trip_start}
              tripEnd={group.trip_end}
            />
          )}
          {scheduleView === "courses" && (
            <CoursesView
              embedded
              events={events}
              eventRounds={eventRounds}
              teeTimes={teeTimes}
              memberById={memberById}
              tripStart={group.trip_start}
              tripEnd={group.trip_end}
            />
          )}
        </section>
      )}

      {activeTab === "crew" && (
        <section className="space-y-3">
          <SectionIntro
            title="Crew"
            description="Everyone tracked in this group. Tap a name for a full itinerary and rating history."
            compact
            action={<SeedFromFriendsButton groupId={groupId} onSeeded={load} />}
          />
          <div className="max-w-2xl">
            <MembersPanel
              groupId={groupId}
              members={members}
              snapshots={snapshots}
              events={events}
              teeByKey={teeByKey}
              onAdd={async (row) => {
                const r = await addMember({ data: row });
                await load();
                return r as {
                  duplicate?: boolean;
                  notified?: boolean;
                  matched_profile?: { display_name: string | null; username: string } | null;
                };
              }}
              onUpdate={async (row) => {
                await updateMember({ data: row });
                await load();
              }}
              onRemove={async (id) => {
                await removeMember({ data: { id } });
                await load();
              }}
            />
          </div>
        </section>
      )}

      {activeTab === "events" && (
        <section className="space-y-2">
          <SectionIntro
            title="Events"
            description="All PDGA and manually-added events inside your trip window. Paste a PDGA event URL to auto-import."
            compact
          />
          <EventsPanel
            groupId={groupId}
            members={members}
            events={events.filter((e) => {
              if (!group.trip_start && !group.trip_end) return true;
              if (!e.event_date) return false;
              if (group.trip_start && e.event_date < group.trip_start) return false;
              if (group.trip_end && e.event_date > group.trip_end) return false;
              return true;
            })}
            teeByKey={teeByKey}
            teesByKey={teesByKey}
            roundsByEvent={roundsByEvent}
            snapByNum={snapByNum}
            memberById={memberById}
            onAdd={async (row) => {
              await addEvent({ data: row });
              await load();
            }}
            onImportUrl={async (url) => {
              const r = await importEvent({ data: { group_id: groupId, url } });
              await load();
              return r;
            }}
            onRemove={async (id) => {
              if (blockedByOffline("Removing an event")) return;
              await removeEvent({ data: { id } });
              await load();
            }}
            onEdit={async (row) => {
              if (blockedByOffline("Editing an event")) return;
              await editEvent({ data: row });
              await load();
            }}
            onTeeTime={async (row) => {
              if (blockedByOffline("Saving a tee time")) return;
              await setTeeTime({ data: row });
              await load();
            }}
          />
        </section>
      )}
    </PageShell>
  );
}

const TAB_ORDER = ["overview", "schedule", "results", "crew", "events", "alerts"] as const;
type TrackerTab = (typeof TAB_ORDER)[number];
const TAB_LABELS: Record<TrackerTab, string> = {
  overview: "Overview",
  schedule: "Schedule",
  results: "Results",
  crew: "Crew",
  events: "Events",
  alerts: "Alerts",
};

function TrackerTabs({
  value,
  onChange,
  alertCount,
}: {
  value: TrackerTab;
  onChange: (t: TrackerTab) => void;
  alertCount: number;
}) {
  return (
    <div className="sticky top-0 z-10 -mx-4 flex flex-wrap gap-1 border-b bg-background/95 px-4 py-1 backdrop-blur">
      {TAB_ORDER.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition ${value === k ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted"}`}
        >
          {TAB_LABELS[k]}
          {k === "alerts" && alertCount > 0 && (
            <span className="rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
              {alertCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Members panel ----------------------------- */

function MembersPanel({
  groupId,
  members,
  snapshots,
  events,
  teeByKey,
  onAdd,
  onUpdate,
  onRemove,
}: {
  groupId: string;
  members: TrackerMember[];
  snapshots: MemberSnapshot[];
  events: TrackerEvent[];
  teeByKey: Map<string, TrackerTeeTime>;
  onAdd: (row: {
    group_id: string;
    pdga_number: string;
    display_name?: string | null;
    default_division?: string | null;
    is_you?: boolean;
    color?: string | null;
  }) => Promise<{
    duplicate?: boolean;
    notified?: boolean;
    matched_profile?: { display_name: string | null; username: string } | null;
  } | void>;
  onUpdate: (row: {
    id: string;
    pdga_number?: string;
    display_name?: string | null;
    default_division?: string | null;
    is_you?: boolean;
    color?: string | null;
  }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pdga, setPdga] = useState("");
  const [displayName, setDisplayName] = useState("");
  // Directory + friends + PDGA search, debounced so typing doesn't hammer the server.
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const runSearch = useServerFn(searchCrewCandidates);
  const candidates = useQuery({
    queryKey: ["crew-candidates", groupId, debouncedSearch],
    enabled: open && debouncedSearch.length >= 2,
    staleTime: 30_000,
    queryFn: () => runSearch({ data: { query: debouncedSearch, group_id: groupId } }),
  });
  const [division, setDivision] = useState<string>("MA40");
  const [isYou, setIsYou] = useState(false);
  const [editing, setEditing] = useState<TrackerMember | null>(null);
  const [eForm, setEForm] = useState({
    pdga_number: "",
    display_name: "",
    default_division: "MA40",
    is_you: false,
    color: "#22c55e",
  });
  const [inviteAfterAdd, setInviteAfterAdd] = useState<{ pdga: string; name: string } | null>(null);
  const snapByNum = new Map(snapshots.map((s) => [s.pdga_number, s]));

  async function add(override?: { pdga_number: string; display_name?: string | null }) {
    if (blockedByOffline("Adding a player")) return;
    const pdgaInput = override?.pdga_number ?? pdga;
    if (!pdgaInput.trim()) {
      toast.error("Search for a player, or enter a PDGA number");
      return;
    }
    const enteredPdga = pdgaInput.replace(/\D/g, "");
    const enteredName = override ? (override.display_name ?? "") : displayName;
    try {
      const r = await onAdd({
        group_id: groupId,
        pdga_number: pdgaInput,
        display_name: enteredName || null,
        default_division: division || null,
        is_you: isYou,
        color: MEMBER_COLORS[members.length % MEMBER_COLORS.length],
      });
      setPdga("");
      setDisplayName("");
      setIsYou(false);
      setOpen(false);
      const result = r as {
        duplicate?: boolean;
        notified?: boolean;
        matched_profile?: { display_name: string | null; username: string } | null;
      } | void;
      if (result && result.duplicate) {
        toast.info("Already in your crew", {
          description: `PDGA #${enteredPdga} is already being tracked in this group.`,
        });
      } else if (result && result.notified && result.matched_profile) {
        const who = result.matched_profile.display_name || `@${result.matched_profile.username}`;
        toast.success("Added to your crew", {
          description: `${who} was notified they've been added.`,
        });
      } else if (!isYou && result && !result.matched_profile) {
        const nameForInvite = enteredName || `PDGA #${enteredPdga}`;
        toast.success("Player added", {
          description: "Not on DG Dashboard yet — send them an invite?",
        });
        setInviteAfterAdd({ pdga: enteredPdga, name: nameForInvite });
      } else {
        toast.success("Player added");
      }
    } catch (e) {
      toast.error("Failed", { description: (e as Error).message });
    }
  }

  function beginEdit(m: TrackerMember) {
    setEditing(m);
    setEForm({
      pdga_number: m.pdga_number ?? "",
      display_name: m.display_name ?? "",
      default_division: m.default_division ?? "MA40",
      is_you: !!m.is_you,
      color: m.color ?? "#22c55e",
    });
  }

  async function saveEdit() {
    if (blockedByOffline("Editing a player")) return;
    if (!editing) return;
    if (!eForm.pdga_number.trim()) {
      toast.error("Enter PDGA #");
      return;
    }
    try {
      await onUpdate({
        id: editing.id,
        pdga_number: eForm.pdga_number,
        display_name: eForm.display_name || null,
        default_division: eForm.default_division || null,
        is_you: eForm.is_you,
        color: eForm.color,
      });
      setEditing(null);
      toast.success("Player updated");
    } catch (e) {
      toast.error("Failed", { description: (e as Error).message });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" /> Crew ({members.length})
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="secondary">
              <Plus className="h-3 w-3" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add a player to your crew</DialogTitle>
              <DialogDescription className="text-xs">
                Search by PDGA number, DG Dashboard username, or first and last name. Friends show
                up first. If they're on DG Dashboard we'll notify them; otherwise you can send an
                invite link.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Search players</Label>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, @username, or PDGA #"
                />
              </div>

              {debouncedSearch.length >= 2 && (
                <div className="space-y-1.5">
                  {candidates.isPending ? (
                    <p className="text-xs text-muted-foreground">Searching…</p>
                  ) : (candidates.data?.length ?? 0) === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No players matched that. Try a PDGA number, or enter it below.
                    </p>
                  ) : (
                    (candidates.data as CrewCandidate[]).map((c) => (
                      <div
                        key={c.key}
                        className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-medium">{c.name}</span>
                            {c.isFriend && (
                              <Badge variant="secondary" className="text-[10px]">
                                Friend
                              </Badge>
                            )}
                            {c.source === "directory" && !c.isFriend && (
                              <Badge variant="outline" className="text-[10px]">
                                On DG Dashboard
                              </Badge>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {[
                              c.username ? `@${c.username}` : null,
                              c.pdgaNumber ? `#${c.pdgaNumber}` : "No PDGA number on file",
                              c.rating ? `${c.rating} rated` : null,
                              c.location,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        {c.alreadyInCrew ? (
                          <span className="shrink-0 text-xs text-muted-foreground">In crew</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="shrink-0"
                            disabled={!c.pdgaNumber}
                            title={
                              c.pdgaNumber
                                ? undefined
                                : "Tracking needs a PDGA number — ask them to add theirs"
                            }
                            onClick={() =>
                              void add({ pdga_number: c.pdgaNumber!, display_name: c.name })
                            }
                          >
                            Add
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className="space-y-1 border-t pt-3">
                <Label>Or enter a PDGA number</Label>
                <Input
                  value={pdga}
                  onChange={(e) => setPdga(e.target.value)}
                  placeholder="e.g. 12345"
                />
              </div>
              <div className="space-y-1">
                <Label>Display name (optional)</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Alex P."
                />
              </div>
              <div className="space-y-1">
                <Label>Default division</Label>
                <Select value={division} onValueChange={setDivision}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIVISIONS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isYou}
                  onChange={(e) => setIsYou(e.target.checked)}
                />{" "}
                This is me
              </label>
            </div>
            <DialogFooter>
              <Button onClick={() => void add()}>Add to crew</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {members.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No players yet — add friends by PDGA number.
          </p>
        ) : (
          members.map((m) => {
            const s = snapByNum.get(m.pdga_number);
            const name = m.display_name || s?.name || `PDGA #${m.pdga_number}`;
            const today = new Date().toISOString().slice(0, 10);
            const trackedRefs = new Set(
              events.map((e) => e.pdga_event_ref).filter((r): r is string => !!r),
            );
            const upcoming = events
              .filter((e) => (e.event_date ?? "") >= today)
              .filter((e) => teeByKey.has(`${e.id}:${m.id}`))
              .sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? ""));
            const nextEvent = upcoming[0] ?? null;
            const nextTee = nextEvent ? (teeByKey.get(`${nextEvent.id}:${m.id}`) ?? null) : null;
            const eventsTracked = events.filter((e) => teeByKey.has(`${e.id}:${m.id}`)).length;
            const latestFinish =
              (s?.finishes ?? [])
                .filter((f) => f.place != null && f.event_ref && trackedRefs.has(f.event_ref))
                .sort((a, b) => (b.event_date ?? "").localeCompare(a.event_date ?? ""))[0] ?? null;
            const lastRoundRating =
              (s?.rounds ?? [])
                .map((r) => r.round_rating)
                .filter((n): n is number => typeof n === "number")[0] ?? null;
            return (
              <div
                key={m.id}
                className="group rounded-md border bg-card px-2 py-1.5 text-xs hover:bg-muted/40 transition"
              >
                <div className="flex items-start gap-2">
                  <Link
                    to="/tracker/$groupId/player/$memberId"
                    params={{ groupId, memberId: m.id }}
                    className="flex min-w-0 flex-1 items-start gap-2"
                  >
                    <span
                      className="mt-0.5 h-8 w-8 shrink-0 rounded-full text-black text-[11px] font-bold grid place-items-center shadow-sm"
                      style={crewSwatchStyle(m.color)}
                    >
                      {name
                        .split(/\s+/)
                        .filter(Boolean)
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="truncate font-medium text-primary underline-offset-2 group-hover:underline">
                          {name}
                        </span>
                        {m.is_you && (
                          <Badge variant="outline" className="h-3.5 px-1 text-[9px]">
                            you
                          </Badge>
                        )}
                        <ExternalLink className="h-2.5 w-2.5 text-primary/60" />
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground tabular-nums">
                        <span>#{m.pdga_number}</span>
                        {m.default_division && (
                          <span className="rounded bg-muted px-1">{m.default_division}</span>
                        )}
                        {s?.current_rating && (
                          <span className="inline-flex items-center gap-0.5 text-foreground font-medium">
                            <Star className="h-2.5 w-2.5 text-amber-500" />
                            {s.current_rating}
                          </span>
                        )}
                        {lastRoundRating && <span>last rd {lastRoundRating}</span>}
                        <span>
                          {eventsTracked} event{eventsTracked === 1 ? "" : "s"}
                        </span>
                      </div>
                      {(nextEvent || latestFinish) && (
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] leading-tight">
                          {nextEvent && (
                            <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1 py-0.5 text-primary">
                              <CalendarDays className="h-2.5 w-2.5" />
                              {fmtDate(nextEvent.event_date)}
                              <span className="truncate max-w-[120px]">{nextEvent.name}</span>
                              {nextTee?.tee_time && (
                                <span className="font-semibold">
                                  · {formatTeeTime(nextTee.tee_time)}
                                </span>
                              )}
                            </span>
                          )}
                          {latestFinish && (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Trophy className="h-2.5 w-2.5" />#{latestFinish.place} ·{" "}
                              <span className="truncate max-w-[100px]">
                                {latestFinish.event_name}
                              </span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </Link>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                    {!m.is_you && (
                      <InviteToAppButton pdgaNumber={m.pdga_number} displayName={name} />
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => beginEdit(m)}
                      aria-label="Edit player"
                      title="Edit player"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => onRemove(m.id)}
                      aria-label="Remove player from crew"
                      title="Remove player from crew"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>

      <Dialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit player</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>PDGA #</Label>
              <Input
                value={eForm.pdga_number}
                onChange={(e) => setEForm({ ...eForm, pdga_number: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Display name</Label>
              <Input
                value={eForm.display_name}
                onChange={(e) => setEForm({ ...eForm, display_name: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1">
              <Label>Default division</Label>
              <Select
                value={eForm.default_division}
                onValueChange={(v) => setEForm({ ...eForm, default_division: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIVISIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {MEMBER_COLORS.map((c) => {
                  const isActive = eForm.color === c;
                  const { border } = parseCrewColor(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEForm({ ...eForm, color: c })}
                      className={`h-8 w-8 rounded-full transition ${isActive ? "ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110" : "hover:scale-105"}`}
                      style={crewSwatchStyle(c)}
                      aria-label={border ? `Two-tone ${c}` : `Solid ${c}`}
                    />
                  );
                })}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={eForm.is_you}
                onChange={(e) => setEForm({ ...eForm, is_you: e.target.checked })}
              />{" "}
              This is me
            </label>
          </div>
          <DialogFooter className="justify-between sm:justify-between">
            <Button
              variant="destructive"
              onClick={() => {
                if (editing) {
                  onRemove(editing.id);
                  setEditing(null);
                }
              }}
            >
              <Trash2 className="mr-1 h-3 w-3" /> Remove
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={saveEdit}>Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!inviteAfterAdd}
        onOpenChange={(o) => {
          if (!o) setInviteAfterAdd(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite {inviteAfterAdd?.name} to DG Dashboard</DialogTitle>
            <DialogDescription className="text-xs">
              They're tracked in your crew, but don't have a DG Dashboard account yet. Send them an
              invite link so they can join and see the crew's schedule.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="justify-end">
            <Button variant="outline" onClick={() => setInviteAfterAdd(null)}>
              Not now
            </Button>
            {inviteAfterAdd && (
              <InviteToAppButton
                key={inviteAfterAdd.pdga}
                pdgaNumber={inviteAfterAdd.pdga}
                displayName={inviteAfterAdd.name}
                triggerLabel="Send invite"
              />
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------------ Crew dashboard ---------------------------- */

function CrewDashboard({
  members,
  events,
  teeTimes,
  snapshots,
  tripStart,
  tripEnd,
  liveByMember,
  activeCount = 0,
}: {
  members: TrackerMember[];
  events: TrackerEvent[];
  teeTimes: TrackerTeeTime[];
  snapshots: MemberSnapshot[];
  tripStart: string | null;
  tripEnd: string | null;
  liveByMember?: Map<string, LiveMemberStatus>;
  activeCount?: number;
}) {
  const snapByNum = useMemo(() => new Map(snapshots.map((s) => [s.pdga_number, s])), [snapshots]);
  const today = new Date().toISOString().slice(0, 10);

  const ratings = members
    .map((m) => snapByNum.get(m.pdga_number)?.current_rating ?? 0)
    .filter((r) => r > 0);
  const avgRating = ratings.length
    ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)
    : null;
  const topRating = ratings.length ? Math.max(...ratings) : null;

  const inTrip = events.filter((e) => {
    if (!tripStart && !tripEnd) return true;
    if (!e.event_date) return false;
    if (tripStart && e.event_date < tripStart) return false;
    if (tripEnd && e.event_date > tripEnd) return false;
    return true;
  });
  const upcoming = inTrip
    .filter((e) => e.event_date && e.event_date >= today)
    .sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? ""));
  const nextEvent = upcoming[0] ?? null;

  let daysUntil: number | null = null;
  if (nextEvent?.event_date) {
    const then = new Date(nextEvent.event_date + "T00:00:00").getTime();
    const now = new Date(today + "T00:00:00").getTime();
    daysUntil = Math.max(0, Math.round((then - now) / 86_400_000));
  }

  const registered = teeTimes.length;
  const withTeeTimes = teeTimes.filter((t) => !!t.tee_time).length;

  const lastRefresh = snapshots
    .map((s) => s.refreshed_at)
    .filter(Boolean)
    .sort()
    .pop() as string | undefined;

  if (!members.length) return null;

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {activeCount > 0 ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-300">
            <span className="relative inline-flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-600" />
            </span>
            <span className="truncate">Live now</span>
          </div>
          <div className="mt-1 truncate text-base font-bold leading-tight text-red-700 dark:text-red-200">
            {activeCount} playing
          </div>
          <div className="truncate text-[11px] text-red-600/80 dark:text-red-300/80">
            Auto-refreshing
          </div>
        </div>
      ) : (
        <KpiTile
          label="Crew size"
          value={String(members.length)}
          icon={<Users className="h-3.5 w-3.5" />}
        />
      )}
      <KpiTile
        label={
          daysUntil === 0
            ? "Playing today"
            : daysUntil !== null
              ? `Next event · ${daysUntil}d`
              : "Next event"
        }
        value={nextEvent ? nextEvent.name : "None scheduled"}
        icon={<CalendarDays className="h-3.5 w-3.5" />}
        subtitle={nextEvent?.event_date ? fmtDate(nextEvent.event_date) : undefined}
      />
      <KpiTile
        label="Events tracked"
        value={String(inTrip.length)}
        icon={<Trophy className="h-3.5 w-3.5" />}
      />
      <KpiTile
        label="Tee times set"
        value={`${withTeeTimes}/${registered || 0}`}
        icon={<Clock className="h-3.5 w-3.5" />}
        subtitle={
          lastRefresh ? `Synced ${new Date(lastRefresh).toLocaleDateString()}` : "Not synced"
        }
      />
    </div>
  );
}

/* ------------------------------- Events panel ------------------------------ */

function EventsPanel({
  groupId,
  members,
  events,
  teeByKey,
  teesByKey,
  roundsByEvent,
  snapByNum,
  memberById,
  onAdd,
  onImportUrl,
  onRemove,
  onEdit,
  onTeeTime,
}: {
  groupId: string;
  members: TrackerMember[];
  events: TrackerEvent[];
  teeByKey: Map<string, TrackerTeeTime>;
  teesByKey: Map<string, TrackerTeeTime[]>;
  roundsByEvent: Map<string, TrackerEventRound[]>;
  snapByNum: Map<string, MemberSnapshot>;
  memberById: Map<string, TrackerMember>;
  onAdd: (row: {
    group_id: string;
    name: string;
    event_date?: string | null;
    location?: string | null;
    tier?: string | null;
    url?: string | null;
  }) => Promise<void>;
  onImportUrl: (url: string) => Promise<{
    event_ref: string;
    teeTimesAdded: number;
    teeTimesUpdated: number;
    info: { name: string | null };
  }>;
  onRemove: (id: string) => Promise<void>;
  onEdit: (row: {
    id: string;
    name?: string;
    event_date?: string | null;
    location?: string | null;
    tier?: string | null;
    url?: string | null;
  }) => Promise<void>;
  onTeeTime: (row: {
    event_id: string;
    member_id: string;
    tee_time?: string | null;
    division?: string | null;
    notes?: string | null;
  }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", event_date: "", location: "", tier: "", url: "" });
  const [pasteUrl, setPasteUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<string>("all");

  async function add() {
    if (blockedByOffline("Adding an event")) return;
    if (!form.name.trim()) {
      toast.error("Event name required");
      return;
    }
    try {
      await onAdd({
        group_id: groupId,
        name: form.name.trim(),
        event_date: form.event_date || null,
        location: form.location || null,
        tier: form.tier || null,
        url: form.url || null,
      });
      setForm({ name: "", event_date: "", location: "", tier: "", url: "" });
      setOpen(false);
      toast.success("Event added");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function importFromUrl() {
    if (blockedByOffline("Importing an event")) return;
    const url = pasteUrl.trim();
    if (!url) {
      toast.error("Paste a PDGA event URL");
      return;
    }
    setImporting(true);
    try {
      const r = await onImportUrl(url);
      const bits = [`Imported ${r.info.name ?? `event ${r.event_ref}`}`];
      if (r.teeTimesAdded)
        bits.push(`${r.teeTimesAdded} tee time${r.teeTimesAdded === 1 ? "" : "s"}`);
      if (r.teeTimesUpdated) bits.push(`${r.teeTimesUpdated} updated`);
      toast.success(bits.join(" · "));
      setPasteUrl("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  const urlBar = (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-2 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground sm:pl-1">
        <ExternalLink className="h-3.5 w-3.5" /> Paste event URL
      </div>
      <Input
        className="h-8 flex-1"
        placeholder="https://www.pdga.com/tour/event/86677"
        value={pasteUrl}
        onChange={(e) => setPasteUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !importing) void importFromUrl();
        }}
      />
      <Button size="sm" onClick={importFromUrl} disabled={importing || !pasteUrl.trim()}>
        {importing ? "Importing…" : "Import"}
      </Button>
    </div>
  );

  if (!events.length) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4" /> Events
          </CardTitle>
          <AddEventButton
            open={open}
            setOpen={setOpen}
            form={form}
            setForm={setForm}
            onSubmit={add}
          />
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {urlBar}
          <p>
            Paste a PDGA event URL to pull the name, tier, date, and location — or press{" "}
            <b>Sync from PDGA</b> to auto-populate from each player's schedule.
          </p>
        </CardContent>
      </Card>
    );
  }

  const visible = selected === "all" ? events : events.filter((e) => e.id === selected);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Trophy className="h-4 w-4" /> Events ({events.length})
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="h-8 w-full text-xs sm:w-[220px]">
              <SelectValue placeholder="Filter event" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events ({events.length})</SelectItem>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                  {e.event_date
                    ? ` · ${new Date(e.event_date + "T12:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AddEventButton
            open={open}
            setOpen={setOpen}
            form={form}
            setForm={setForm}
            onSubmit={add}
          />
        </div>
      </div>
      {urlBar}
      {visible.map((e) => (
        <EventCard
          key={e.id}
          event={e}
          members={members}
          teeByKey={teeByKey}
          teesByKey={teesByKey}
          rounds={roundsByEvent.get(e.id) ?? []}
          snapByNum={snapByNum}
          memberById={memberById}
          onRemove={onRemove}
          onEdit={onEdit}
          onTeeTime={onTeeTime}
        />
      ))}
    </div>
  );
}

function AddEventButton({
  open,
  setOpen,
  form,
  setForm,
  onSubmit,
}: {
  open: boolean;
  setOpen: (o: boolean) => void;
  form: { name: string; event_date: string; location: string; tier: string; url: string };
  setForm: (v: {
    name: string;
    event_date: string;
    location: string;
    tier: string;
    url: string;
  }) => void;
  onSubmit: () => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1 h-3 w-3" /> Manual event
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add event</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ledgestone Flex - ICC"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input
                type="date"
                value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Tier</Label>
              <Input
                value={form.tier}
                onChange={(e) => setForm({ ...form, tier: e.target.value })}
                placeholder="A-Tier / Flex"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Location</Label>
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Eureka, IL"
            />
          </div>
          <div className="space-y-1">
            <Label>PDGA event URL (optional)</Label>
            <Input
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://www.pdga.com/tour/event/86677"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onSubmit}>Add event</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EventCard({
  event,
  members,
  teeByKey,
  teesByKey,
  rounds,
  snapByNum,
  memberById,
  onRemove,
  onEdit,
  onTeeTime,
}: {
  event: TrackerEvent;
  members: TrackerMember[];
  teeByKey: Map<string, TrackerTeeTime>;
  teesByKey: Map<string, TrackerTeeTime[]>;
  rounds: TrackerEventRound[];
  snapByNum: Map<string, MemberSnapshot>;
  memberById: Map<string, TrackerMember>;
  onRemove: (id: string) => Promise<void>;
  onEdit: (row: {
    id: string;
    name?: string;
    event_date?: string | null;
    location?: string | null;
    tier?: string | null;
    url?: string | null;
  }) => Promise<void>;
  onTeeTime: (row: {
    event_id: string;
    member_id: string;
    tee_time?: string | null;
    division?: string | null;
    notes?: string | null;
  }) => Promise<void>;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: event.name ?? "",
    event_date: event.event_date ?? "",
    location: event.location ?? "",
    tier: event.tier ?? "",
    url: event.url ?? "",
  });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (editOpen) {
      setEditForm({
        name: event.name ?? "",
        event_date: event.event_date ?? "",
        location: event.location ?? "",
        tier: event.tier ?? "",
        url: event.url ?? "",
      });
    }
  }, [editOpen, event.name, event.event_date, event.location, event.tier, event.url]);
  async function saveEdit() {
    if (blockedByOffline("Editing an event")) return;
    if (!editForm.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      await onEdit({
        id: event.id,
        name: editForm.name.trim(),
        event_date: editForm.event_date || null,
        location: editForm.location || null,
        tier: editForm.tier || null,
        url: editForm.url || null,
      });
      toast.success("Event updated");
      setEditOpen(false);
    } catch (e) {
      toast.error((e as Error).message || "Could not update event");
    } finally {
      setSaving(false);
    }
  }
  // Link members to their PDGA event finish for THIS event by strict event_ref.
  // Name/date fallbacks are only used for DISPLAY of finish data on already-registered
  // players — never to decide registration, since substring matches produce false
  // positives (e.g. any "Ledgestone" event matching all Ledgestone series stops).
  function findFinishStrict(pdga: string) {
    const s = snapByNum.get(pdga);
    if (!s || !event.pdga_event_ref) return null;
    return s.finishes.find((f) => f.event_ref === event.pdga_event_ref) ?? null;
  }
  function findFinishLoose(pdga: string) {
    const s = snapByNum.get(pdga);
    if (!s) return null;
    if (event.event_date) {
      const byDate = s.finishes.find(
        (f) =>
          f.event_date === event.event_date &&
          f.event_name
            ?.toLowerCase()
            .includes((event.name || "").split(" ")[0]?.toLowerCase() ?? "___"),
      );
      if (byDate) return byDate;
    }
    return null;
  }

  const allRows = members.map((m) => {
    const tt = teeByKey.get(`${event.id}:${m.id}`);
    const strict = findFinishStrict(m.pdga_number);
    const finish = strict ?? (tt ? findFinishLoose(m.pdga_number) : null);
    return { m, tt, finish, strict, snap: snapByNum.get(m.pdga_number) ?? null };
  });
  // Registration truth: player has a synced tee-time row for this event, or a
  // PDGA finish tied to this event's exact PDGA event_ref. No name-substring
  // guesses — those inflate rosters with unregistered players.
  const filtered = allRows.filter(({ tt, strict }) => !!tt || !!strict);
  // Sort by earliest tee time across all rounds for this event; fall back to name.
  const teeSortKey = (s?: string | null) => {
    if (!s) return Number.POSITIVE_INFINITY;
    const m = /(\d{1,2}):(\d{2})\s*(a|p)?m?/i.exec(s);
    if (!m) return Number.POSITIVE_INFINITY;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ap = m[3]?.toLowerCase();
    if (ap === "p" && h < 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
    return h * 60 + min;
  };
  const earliestTee = (memberId: string) => {
    const list = teesByKey.get(`${event.id}:${memberId}`) ?? [];
    let best = Number.POSITIVE_INFINITY;
    for (const t of list) best = Math.min(best, teeSortKey(t.tee_time));
    return best;
  };
  const rows = [...filtered].sort((a, b) => {
    const ta = earliestTee(a.m.id);
    const tb = earliestTee(b.m.id);
    if (ta !== tb) return ta - tb;
    const na = (a.m.display_name || a.snap?.name || `#${a.m.pdga_number}`).toLocaleLowerCase();
    const nb = (b.m.display_name || b.snap?.name || `#${b.m.pdga_number}`).toLocaleLowerCase();
    return na.localeCompare(nb);
  });

  const eventIsPast = event.event_date
    ? new Date(event.event_date) < new Date(new Date().toDateString())
    : false;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {event.pdga_event_ref ? (
              <Link
                to="/events/pdga/$eventRef"
                params={{ eventRef: event.pdga_event_ref }}
                className="truncate text-sm font-semibold hover:underline"
              >
                {event.name}
              </Link>
            ) : (
              <h3 className="truncate text-sm font-semibold">{event.name}</h3>
            )}
            {event.tier && (
              <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                {event.tier}
              </Badge>
            )}
            {eventIsPast && (
              <Badge className="h-4 gap-0.5 px-1 text-[9px]">
                <Sparkles className="h-2.5 w-2.5" />
                Played
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {fmtDate(event.event_date)}
            </span>
            {event.location && (
              <span className="inline-flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3" />
                {event.location}
              </span>
            )}
            {event.pdga_event_ref && (
              <Link
                to="/events/pdga/$eventRef"
                params={{ eventRef: event.pdga_event_ref }}
                className="inline-flex items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary hover:bg-primary/20"
              >
                <Trophy className="h-3 w-3" /> Details
              </Link>
            )}
            <Link
              to="/tracker/$groupId/event/$eventId"
              params={{ groupId: event.group_id, eventId: event.id }}
              className="inline-flex items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary hover:bg-primary/20"
            >
              <Trophy className="h-3 w-3" /> Results
            </Link>
            <span className="ml-auto">{rows.length} registered</span>
          </div>
          {event.pdga_event_ref ? (
            <PdgaEventLinks
              eventRef={event.pdga_event_ref}
              live={
                !eventIsPast &&
                !!event.event_date &&
                event.event_date === new Date().toISOString().slice(0, 10)
              }
              label={null}
              className="mt-1"
            />
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="Edit event details"
                title="Edit event details"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit event</DialogTitle>
                <DialogDescription>
                  Update the name, date, tier, location, or PDGA link for this tracked event.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={editForm.event_date}
                      onChange={(e) => setEditForm({ ...editForm, event_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Tier</Label>
                    <Input
                      value={editForm.tier}
                      onChange={(e) => setEditForm({ ...editForm, tier: e.target.value })}
                      placeholder="A-Tier / Flex"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Location</Label>
                  <Input
                    value={editForm.location}
                    onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    placeholder="Eureka, IL"
                  />
                </div>
                <div className="space-y-1">
                  <Label>PDGA event URL (optional)</Label>
                  <Input
                    value={editForm.url}
                    onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                    placeholder="https://www.pdga.com/tour/event/86677"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={saveEdit} disabled={saving}>
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onRemove(event.id)}
            aria-label="Remove event"
            title="Remove event"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {rounds.length > 0 &&
        (() => {
          const aggregates = rounds.filter((r) => r.division == null);
          const perDivision = rounds.filter((r) => r.division != null);
          const roundNums = Array.from(new Set(rounds.map((r) => r.round_number))).sort(
            (a, b) => a - b,
          );
          const displayRounds =
            aggregates.length > 0
              ? aggregates
              : roundNums
                  .map((n) => perDivision.find((r) => r.round_number === n)!)
                  .filter(Boolean);
          // Group per-division splits by round for the "pool splits" hint.
          const splitsByRound = new Map<number, typeof perDivision>();
          for (const r of perDivision) {
            const arr = splitsByRound.get(r.round_number) ?? [];
            arr.push(r);
            splitsByRound.set(r.round_number, arr);
          }
          return (
            <div className="space-y-1 border-b bg-muted/10 px-3 py-1.5 text-[10px]">
              <div className="flex flex-wrap items-center gap-1">
                <span className="font-medium uppercase tracking-wide text-muted-foreground">
                  Schedule
                </span>
                {displayRounds.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5"
                  >
                    <span className="font-semibold">R{r.round_number}</span>
                    {r.round_date && (
                      <span className="text-muted-foreground">{fmtDate(r.round_date)}</span>
                    )}
                    {r.course_name && (
                      <span className="truncate max-w-[180px]">{r.course_name}</span>
                    )}
                    {r.course_layout && (
                      <span className="text-muted-foreground">· {r.course_layout}</span>
                    )}
                  </span>
                ))}
              </div>
              {[...splitsByRound.entries()]
                .filter(
                  ([, rs]) =>
                    rs.length > 1 ||
                    (rs[0] &&
                      aggregates.length > 0 &&
                      rs[0].course_name !==
                        aggregates.find((a) => a.round_number === rs[0].round_number)?.course_name),
                )
                .map(([n, rs]) => (
                  <div key={`split-${n}`} className="flex flex-wrap items-center gap-1 pl-1">
                    <span className="text-muted-foreground">R{n} pools:</span>
                    {rs.map((r) => (
                      <span key={r.id} className="rounded border bg-background/60 px-1.5 py-0.5">
                        <span className="font-semibold">{r.division}</span>
                        {r.course_name && (
                          <span className="ml-1 truncate max-w-[140px] inline-block align-bottom">
                            {r.course_name}
                          </span>
                        )}
                        {r.course_layout && (
                          <span className="ml-1 text-muted-foreground">· {r.course_layout}</span>
                        )}
                      </span>
                    ))}
                  </div>
                ))}
            </div>
          );
        })()}

      {rows.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">
          No crew registered yet — sync from PDGA or add a tee time to get started.
        </p>
      ) : (
        <div className="overflow-x-auto divide-y">
          <div className="grid min-w-[560px] grid-cols-[1fr_60px_36px_1.4fr_92px] items-center gap-2 bg-muted/20 px-3 py-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Player</span>
            <span>Div</span>
            <span>Pool</span>
            <span>Rounds · Course · Date · Tee</span>
            <span className="text-right">Result</span>
          </div>

          {rows.map(({ m, tt, finish, snap }) => {
            const name = m.display_name || snap?.name || `#${m.pdga_number}`;
            const playerDiv = tt?.division ?? m.default_division ?? null;
            // Pick pool-aware schedule row per round: exact division match wins,
            // then prefix match (MPO40A ⊇ MPO), else the aggregate row.
            const roundNums = Array.from(new Set(rounds.map((r) => r.round_number))).sort(
              (a, b) => a - b,
            );
            const pickRound = (n: number): TrackerEventRound | null => {
              const candidates = rounds.filter((r) => r.round_number === n);
              if (!candidates.length) return null;
              if (playerDiv) {
                const exact = candidates.find((r) => r.division === playerDiv);
                if (exact) return exact;
                const prefix = candidates.find(
                  (r) =>
                    r.division &&
                    (playerDiv.startsWith(r.division) || r.division.startsWith(playerDiv)),
                );
                if (prefix) return prefix;
              }
              return candidates.find((r) => r.division == null) ?? candidates[0];
            };
            return (
              <div
                key={m.id}
                className="grid min-w-[560px] grid-cols-[1fr_60px_36px_1.4fr_92px] items-start gap-2 px-3 py-1.5 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-7 w-7 shrink-0 rounded-full text-black text-[10px] font-bold grid place-items-center shadow-sm"
                    style={crewSwatchStyle(m.color)}
                  >
                    {name
                      .split(/\s+/)
                      .filter(Boolean)
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <Link
                        to="/tracker/$groupId/player/$memberId"
                        params={{ groupId: m.group_id, memberId: m.id }}
                        className="truncate font-medium text-primary underline-offset-2 hover:underline"
                        title={`View ${name}'s full event details`}
                      >
                        {name}
                      </Link>
                      <ExternalLink className="h-2.5 w-2.5 text-primary/60" />
                      {m.is_you && (
                        <Badge variant="outline" className="h-3.5 px-1 text-[9px]">
                          you
                        </Badge>
                      )}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      #{m.pdga_number}
                      {snap?.current_rating ? ` · ${snap.current_rating}` : ""}
                    </div>
                  </div>
                </div>
                <Input
                  className="h-6 px-1.5 text-[11px]"
                  placeholder="Div"
                  defaultValue={tt?.division ?? m.default_division ?? ""}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    const cur = tt?.division ?? m.default_division ?? "";
                    if (val !== cur)
                      void onTeeTime({
                        event_id: event.id,
                        member_id: m.id,
                        division: val || null,
                        tee_time: tt?.tee_time ?? null,
                        notes: tt?.notes ?? null,
                      });
                  }}
                />
                {(() => {
                  const poolFromDiv =
                    playerDiv && /[A-Z]$/.test(playerDiv) && playerDiv.length > 2
                      ? playerDiv.slice(-1)
                      : null;
                  const poolFromTee = tt?.pool ?? null;
                  const pool = poolFromTee ?? poolFromDiv;
                  return pool ? (
                    <Badge
                      variant="secondary"
                      className="h-5 justify-center px-1 text-[10px] font-semibold"
                    >
                      {pool}
                    </Badge>
                  ) : (
                    <span className="text-center text-[10px] text-muted-foreground">—</span>
                  );
                })()}
                {(() => {
                  const perRoundTees = (teesByKey.get(`${event.id}:${m.id}`) ?? []).filter(
                    (t) => t.round_number != null,
                  );
                  const teeByRound = new Map(perRoundTees.map((t) => [t.round_number, t]));
                  // Show one row per scheduled round; fall back to just tee-times if no round metadata.
                  const roundList =
                    roundNums.length > 0
                      ? roundNums.map((n) => ({ r: pickRound(n), t: teeByRound.get(n) ?? null }))
                      : perRoundTees
                          .sort((a, b) => (a.round_number ?? 0) - (b.round_number ?? 0))
                          .map((t) => ({ r: null as TrackerEventRound | null, t }));

                  if (roundList.length > 0) {
                    return (
                      <Link
                        to="/tracker/$groupId/player/$memberId"
                        params={{ groupId: m.group_id, memberId: m.id }}
                        className="flex flex-col gap-0.5 text-[10px] leading-tight hover:bg-muted/50 rounded px-1 -mx-1"
                      >
                        {roundList.map(({ r, t }, i) => {
                          const roundPool =
                            t?.pool ??
                            (r?.division && /[A-Z]$/.test(r.division) && r.division.length > 2
                              ? r.division.slice(-1)
                              : null);
                          return (
                            <div
                              key={r?.id ?? t?.id ?? i}
                              className="flex flex-wrap items-center gap-x-1.5 gap-y-0"
                            >
                              <span className="font-semibold">
                                R{r?.round_number ?? t?.round_number}
                              </span>
                              {roundPool && (
                                <Badge
                                  variant="outline"
                                  className="h-3.5 px-1 text-[9px] font-semibold"
                                >
                                  Pool {roundPool}
                                </Badge>
                              )}
                              {r?.round_date && (
                                <span className="text-muted-foreground">
                                  {fmtDate(r.round_date)}
                                </span>
                              )}
                              {r?.course_name && (
                                <span className="truncate max-w-[160px]">{r.course_name}</span>
                              )}
                              {r?.course_layout && (
                                <span className="text-muted-foreground">· {r.course_layout}</span>
                              )}
                              {t?.tee_time ? (
                                <span className="font-semibold text-primary">
                                  {formatTeeTime(t.tee_time)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground italic">tee TBD</span>
                              )}
                              {t?.starting_hole && (
                                <span className="text-muted-foreground">H{t.starting_hole}</span>
                              )}
                            </div>
                          );
                        })}
                      </Link>
                    );
                  }
                  return (
                    <Input
                      className="h-6 px-1.5 text-[11px]"
                      placeholder="Tee time —"
                      defaultValue={tt?.tee_time ?? ""}
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val !== (tt?.tee_time ?? ""))
                          void onTeeTime({
                            event_id: event.id,
                            member_id: m.id,
                            tee_time: val || null,
                            division: tt?.division ?? m.default_division ?? null,
                            notes: tt?.notes ?? null,
                          });
                      }}
                    />
                  );
                })()}

                <div className="text-right text-[11px]">
                  {finish ? (
                    <div className="flex flex-col items-end leading-tight">
                      <span className="font-semibold">
                        {finish.place != null ? `#${finish.place}` : "Reg"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {finish.division ?? ""}
                        {finish.points != null ? ` · ${finish.points}pt` : ""}
                      </span>
                    </div>
                  ) : eventIsPast ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <TrendingDown className="h-3 w-3" />
                      Pending
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Upcoming
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <LiveScoringPanel
        eventId={event.id}
        eventDate={event.event_date ?? null}
        pdgaEventRef={event.pdga_event_ref}
        liveScoringUrl={event.live_scoring_url ?? null}
        liveLastSyncedAt={event.live_last_synced_at ?? null}
        liveCurrentRound={event.live_current_round ?? null}
        members={members}
      />
    </Card>
  );
}

/* --------------------------- Invite crew member --------------------------- */
function InviteToAppButton({
  pdgaNumber,
  displayName,
  triggerLabel,
}: {
  pdgaNumber: string;
  displayName: string;
  triggerLabel?: string;
}) {
  const invite = useServerFn(addPdgaFriend);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setLink(null);
    setStatus(null);
    setOpen(true);
    try {
      const r = (await invite({ data: { pdgaNumber } })) as {
        kind: string;
        invite?: { invite_token: string };
      };
      if (r.kind === "invite_created" && r.invite?.invite_token) {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        setLink(`${origin}/invite/pdga/${r.invite.invite_token}`);
        setStatus("Invite ready to share");
      } else if (r.kind === "friend_request_sent") {
        setStatus("They're already on DG Dashboard — friend request sent.");
      } else if (r.kind === "already_related") {
        setStatus("You're already connected with this player.");
      } else if (r.kind === "self") {
        setStatus("That's your own PDGA number.");
      } else {
        setStatus("Invite created.");
      }
    } catch (e) {
      toast.error("Invite failed", { description: (e as Error).message });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  return (
    <>
      {triggerLabel ? (
        <Button size="sm" onClick={run} disabled={busy}>
          <Send className="mr-1 h-3 w-3" />
          {triggerLabel}
        </Button>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={run}
          disabled={busy}
          aria-label={`Invite ${displayName} to DG Dashboard`}
          title={`Invite ${displayName} to DG Dashboard`}
        >
          <Send className="h-3 w-3" />
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite {displayName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {busy && <p className="text-muted-foreground">Preparing invite…</p>}
            {status && <p>{status}</p>}
            {link && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Share this link so they can see the crew's schedule and their PDGA stats:
                </p>
                <div className="flex items-center gap-2">
                  <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
                  <Button size="sm" variant="secondary" onClick={copy}>
                    <Copy className="mr-1 h-3 w-3" />
                    Copy
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <a href={`sms:?&body=${encodeURIComponent(`Join me on DG Dashboard: ${link}`)}`}>
                    <Button size="sm" variant="outline">
                      Text
                    </Button>
                  </a>
                  <a
                    href={`mailto:?subject=${encodeURIComponent("Join me on DG Dashboard")}&body=${encodeURIComponent(link)}`}
                  >
                    <Button size="sm" variant="outline">
                      Email
                    </Button>
                  </a>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------- Seed from DG Dashboard friends ------------------------- */

function SeedFromFriendsButton({
  groupId,
  onSeeded,
}: {
  groupId: string;
  onSeeded: () => Promise<void> | void;
}) {
  const seed = useServerFn(seedTrackerFromFriends);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const r = (await seed({ data: { group_id: groupId } })) as {
        added: number;
        skipped: number;
        missing_pdga: number;
      };
      if (r.added === 0 && r.skipped === 0 && r.missing_pdga === 0) {
        toast("No DG Dashboard friends yet", {
          description: "Add friends first to seed this crew in one tap.",
        });
      } else {
        const bits: string[] = [];
        if (r.added) bits.push(`${r.added} added`);
        if (r.skipped) bits.push(`${r.skipped} already on roster`);
        if (r.missing_pdga) bits.push(`${r.missing_pdga} without PDGA #`);
        toast.success("Seeded from friends", { description: bits.join(" · ") });
      }
      await onSeeded();
    } catch (e) {
      toast.error("Couldn't seed crew", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={run} disabled={busy}>
      <Users className="mr-1.5 h-3.5 w-3.5" />
      {busy ? "Seeding…" : "Import from friends"}
    </Button>
  );
}

function LatestResultsWidget({
  groupId,
  members,
  snapByNum,
  liveScoreRows,
  eventById,
}: {
  groupId: string;
  members: TrackerMember[];
  snapByNum: Map<string, MemberSnapshot>;
  liveScoreRows: TrackerLiveScoreRow[];
  eventById: Map<string, TrackerEvent>;
}) {
  // Rank events with posted scores first (newest played date wins), so the
  // default pick is the freshest event that actually has results. Upcoming
  // events with only placeholder rows fall to the bottom of the picker.
  const eventOptions = useMemo(() => {
    const latest = new Map<string, { last: string; hasCompleted: boolean; hasScores: boolean }>();
    for (const s of liveScoreRows) {
      const stamp = s.last_synced_at ?? "";
      const scored =
        (s.round_score ?? 0) > 0 ||
        (Array.isArray(s.hole_scores) && s.hole_scores.some((n) => (n ?? 0) > 0));
      const cur = latest.get(s.event_id);
      if (!cur) {
        latest.set(s.event_id, { last: stamp, hasCompleted: !!s.completed, hasScores: scored });
      } else {
        cur.hasCompleted = cur.hasCompleted || !!s.completed;
        cur.hasScores = cur.hasScores || scored;
        if (stamp > cur.last) cur.last = stamp;
      }
    }
    return Array.from(latest.entries())
      .map(([id, v]) => {
        const ev = eventById.get(id);
        return {
          id,
          last: v.last,
          hasCompleted: v.hasCompleted,
          hasScores: v.hasScores,
          ev,
          date: ev?.event_date ?? "",
        };
      })
      .sort((a, b) => {
        // Events with posted scores first, then most recently played.
        if (a.hasScores !== b.hasScores) return a.hasScores ? -1 : 1;
        if (a.date !== b.date) return (b.date || "").localeCompare(a.date || "");
        return b.last.localeCompare(a.last);
      });
  }, [liveScoreRows, eventById]);

  const defaultEventId = eventOptions[0]?.id ?? null;

  const [pickedEventId, setPickedEventId] = useState<string | null>(null);
  const selectedEventId =
    pickedEventId && eventOptions.some((o) => o.id === pickedEventId)
      ? pickedEventId
      : defaultEventId;

  if (eventOptions.length === 0 || !selectedEventId) return null;

  const ev = eventById.get(selectedEventId);
  const evScores = liveScoreRows.filter((s) => s.event_id === selectedEventId);
  const ratings: Record<string, number | null> = {};
  for (const m of members) {
    const snap = snapByNum.get(m.pdga_number);
    ratings[m.pdga_number] = snap?.current_rating ?? null;
  }

  return (
    <div className="space-y-2">
      {eventOptions.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Event</span>
          <Select value={selectedEventId} onValueChange={(v) => setPickedEventId(v)}>
            <SelectTrigger className="h-8 w-full max-w-xs text-sm">
              <SelectValue placeholder="Choose an event" />
            </SelectTrigger>
            <SelectContent>
              {eventOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.ev?.name ?? "Untitled event"}
                  {!opt.hasScores ? " · no scores yet" : !opt.hasCompleted ? " · in progress" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <EventResultsBoard
        groupId={groupId}
        members={members}
        scores={evScores}
        ratings={ratings}
        title="Latest results"
        eventName={ev?.name}
        href={
          ev
            ? {
                to: "/tracker/$groupId/event/$eventId",
                params: { groupId, eventId: selectedEventId },
              }
            : undefined
        }
      />
      <HoleByHoleCard members={members} scores={evScores} title="Hole-by-hole" />
    </div>
  );
}
