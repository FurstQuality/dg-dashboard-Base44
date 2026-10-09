import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Clock, Loader2, MapPin, RefreshCw, Radio } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listFriendsLiveNow, refreshFriendsLiveNow } from "@/lib/live-friends.functions";
import { formatToPar, isOnTheCourse } from "@/lib/live/friend-live";
import { liveKeys, LIVE_POLL, livePolling } from "@/lib/tracker-queries";
import { FriendLiveCardSheet } from "@/components/tracker/friend-live-card-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useFriendLiveAlerts } from "@/hooks/use-friend-live-alerts";

/**
 * Shows a value and flashes it briefly whenever it changes, so a score or place
 * that moves during a background refresh is noticeable without the row
 * re-rendering from scratch or flickering.
 */
function FlashValue({ value, className = "" }: { value: string; className?: string }) {
  const previous = useRef(value);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 1600);
    return () => window.clearTimeout(timer);
  }, [value]);
  return (
    <span
      className={`rounded px-1 transition-colors duration-500 ${flash ? "bg-primary/20 text-primary" : ""} ${className}`}
    >
      {value}
    </span>
  );
}

function sinceLabel(iso: string | null): string {
  if (!iso) return "not yet";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr ago`;
}

/**
 * "Live now" — friends who are on the course right now, in a sanctioned event
 * with published live scoring or in a round they're scoring in the app. Scores
 * refresh on their own while the tab is open, and the background sync keeps
 * them current for everyone else.
 */
export function FriendsLiveNowPanel({
  onPreview,
  bare = false,
}: {
  onPreview?: (eventRef: string) => void;
  bare?: boolean;
}) {
  const load = useServerFn(listFriendsLiveNow);
  const refresh = useServerFn(refreshFriendsLiveNow);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [card, setCard] = useState<{
    eventRef: string;
    eventName: string;
    pdgaNumber: string;
    playerName: string;
  } | null>(null);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: liveKeys.friendsLiveNow(),
    queryFn: () => load(),
    ...livePolling(LIVE_POLL.live),
  });

  useFriendLiveAlerts(data);

  const events = data?.events ?? [];
  const rounds = data?.rounds ?? [];
  const onCourse = useMemo(
    () =>
      events.reduce((sum, e) => sum + e.players.filter(isOnTheCourse).length, 0) + rounds.length,
    [events, rounds],
  );

  const doRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await refresh({ data: {} });
      toast.info(res.message);
      await queryClient.invalidateQueries({ queryKey: liveKeys.friendsLiveNow() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't pull live scoring just now");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card className={bare ? "border-0 bg-transparent shadow-none" : undefined}>
      <CardHeader className={bare ? "p-0 pb-3" : "pb-3"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className={`h-4 w-4 ${onCourse ? "text-destructive" : "text-primary"}`} />
              Live now
              {onCourse > 0 ? (
                <Badge variant="destructive" className="text-xs">
                  {onCourse} on the course
                </Badge>
              ) : null}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Friends on the course right now. Refreshes every 30 seconds.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onCourse > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                  <span className="absolute inset-0 h-1.5 w-1.5 animate-ping rounded-full bg-red-500/60" />
                </span>
                Live
              </span>
            ) : null}
            <span
              className="text-xs text-muted-foreground"
              title="Scores refresh on their own every 30 seconds while this page is open."
            >
              Updated {sinceLabel(data?.oldestSyncedAt ?? data?.fetchedAt ?? null)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void doRefresh()}
              disabled={refreshing}
              aria-label="Pull the newest live scores"
            >
              {refreshing || isFetching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className={bare ? "space-y-4 p-0" : "space-y-4"}>
        {isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-live="polite">
            <span className="sr-only">Checking who's out playing…</span>
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : isError ? (
          <div className="space-y-3 py-4">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : "We couldn't load live scoring just now."}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : !events.length && !rounds.length ? (
          <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
            Nobody's mid-round right now. When a friend tees off, their card shows up here.
          </div>
        ) : (
          <>
            {events.map((event) => (
              <div key={event.eventRef} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{event.name}</span>
                      {event.tier ? (
                        <Badge variant="outline" className="text-xs">
                          {event.tier}
                        </Badge>
                      ) : null}
                    </div>
                    {event.location ? (
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {event.location}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" /> {sinceLabel(event.lastSyncedAt)}
                    </span>
                    {onPreview ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPreview(event.eventRef)}
                        aria-label={`Open tracking for ${event.name}`}
                      >
                        <Activity className="mr-1.5 h-3.5 w-3.5" /> Track
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {event.players.map((player) => (
                    <button
                      key={`${player.pdgaNumber}-${player.roundNumber}`}
                      type="button"
                      onClick={() =>
                        setCard({
                          eventRef: event.eventRef,
                          eventName: event.name,
                          pdgaNumber: player.pdgaNumber,
                          playerName: player.displayName,
                        })
                      }
                      aria-label={`Open ${player.displayName}'s card at ${event.name}`}
                      className="flex w-full flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {isOnTheCourse(player) ? (
                          <span
                            className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-destructive"
                            aria-hidden
                          />
                        ) : (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-border" aria-hidden />
                        )}
                        <span className="truncate text-sm font-medium">{player.displayName}</span>
                        {player.division ? (
                          <Badge variant="outline" className="text-[11px]">
                            {player.division}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">
                          R{player.roundNumber} ·{" "}
                          {player.completed
                            ? "Finished"
                            : player.roundStarted || player.thru > 0
                              ? `Thru ${player.thru}`
                              : (player.teeTime ?? "Not started")}
                        </span>
                        <FlashValue
                          value={formatToPar(player.toPar)}
                          className="font-semibold"
                        />
                        <span className="w-12 text-right text-muted-foreground">
                          <FlashValue value={player.place != null ? `#${player.place}` : "—"} />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {rounds.length ? (
              <div className="rounded-lg border border-border p-4">
                <div className="text-sm font-medium">Rounds being scored in the app</div>
                <div className="mt-3 space-y-2">
                  {rounds.map((round) => {
                    const toPar =
                      round.totalPar > 0 ? round.totalStrokes - round.totalPar : null;
                    return (
                      <div
                        key={round.roundId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/30 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-destructive"
                            aria-hidden
                          />
                          {round.username ? (
                            <Link
                              to="/u/$username"
                              params={{ username: round.username }}
                              className="truncate text-sm font-medium hover:underline"
                            >
                              {round.displayName}
                            </Link>
                          ) : (
                            <span className="truncate text-sm font-medium">
                              {round.displayName}
                            </span>
                          )}
                          <span className="truncate text-xs text-muted-foreground">
                            {round.courseName ?? "Course not named"}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-muted-foreground">
                            Thru {round.holesPlayed}
                          </span>
                          <FlashValue
                            value={
                              toPar != null ? formatToPar(toPar) : `${round.totalStrokes} strokes`
                            }
                            className="font-semibold"
                          />
                          <span className="text-xs text-muted-foreground">
                            {sinceLabel(round.lastScoreAt ?? round.startedAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>

      <FriendLiveCardSheet
        open={!!card}
        onOpenChange={(open) => {
          if (!open) setCard(null);
        }}
        eventRef={card?.eventRef ?? null}
        eventName={card?.eventName ?? null}
        pdgaNumber={card?.pdgaNumber ?? null}
        playerName={card?.playerName ?? null}
      />
    </Card>
  );
}
