import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, ClientOnly, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, List, Loader2, Map as MapIcon, MapPin, Navigation, Pin, Play, Search } from "lucide-react";
import { PageShell, PageHeader } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StartRoundDialog } from "@/components/start-round-dialog";
import { searchCoursesForRound, type PickableCourse } from "@/lib/play.functions";
import { timeAgo } from "@/lib/current-user";

import { loadPlayCoords, savePlayCoords, type PlayCoords } from "@/lib/play-location";

const PickCourseMap = lazy(() =>
  import("@/components/play/pick-course-map").then((m) => ({ default: m.PickCourseMap })),
);

/** Radius options for filtering the picker once we know where the player is. */
const RADIUS_OPTIONS = [
  { value: "5", label: "Within 5 mi" },
  { value: "10", label: "Within 10 mi" },
  { value: "25", label: "Within 25 mi" },
  { value: "50", label: "Within 50 mi" },
  { value: "100", label: "Within 100 mi" },
  { value: "any", label: "Any distance" },
] as const;


type Coords = PlayCoords;


export const Route = createFileRoute("/_authenticated/play/pick-course")({
  head: () => ({
    meta: [
      { title: "Pick a course · DG Dashboard" },
      {
        name: "description",
        content:
          "Choose the course you're playing to start a round — your pinned courses, nearby layouts, and a full course search.",
      },
      { property: "og:title", content: "Pick a course · DG Dashboard" },
      {
        property: "og:description",
        content: "Choose a course and start scoring your round on DG Dashboard.",
      },
    ],
  }),
  component: PickCoursePage,
});

function PickCoursePage() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PickableCourse | null>(null);
  const [view, setView] = useState<"list" | "map">("map");
  const [radius, setRadius] = useState<string>("5");

  const search = useServerFn(searchCoursesForRound);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("This browser can't share your location.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(next);
        setLocating(false);
        savePlayCoords(next);
      },
      (err) => {
        setLocating(false);
        setGeoError(err.message || "We couldn't get your location.");
      },
      { maximumAge: 300_000, timeout: 10_000 },
    );
  }, []);

  // Filter by location automatically: reuse the last known point right away, and
  // ask the browser for a fresh fix on load so nearby courses come up first.
  useEffect(() => {
    const stored = loadPlayCoords();
    if (stored) setCoords(stored);
    locate();
  }, [locate]);

  const courses = useQuery({
    queryKey: ["pickCourse", debounced, coords?.lat ?? null, coords?.lng ?? null],
    staleTime: 60_000,
    queryFn: () =>
      search({
        data: {
          q: debounced,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          limit: 60,
        },
      }),
  });

  const rows = useMemo(() => {
    const all = courses.data ?? [];
    if (!coords || radius === "any" || debounced) return all;
    const max = Number(radius);
    // Keep pinned and recently played courses visible even when they sit
    // outside the radius, and keep courses we can't place on the map.
    return all.filter(
      (c) =>
        c.pinned ||
        c.lastPlayed !== null ||
        c.distanceMi === null ||
        c.distanceMi <= max,
    );
  }, [courses.data, coords, radius, debounced]);

  const mapRows = useMemo(
    () => rows.filter((c) => c.latitude != null && c.longitude != null),
    [rows],
  );


  return (
    <PageShell section="play">
      <PageHeader
        title="Pick a course"
        description="Choose where you're playing, then set your card and start scoring."
        eyebrow={
          <Link
            to="/play"
            className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to Play
          </Link>
        }
        secondaryAction={

          <Button asChild variant="outline" size="sm">
            <Link
              to="/courses"
              search={{
                q: "",
                state: "all",
                holes: "any",
                scoring: "any",
                minRating: "any",
                difficulty: "any",
                sort: "name",
                view: "grid",
                locate: "",
              }}
            >
              Full course directory
            </Link>
          </Button>
        }
      />

      <section className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search courses by name or city"
            aria-label="Search courses"
            className="pl-9"
          />
        </div>
        <Select value={radius} onValueChange={setRadius} disabled={!coords || !!debounced}>
          <SelectTrigger className="sm:w-[170px]" aria-label="Distance from me">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RADIUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={locate} disabled={locating}>
          {locating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Navigation className="mr-2 h-4 w-4" />
          )}
          {coords ? "Update my location" : "Use my location"}
        </Button>
        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List className="mr-1 h-4 w-4" />
            List
          </Button>
          <Button
            variant={view === "map" ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={view === "map"}
            onClick={() => setView("map")}
          >
            <MapIcon className="mr-1 h-4 w-4" />
            Map
          </Button>
        </div>
      </section>


      {geoError ? <p className="text-sm text-muted-foreground">{geoError}</p> : null}
      {!coords && !debounced ? (
        <p className="text-sm text-muted-foreground">
          Share your location to see the closest courses first, or search for one by name.
        </p>
      ) : coords && !debounced ? (
        <p className="text-sm text-muted-foreground">
          Showing courses{radius === "any" ? "" : ` within ${radius} miles`} of you, closest first.
        </p>
      ) : null}

      <section>
        {courses.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : courses.isError ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            We couldn't load courses just now. Refresh to try again.
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            No courses matched that search. Try a wider distance or a shorter name, or add the course
            in the directory.
            <div className="mt-3">
              <Button asChild size="sm" variant="outline">
                <Link to="/courses" search={{ add: "1" } as never}>Add a course</Link>
              </Button>
            </div>
          </div>
        ) : view === "map" ? (
          <ClientOnly fallback={<Skeleton className="h-[420px] w-full rounded-xl" />}>
            <Suspense fallback={<Skeleton className="h-[420px] w-full rounded-xl" />}>
              <PickCourseMap
                courses={mapRows}
                origin={coords}
                radiusMi={radius === "any" ? 50 : Number(radius)}
                onSelect={setSelected}
              />
            </Suspense>
          </ClientOnly>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {rows.map((course) => (
              <li
                key={course.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {course.pinned ? (
                      <Pin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    ) : null}
                    <span className="truncate font-medium">{course.name}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" aria-hidden />
                      {[course.city, course.state].filter(Boolean).join(", ") || "Location unlisted"}
                    </span>
                    {course.holeCount ? <span>{course.holeCount} holes</span> : null}
                    {course.distanceMi !== null ? <span>{course.distanceMi} mi</span> : null}
                    {course.lastPlayed ? <span>Played {timeAgo(course.lastPlayed)}</span> : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button size="sm" onClick={() => setSelected(course)}>
                    <Play className="mr-1 h-4 w-4" />
                    Start
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/courses/$courseId" params={{ courseId: course.id }}>
                      Details
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected ? (
        <StartRoundDialog
          open
          onOpenChange={(v) => {
            if (!v) setSelected(null);
          }}
          courseId={selected.id}
          courseName={selected.name}
          layoutId={null}
          holeCount={selected.holeCount ?? 18}
        />
      ) : null}
    </PageShell>
  );
}
