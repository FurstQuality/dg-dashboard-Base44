import { WidgetNote, WidgetSourceNote } from "@/components/shell";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { CalendarDays, MapPin, Trophy } from "lucide-react";
import { getPlayEvents } from "@/lib/play.functions";
import { PLAY_LIMITS, PLAY_STALE, playKeys } from "@/lib/play-queries";
import { TrackEventButton } from "@/components/tracker/track-event-button";
import { PlayErrorState, PlayRowsSkeleton } from "@/components/play/play-widget-states";

function formatDay(date: string | null): string {
  if (!date) return "Date TBD";
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Play overview widget: the soonest sanctioned events near the player,
 * with a link out to the full events directory.
 */
export function PlayNearbyEventsCard({ userId }: { userId: string | null | undefined }) {
  const fetchEvents = useServerFn(getPlayEvents);
  const {
    data,
    isPending: queryPending,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: playKeys.events(userId),
    enabled: !!userId,
    staleTime: PLAY_STALE.short,
    queryFn: () => fetchEvents({ data: { limit: PLAY_LIMITS.events } }),
  });

  // A disabled query stays `pending` forever, so only show loading while the
  // account is known and the request is actually in flight.
  const isPending = queryPending && !!userId;

  const nearby = data?.nearby ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-base font-semibold">
          <Trophy className="h-4 w-4 text-amber-400" />
          Upcoming events nearby
        </h3>
        <Link to="/events" className="text-sm font-medium text-primary hover:underline">
          Full events page →
        </Link>
      </div>
      <WidgetNote className="mb-2 mt-0">
        Tournaments and league nights coming up closest to you, soonest first.
      </WidgetNote>
      <WidgetSourceNote
        className="mb-3 mt-0"
        sources={["PDGA", "Disc Golf Scene", "UDisc", "Events created in DG Dashboard"]}
        note="Distances are measured from your saved play location."
      />

      {isError ? (
        <PlayErrorState
          message="We couldn't load nearby events."
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      ) : isPending ? (
        <PlayRowsSkeleton rows={3} />
      ) : !data?.homeState ? (
        <p className="text-sm text-muted-foreground">
          Add your home state in profile settings and we'll list the soonest sanctioned events near
          you.
        </p>
      ) : nearby.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No upcoming sanctioned events on file for {data.homeState} yet. The events page has the
          full national list.
        </p>
      ) : (
        <ul className="space-y-2">
          {nearby.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-background/40 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{e.name}</p>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {formatDay(e.startDate)}
                  </span>
                  {e.city || e.state ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {[e.city, e.state].filter(Boolean).join(", ")}
                    </span>
                  ) : null}
                  {e.tier ? <span>{e.tier}</span> : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {e.registrationUrl ? (
                  <a
                    href={e.registrationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"
                  >
                    Register
                  </a>
                ) : null}
                {e.pdgaEventId ? (
                  <TrackEventButton
                    label="Track"
                    event={{
                      eventRef: e.pdgaEventId,
                      name: e.name,
                      eventDate: e.startDate,
                      location: e.location ?? [e.city, e.state].filter(Boolean).join(", ") ?? null,
                      tier: e.tier,
                      url: `https://www.pdga.com/tour/event/${e.pdgaEventId}`,
                    }}
                  />
                ) : (
                  <Link
                    to="/tracker"
                    className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"
                  >
                    Track
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
