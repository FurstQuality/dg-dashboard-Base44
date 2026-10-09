import { WidgetNote, WidgetSourceNote } from "@/components/shell";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { getFriendPlayActivity } from "@/lib/play.functions";
import { timeAgo } from "@/lib/current-user";
import { PLAY_LIMITS, PLAY_STALE, playKeys } from "@/lib/play-queries";
import { PlayErrorState, PlayRowsSkeleton } from "@/components/play/play-widget-states";

function formatToPar(toPar: number | null): string {
  if (toPar == null) return "Score pending";
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : String(toPar);
}

function formatDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Play activity rail — what your friends just played and which events they are
 * signed up for next. Server-aggregated so this stays a couple of small reads.
 */
export function FriendActivityCard({
  userId,
  embedded = false,
}: {
  userId: string | null | undefined;
  embedded?: boolean;
}) {
  const fetchActivity = useServerFn(getFriendPlayActivity);
  const {
    data,
    isPending: queryPending,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: playKeys.friendActivity(userId),
    enabled: !!userId,
    staleTime: PLAY_STALE.short,
    queryFn: () => fetchActivity({ data: { limit: PLAY_LIMITS.friendActivity } }),
  });

  // A disabled query stays `pending` forever, so only show loading while the
  // account is known and the request is actually in flight.
  const isPending = queryPending && !!userId;

  const rounds = data?.rounds ?? [];
  const events = data?.events ?? [];
  const hasContent = rounds.length > 0 || events.length > 0;

  return (
    <div className={embedded ? "" : "rounded-2xl border border-border bg-card p-4"}>
      {embedded ? (
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Recent rounds &amp; sign-ups
        </p>
      ) : (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
            <Users className="h-4 w-4 text-emerald-400" />
            Friend activity
          </h3>
          <Link to="/friends" className="text-xs text-muted-foreground hover:text-foreground">
            Friends →
          </Link>
        </div>
      )}
      <WidgetNote className="mb-2 mt-0">
        The latest rounds your friends finished and the events they signed up for.
      </WidgetNote>
      <WidgetSourceNote
        className="mb-3 mt-0"
        sources={["Rounds scored in DG Dashboard", "Imported UDisc rounds", "PDGA event sign-ups"]}
        note="Each row shows the round type and where the score came from."
      />

      {isError ? (
        <PlayErrorState
          message="We couldn't load your friends' activity."
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      ) : isPending ? (
        <PlayRowsSkeleton rows={3} />
      ) : !hasContent ? (
        <p className="text-sm text-muted-foreground">
          No friend rounds or event sign-ups yet. Add a few players and their rounds will show up
          here.
        </p>
      ) : (
        <div className="space-y-4">
          {rounds.length > 0 && (
            <ul className="space-y-2">
              {rounds.map((r) => (
                <li key={r.roundId} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {r.playerUsername ? (
                        <Link
                          to="/players/$username"
                          params={{ username: r.playerUsername }}
                          className="hover:text-primary"
                        >
                          {r.playerName}
                        </Link>
                      ) : (
                        r.playerName
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.courseName ?? "Course TBD"} · {timeAgo(r.playedAt)}
                      {r.yourCourse ? " · one of your courses" : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
                    {formatToPar(r.toPar)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {events.length > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Where they're playing next
              </p>
              <ul className="space-y-2">
                {events.map((e) => (
                  <li key={e.tournamentId} className="text-sm">
                    {e.slug ? (
                      <Link
                        to="/tournaments/$slug"
                        params={{ slug: e.slug }}
                        className="truncate font-medium hover:text-primary"
                      >
                        {e.name}
                      </Link>
                    ) : (
                      <p className="truncate font-medium">{e.name}</p>
                    )}
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {formatDate(e.startDate)}
                      </span>
                      {e.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {e.location}
                        </span>
                      )}
                      <span>
                        {e.friendNames.join(", ")}
                        {e.friendCount > e.friendNames.length
                          ? ` +${e.friendCount - e.friendNames.length} more`
                          : ""}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
