import { WidgetNote, WidgetSourceNote } from "@/components/shell";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { MapPin, Pin, Navigation, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMyCourses, getNearbyCourses } from "@/lib/play.functions";
import { PLAY_LIMITS, PLAY_STALE, playKeys } from "@/lib/play-queries";
import { loadPlayCoords, savePlayCoords } from "@/lib/play-location";
import { PlayErrorState, PlayRowsSkeleton } from "@/components/play/play-widget-states";

type Tab = "mine" | "nearby";

/**
 * Courses in reach: the ones you already play (pinned course book entries and
 * recent rounds) plus the closest approved courses to your current location.
 */
export function PlayCoursesCard({ userId }: { userId: string | null | undefined }) {
  const [tab, setTab] = useState<Tab>("mine");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const fetchMine = useServerFn(getMyCourses);
  const fetchNearby = useServerFn(getNearbyCourses);

  useEffect(() => {
    setCoords(loadPlayCoords());
  }, []);

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

  const mine = useQuery({
    queryKey: playKeys.myCourses(userId),
    enabled: !!userId,
    staleTime: PLAY_STALE.medium,
    queryFn: () => fetchMine({ data: { limit: PLAY_LIMITS.myCourses } }),
  });

  const nearby = useQuery({
    queryKey: playKeys.nearbyCourses(coords?.lat, coords?.lng),
    enabled: tab === "nearby" && !!coords,
    staleTime: PLAY_STALE.long,
    queryFn: () =>
      fetchNearby({
        data: { lat: coords!.lat, lng: coords!.lng, limit: PLAY_LIMITS.nearbyCourses },
      }),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold">Courses in reach</h2>
        <div className="flex items-center gap-2">
          <div
            role="tablist"
            aria-label="Course source"
            className="flex rounded-full border border-border p-0.5"
          >
            {(["mine", "nearby"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => {
                  setTab(t);
                  if (t === "nearby" && !coords) locate();
                }}
                className={
                  "rounded-full px-3 py-1 text-xs font-medium transition " +
                  (tab === t
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {t === "mine" ? "Your courses" : "Nearby"}
              </button>
            ))}
          </div>
          <Link to="/courses" className="text-xs text-muted-foreground hover:text-foreground">
            All courses →
          </Link>
        </div>
      </div>
      <WidgetNote className="mb-2 mt-0">
        Your courses are the ones you pinned or have played; Nearby lists approved courses closest
        to your current location.
      </WidgetNote>
      <WidgetSourceNote
        className="mb-3 mt-0"
        sources={[
          "Verified DG Dashboard course directory",
          "Your played rounds and pinned courses",
        ]}
        note="Hole counts and pars come from the course's published layouts."
      />

      {tab === "mine" ? (
        mine.isPending && !!userId ? (
          <PlayRowsSkeleton rows={3} height="h-12" />
        ) : mine.isError ? (
          <PlayErrorState
            message="We couldn't load your course history."
            onRetry={() => void mine.refetch()}
            retrying={mine.isFetching}
          />
        ) : (mine.data ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            No course history yet. Start a round or pin a favorite and it will show up here.
            <div className="mt-3">
              <Button asChild size="sm">
                <Link to="/play/pick-course">Pick a course</Link>
              </Button>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {(mine.data ?? []).map((c) => (
              <li key={c.courseKey} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {c.pinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-amber-400" /> : null}
                    <span className="truncate text-sm font-medium">{c.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.rounds > 0 ? `${c.rounds} round${c.rounds === 1 ? "" : "s"}` : "Pinned"}
                    {c.location ? ` · ${c.location}` : ""}
                    {c.bestToPar !== null
                      ? ` · best ${c.bestToPar > 0 ? `+${c.bestToPar}` : c.bestToPar}`
                      : ""}
                  </div>
                </div>
                {c.courseId ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/courses/$courseId" params={{ courseId: c.courseId }}>
                      Open
                    </Link>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : !coords ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          {geoError ?? "Share your location to see the closest courses."}
          <div className="mt-3">
            <Button size="sm" onClick={locate} disabled={locating}>
              {locating ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Navigation className="mr-1.5 h-3.5 w-3.5" />
              )}
              Use my location
            </Button>
          </div>
        </div>
      ) : nearby.isPending && !!coords ? (
        <PlayRowsSkeleton rows={3} height="h-12" />
      ) : nearby.isError ? (
        <PlayErrorState
          message="We couldn't search nearby courses."
          onRetry={() => void nearby.refetch()}
          retrying={nearby.isFetching}
        />
      ) : (nearby.data ?? []).length === 0 ? (
        <Row muted>No approved courses within about 80 miles. Try browsing all courses.</Row>
      ) : (
        <ul className="divide-y divide-border/60">
          {(nearby.data ?? []).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <span className="truncate text-sm font-medium">{c.name}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.distanceMi} mi away
                  {c.holeCount ? ` · ${c.holeCount} holes` : ""}
                  {[c.city, c.state].filter(Boolean).length
                    ? ` · ${[c.city, c.state].filter(Boolean).join(", ")}`
                    : ""}
                </div>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to="/courses/$courseId" params={{ courseId: c.id }}>
                  Open
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <div className={"py-3 text-sm " + (muted ? "text-muted-foreground" : "")}>{children}</div>;
}
