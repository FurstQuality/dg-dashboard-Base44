/**
 * Course rating history — search any course and list the rated rounds the
 * player has shot there, grouped by layout. No projected or "needed" scores:
 * only ratings that were actually earned.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { History, Loader2, MapPin, Navigation, Search, Target, X } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCourseHistory, type PastCourseRound } from "@/lib/course-history.functions";
import { searchCourseDirectory, type DirectoryCourse } from "@/lib/course-directory.functions";
import { getNearbyCourses } from "@/lib/play.functions";
import { loadPlayCoords, savePlayCoords } from "@/lib/play-location";

export type SuggestedCourse = {
  courseId: string | null;
  courseName: string;
  /** Why it's suggested — e.g. the event and date it's being played for. */
  note?: string;
};

export function RatingTargetSearch({ upcoming = [] }: { upcoming?: SuggestedCourse[] }) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [picked, setPicked] = useState<DirectoryCourse | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  // Real device location — never a state-wide alphabetical list.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    setCoords(loadPlayCoords());
  }, []);

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("This browser can't share your location.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(next);
        savePlayCoords(next);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setGeoError(err.message || "We couldn't get your location.");
      },
      { maximumAge: 300_000, timeout: 10_000 },
    );
  }, []);

  // Ask once on load when we have no saved position yet.
  useEffect(() => {
    if (coords || locating || geoError) return;
    if (typeof window === "undefined") return;
    if (loadPlayCoords()) return;
    locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchCourses = useServerFn(searchCourseDirectory);
  const fetchNearby = useServerFn(getNearbyCourses);
  const fetchHistory = useServerFn(getCourseHistory);

  const results = useQuery({
    queryKey: ["rating-target", "course-search", debounced],
    queryFn: () => searchCourses({ data: { q: debounced, pageSize: 8, sort: "name" } }),
    enabled: debounced.length >= 2 && !picked,
    staleTime: 5 * 60 * 1000,
  });

  const history = useQuery({
    queryKey: ["course-rated-history", picked?.id, picked?.name],
    queryFn: () =>
      fetchHistory({ data: { courseName: picked!.name, courseId: picked!.id || null } }),
    enabled: !!picked && picked.name.length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  // Closest approved courses to where the player actually is.
  const local = useQuery({
    queryKey: ["rating-target", "nearby-courses", coords?.lat, coords?.lng],
    queryFn: () => fetchNearby({ data: { lat: coords!.lat, lng: coords!.lng, limit: 8 } }),
    enabled: !!coords && !picked,
    staleTime: 10 * 60 * 1000,
  });

  const localSuggestions = useMemo<SuggestedCourse[]>(() => {
    const rows = local.data ?? [];
    const seen = new Set(upcoming.map((u) => u.courseName.toLowerCase()));
    return rows
      .filter((c) => !seen.has(c.name.toLowerCase()))
      .slice(0, 8)
      .map((c) => ({
        courseId: c.id,
        courseName: c.name,
        note: `${c.distanceMi < 10 ? c.distanceMi.toFixed(1) : Math.round(c.distanceMi)} mi`,
      }));
  }, [local.data, upcoming]);

  const pickSuggestion = (s: SuggestedCourse) => {
    setPicked({
      id: s.courseId ?? "",
      name: s.courseName,
      slug: "",
      city: null,
      state: null,
      country: null,
      latitude: null,
      longitude: null,
      cover_url: null,
      hole_count: 0,
      difficulty: null,
      source: null,
      pdga_rating: null,
      pdga_rating_votes: null,
      year_established: null,
      location_quality: null,
    });
  };


  return (
    <Card className="min-w-0 space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <History className="h-4 w-4 text-primary" />
            Your rated rounds at any course
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Search a course to see every rated round you've shot there, layout by layout.
          </p>
        </div>
      </div>
      {!picked && !coords ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2 text-sm">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {geoError
              ? `${geoError} Turn on location to see the courses closest to you.`
              : "Share your location to see the courses closest to you."}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={locate} disabled={locating}>
            {locating ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Navigation className="mr-1.5 h-3.5 w-3.5" />
            )}
            Use my location
          </Button>
        </div>
      ) : null}

      {!picked && (upcoming.length > 0 || localSuggestions.length > 0) ? (
        <div className="space-y-2">
          {upcoming.length > 0 ? (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Courses you're playing next
              </div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {upcoming.map((s) => (
                  <Button
                    key={`${s.courseId ?? s.courseName}`}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => pickSuggestion(s)}
                  >
                    <Target className="mr-1.5 h-3.5 w-3.5" />
                    <span className="truncate">{s.courseName}</span>
                    {s.note ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">{s.note}</span>
                    ) : null}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {localSuggestions.length > 0 ? (
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Courses near you
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs normal-case"
                  onClick={locate}
                  disabled={locating}
                >
                  {locating ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Navigation className="mr-1 h-3 w-3" />
                  )}
                  Update location
                </Button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {localSuggestions.map((s) => (
                  <Button
                    key={`${s.courseId ?? s.courseName}`}
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="border"
                    onClick={() => pickSuggestion(s)}
                  >
                    <MapPin className="mr-1.5 h-3.5 w-3.5" />
                    <span className="truncate">{s.courseName}</span>
                    {s.note ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">{s.note}</span>
                    ) : null}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {picked ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{picked.name}</span>
          {picked.city || picked.state ? (
            <span className="text-xs text-muted-foreground">
              {[picked.city, picked.state].filter(Boolean).join(", ")}
            </span>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => {
              setPicked(null);
                            setTerm("");
            }}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Pick another course
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search a course by name, city, or state"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              aria-label="Search courses"
            />
          </div>

          {debounced.length >= 2 ? (
            results.isLoading ? (
              <p className="text-sm text-muted-foreground">Searching the course library…</p>
            ) : results.isError ? (
              <p className="text-sm text-muted-foreground">
                Course search didn't respond. Try again in a moment.
              </p>
            ) : (results.data?.courses.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                No course matched “{debounced}”. Try a shorter name, or{" "}
                <Link to="/courses" className="underline">
                  browse the directory
                </Link>
                .
              </p>
            ) : (
              <div className="space-y-1">
                {results.data!.courses.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setPicked(c)}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[c.city, c.state].filter(Boolean).join(", ") || "Location not on file"}
                      </span>
                    </span>
                    {c.hole_count ? (
                      <Badge variant="outline" className="shrink-0">
                        {c.hole_count} holes
                      </Badge>
                    ) : null}
                  </button>
                ))}
              </div>
            )
          ) : (
            <p className="text-xs text-muted-foreground">
              Type at least two letters to search every approved course in the app.
            </p>
          )}
        </div>
      )}


      {picked ? (
        history.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading your rounds at this course…</p>
        ) : history.isError || !history.data ? (
          <p className="text-sm text-muted-foreground">
            We couldn't load your rounds here just now. Try again in a moment.
          </p>
        ) : (
          <RatedHistory rounds={history.data.rounds} courseId={picked.id || null} />
        )
      ) : null}
    </Card>
  );
}

const SOURCE_LABEL: Record<PastCourseRound["source"], string> = {
  pdga: "PDGA",
  udisc: "UDisc",
  app: "DG Dashboard",
  disc_golf_scene: "Disc Golf Scene",
};

function fmtToPar(n: number): string {
  return n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`;
}

function RatedHistory({ rounds, courseId }: { rounds: PastCourseRound[]; courseId: string | null }) {
  const rated = rounds
    .filter((r) => r.rating != null)
    .sort((a, b) => b.playedOn.localeCompare(a.playedOn));
  if (rated.length === 0) {
    return (
      <p className="border-t border-border/60 pt-4 text-sm text-muted-foreground">
        You haven't shot a rated round at this course yet. Rated rounds from PDGA, UDisc, and DG
        Dashboard show up here once they're on your account.
      </p>
    );
  }
  // Every layout rates scores differently, so rounds are never mixed across layouts.
  const byLayout = new Map<string, PastCourseRound[]>();
  for (const r of rated) {
    const key = r.layoutName?.trim() || "Layout not recorded";
    const list = byLayout.get(key);
    if (list) list.push(r);
    else byLayout.set(key, [r]);
  }
  const groups = [...byLayout.entries()].sort((a, b) => b[1].length - a[1].length);
  return (
    <div className="space-y-5 border-t border-border/60 pt-4">
      {groups.map(([layout, list]) => (
        <div key={layout}>
          <h3 className="mb-2 text-sm font-semibold">
            {layout}
            <span className="ml-2 font-normal text-muted-foreground">
              {list.length} rated round{list.length === 1 ? "" : "s"}
            </span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Date</th>
                  <th className="py-1.5 pr-3 font-medium">Event</th>
                  <th className="py-1.5 pr-3 font-medium">Score</th>
                  <th className="py-1.5 pr-3 font-medium">To par</th>
                  <th className="py-1.5 pr-3 font-medium">Rating</th>
                  <th className="py-1.5 pr-3 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{r.playedOn.slice(0, 10)}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{r.eventName ?? "—"}</td>
                    <td className="py-1.5 pr-3">{r.strokes ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">
                      {r.toPar != null ? fmtToPar(r.toPar) : "—"}
                    </td>
                    <td className="py-1.5 pr-3 font-semibold">{Math.round(r.rating!)}</td>
                    <td className="py-1.5 pr-3">
                      <Badge variant="outline">{SOURCE_LABEL[r.source] ?? r.source}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Ratings are shown exactly as each source issued them. UDisc ratings use their own scale.
      </p>
      {courseId ? (
        <Button asChild size="sm" variant="outline">
          <Link to="/courses/$courseId" params={{ courseId }}>
            Open course data
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
