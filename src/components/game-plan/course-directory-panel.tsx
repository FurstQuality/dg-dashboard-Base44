import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, MapPin, PlayCircle, Search, Star, Users } from "lucide-react";
import {
  searchCourseDirectory,
  listCourseStates,
  type DirectoryCourse,
} from "@/lib/course-directory.functions";
import { listCourseActivity, type CourseActivity } from "@/lib/course-activity.functions";
import { normalizeStateCode } from "@/lib/us-states";

const PAGE_SIZE = 24;

function formatDate(value: string | null): string {
  if (!value) return "Date TBD";
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "Date TBD";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Course directory built for choosing where to play: every approved course,
 * annotated with the events coming up on it and the rounds being played now.
 */
export function CourseDirectoryPanel({ homeState }: { homeState?: string }) {
  const search = useServerFn(searchCourseDirectory);
  const states = useServerFn(listCourseStates);
  const activityFn = useServerFn(listCourseActivity);

  const initialState = normalizeStateCode(homeState ?? null) ?? "all";
  const [q, setQ] = useState("");
  const [state, setState] = useState(initialState);
  const [sort, setSort] = useState("rating");
  const [page, setPage] = useState(1);

  const stateQuery = useQuery({
    queryKey: ["course-states"],
    queryFn: () => states(),
    staleTime: 30 * 60_000,
  });

  const listQuery = useQuery({
    queryKey: ["course-directory", q, state, sort, page],
    queryFn: () =>
      search({
        data: {
          q: q.trim() || undefined,
          state: state === "all" ? undefined : state,
          sort,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
  });

  const courses: DirectoryCourse[] = listQuery.data?.courses ?? [];
  const total = listQuery.data?.total ?? 0;
  const courseIds = useMemo(() => courses.map((c) => c.id), [courses]);

  const activityQuery = useQuery({
    queryKey: ["course-activity", courseIds],
    queryFn: () => activityFn({ data: { courseIds } }),
    enabled: courseIds.length > 0,
    staleTime: 60_000,
  });

  const activity = useMemo(() => {
    const map = new Map<string, CourseActivity>();
    for (const row of activityQuery.data ?? []) map.set(row.courseId, row);
    return map;
  }, [activityQuery.data]);

  const beingPlayed = useMemo(
    () =>
      courses
        .map((c) => ({ course: c, act: activity.get(c.id) }))
        .filter((r) => (r.act?.liveRounds ?? 0) > 0)
        .slice(0, 6),
    [courses, activity],
  );

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Search courses</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Course, city, or club"
                className="pl-8"
              />
            </div>
          </div>
          <div className="min-w-[150px] space-y-1.5">
            <Label className="text-xs text-muted-foreground">State</Label>
            <Select
              value={state}
              onValueChange={(v) => {
                setState(v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Every state</SelectItem>
                {(stateQuery.data ?? []).map((s) => (
                  <SelectItem key={s.state} value={s.state}>
                    {s.state} ({s.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[150px] space-y-1.5">
            <Label className="text-xs text-muted-foreground">Sort by</Label>
            <Select
              value={sort}
              onValueChange={(v) => {
                setSort(v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rating">Highest rated</SelectItem>
                <SelectItem value="name">Name (A–Z)</SelectItem>
                <SelectItem value="holes">Most holes</SelectItem>
                <SelectItem value="newest">Newest added</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {beingPlayed.length > 0 ? (
        <Card className="space-y-2 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <PlayCircle className="h-4 w-4 text-primary" />
            Being played right now
          </div>
          <div className="flex flex-wrap gap-2">
            {beingPlayed.map(({ course, act }) => (
              <Link
                key={course.id}
                to="/courses/$courseId"
                params={{ courseId: course.id }}
                className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs hover:border-primary"
              >
                {course.name} · {act?.liveRounds} round{act?.liveRounds === 1 ? "" : "s"} live
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      {listQuery.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          No courses match that search yet. Try a different name or clear the state filter.
        </Card>
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            {total.toLocaleString()} course{total === 1 ? "" : "s"} · page {page} of {lastPage}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((c) => {
              const act = activity.get(c.id);
              const place = [c.city, c.state].filter(Boolean).join(", ");
              return (
                <Card key={c.id} className="flex min-w-0 flex-col gap-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        to="/courses/$courseId"
                        params={{ courseId: c.id }}
                        className="block truncate font-medium hover:text-primary"
                      >
                        {c.name}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {place || "Location not listed"}
                      </div>
                    </div>
                    {c.pdga_rating != null ? (
                      <Badge variant="secondary" className="shrink-0 gap-1">
                        <Star className="h-3 w-3" />
                        {c.pdga_rating.toFixed(1)}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    <Badge variant="outline">{c.hole_count || "?"} holes</Badge>
                    {c.layout_count ? (
                      <Badge variant="outline">
                        {c.layout_count} layout{c.layout_count === 1 ? "" : "s"}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-600">
                        Layout needed
                      </Badge>
                    )}
                    {act && act.liveRounds > 0 ? (
                      <Badge className="gap-1">
                        <Users className="h-3 w-3" />
                        {act.liveRounds} playing now
                      </Badge>
                    ) : act && act.recentRounds > 0 ? (
                      <Badge variant="secondary">
                        {act.recentRounds} round{act.recentRounds === 1 ? "" : "s"} this week
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-auto space-y-1.5 border-t border-border pt-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      <Calendar className="h-3.5 w-3.5 text-primary" />
                      {act?.upcomingCount
                        ? `${act.upcomingCount} event${act.upcomingCount === 1 ? "" : "s"} coming up`
                        : "No events scheduled yet"}
                    </div>
                    {act?.upcoming.length ? (
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {act.upcoming.map((e) => (
                          <li key={e.id} className="flex items-center justify-between gap-2">
                            <span className="truncate">{e.name}</span>
                            <span className="shrink-0">{formatDate(e.startDate)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        Host a league night or tournament here to get it on the calendar.
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                        <Link to="/courses/$courseId" params={{ courseId: c.id }}>
                          Course data
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                        <Link to="/play/pick-course">Start a round</Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                        <Link to="/events" search={{ q: c.name } as never}>
                          Events here
                        </Link>
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {lastPage}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= lastPage}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
