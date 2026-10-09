import { formatToPar as fmtToPar } from "@/lib/score-display";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  Trophy,
  Star,
  Clock,
  ExternalLink,
  Link as LinkIcon,
  Users,
} from "lucide-react";
import {
  getTrackerGroup,
  type TrackerLiveScoreRow,
  type TrackerEvent,
} from "@/lib/tracker.functions";
import { HoleByHoleCard } from "@/components/tracker/hole-by-hole-card";
import { crewSwatchStyle } from "@/lib/tracker-colors";
import { formatTeeTime } from "@/lib/tee-time";
import { RouteErrorBoundary, RouteNotFound } from "@/components/route-boundaries";
import { PdgaPlayerLinks } from "@/components/shared/pdga-links";
import { PageShell } from "@/components/shell/page-shell";
import { useQuery } from "@tanstack/react-query";
import { TRACKER_STALE, trackerKeys } from "@/lib/tracker-queries";
import { TrackerErrorState, TrackerPageSkeleton } from "@/components/tracker/tracker-states";

export const Route = createFileRoute("/_authenticated/tracker/$groupId/player/$memberId")({
  component: PlayerDetail,
  errorComponent: RouteErrorBoundary,
  notFoundComponent: () => <RouteNotFound label="This player" />,
  head: () => ({
    meta: [
      { title: "Player schedule · Tournament Tracker · DG Dashboard" },
      {
        name: "description",
        content:
          "See every event a crew member is registered for, tee times, divisions, and PDGA data sources.",
      },
      { property: "og:title", content: "Player schedule · Tournament Tracker · DG Dashboard" },
      {
        property: "og:description",
        content: "Full event schedule with data source attribution for each crew member.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function fmtDate(d?: string | null) {
  if (!d) return "TBD";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PlayerDetail() {
  const { groupId, memberId } = Route.useParams();
  const get = useServerFn(getTrackerGroup);
  type Bundle = NonNullable<Awaited<ReturnType<typeof getTrackerGroup>>>;

  // Shares the crew page's cached payload, so arriving from the crew view is instant.
  const query = useQuery({
    queryKey: trackerKeys.group(groupId),
    staleTime: TRACKER_STALE.group,
    queryFn: () => get({ data: { id: groupId } }),
  });
  const bundle = (query.data ?? null) as Bundle | null;

  const member = useMemo(
    () => bundle?.members.find((m) => m.id === memberId) ?? null,
    [bundle, memberId],
  );
  const snap = useMemo(() => {
    if (!bundle || !member) return null;
    return bundle.snapshots.find((s) => s.pdga_number === member.pdga_number) ?? null;
  }, [bundle, member]);

  if (query.isPending && !bundle) {
    return (
      <PageShell>
        <TrackerPageSkeleton label="Loading this player…" />
      </PageShell>
    );
  }
  if (!bundle) {
    return (
      <PageShell>
        <TrackerErrorState
          title="We couldn't load this player"
          message={
            query.error instanceof Error
              ? query.error.message
              : "The crew details didn't come through. Try again."
          }
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </PageShell>
    );
  }
  if (!member) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <Link
          to="/tracker/$groupId"
          params={{ groupId }}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to crew
        </Link>
        <p className="mt-4 text-sm text-muted-foreground">Player not found in this crew.</p>
      </div>
    );
  }

  const { events, teeTimes, eventRounds, group } = bundle;
  const myTeeTimes = teeTimes.filter((t) => t.member_id === memberId);
  const eventIdsPlaying = new Set(myTeeTimes.map((t) => t.event_id));

  // Also include events where the player has a PDGA finish (played events).
  const finishByRef = new Map((snap?.finishes ?? []).map((f) => [f.event_ref, f] as const));
  for (const e of events) {
    if (e.pdga_event_ref && finishByRef.has(e.pdga_event_ref)) eventIdsPlaying.add(e.id);
  }

  const playing = events
    .filter((e) => eventIdsPlaying.has(e.id))
    .sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? ""));

  const name = member.display_name || snap?.name || `PDGA #${member.pdga_number}`;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <PageShell>
      <div className="flex items-center gap-3">
        <Link
          to="/tracker/$groupId"
          params={{ groupId }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-8 w-8 shrink-0 rounded-full grid place-items-center text-white text-xs font-semibold"
              style={{ background: member.color ?? "#64748b" }}
            >
              {name
                .split(/\s+/)
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <h1 className="truncate text-xl font-semibold">{name}</h1>
            {member.is_you && (
              <Badge variant="outline" className="text-[10px]">
                you
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              Crew:{" "}
              <Link to="/tracker/$groupId" params={{ groupId }} className="hover:underline">
                {group.name}
              </Link>
            </span>
            <span>PDGA #{member.pdga_number}</span>
            {member.default_division && <span>Div: {member.default_division}</span>}
            {snap?.current_rating && (
              <span className="inline-flex items-center gap-0.5">
                <Star className="h-3 w-3" />
                {snap.current_rating}
              </span>
            )}
          </div>
          <PdgaPlayerLinks pdgaNumber={member.pdga_number} className="mt-1" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Kpi label="Events registered" value={String(playing.length)} />
        <Kpi
          label="Upcoming"
          value={String(playing.filter((e) => e.event_date && e.event_date >= today).length)}
        />
        <Kpi label="PDGA finishes" value={String(snap?.finishes.length ?? 0)} />
        <Kpi
          label="Last synced"
          value={snap?.refreshed_at ? new Date(snap.refreshed_at).toLocaleDateString() : "—"}
        />
      </div>

      <PlayerRoundResults
        member={member}
        events={events}
        liveScores={(bundle as unknown as { liveScores?: TrackerLiveScoreRow[] }).liveScores ?? []}
        eventRounds={eventRounds}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4" /> Events this player is registered for ({playing.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {playing.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No registrations tracked yet. Press <b>Sync from PDGA</b> on the crew page, or import
              a specific event by URL.
            </p>
          ) : (
            playing.map((e) => {
              const tees = myTeeTimes
                .filter((t) => t.event_id === e.id)
                .sort((a, b) => (a.round_number ?? 0) - (b.round_number ?? 0));
              const allRounds = eventRounds.filter((r) => r.event_id === e.id);
              const primaryTee = tees.find((t) => t.round_number == null) ?? tees[0] ?? null;
              const playerDiv = primaryTee?.division ?? member.default_division ?? null;
              // Pool-aware round pick: exact division match > prefix > aggregate (null).
              const roundNumsSorted = Array.from(
                new Set(allRounds.map((r) => r.round_number)),
              ).sort((a, b) => a - b);
              const rounds = roundNumsSorted
                .map((n) => {
                  const cands = allRounds.filter((r) => r.round_number === n);
                  if (playerDiv) {
                    const exact = cands.find((r) => r.division === playerDiv);
                    if (exact) return exact;
                    const pref = cands.find(
                      (r) =>
                        r.division &&
                        (playerDiv.startsWith(r.division) || r.division.startsWith(playerDiv)),
                    );
                    if (pref) return pref;
                  }
                  return cands.find((r) => r.division == null) ?? cands[0];
                })
                .filter((r): r is NonNullable<typeof r> => !!r);
              const finish = e.pdga_event_ref ? (finishByRef.get(e.pdga_event_ref) ?? null) : null;
              const source = e.pdga_event_ref
                ? e.url
                  ? "PDGA event URL"
                  : "PDGA sync (player schedule)"
                : "Manually added";
              const isPast = e.event_date ? e.event_date < today : false;

              return (
                <div key={e.id} className="rounded-md border">
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {e.pdga_event_ref ? (
                          <Link
                            to="/events/pdga/$eventRef"
                            params={{ eventRef: e.pdga_event_ref }}
                            className="truncate text-sm font-semibold hover:underline"
                          >
                            {e.name}
                          </Link>
                        ) : (
                          <span className="truncate text-sm font-semibold">{e.name}</span>
                        )}
                        {e.tier && (
                          <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                            {e.tier}
                          </Badge>
                        )}
                        {isPast && <Badge className="h-4 px-1 text-[9px]">Played</Badge>}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {fmtDate(e.event_date)}
                        </span>
                        {e.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {e.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-[10px]">
                      <Badge variant="outline" className="gap-1">
                        <LinkIcon className="h-2.5 w-2.5" />
                        Source: {source}
                      </Badge>
                      {e.pdga_event_ref && (
                        <Link
                          to="/events/pdga/$eventRef"
                          params={{ eventRef: e.pdga_event_ref }}
                          className="inline-flex items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary hover:bg-primary/20"
                        >
                          <Trophy className="h-3 w-3" /> Event details
                        </Link>
                      )}
                      {e.url && (
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" /> PDGA page
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 p-3 md:grid-cols-2">
                    <div>
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        This player
                      </div>
                      <div className="space-y-0.5 text-xs">
                        <div>
                          <span className="text-muted-foreground">Division: </span>
                          <span className="font-medium">
                            {primaryTee?.division ?? member.default_division ?? "—"}
                          </span>
                        </div>
                        {tees.length > 1 ? (
                          <div className="space-y-0.5">
                            {tees
                              .filter((t) => t.round_number != null)
                              .map((t) => (
                                <div key={t.id} className="flex items-center gap-2">
                                  <span className="font-semibold">R{t.round_number}</span>
                                  {t.tee_time && (
                                    <span className="inline-flex items-center gap-1 font-medium text-primary">
                                      <Clock className="h-3 w-3" />
                                      {formatTeeTime(t.tee_time)}
                                    </span>
                                  )}
                                  {t.pool && (
                                    <span className="text-muted-foreground">Pool {t.pool}</span>
                                  )}
                                  {t.starting_hole && (
                                    <span className="text-muted-foreground">
                                      Hole {t.starting_hole}
                                    </span>
                                  )}
                                </div>
                              ))}
                          </div>
                        ) : primaryTee?.tee_time ? (
                          <div className="inline-flex items-center gap-1 font-medium text-primary">
                            <Clock className="h-3 w-3" />
                            {formatTeeTime(primaryTee.tee_time)}
                          </div>
                        ) : (
                          <div className="text-muted-foreground">Tee time TBD</div>
                        )}
                        {finish && (
                          <div className="pt-1">
                            <span className="text-muted-foreground">Result: </span>
                            <span className="font-medium">
                              {finish.place != null ? `#${finish.place}` : "Registered"}
                              {finish.points != null ? ` · ${finish.points} pts` : ""}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Schedule
                      </div>
                      {rounds.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Schedule hasn't dropped yet — check back after PDGA posts tee times.
                        </p>
                      ) : (
                        <div className="space-y-1 text-xs">
                          {rounds.map((r) => (
                            <div key={r.id} className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                                R{r.round_number}
                              </Badge>
                              {r.round_date && (
                                <span className="text-muted-foreground">
                                  {fmtDate(r.round_date)}
                                </span>
                              )}
                              {r.course_name && (
                                <span className="font-medium">{r.course_name}</span>
                              )}
                              {r.course_layout && (
                                <span className="text-muted-foreground">· {r.course_layout}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {snap && snap.finishes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4" /> PDGA finish history
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y text-xs">
              {snap.finishes
                .slice()
                .sort((a, b) => (b.event_date ?? "").localeCompare(a.event_date ?? ""))
                .map((f, i) => (
                  <div
                    key={`${f.event_ref ?? i}-${i}`}
                    className="grid grid-cols-[1fr_auto] items-center gap-2 py-1.5"
                  >
                    <div className="min-w-0">
                      {f.event_ref ? (
                        <Link
                          to="/events/pdga/$eventRef"
                          params={{ eventRef: f.event_ref }}
                          className="truncate font-medium hover:underline"
                        >
                          {f.event_name}
                        </Link>
                      ) : (
                        <span className="truncate font-medium">{f.event_name}</span>
                      )}
                      <div className="text-[10px] text-muted-foreground">
                        {fmtDate(f.event_date)}
                        {f.tier ? ` · ${f.tier}` : ""}
                        {f.division ? ` · ${f.division}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{f.place != null ? `#${f.place}` : "—"}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {f.points != null ? `${f.points} pts` : ""}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate text-base font-bold leading-tight">{value}</div>
    </div>
  );
}


/**
 * Every synced round for one crew member: round-by-round totals per event,
 * plus the hole-by-hole scorecard for that player's rounds.
 */
function PlayerRoundResults({
  member,
  events,
  liveScores,
  eventRounds,
}: {
  member: { id: string; pdga_number: string; display_name: string | null; color: string | null };
  events: TrackerEvent[];
  liveScores: TrackerLiveScoreRow[];
  eventRounds?: {
    event_id: string;
    round_number: number;
    division: string | null;
    course_name: string | null;
    course_layout: string | null;
  }[];
}) {
  // Course played per (event, round) so every result row names its course.
  const courseByRound = new Map<string, string>();
  for (const r of eventRounds ?? []) {
    const key = `${r.event_id}:${r.round_number}`;
    if (r.course_name && !courseByRound.has(key)) {
      courseByRound.set(
        key,
        r.course_layout ? `${r.course_name} · ${r.course_layout}` : r.course_name,
      );
    }
  }
  const mine = liveScores.filter(
    (s) => s.member_id === member.id || s.pdga_number === member.pdga_number,
  );
  if (mine.length === 0) return null;

  const nameById = new Map(events.map((e) => [e.id, e.name] as const));
  const dateById = new Map(events.map((e) => [e.id, e.event_date] as const));
  const byEvent = new Map<string, TrackerLiveScoreRow[]>();
  for (const s of mine) {
    const arr = byEvent.get(s.event_id) ?? [];
    arr.push(s);
    byEvent.set(s.event_id, arr);
  }
  const groups = Array.from(byEvent.entries()).sort((a, b) =>
    (dateById.get(b[0]) ?? "").localeCompare(dateById.get(a[0]) ?? ""),
  );

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4" /> Round results
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {groups.map(([eventId, rowsForEvent]) => {
            const rounds = rowsForEvent
              .filter((s) => s.round_number != null)
              .sort((a, b) => (a.round_number ?? 0) - (b.round_number ?? 0));
            const overall = rowsForEvent.find((s) => s.to_par != null || s.total != null);
            return (
              <div key={eventId} className="overflow-hidden rounded-md border">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 bg-muted/30 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {nameById.get(eventId) ?? "Event"}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {fmtDate(dateById.get(eventId) ?? null)}
                      {overall?.division ? ` · ${overall.division}` : ""}
                      {overall?.running_place != null || overall?.place != null
                        ? ` · Place ${overall.running_place ?? overall.place}`
                        : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-base font-bold tabular-nums">
                      {fmtToPar(overall?.to_par ?? null)}
                    </div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {overall?.total != null ? `${overall.total} strokes` : ""}
                    </div>
                  </div>
                </div>
                {rounds.length > 0 && (
                  <ul className="divide-y divide-border/50">
                    {rounds.map((r) => (
                      <li
                        key={r.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2"
                      >
                        <div className="min-w-0 text-[13px]">
                          <span className="font-medium">Round {r.round_number}</span>
                          {r.tee_time && (
                            <span className="text-muted-foreground">
                              {" "}
                              · {formatTeeTime(r.tee_time)}
                            </span>
                          )}
                          {r.card_number && (
                            <span className="text-muted-foreground"> · Card {r.card_number}</span>
                          )}
                          {r.round_started && !r.completed && r.thru != null && (
                            <span className="text-muted-foreground"> · thru {r.thru}</span>
                          )}
                          {courseByRound.get(`${eventId}:${r.round_number}`) && (
                            <div className="truncate text-[11px] text-muted-foreground">
                              {courseByRound.get(`${eventId}:${r.round_number}`)}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 text-right text-[13px] tabular-nums">
                          <span className="font-bold">{fmtToPar(r.round_to_par ?? null)}</span>
                          <span className="ml-2 text-muted-foreground">{r.round_score ?? "—"}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <HoleByHoleCard
        members={[member]}
        scores={mine}
        title={`Hole-by-hole · ${member.display_name || `#${member.pdga_number}`}`}
      />
    </div>
  );
}
