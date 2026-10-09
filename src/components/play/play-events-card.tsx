import { WidgetNote, WidgetSourceNote } from "@/components/shell";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { CalendarDays, ClipboardList, MapPin, Trophy } from "lucide-react";
import { getPlayEvents } from "@/lib/play.functions";
import { PLAY_LIMITS, PLAY_STALE, playKeys } from "@/lib/play-queries";
import { PlayErrorState, PlayRowsSkeleton } from "@/components/play/play-widget-states";

function formatDay(date: string | null): string {
  if (!date) return "Date TBD";
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTeeTime(startsAt: string | null): string | null {
  if (!startsAt) return null;
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Events coverage for Play: what you are already signed up for, and the
 * soonest sanctioned events in your home state with registration inline.
 */
export function PlayEventsCard({ userId }: { userId: string | null | undefined }) {
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

  const mine = data?.mine ?? [];
  const nearby = data?.nearby ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
          <Trophy className="h-4 w-4 text-amber-400" />
          Your events
        </h3>
        <Link to="/events" className="text-xs text-muted-foreground hover:text-foreground">
          Event directory →
        </Link>
      </div>
      <WidgetNote className="mb-2 mt-0">
        Events you are registered for and nearby events still open for sign-up.
      </WidgetNote>
      <WidgetSourceNote
        className="mb-3 mt-0"
        sources={["PDGA", "Disc Golf Scene", "UDisc", "Events created in DG Dashboard"]}
        note="Includes sanctioned tournaments and league nights."
      />

      {isError ? (
        <PlayErrorState
          message="We couldn't load your events."
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      ) : isPending ? (
        <PlayRowsSkeleton rows={4} />
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              On your schedule
            </p>
            {mine.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing on the calendar yet. Add an event and it shows up here with date, course,
                and tee time.
              </p>
            ) : (
              <ul className="space-y-2">
                {mine.map((e) => {
                  const tee = formatTeeTime(e.startsAt);
                  return (
                    <li
                      key={e.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-background/40 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{e.title}</p>
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {formatDay(e.startsOn)}
                          </span>
                          {tee ? <span>Tee {tee}</span> : null}
                          {e.location ? (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {e.location}
                            </span>
                          ) : null}
                          {e.division ? <span>{e.division}</span> : null}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                          {e.status}
                        </span>
                        <Link
                          to="/game-plan"
                          search={{ event: e.id }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          <ClipboardList className="h-3 w-3" /> Plan this event
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link
              to="/game-plan"
              className="mt-2 mr-3 inline-block text-xs text-muted-foreground hover:text-foreground"
            >
              Course tracker & game plan →
            </Link>
            <Link
              to="/schedule"
              className="mt-2 inline-block text-xs text-muted-foreground hover:text-foreground"
            >
              Open schedule →
            </Link>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {data?.homeState ? `Coming up in ${data.homeState}` : "Coming up near you"}
            </p>
            {!data?.homeState ? (
              <p className="text-sm text-muted-foreground">
                Add your home state in profile settings and we'll list the soonest sanctioned events
                near you.
              </p>
            ) : nearby.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No upcoming sanctioned events on file for your state yet. The directory has the full
                national list.
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
                          className="rounded-full border border-border px-2.5 py-1 text-[11px] hover:bg-muted"
                        >
                          Register
                        </a>
                      ) : null}
                      <Link
                        to="/tracker"
                        className="rounded-full border border-border px-2.5 py-1 text-[11px] hover:bg-muted"
                      >
                        Track
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
