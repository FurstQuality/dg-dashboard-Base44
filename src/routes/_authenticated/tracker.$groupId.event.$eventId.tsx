import { eventLifecycle } from "@/lib/tracker/event-lifecycle";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  Save,
  Trophy,
  Sparkles,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTrackerEventResults, postEventResults } from "@/lib/tracker.functions";
import { refreshTrackerEventLive } from "@/lib/tracker-live.functions";
import { RouteErrorBoundary, RouteNotFound } from "@/components/route-boundaries";
import { crewSwatchStyle } from "@/lib/tracker-colors";
import { EventWeather } from "@/components/event-weather";
import { EventResultsBoard } from "@/components/tracker/event-results-board";
import { HoleByHoleCard } from "@/components/tracker/hole-by-hole-card";
import { FieldLeaderboard } from "@/components/tracker/field-leaderboard";
import { FieldAnalysisCard } from "@/components/tracker/field-analysis-card";
import {
  EventDetailsCard,
  type TrackedEventDetails,
  type TrackedEventRound,
} from "@/components/tracker/event-details-card";
import {
  EventUpdatesCard,
  type TrackedEventUpdate,
} from "@/components/tracker/event-updates-card";
import { buildFieldSnapshot, myDivision } from "@/lib/event-field-analysis";
import { PageShell } from "@/components/shell/page-shell";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TRACKER_STALE, trackerKeys } from "@/lib/tracker-queries";
import { TrackerErrorState, TrackerPageSkeleton } from "@/components/tracker/tracker-states";
import { blockedByOffline } from "@/lib/tracker-offline-guard";
import { ShareToFeedButton } from "@/components/feed/share-to-feed-button";
import { eventResultsDraft } from "@/lib/share-to-feed";

export const Route = createFileRoute("/_authenticated/tracker/$groupId/event/$eventId")({
  component: EventResultsPage,
  errorComponent: RouteErrorBoundary,
  notFoundComponent: () => <RouteNotFound label="This event" />,
  head: () => ({
    meta: [
      { title: "Event results · Tournament Tracker · DG Dashboard" },
      {
        name: "description",
        content: "Post and review results for a tracked event across your crew.",
      },
      { property: "og:title", content: "Event results · Tournament Tracker · DG Dashboard" },
      {
        property: "og:description",
        content: "Post and review results for a tracked event across your crew.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Row = {
  member_id: string;
  division: string;
  score: string;
  to_par: string;
  round_rating: string;
};

function fmtDate(d?: string | null) {
  if (!d) return "TBD";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function EventResultsPage() {
  const { groupId, eventId } = Route.useParams();
  const load = useServerFn(getTrackerEventResults);
  const save = useServerFn(postEventResults);
  const syncLive = useServerFn(refreshTrackerEventLive);
  const queryClient = useQueryClient();

  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [autoSynced, setAutoSynced] = useState(false);
  const [round, setRound] = useState(1);
  const [courseName, setCourseName] = useState("");
  const [courseLayout, setCourseLayout] = useState("");
  const [rows, setRows] = useState<Record<string, Row>>({});

  const query = useQuery({
    queryKey: trackerKeys.eventResults(groupId, eventId),
    staleTime: TRACKER_STALE.eventResults,
    queryFn: () => load({ data: { event_id: eventId } }),
  });
  const bundle = (query.data ?? null) as Awaited<ReturnType<typeof load>> | null;

  const refresh = useCallback(async () => {
    // The crew page reads the same live scores, so keep both views in step.
    void queryClient.invalidateQueries({ queryKey: trackerKeys.group(groupId) });
    const res = await query.refetch();
    return res.data ?? null;
  }, [groupId, query, queryClient]);

  const runSync = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      setSyncing(true);
      try {
        const res = await syncLive({ data: { eventId } });
        if (!opts.silent) {
          if (res.state === "updated") {
            toast.success("Updated from PDGA", {
              description: res.players
                ? `${res.players} player-round${res.players === 1 ? "" : "s"} across ${res.divisions} division${res.divisions === 1 ? "" : "s"}.`
                : "PDGA hasn't posted scores yet.",
            });
          } else if (res.state === "unchanged") {
            toast("Nothing changed", { description: "PDGA has nothing new since the last check." });
          } else if (res.state === "syncing") {
            // Another follower's PDGA check is running: wait in line and pick
            // up their result instead of fetching PDGA twice.
            const id = `sync-queue-${eventId}`;
            const tries = 6;
            let done = false;
            for (let i = 1; i <= tries && !done; i++) {
              toast.loading(`Queued — waiting for PDGA check (${i}/${tries})`, {
                id,
                description: "Someone else following this event started a check. We'll use their results.",
              });
              await new Promise((r) => setTimeout(r, 5000));
              const next = await syncLive({ data: { eventId } });
              if (next.state !== "syncing") {
                done = true;
                if (next.state === "could_not_sync")
                  toast.error("Could not sync", { id, description: "PDGA isn't responding. We'll try again automatically." });
                else toast.success(next.state === "updated" ? "Updated from PDGA" : "Nothing changed", { id, description: undefined });
              }
            }
            if (!done) toast("Still checking", { id, description: "PDGA is slow right now. Results will show here when they land." });
          } else {
            toast.error("Could not sync", { description: "PDGA isn't responding. We'll try again automatically." });
          }
        }
        await refresh();
      } catch (e) {
        if (!opts.silent) toast.error(e instanceof Error ? e.message : "Couldn't sync from PDGA");
      } finally {
        setSyncing(false);
      }
    },
    [eventId, refresh, syncLive],
  );

  // Auto-sync from PDGA once on mount when the event is linked to a PDGA id.
  useEffect(() => {
    if (!bundle || autoSynced) return;
    const ev = bundle.event as { pdga_event_ref?: string | null; live_scoring_url?: string | null };
    if (!ev.pdga_event_ref && !ev.live_scoring_url) return;
    setAutoSynced(true);
    void runSync({ silent: true });
  }, [bundle, autoSynced, runSync]);

  // Available round numbers (default: [1]).
  const availableRounds = useMemo(() => {
    if (!bundle) return [1];
    const nums = new Set<number>([1]);
    for (const r of bundle.rounds) nums.add(r.round_number);
    for (const s of bundle.scores) if (s.round_number) nums.add(s.round_number);
    return Array.from(nums).sort((a, b) => a - b);
  }, [bundle]);

  // Rehydrate the editable rows whenever the active round or bundle changes so
  // existing results appear pre-filled.
  useEffect(() => {
    if (!bundle) return;
    const scoreByMember = new Map<string, (typeof bundle.scores)[number]>();
    for (const s of bundle.scores) {
      if (s.round_number !== round) continue;
      // Prefer member_id match; fall back to pdga_number.
      const memberId =
        s.member_id ?? bundle.members.find((m) => m.pdga_number === s.pdga_number)?.id;
      if (memberId) scoreByMember.set(memberId, s);
    }
    const next: Record<string, Row> = {};
    for (const m of bundle.members) {
      const s = scoreByMember.get(m.id);
      next[m.id] = {
        member_id: m.id,
        division: (s?.division ?? m.default_division ?? "") as string,
        // Round fields only — never the cumulative event total.
        score: s?.round_score != null ? String(s.round_score) : "",
        to_par: s?.round_to_par != null ? String(s.round_to_par) : "",
        round_rating: "",
      };
    }
    setRows(next);
    // Seed course meta from the schedule row if present.
    const sched =
      bundle.rounds.find((r) => r.round_number === round && r.division == null) ??
      bundle.rounds.find((r) => r.round_number === round);
    setCourseName(sched?.course_name ?? bundle.event.location ?? "");
    setCourseLayout(sched?.course_layout ?? "");
  }, [bundle, round]);

  async function onSave() {
    if (!bundle) return;
    if (blockedByOffline("Posting results")) return;
    const payload = Object.values(rows)
      .map((r) => ({
        member_id: r.member_id,
        division: r.division.trim() || null,
        score: r.score.trim() ? Number(r.score) : null,
        to_par: r.to_par.trim() ? Number(r.to_par) : null,
        round_rating: r.round_rating.trim() ? Number(r.round_rating) : null,
      }))
      .filter((r) => r.score != null || r.to_par != null || r.round_rating != null);
    if (payload.length === 0) {
      toast.error("Enter at least one player's score.");
      return;
    }
    setSaving(true);
    try {
      const r = await save({
        data: {
          event_id: eventId,
          round_number: round,
          course_name: courseName.trim() || null,
          course_layout: courseLayout.trim() || null,
          rows: payload,
        },
      });
      const res = r as { written?: number; skipped_official?: number };
      toast.success(
        res.skipped_official
          ? `Saved ${res.written ?? 0}. ${res.skipped_official} already have official results, so they weren't changed.`
          : "Your round notes are saved.",
      );
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your round notes.");
    } finally {
      setSaving(false);
    }
  }

  if (query.isPending && !bundle) {
    return (
      <PageShell>
        <TrackerPageSkeleton label="Loading this event…" />
      </PageShell>
    );
  }

  if (!bundle) {
    return (
      <PageShell>
        <TrackerErrorState
          title="We couldn't load this event"
          message={
            query.error instanceof Error
              ? query.error.message
              : "The event results didn't come through. Try again."
          }
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </PageShell>
    );
  }

  const { event, members, scores } = bundle;
  const ratings = (bundle as { ratings?: Record<string, number | null> }).ratings ?? {};

  // Whole-field view: the sync stores every player in every division, so the
  // page can rank you against the entire event, not just your crew.
  const myPdga = (bundle as { myPdga?: string | null }).myPdga ?? null;
  const fieldSnapshot = buildFieldSnapshot({
    scores: scores as unknown as Parameters<typeof buildFieldSnapshot>[0]["scores"],
    members: members as unknown as Parameters<typeof buildFieldSnapshot>[0]["members"],
    ratings,
    myPdga,
  });
  const myFieldDivision = myDivision(fieldSnapshot, myPdga);
  const hasField = fieldSnapshot.totalPlayers > 0;
  const lifecycle = eventLifecycle({
    eventDate: event.event_date ?? null,
    endDate: (event as { end_date?: string | null }).end_date ?? null,
    eventStatus: (event as { event_status?: string | null }).event_status ?? null,
    registrationStatus:
      (event as { registration_status?: string | null }).registration_status ?? null,
    roundsPlanned: (event as { rounds_planned?: number | null }).rounds_planned ?? null,
    fieldCount: Math.max(
      fieldSnapshot.totalPlayers,
      (event as { field_size?: number | null }).field_size ?? 0,
    ),
    scores: scores as unknown as Parameters<typeof eventLifecycle>[0]["scores"],
  });

  // Top finishers for a feed share. Uses only posted/synced standings; players
  // without a place are excluded rather than guessed at.
  const memberName = new Map(
    (members as Array<{ id: string; pdga_number: string; display_name: string | null }>).map(
      (m) => [m.pdga_number, m.display_name ?? `#${m.pdga_number}`] as const,
    ),
  );
  // Change-log rows reference crew member ids; show a name instead.
  const updateMemberNames: Record<string, string> = {};
  for (const m of members as Array<{
    id: string;
    pdga_number: string;
    display_name: string | null;
  }>) {
    updateMemberNames[m.id] = m.display_name ?? `#${m.pdga_number}`;
  }
  const standingsByPlayer = (
    scores as Array<{
      pdga_number: string;
      division: string | null;
      running_place: number | null;
      place: number | null;
      to_par: number | null;
      total: number | null;
    }>
  )
    .filter((s) => (s.running_place ?? s.place) != null)
    .reduce<
      Map<
        string,
        { position: number | null; name: string; total: string | null; division: string | null }
      >
    >((acc, s) => {
      const position = s.running_place ?? s.place ?? null;
      acc.set(s.pdga_number, {
        position,
        name: memberName.get(s.pdga_number) ?? `#${s.pdga_number}`,
        total:
          s.to_par == null
            ? s.total == null
              ? null
              : String(s.total)
            : s.to_par === 0
              ? "E"
              : s.to_par > 0
                ? `+${s.to_par}`
                : String(s.to_par),
        division: s.division ?? null,
      });
      return acc;
    }, new Map());
  const shareStandings = Array.from(standingsByPlayer.values()).sort(
    (a, b) => (a.position ?? 999) - (b.position ?? 999),
  );

  return (
    <PageShell>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Link
            to="/tracker/$groupId"
            params={{ groupId }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{event.name}</h1>
              <Badge
                variant={lifecycle.state === "LIVE" ? "default" : "outline"}
                className="gap-1"
              >
                {lifecycle.label}
              </Badge>
              {event.tier && <Badge variant="secondary">{event.tier}</Badge>}
              {event.event_classification === "flex" && (
                <Badge className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  Flex
                </Badge>
              )}
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {fmtDate(event.event_date)}
              </span>
              {event.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {event.location}
                </span>
              )}
              {event.url && (
                <a
                  href={event.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Source <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </p>
          </div>
        </div>
        {(event.pdga_event_ref || event.live_scoring_url) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runSync()}
            disabled={syncing}
            className="gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync from PDGA"}
          </Button>
        )}
        {shareStandings.length > 0 && (
          <ShareToFeedButton
            variant="outline"
            size="sm"
            label="Share results"
            title={`Share ${event.name} results`}
            draft={() =>
              eventResultsDraft({
                eventName: event.name,
                divisionCode: shareStandings[0]?.division ?? null,
                standings: shareStandings,
              })
            }
          />
        )}
      </div>

      {lifecycle.pending.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Not published yet">
          {lifecycle.pending.map((p) => (
            <span
              key={p}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
            >
              {p}
            </span>
          ))}
        </div>
      )}

      <EventDetailsCard
        event={event as unknown as TrackedEventDetails}
        rounds={bundle.rounds as unknown as TrackedEventRound[]}
        fieldObserved={fieldSnapshot.totalPlayers}
      />

      <EventWeather location={event.location ?? null} date={event.event_date ?? null} />

      <EventResultsBoard
        groupId={groupId}
        members={members}
        scores={scores as unknown as import("@/lib/tracker.functions").TrackerLiveScoreRow[]}
        ratings={ratings}
        title="Your crew"
      />

      {hasField && lifecycle.hasStandings && (
        <FieldAnalysisCard
          snapshot={fieldSnapshot}
          pdgaNumber={myPdga}
          rating={myPdga ? (ratings[myPdga] ?? null) : null}
          plannedRounds={fieldSnapshot.rounds.length ? Math.max(...fieldSnapshot.rounds) : 1}
        />
      )}

      {hasField && <FieldLeaderboard snapshot={fieldSnapshot} defaultDivision={myFieldDivision} />}

      <HoleByHoleCard
        members={members}
        scores={scores as unknown as import("@/lib/tracker.functions").TrackerLiveScoreRow[]}
        title="Hole-by-hole scorecard"
      />

      <EventUpdatesCard
        updates={((bundle as { updates?: TrackedEventUpdate[] }).updates ?? []) as TrackedEventUpdate[]}
        memberNames={updateMemberNames}
      />


      {/* Post results */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your round notes (unofficial)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Enter strokes for this one round while you wait for official results. Notes are private
            to this tracker, never replace official PDGA scores, and don't add rounds to your
            Statboard — official results arrive there through your PDGA import.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <Label className="text-xs">Round</Label>
              <Tabs
                value={String(round)}
                onValueChange={(v) => setRound(Number(v))}
                className="mt-1"
              >
                <TabsList>
                  {availableRounds.map((n) => (
                    <TabsTrigger key={n} value={String(n)}>
                      R{n}
                    </TabsTrigger>
                  ))}
                  {!availableRounds.includes(Math.max(...availableRounds) + 1) && (
                    <TabsTrigger value={String(Math.max(...availableRounds) + 1)}>
                      + Round
                    </TabsTrigger>
                  )}
                </TabsList>
              </Tabs>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="course-name" className="text-xs">
                Course
              </Label>
              <Input
                id="course-name"
                className="h-8 w-56"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="Eureka Temp"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="course-layout" className="text-xs">
                Layout
              </Label>
              <Input
                id="course-layout"
                className="h-8 w-40"
                value={courseLayout}
                onChange={(e) => setCourseLayout(e.target.value)}
                placeholder="Blue tees"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-md border">
            <div className="hidden grid-cols-[1.6fr_70px_80px_80px_80px] gap-2 bg-muted/30 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Player</span>
              <span>Div</span>
              <span className="text-right">Strokes</span>
              <span className="text-right">To par</span>
              <span className="text-right">Rating</span>
            </div>
            {members.map((m) => {
              const row = rows[m.id];
              if (!row) return null;
              const name = m.display_name || `#${m.pdga_number}`;
              const initials = name
                .split(/\s+/)
                .filter(Boolean)
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
              const set = (patch: Partial<Row>) =>
                setRows((r) => ({ ...r, [m.id]: { ...row, ...patch } }));
              return (
                <div
                  key={m.id}
                  className="border-t px-3 py-2.5 text-sm sm:grid sm:grid-cols-[1.6fr_70px_80px_80px_80px] sm:items-center sm:gap-2 sm:py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-black"
                      style={crewSwatchStyle(m.color)}
                    >
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {name}
                        {m.is_you && (
                          <Badge variant="outline" className="ml-1 h-4 px-1 text-[9px]">
                            you
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">#{m.pdga_number}</div>
                    </div>
                  </div>
                  {/* Mobile: labelled 2x2 field block. Desktop keeps the inline columns. */}
                  <div className="mt-2 grid grid-cols-4 gap-2 sm:hidden">
                    <MobileField
                      label="Div"
                      value={row.division}
                      onChange={(v) => set({ division: v })}
                    />
                    <MobileField
                      label="Strokes"
                      numeric
                      value={row.score}
                      onChange={(v) => set({ score: v })}
                    />
                    <MobileField
                      label="To par"
                      numeric
                      value={row.to_par}
                      onChange={(v) => set({ to_par: v })}
                    />
                    <MobileField
                      label="Rating"
                      numeric
                      value={row.round_rating}
                      onChange={(v) => set({ round_rating: v })}
                    />
                  </div>
                  <Input
                    aria-label={`${name} division`}
                    className="hidden h-8 px-2 text-xs sm:block"
                    value={row.division}
                    onChange={(e) => set({ division: e.target.value })}
                  />
                  <Input
                    aria-label={`${name} strokes`}
                    className="hidden h-8 px-2 text-right text-sm tabular-nums sm:block"
                    inputMode="numeric"
                    placeholder="—"
                    value={row.score}
                    onChange={(e) => set({ score: e.target.value })}
                  />
                  <Input
                    aria-label={`${name} to par`}
                    className="hidden h-8 px-2 text-right text-sm tabular-nums sm:block"
                    inputMode="numeric"
                    placeholder="+/–"
                    value={row.to_par}
                    onChange={(e) => set({ to_par: e.target.value })}
                  />
                  <Input
                    aria-label={`${name} round rating`}
                    className="hidden h-8 px-2 text-right text-sm tabular-nums sm:block"
                    inputMode="numeric"
                    placeholder="rating"
                    value={row.round_rating}
                    onChange={(e) => set({ round_rating: e.target.value })}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <Button onClick={onSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save round notes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function MobileField({
  label,
  value,
  onChange,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Input
        className="h-9 px-2 text-center text-sm tabular-nums"
        inputMode={numeric ? "numeric" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
