/**
 * One shared "what you're tracking" strip: saved events, followed players, and
 * tracked courses. It appears on every tracker surface so each tool always
 * shows the other two, and each card links to the tool that manages it.
 */
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, MapPin, UserSearch, Radio, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listTrackedEvents } from "@/lib/tracker-watchlist.functions";
import { listTrackedPlayers } from "@/lib/tracker-player-search.functions";
import {
  listTrackedCourses,
  untrackCourse,
  type TrackedCourse,
} from "@/lib/tracked-courses.functions";
import { trackerKeys, TRACKER_STALE } from "@/lib/tracker-queries";

export const trackedCoursesKey = ["tracker", "tracked-courses"] as const;
const trackedPlayersKey = ["tracker", "tracked-players"] as const;

type Highlight = "events" | "players" | "courses";

function SectionCard({
  icon: Icon,
  title,
  blurb,
  count,
  countLabel,
  to,
  ctaLabel,
  highlighted,
  children,
}: {
  icon: typeof Bookmark;
  title: string;
  blurb: string;
  count: number | null;
  countLabel: string;
  to: "/tracker/events" | "/tracker/players" | "/game-plan";
  ctaLabel: string;
  highlighted: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={highlighted ? "border-primary/50" : undefined}>
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
        <p className="text-muted-foreground mt-2 text-sm">{blurb}</p>
        <p className="text-muted-foreground mt-1 text-xs">{countLabel}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {children}
        <Button
          asChild
          size="sm"
          variant={highlighted ? "outline" : "secondary"}
          className="w-full"
        >
          <Link to={to}>{ctaLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}


function EmptyLine({ text }: { text: string }) {
  return <p className="text-muted-foreground text-xs">{text}</p>;
}

export function TrackingSummary({
  highlight,
  limit = 4,
}: {
  highlight?: Highlight;
  /** How many rows each card lists before its "manage" button. */
  limit?: number;
}) {
  const eventsFn = useServerFn(listTrackedEvents);
  const playersFn = useServerFn(listTrackedPlayers);
  const coursesFn = useServerFn(listTrackedCourses);
  const removeCourse = useServerFn(untrackCourse);
  const queryClient = useQueryClient();

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

  const removal = useMutation({
    mutationFn: (id: string) => removeCourse({ data: { id } }),
    onSuccess: () => {
      toast.success("Course removed from your tracker");
      void queryClient.invalidateQueries({ queryKey: trackedCoursesKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const eventRows = events.data?.events ?? [];
  const liveCount = eventRows.filter((e) => e.phase === "live").length;
  const upcoming = eventRows.filter((e) => e.phase !== "past").slice(0, limit);
  const playerRows = players.data?.players ?? [];
  const courseRows: TrackedCourse[] = courses.data?.courses ?? [];

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <SectionCard
        icon={Bookmark}
        title="Event Tracker"
        blurb="Save a tournament or league and follow live scores, round results, and the full field."
        count={events.isLoading ? null : eventRows.length}
        countLabel={
          liveCount > 0
            ? `${liveCount} playing right now`
            : "Tournaments and leagues you follow for scores"
        }
        to="/tracker/events"
        ctaLabel="Manage tracked events"
        highlighted={highlight === "events"}
      >
        {events.isLoading ? (
          <EmptyLine text="Loading your events…" />
        ) : events.isError ? (
          <EmptyLine text="Couldn't load your tracked events." />
        ) : upcoming.length === 0 ? (
          <EmptyLine text="No events saved yet — find one and follow its scores." />
        ) : (
          <ul className="space-y-1">
            {upcoming.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-xs">
                {e.phase === "live" ? (
                  <Radio className="text-primary h-3 w-3 shrink-0" />
                ) : (
                  <span className="bg-muted-foreground/40 h-1.5 w-1.5 shrink-0 rounded-full" />
                )}
                <span className="truncate">{e.name ?? "Event"}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        icon={UserSearch}
        title="Player Tracker"
        blurb="Follow a player to see what they're playing and how they've been shooting."
        count={players.isLoading ? null : playerRows.length}
        countLabel="Players you follow for events and recent form"
        to="/tracker/players"
        ctaLabel="Manage tracked players"
        highlighted={highlight === "players"}
      >
        {players.isLoading ? (
          <EmptyLine text="Loading the players you follow…" />
        ) : players.isError ? (
          <EmptyLine text="Couldn't load the players you follow." />
        ) : playerRows.length === 0 ? (
          <EmptyLine text="No players followed yet — search a name or PDGA number." />
        ) : (
          <ul className="space-y-1">
            {playerRows.slice(0, limit).map((p) => (
              <li key={p.member_id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{p.display_name ?? `#${p.pdga_number}`}</span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {p.rating != null ? `${p.rating} PDGA` : "Rating pending"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        icon={MapPin}
        title="Course Analytics"
        blurb="Study a course from past PDGA events — what players shot and what each rating took."
        count={courses.isLoading ? null : courseRows.length}
        countLabel="Courses you study from past PDGA events"
        to="/game-plan"
        ctaLabel="Open Course Analytics"
        highlighted={highlight === "courses"}
      >
        {courses.isLoading ? (
          <EmptyLine text="Loading your tracked courses…" />
        ) : courses.isError ? (
          <EmptyLine text="Couldn't load your tracked courses." />
        ) : courseRows.length === 0 ? (
          <EmptyLine text="No courses tracked yet — save one to study its scoring." />
        ) : (
          <ul className="space-y-1">
            {courseRows.slice(0, limit).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                {c.course_id ? (
                  <Link
                    to="/courses/$courseId"
                    params={{ courseId: c.course_id }}
                    className="truncate hover:underline"
                  >
                    {c.course_name}
                  </Link>
                ) : (
                  <span className="truncate">{c.course_name}</span>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  aria-label={`Stop tracking ${c.course_name}`}
                  disabled={removal.isPending}
                  onClick={() => removal.mutate(c.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
