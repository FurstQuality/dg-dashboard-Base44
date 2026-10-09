/**
 * Full-list companions to the summary cards: every tracked event, player, and
 * course in one scrollable card each, so nothing is hidden behind a "top six".
 */
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, MapPin, Radio, UserSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listTrackedEvents } from "@/lib/tracker-watchlist.functions";
import { listTrackedPlayers } from "@/lib/tracker-player-search.functions";
import { listTrackedCourses, type TrackedCourse } from "@/lib/tracked-courses.functions";
import { trackerKeys, TRACKER_STALE } from "@/lib/tracker-queries";
import { trackedCoursesKey } from "@/components/tracker/tracking-summary";

const trackedPlayersKey = ["tracker", "tracked-players"] as const;

function ListCard({
  icon: Icon,
  title,
  subtitle,
  count,
  children,
}: {
  icon: typeof Bookmark;
  title: string;
  subtitle: string;
  count: number | null;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="font-display flex items-center gap-2 text-base">
            <span className="bg-primary/10 text-primary grid h-8 w-8 shrink-0 place-items-center rounded-lg">
              <Icon className="h-4 w-4" />
            </span>
            {title}
          </CardTitle>
          <Badge variant="outline" className="tabular-nums">
            {count ?? "—"}
          </Badge>
        </div>
        <p className="text-muted-foreground mt-2 text-sm">{subtitle}</p>
      </CardHeader>
      <CardContent>
        <div className="max-h-72 overflow-y-auto pr-1">{children}</div>
      </CardContent>
    </Card>
  );
}

function Note({ text }: { text: string }) {
  return <p className="text-muted-foreground text-sm">{text}</p>;
}

function fmtDate(iso: string | null) {
  if (!iso) return "Date to come";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "Date to come";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Every tracked event, player, and course — full lists, no truncation. */
export function TrackingFullLists() {
  const eventsFn = useServerFn(listTrackedEvents);
  const playersFn = useServerFn(listTrackedPlayers);
  const coursesFn = useServerFn(listTrackedCourses);

  const events = useQuery({
    queryKey: trackerKeys.watchlist(),
    queryFn: () => eventsFn(),
    staleTime: TRACKER_STALE.watchlist,
  });
  const players = useQuery({
    queryKey: trackedPlayersKey,
    queryFn: () => playersFn(),
    staleTime: TRACKER_STALE.watchlist,
  });
  const courses = useQuery({
    queryKey: trackedCoursesKey,
    queryFn: () => coursesFn(),
    staleTime: TRACKER_STALE.watchlist,
  });

  const eventRows = events.data?.events ?? [];
  const playerRows = players.data?.players ?? [];
  const courseRows: TrackedCourse[] = courses.data?.courses ?? [];

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <ListCard
        icon={Bookmark}
        title="All tracked events"
        subtitle="Every tournament and league night you follow, newest first."
        count={events.isLoading ? null : eventRows.length}
      >
        {events.isLoading ? (
          <Note text="Loading your events…" />
        ) : events.isError ? (
          <Note text="Couldn't load your tracked events." />
        ) : eventRows.length === 0 ? (
          <Note text="Nothing saved yet — track an event to follow its scores." />
        ) : (
          <ul className="divide-border divide-y">
            {eventRows.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <Link
                    to="/tracker/$groupId/event/$eventId"
                    params={{ groupId: e.groupId, eventId: e.id }}
                    className="flex items-center gap-1.5 truncate font-medium hover:underline"
                  >
                    {e.phase === "live" ? <Radio className="text-primary h-3 w-3 shrink-0" /> : null}
                    <span className="truncate">{e.name}</span>
                  </Link>
                  <p className="text-muted-foreground truncate text-xs">
                    {fmtDate(e.startDate)}
                    {e.location ? ` · ${e.location}` : ""}
                  </p>
                </div>
                {e.phase === "live" ? (
                  <Badge className="shrink-0">Live</Badge>
                ) : e.phase === "past" ? (
                  <Badge variant="outline" className="shrink-0">
                    Finished
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </ListCard>

      <ListCard
        icon={UserSearch}
        title="All tracked players"
        subtitle="Everyone you follow, with their current PDGA rating."
        count={players.isLoading ? null : playerRows.length}
      >
        {players.isLoading ? (
          <Note text="Loading the players you follow…" />
        ) : players.isError ? (
          <Note text="Couldn't load the players you follow." />
        ) : playerRows.length === 0 ? (
          <Note text="No players followed yet — search a name or PDGA number." />
        ) : (
          <ul className="divide-border divide-y">
            {playerRows.map((p) => (
              <li key={p.member_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {p.display_name ?? `#${p.pdga_number}`}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">PDGA #{p.pdga_number}</p>
                </div>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {p.rating != null ? `${p.rating} rated` : "Rating pending"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ListCard>

      <ListCard
        icon={MapPin}
        title="All tracked courses"
        subtitle="Every course you've saved to study for a round."
        count={courses.isLoading ? null : courseRows.length}
      >
        {courses.isLoading ? (
          <Note text="Loading your tracked courses…" />
        ) : courses.isError ? (
          <Note text="Couldn't load your tracked courses." />
        ) : courseRows.length === 0 ? (
          <Note text="No courses saved yet — save one to study its scoring." />
        ) : (
          <ul className="divide-border divide-y">
            {courseRows.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  {c.course_id ? (
                    <Link
                      to="/courses/$courseId"
                      params={{ courseId: c.course_id }}
                      className="truncate font-medium hover:underline"
                    >
                      {c.course_name}
                    </Link>
                  ) : (
                    <p className="truncate font-medium">{c.course_name}</p>
                  )}
                  {c.location ? (
                    <p className="text-muted-foreground truncate text-xs">{c.location}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </ListCard>
    </div>
  );
}
