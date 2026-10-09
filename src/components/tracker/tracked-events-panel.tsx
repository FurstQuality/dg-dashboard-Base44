import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ExternalLink, Loader2, MapPin, Radio, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { listTrackedEvents, untrackEvent } from "@/lib/tracker-watchlist.functions";
import { trackerKeys, TRACKER_STALE } from "@/lib/tracker-queries";
import { ShareToFeedButton } from "@/components/feed/share-to-feed-button";
import { trackingDraft } from "@/lib/share-to-feed";

function formatRange(start: string | null, end: string | null): string {
  if (!start) return "Dates TBD";
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  if (!end || end === start) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

/**
 * The caller's saved tournaments: live events first, then upcoming, then a
 * short history. Saving happens in the search panel; this is where saved
 * events live afterwards.
 */
export function TrackedEventsPanel({
  onPreview,
  bare = false,
}: {
  onPreview?: (eventRef: string) => void;
  /** Render without the card chrome and heading, for use inside a combined panel. */
  bare?: boolean;
}) {
  const list = useServerFn(listTrackedEvents);
  const untrack = useServerFn(untrackEvent);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: trackerKeys.watchlist(),
    queryFn: () => list(),
    staleTime: TRACKER_STALE.watchlist,
  });

  const removal = useMutation({
    mutationFn: (eventId: string) => untrack({ data: { event_id: eventId } }),
    onSuccess: () => {
      toast.success("Removed from your tracker");
      void queryClient.invalidateQueries({ queryKey: trackerKeys.watchlist() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const groups = useMemo(() => {
    const events = data?.events ?? [];
    return {
      live: events.filter((e) => e.phase === "live"),
      upcoming: events.filter((e) => e.phase === "upcoming"),
      past: events.filter((e) => e.phase === "past").slice(0, 8),
    };
  }, [data]);

  return (
    <Card className={bare ? "border-0 bg-transparent shadow-none" : undefined}>
      <CardHeader className={bare ? "p-0 pb-3" : "pb-3"}>
        {bare ? (
          <p className="text-xs text-muted-foreground">
            Tee times, pools, and results keep syncing while these events are live.
          </p>
        ) : (
          <>
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className="h-4 w-4 text-primary" /> Your tracked events
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Events you've saved. Tee times, pools, and results keep syncing from PDGA while
              they're live.
            </p>
          </>
        )}
      </CardHeader>
      <CardContent className={bare ? "space-y-4 p-0" : "space-y-4"}>
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Loading your tracked events…
          </p>
        ) : isError ? (
          <p className="py-6 text-center text-sm text-destructive">
            Couldn't load your tracked events: {(error as Error).message}
          </p>
        ) : (data?.events.length ?? 0) === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing tracked yet. Open Find events and hit Track event to follow its field,
            tee times, and results.
          </p>
        ) : (
          <>
            {(["live", "upcoming", "past"] as const).map((phase) => {
              const rows = groups[phase];
              if (!rows.length) return null;
              const heading =
                phase === "live"
                  ? "Playing now"
                  : phase === "upcoming"
                    ? "Coming up"
                    : "Recently finished";
              return (
                <section key={phase} className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {heading}
                  </h3>
                  <ul className="divide-y rounded-lg border">
                    {rows.map((ev) => (
                      <li key={ev.id} className="flex flex-wrap items-center gap-3 p-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to="/tracker/$groupId/event/$eventId"
                              params={{ groupId: ev.groupId, eventId: ev.id }}
                              className="truncate text-sm font-semibold hover:underline"
                            >
                              {ev.name}
                            </Link>
                            {ev.tier ? (
                              <Badge variant="secondary" className="text-[10px]">
                                {ev.tier}
                              </Badge>
                            ) : null}
                            {ev.phase === "live" ? (
                              <Badge className="text-[10px]">
                                Live{ev.liveCurrentRound ? ` · R${ev.liveCurrentRound}` : ""}
                              </Badge>
                            ) : null}
                            {!ev.isPersonal ? (
                              <Badge variant="outline" className="text-[10px]">
                                {ev.groupName}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="h-3 w-3" />{" "}
                              {formatRange(ev.startDate, ev.endDate)}
                            </span>
                            {ev.location ? (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {ev.location}
                              </span>
                            ) : null}
                            {ev.playersTracked ? (
                              <span className="inline-flex items-center gap-1">
                                <Users className="h-3 w-3" /> {ev.playersTracked} player
                                {ev.playersTracked === 1 ? "" : "s"} followed
                              </span>
                            ) : null}
                            <span>
                              {ev.roundsPublished
                                ? `${ev.roundsPublished} round${ev.roundsPublished === 1 ? "" : "s"} published`
                                : "Rounds not published yet"}
                            </span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {onPreview && ev.pdgaEventRef ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onPreview(ev.pdgaEventRef!)}
                            >
                              Preview
                            </Button>
                          ) : null}
                          <Button asChild variant="default" size="sm">
                            <Link
                              to="/tracker/$groupId/event/$eventId"
                              params={{ groupId: ev.groupId, eventId: ev.id }}
                            >
                              Full event details
                            </Link>
                          </Button>
                          <ShareToFeedButton
                            iconOnly
                            variant="ghost"
                            label="Share that you're tracking this event"
                            title={`Share ${ev.name}`}
                            draft={() =>
                              trackingDraft({
                                eventName: ev.name,
                                startDate: ev.startDate,
                                endDate: ev.endDate,
                                location: ev.location,
                                tier: ev.tier,
                              })
                            }
                          />
                          {ev.url ? (
                            <Button asChild variant="ghost" size="sm">
                              <a
                                href={ev.url}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Open ${ev.name} on PDGA`}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Stop tracking ${ev.name}`}
                            disabled={removal.isPending}
                            onClick={() => removal.mutate(ev.id)}
                          >
                            {removal.isPending && removal.variables === ev.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </>
        )}
      </CardContent>
    </Card>
  );
}
