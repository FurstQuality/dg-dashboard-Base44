import { satelliteStillUrl } from "@/lib/course-imagery";
import { ClientOnly, Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { CourseConditionBadge } from "@/components/courses/course-condition-badge";
import { useCourseStatuses, useLiveConditions } from "@/lib/course-conditions-live";
// Course Studio opens on top of the directory so closing it returns to the same map.
const CourseStudio = lazy(() => import("@/components/pages/courses-new-page"));
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { UseCurrentLocationButton } from "@/components/use-current-location-button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BadgeCheck,
  BarChart3,
  BookOpen,
  LayoutGrid,
  MapPin,
  SlidersHorizontal,
  Plus,
  RotateCcw,
  Rows3,
  Search,
  Target,
  X,
} from "lucide-react";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { NowCourses } from "@/components/now/now-courses";
import type { MapViewport } from "@/components/course/course-directory-map";
const CourseDirectoryMap = lazy(() =>
  import("@/components/course/course-directory-map").then((m) => ({
    default: m.CourseDirectoryMap,
  })),
);
import { AddCoursePanel } from "@/components/course/add-course-panel";
import type L from "leaflet";
import { useSession, useMyProfile } from "@/lib/current-user";
import { stateName, normalizeStateCode } from "@/lib/us-states";

import {
  getDirectoryMapView,
  listCourseStates,
  searchCourseDirectory,
  type DirectoryCourse,
} from "@/lib/course-directory.functions";

const PAGE_SIZE = 24;

/** Stable empty results. A fresh [] each render would restart the map's
 *  framing effect on every render and spin the page into a render loop. */
const NO_COURSES: DirectoryCourse[] = [];
const NO_STATES: { state: string; count: number }[] = [];

/** Great-circle distance in miles, used for the "closest to me" ordering. */
function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

const routeApi = getRouteApi("/_authenticated/courses/");

const SCORING_VALUES = ["any", "verified", "ready", "pending"] as const;
type ScoringValue = (typeof SCORING_VALUES)[number];

const RADIUS_VALUES = ["any", "10", "25", "50", "100", "250", "500"] as const;
/** The directory opens on nearby courses instead of a whole state. */
const DEFAULT_RADIUS = "100";
const FILTER_STORAGE_KEY = "dgd:courses:filters:v1";

type SavedFilters = {
  q: string;
  state: string;
  holes: string;
  scoring: string;
  minRating: string;
  difficulty: string;
  sort: string;
  view: string;
  radius: string;
  origin: { lat: number; lng: number } | null;
};

const FILTER_DEFAULTS: SavedFilters = {
  q: "",
  state: "all",
  holes: "any",
  scoring: "any",
  minRating: "any",
  difficulty: "any",
  sort: "near",
  view: "grid",
  radius: DEFAULT_RADIUS,
  origin: null,
};

/** Filters persist per browser so the directory reopens exactly as the player
 *  left it, until they change or clear them. */
function readSavedFilters(): SavedFilters {
  if (typeof window === "undefined") return FILTER_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return FILTER_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<SavedFilters>;
    return { ...FILTER_DEFAULTS, ...parsed };
  } catch {
    return FILTER_DEFAULTS;
  }
}

export default function CoursesIndex() {
  const urlFilters = routeApi.useSearch();
  const navigate = useNavigate({ from: "/courses/" });
  const { user } = useSession();
  const { profile } = useMyProfile(user);
  const search = useServerFn(searchCourseDirectory);
  const states = useServerFn(listCourseStates);
  const mapView = useServerFn(getDirectoryMapView);

  // A link that carries filters wins; otherwise reopen the saved filter set.
  const [seed] = useState<SavedFilters>(() => {
    const urlHasFilters =
      urlFilters.q !== "" ||
      urlFilters.state !== "all" ||
      urlFilters.holes !== "any" ||
      urlFilters.scoring !== "any" ||
      urlFilters.minRating !== "any" ||
      urlFilters.difficulty !== "any" ||
      urlFilters.sort !== "name" ||
      urlFilters.radius !== "";
    const savedFilters = readSavedFilters();
    if (!urlHasFilters) return savedFilters;
    return {
      q: urlFilters.q,
      state: urlFilters.state,
      holes: urlFilters.holes,
      scoring: urlFilters.scoring,
      minRating: urlFilters.minRating,
      difficulty: urlFilters.difficulty,
      sort: urlFilters.sort,
      view: urlFilters.view,
      radius: (RADIUS_VALUES as readonly string[]).includes(urlFilters.radius)
        ? urlFilters.radius
        : savedFilters.radius,
      origin: savedFilters.origin,
    };
  });

  const [q, setQ] = useState(seed.q);
  const [debouncedQ, setDebouncedQ] = useState(seed.q);
  const [state, setState] = useState(seed.state);
  const [holes, setHoles] = useState(seed.holes);
  const [scoring, setScoring] = useState<ScoringValue>(
    (SCORING_VALUES as readonly string[]).includes(seed.scoring)
      ? (seed.scoring as ScoringValue)
      : "any",
  );
  const [minRating, setMinRating] = useState(seed.minRating);
  const [difficulty, setDifficulty] = useState(seed.difficulty);
  const [sort, setSort] = useState(seed.sort);
  const [radius, setRadius] = useState(
    (RADIUS_VALUES as readonly string[]).includes(seed.radius) ? seed.radius : DEFAULT_RADIUS,
  );
  const [view, setView] = useState<"grid" | "table">(seed.view === "table" ? "table" : "grid");

  const [page, setPage] = useState(1);

  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(seed.origin);

  const [locating, setLocating] = useState(seed.origin === null);
  // The list always mirrors the courses inside the map view.
  const followMap = true;
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  // Start a round links here with locate=1, so the map opens zoomed to the
  // player's area for course selection instead of showing the whole country.
  const [wantsLocalView] = useState(() => urlFilters.locate === "1");
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(seed.origin);

  useEffect(() => {
    if (!wantsLocalView) return;
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setOrigin(coords);
        setFocus(coords);
        setSort("near");
        setPage(1);
      },
      () => {},
      { timeout: 8000 },
    );
  }, [wantsLocalView]);

  // Single source of truth for the filter payload, so the list and the map
  // always resolve the identical result set.
  const filters = useMemo(
    () => ({
      q: debouncedQ || undefined,
      state,
      holes,
      scoring,
      minRating: minRating === "any" ? undefined : Number(minRating),
      difficulty,
    }),
    [debouncedQ, state, holes, scoring, minRating, difficulty],
  );
  const filterKey = useMemo(
    () => `${debouncedQ}|${state}|${holes}|${scoring}|${minRating}|${difficulty}`,
    [debouncedQ, state, holes, scoring, minRating, difficulty],
  );

  // Keep the URL in step with the controls so the view stays shareable and the
  // explorer link always carries the live filter set.
  useEffect(() => {
    navigate({
      replace: true,
      search: (previous) => ({
        // Studio is a destination, not a filter. Keep its course ID when
        // normalizing filters on a direct visit or refresh.
        ...previous,
        q: debouncedQ,
        state,
        holes,
        scoring,
        minRating,
        difficulty,
        sort,
        view,
        radius,
        locate: "",
        add: "",
      }),
    });
  }, [navigate, debouncedQ, state, holes, scoring, minRating, difficulty, sort, view, radius]);

  // Remember the filter set (and the located origin it is measured from) so the
  // directory reopens on the same view until the player changes or clears it.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({
          q: debouncedQ,
          state,
          holes,
          scoring,
          minRating,
          difficulty,
          sort,
          view,
          radius,
          origin,
        } satisfies SavedFilters),
      );
    } catch {
      // Private browsing can block storage; filters just won't persist.
    }
  }, [debouncedQ, state, holes, scoring, minRating, difficulty, sort, view, radius, origin]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // The directory opens on courses near the player, so resolve a location once.
  // If the device refuses, fall back to the profile's home state so the list is
  // still local instead of nationwide.
  const [locateTried, setLocateTried] = useState(seed.origin !== null);
  useEffect(() => {
    if (locateTried) return;
    setLocateTried(true);
    if (!navigator.geolocation) {
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setOrigin(coords);
        setFocus(coords);
        setLocating(false);
        setPage(1);
      },
      () => {
        setLocating(false);
        const code =
          normalizeStateCode(profile?.home_state ?? null) ??
          normalizeStateCode(profile?.location ?? null);
        if (code) {
          setState((prev) => (prev === "all" ? code : prev));
          setPage(1);
        }
      },
      { timeout: 8000 },
    );
  }, [locateTried, profile]);

  // The map loads only what is in view: grouped counts when a view holds too
  // many courses, real pins when zoomed in. The bounding box of every match
  // still comes back so the map can frame the results.
  const [viewZoom, setViewZoom] = useState(4);
  const radiusMilesForQuery = radius === "any" ? null : Number(radius);
  const viewBox = useMemo(() => {
    if (radiusMilesForQuery !== null && origin) {
      const dLat = radiusMilesForQuery / 69;
      const dLng = radiusMilesForQuery / (69 * Math.max(0.2, Math.cos((origin.lat * Math.PI) / 180)));
      return { south: origin.lat - dLat, north: origin.lat + dLat, west: origin.lng - dLng, east: origin.lng + dLng, zoom: 10, forcePins: true };
    }
    if (!viewport) return { south: 18, north: 72, west: -170, east: -60, zoom: 4, forcePins: false };
    // Pad and round the window so small pans reuse the cached result.
    const padLat = (viewport.north - viewport.south) * 0.2;
    const padLng = (viewport.east - viewport.west) * 0.2;
    const r = (v: number) => Math.round(v * 20) / 20;
    return {
      south: Math.max(-90, r(viewport.south - padLat)),
      north: Math.min(90, r(viewport.north + padLat)),
      west: r(viewport.west - padLng),
      east: r(viewport.east + padLng),
      zoom: Math.round(viewZoom),
      forcePins: false,
    };
  }, [viewport, viewZoom, radiusMilesForQuery, origin]);
  const pinsQuery = useQuery({
    queryKey: ["course-directory", "map-view", filterKey, viewBox],
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: () => mapView({ data: { ...filters, ...viewBox } }),
  });
  const pins = pinsQuery.data?.pins ?? NO_COURSES;
  const mapClusters = pinsQuery.data?.clusters ?? null;
  const mapFitBox = pinsQuery.isPlaceholderData ? null : (pinsQuery.data?.bbox ?? null);
  const mapTotal = pinsQuery.data?.total;
  const pinsLoading = pinsQuery.isPending;

  const stateOptionsQuery = useQuery({
    queryKey: ["course-directory", "states"],
    staleTime: 30 * 60_000,
    queryFn: () => states({}),
  });
  const stateOptions = stateOptionsQuery.data ?? NO_STATES;

  const radiusMiles = radius === "any" ? null : Number(radius);
  const radiusActive = radiusMiles !== null && origin !== null;

  /** Courses that pass the filters and sit inside the distance limit. */
  const scopedPins = useMemo(() => {
    if (!radiusActive || !origin || radiusMiles === null) return pins;
    return pins.filter((c) => {
      const lat = c.latitude as number | null;
      const lng = c.longitude as number | null;
      if (lat == null || lng == null) return false;
      return milesBetween(origin, { lat, lng }) <= radiusMiles;
    });
  }, [pins, radiusActive, origin, radiusMiles]);

  const sortRows = useMemo(() => {
    return (rows: DirectoryCourse[]) => {
      const sorted = [...rows];
      if (sort === "rating") sorted.sort((a, b) => (b.pdga_rating ?? 0) - (a.pdga_rating ?? 0));
      else if (sort === "reviews")
        sorted.sort((a, b) => (b.pdga_rating_votes ?? 0) - (a.pdga_rating_votes ?? 0));
      else if (sort === "holes") sorted.sort((a, b) => (b.hole_count ?? 0) - (a.hole_count ?? 0));
      else if (sort === "near" && origin)
        sorted.sort(
          (a, b) =>
            milesBetween(origin, { lat: a.latitude as number, lng: a.longitude as number }) -
            milesBetween(origin, { lat: b.latitude as number, lng: b.longitude as number }),
        );
      else sorted.sort((a, b) => a.name.localeCompare(b.name));
      return sorted;
    };
  }, [sort, origin]);

  const nearest = useMemo(() => {
    // Map pins already carry every active filter (including builder
    // readiness), so distance work can run directly on them.
    if (!pinsQuery.data || pinsQuery.isError || mapClusters) return null;
    if ((sort !== "near" && !radiusActive) || !origin) return null;
    return sortRows(scopedPins).map((c) => ({
      course: c,
      miles: milesBetween(origin, { lat: c.latitude as number, lng: c.longitude as number }),
    }));
  }, [sort, origin, radiusActive, scopedPins, sortRows, pinsQuery.data, pinsQuery.isError, mapClusters]);

  // Courses inside the current map window, ordered with the active sort, so the
  // tiles below the map always mirror what is on screen as the user pans/zooms.
  const inView = useMemo(() => {
    if (!pinsQuery.data || pinsQuery.isError || !followMap || !viewport || mapClusters) return null;
    const { north, south, east, west } = viewport;
    const wraps = west > east;
    const rows = scopedPins.filter((c) => {
      const lat = c.latitude as number | null;
      const lng = c.longitude as number | null;
      if (lat == null || lng == null) return false;
      if (lat < south || lat > north) return false;
      return wraps ? lng >= west || lng <= east : lng >= west && lng <= east;
    });
    return sortRows(rows);
  }, [followMap, viewport, scopedPins, sortRows, mapClusters, pinsQuery.data, pinsQuery.isError]);

  // Map-view and distance results are already in memory; everything else is a
  // cached, retryable server search so paging never blanks the list.
  const usesServerSearch = !inView && !nearest;
  const searchQuery = useQuery({
    queryKey: ["course-directory", "search", filterKey, sort, page],
    enabled: usesServerSearch,
    staleTime: 60_000,
    retry: 1,
    placeholderData: keepPreviousData,
    queryFn: () => search({ data: { ...filters, sort, page, pageSize: PAGE_SIZE } }),
  });

  const { courses, total } = useMemo<{ courses: DirectoryCourse[] | null; total: number }>(() => {
    const start = (page - 1) * PAGE_SIZE;
    if (inView) return { courses: inView.slice(start, start + PAGE_SIZE), total: inView.length };
    if (nearest)
      return {
        courses: nearest.slice(start, start + PAGE_SIZE).map((n) => n.course),
        total: nearest.length,
      };
    if (searchQuery.isError) return { courses: NO_COURSES, total: 0 };
    if (!searchQuery.data) return { courses: null, total: 0 };
    return { courses: searchQuery.data.courses, total: searchQuery.data.total };
  }, [inView, nearest, page, searchQuery.data, searchQuery.isError]);
  const pageIds = useMemo(() => (courses ?? []).map((c) => c.id), [courses]);
  const { data: condStatus } = useCourseStatuses(pageIds);
  const { data: condIssues = [] } = useLiveConditions(pageIds);

  const searchFailed = usesServerSearch && searchQuery.isError;

  const distanceById = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of nearest ?? []) map.set(n.course.id, n.miles);
    return map;
  }, [nearest]);

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const scoringLabels: Record<typeof scoring, string> = {
    any: "",
    verified: "Verified layout",
    ready: "Layout built",
    pending: "Needs a layout",
  };
  const holeLabels: Record<string, string> = {
    "9": "9 or fewer holes",
    "18": "10 to 18 holes",
    "24+": "19 or more holes",
  };

  const activeFilters: { key: string; label: string; clear: () => void }[] = [];
  if (debouncedQ)
    activeFilters.push({
      key: "q",
      label: `“${debouncedQ}”`,
      clear: () => {
        setQ("");
        setPage(1);
      },
    });
  if (state !== "all")
    activeFilters.push({
      key: "state",
      label: stateName(state),
      clear: () => {
        setState("all");
        setPage(1);
      },
    });
  if (holes !== "any")
    activeFilters.push({
      key: "holes",
      label: holeLabels[holes] ?? holes,
      clear: () => {
        setHoles("any");
        setPage(1);
      },
    });
  if (scoring !== "any")
    activeFilters.push({
      key: "scoring",
      label: scoringLabels[scoring],
      clear: () => {
        setScoring("any");
        setPage(1);
      },
    });
  if (minRating !== "any")
    activeFilters.push({
      key: "rating",
      label: `${minRating}★ and up`,
      clear: () => {
        setMinRating("any");
        setPage(1);
      },
    });
  if (difficulty !== "any")
    activeFilters.push({
      key: "difficulty",
      label: difficulty,
      clear: () => {
        setDifficulty("any");
        setPage(1);
      },
    });
  if (radius !== "any")
    activeFilters.push({
      key: "radius",
      label: origin ? `Within ${radius} miles` : `Within ${radius} miles (needs your location)`,
      clear: () => {
        setRadius("any");
        setPage(1);
      },
    });
  if (sort !== "name")
    activeFilters.push({
      key: "sort",
      label: `Sorted: ${sort === "near" ? "closest to me" : sort}`,
      clear: () => {
        setSort("name");
        setPage(1);
      },
    });

  const [mobileFilters, setMobileFilters] = useState(false);
  const [adding, setAdding] = useState(urlFilters.add === "1");
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const [mapRef, setMapRef] = useState<L.Map | null>(null);
  // Keep the map where the user left it: returning from Course Studio (or a
  // course page) reopens the directory at the same spot and zoom.
  useEffect(() => {
    if (!mapRef) return;
    const KEY = "dgd:courses-map-view";
    if (!wantsLocalView) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
        if (saved && typeof saved.lat === "number" && typeof saved.zoom === "number") {
          // Wait for the map's own first framing, then restore.
          setTimeout(() => mapRef.setView([saved.lat, saved.lng], saved.zoom, { animate: false }), 300);
        }
      } catch {
        /* ignore bad saved view */
      }
    }
    const save = () => {
      const c = mapRef.getCenter();
      sessionStorage.setItem(KEY, JSON.stringify({ lat: c.lat, lng: c.lng, zoom: mapRef.getZoom() }));
    };
    mapRef.on("moveend", save);
    return () => {
      mapRef.off("moveend", save);
    };
  }, [mapRef, wantsLocalView]);
  function resetFilters() {
    setQ("");
    setState("all");
    setHoles("any");
    setScoring("any");
    setMinRating("any");
    setDifficulty("any");
    setSort("name");
    setRadius("any");
    setPage(1);
  }

  const studioId = urlFilters.studio;
  if (studioId) {
    return (
      <ClientOnly fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
          <CourseStudio courseId={studioId} key={studioId} />
        </Suspense>
      </ClientOnly>
    );
  }
  return (
    <PageShell>
      <PageHeader
        eyebrow="Play"
        title="Courses"
        description="Find a course near you — layouts, reviews and directions."
        primaryAction={
          <Button
            onClick={() => {
              setAdding(true);
              setPicked(null);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add course
          </Button>
        }
        secondaryAction={
          <div className="hidden flex-wrap items-center gap-2 sm:flex">
            <Button asChild variant="outline">
              <Link to="/stats" search={{ tab: "courses" }}>
                <BarChart3 className="mr-1 h-4 w-4" /> Compare &amp; analyze
              </Link>
            </Button>

            <Button asChild variant="outline">
              <Link to="/course-book">
                <BookOpen className="mr-1 h-4 w-4" /> Course Scrapbook
              </Link>
            </Button>
          </div>
        }
      />

      <NowCourses />

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-full sm:min-w-[220px] sm:basis-auto">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by course, city, or state…"
              className="h-11 pl-9 sm:h-10"
            />
          </div>
          <Button
            variant="outline"
            className="h-11 flex-1 gap-1 sm:hidden"
            onClick={() => setMobileFilters((v) => !v)}
            aria-expanded={mobileFilters}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {mobileFilters ? "Hide filters" : "Filters"}
            {activeFilters.length ? <span className="text-xs text-muted-foreground">({activeFilters.length})</span> : null}
          </Button>
          <div className={(mobileFilters ? "flex" : "hidden") + " w-full flex-wrap items-center gap-2 sm:contents"}>

          <Select
            value={state}
            onValueChange={(v) => {
              setState(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All states" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All states</SelectItem>
              {stateOptions.map((s) => (
                <SelectItem key={s.state} value={s.state}>
                  {stateName(s.state)} ({s.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={holes}
            onValueChange={(v) => {
              setHoles(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[175px]">
              <SelectValue placeholder="Any holes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any hole count</SelectItem>
              <SelectItem value="9">9 or fewer</SelectItem>
              <SelectItem value="18">10 to 18</SelectItem>
              <SelectItem value="24+">19 or more</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={scoring}
            onValueChange={(v) => {
              setScoring(v as typeof scoring);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Builder status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any builder status</SelectItem>
              <SelectItem value="verified">Verified layout</SelectItem>
              <SelectItem value="ready">Layout built</SelectItem>
              <SelectItem value="pending">Needs a layout</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={minRating}
            onValueChange={(v) => {
              setMinRating(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[185px]">
              <SelectValue placeholder="Any rating" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any player rating</SelectItem>
              <SelectItem value="3">3.0★ and up</SelectItem>
              <SelectItem value="3.5">3.5★ and up</SelectItem>
              <SelectItem value="4">4.0★ and up</SelectItem>
              <SelectItem value="4.5">4.5★ and up</SelectItem>
            </SelectContent>
          </Select>

          </div>
          <UseCurrentLocationButton
            className="h-11 flex-1 sm:h-10 sm:flex-none"
            size="default"
            onLocated={(coords) => {
              setOrigin(coords);
              setFocus(coords);
              setLocating(false);
              setSort("near");
              setPage(1);
            }}
          />
          <div className={(mobileFilters ? "flex" : "hidden") + " w-full flex-wrap items-center gap-2 sm:contents"}>

          <Select
            value={radius}
            onValueChange={(v) => {
              setRadius(v);
              setPage(1);
              if (v !== "any" && !origin) {
                setLocating(true);
                navigator.geolocation?.getCurrentPosition(
                  (pos) => {
                    const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    setOrigin(coords);
                    setFocus(coords);
                    setLocating(false);
                    setPage(1);
                  },
                  () => setLocating(false),
                  { timeout: 8000 },
                );
              }
            }}
          >
            <SelectTrigger className="w-[185px]">
              <SelectValue placeholder="Distance" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any distance</SelectItem>
              <SelectItem value="10">Within 10 miles</SelectItem>
              <SelectItem value="25">Within 25 miles</SelectItem>
              <SelectItem value="50">Within 50 miles</SelectItem>
              <SelectItem value="100">Within 100 miles</SelectItem>
              <SelectItem value="250">Within 250 miles</SelectItem>
              <SelectItem value="500">Within 500 miles</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={difficulty}
            onValueChange={(v) => {
              setDifficulty(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Any difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any difficulty</SelectItem>
              <SelectItem value="Beginner">Beginner</SelectItem>
              <SelectItem value="Intermediate">Intermediate</SelectItem>
              <SelectItem value="Advanced">Advanced</SelectItem>
              <SelectItem value="Pro">Pro</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={sort}
            onValueChange={(v) => {
              if (v === "near" && !origin) {
                navigator.geolocation?.getCurrentPosition(
                  (pos) => {
                    setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                    setSort("near");
                    setPage(1);
                  },
                  () => setSort("name"),
                  { timeout: 8000 },
                );
                return;
              }
              setSort(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">A to Z</SelectItem>
              <SelectItem value="rating">Highest rated</SelectItem>
              <SelectItem value="newest">Newest added</SelectItem>
              <SelectItem value="oldest">Longest established</SelectItem>
              <SelectItem value="holes">Most holes</SelectItem>
              <SelectItem value="near">Closest to me</SelectItem>
            </SelectContent>
          </Select>

          </div>
          <div className="ml-auto hidden items-center gap-1 rounded-lg border border-border p-0.5 sm:flex">
            <Button
              size="sm"
              variant={view === "grid" ? "secondary" : "ghost"}
              onClick={() => setView("grid")}
              aria-pressed={view === "grid"}
            >
              <LayoutGrid className="mr-1 h-4 w-4" /> Cards
            </Button>
            <Button
              size="sm"
              variant={view === "table" ? "secondary" : "ghost"}
              onClick={() => setView("table")}
              aria-pressed={view === "table"}
            >
              <Rows3 className="mr-1 h-4 w-4" /> Table
            </Button>
          </div>
        </div>

        {activeFilters.length ? (
          <div className="flex flex-wrap items-center gap-2">
            {activeFilters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={f.clear}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs hover:border-primary/50"
              >
                {f.label}
                <X className="h-3 w-3" />
              </button>
            ))}
            <Button size="sm" variant="ghost" onClick={resetFilters}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset filters
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {locating
              ? "Finding courses near you…"
              : courses === null
                ? "Searching the library…"
                : inView
                  ? `${total.toLocaleString()} course${total === 1 ? "" : "s"} in the map view — page ${page} of ${lastPage}`
                  : `${total.toLocaleString()} course${total === 1 ? "" : "s"} match — showing page ${page} of ${lastPage} · map shows ${(mapTotal ?? scopedPins.length).toLocaleString()} mapped match${(mapTotal ?? scopedPins.length) === 1 ? "" : "es"}`}
          </span>

        </div>

        {pinsQuery.isError && (
          <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-4 text-sm">
            <p>The course map couldn&apos;t load. Showing library search results instead of map or distance results.</p>
            <Button className="mt-2" size="sm" onClick={() => void pinsQuery.refetch()}>
              <RotateCcw className="mr-1 h-4 w-4" /> Retry map
            </Button>
          </div>
        )}
        <Suspense
          fallback={<Skeleton className="h-[520px] w-full rounded-2xl sm:h-[680px] lg:h-[780px]" />}
        >
          {adding ? (
            <div className="mb-3">
              <AddCoursePanel
                picked={picked}
                onUseCenter={() => {
                  const c = mapRef?.getCenter();
                  if (c) setPicked({ lat: c.lat, lng: c.lng });
                }}
                onCancel={() => {
                  setAdding(false);
                  setPicked(null);
                }}
              />
            </div>
          ) : null}
          <CourseDirectoryMap
            onPick={adding ? setPicked : undefined}
            picked={adding ? picked : null}
            onMapReady={setMapRef}
            pins={scopedPins}
            loading={pinsLoading || locating}
            filterKey={`${filterKey}|${radius}|${origin ? `${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}` : ""}`}
            focus={focus}
            fitBox={mapFitBox}
            clusters={mapClusters}
            totalMatches={mapTotal}
            visibleCount={mapClusters ? pinsQuery.data?.inView : inView?.length}
            onViewportChange={(v) => {
              if (mapRef) setViewZoom(mapRef.getZoom());
              // Ignore repeats of the same window: re-storing an identical
              // viewport would re-render the map and bounce the page between
              // framing and reporting until the tab runs out of memory.
              setViewport((prev) =>
                prev &&
                Math.abs(prev.north - v.north) < 1e-6 &&
                Math.abs(prev.south - v.south) < 1e-6 &&
                Math.abs(prev.east - v.east) < 1e-6 &&
                Math.abs(prev.west - v.west) < 1e-6
                  ? prev
                  : v,
              );
              setPage((prev) => (prev === 1 ? prev : 1));
            }}
            onLocate={(coords) => {
              setOrigin(coords);
              setFocus(coords);
              setSort("near");
              setPage(1);
            }}
          />
        </Suspense>

        {searchFailed ? (
          <div className="rounded-xl border border-destructive/40 bg-card p-10 text-center">
            <h3 className="font-display text-lg font-semibold">We couldn&apos;t load courses</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              The course library didn&apos;t answer. Check your connection and try again.
            </p>
            <div className="mt-4 flex justify-center">
              <Button onClick={() => void searchQuery.refetch()}>
                <RotateCcw className="mr-1 h-4 w-4" /> Try again
              </Button>
            </div>
          </div>
        ) : courses === null ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
            <h3 className="font-display text-lg font-semibold">Nothing matched that search</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different city or state — or add the course yourself and map it in Course Studio.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link to="/courses" search={(p) => ({ ...p, add: "1" })}>
                  <Plus className="mr-1 h-4 w-4" /> Add a course
                </Link>
              </Button>
              {activeFilters.length ? (
                <Button variant="outline" onClick={resetFilters}>
                  <RotateCcw className="mr-1 h-4 w-4" /> Reset filters
                </Button>
              ) : null}
            </div>
          </div>
        ) : view === "table" ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Course</th>
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 font-medium">Holes</th>
                  <th className="px-3 py-2 font-medium">Par</th>
                  <th className="px-3 py-2 font-medium">Distance</th>
                  <th className="px-3 py-2 font-medium">Builder status</th>
                  <th className="px-3 py-2 font-medium">Rating</th>
                  <th className="px-3 py-2 font-medium">Est.</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border/60 last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        to="/courses/$courseId"
                        params={{ courseId: c.id }}
                        className="font-medium hover:text-primary"
                      >
                        {c.name}
                      </Link>
                      <span className="ml-2 text-xs"><CourseConditionBadge status={condStatus?.get(c.id)} issues={condIssues.filter((r) => r.course_id === c.id)} /></span>
                      {distanceById.has(c.id) ? (
                        <span className="ml-2 text-xs text-primary">
                          {distanceById.get(c.id)!.toFixed(distanceById.get(c.id)! < 10 ? 1 : 0)} mi
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {[c.city, c.state].filter(Boolean).join(", ") || (
                        <span className="italic">Location unconfirmed</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{c.hole_count}</td>
                    <td className="px-3 py-2">
                      {c.layout_par ? `Par ${c.layout_par}` : (c.layout_count ?? 0) > 1 ? `${c.layout_count} layouts` : "—"}
                      {c.default_layout_name ? (
                        <span className="block text-xs text-muted-foreground">
                          Default: {c.default_layout_name}
                          {c.default_layout_par ? ` · Par ${c.default_layout_par}` : ""}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {c.layout_distance_ft ? `${c.layout_distance_ft.toLocaleString()} ft` : (c.layout_count ?? 0) > 1 ? "Varies by layout" : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {c.layout_verified ? (
                        <span className="inline-flex items-center gap-1 text-emerald-500">
                          <BadgeCheck className="h-3.5 w-3.5" /> Verified
                        </span>
                      ) : (c.layout_count ?? 0) > 0 ? (
                        <span className="text-sky-500">Layout built</span>
                      ) : (
                        <span className="text-amber-500">Layout needed</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {c.pdga_rating != null ? `${c.pdga_rating.toFixed(1)}★` : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{c.year_established ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => (
              <Link
                key={c.id}
                to="/courses/$courseId"
                params={{ courseId: c.id }}
                className="group flex gap-3 overflow-hidden rounded-2xl bg-card p-2.5 ring-1 ring-border/50 transition duration-200 hover:-translate-y-0.5 hover:ring-primary/40 hover:shadow-md active:scale-[0.98] motion-reduce:transform-none"
              >
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-24 sm:w-24">
                  {c.cover_url ? (
                    <img
                      src={c.cover_url}
                      alt={c.name}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105 motion-reduce:transform-none"
                      onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                      loading="lazy"
                    />
                  ) : c.latitude != null && c.longitude != null ? (
                    <img
                      src={satelliteStillUrl(c.latitude, c.longitude, { widthM: 450, px: 96 })}
                      onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                      alt={`Satellite view of ${c.name}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-muted-foreground">
                      <Target className="h-8 w-8 opacity-40" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 py-1 pr-1">
                  <div className="text-[15px] font-semibold leading-snug group-hover:text-primary">{c.name}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {[c.city, c.state].filter(Boolean).join(", ") || (
                      <span className="italic">Location unconfirmed</span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground sm:text-xs">
                    <span className="rounded-full bg-muted px-2 py-0.5">{c.hole_count} holes</span>
                    <CourseConditionBadge status={condStatus?.get(c.id)} issues={condIssues.filter((r) => r.course_id === c.id)} />
                    {distanceById.has(c.id) ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                        {distanceById.get(c.id)!.toFixed(distanceById.get(c.id)! < 10 ? 1 : 0)} mi
                        away
                      </span>
                    ) : null}
                    {c.layout_count == null ? null : c.layout_verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-500">
                        <BadgeCheck className="h-3.5 w-3.5" /> Verified layout
                      </span>
                    ) : c.layout_count > 0 ? (
                      <span className="rounded-full bg-sky-500/10 px-2 py-0.5 font-medium text-sky-500">
                        Layout built
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-amber-500">
                        Layout needed
                      </span>
                    )}
                    {c.layout_count ? (
                      <span className="rounded-full bg-muted px-2 py-0.5">
                        {c.layout_count} layout{c.layout_count === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    {c.layout_par ? (
                      <span className="rounded-full bg-muted px-2 py-0.5">Par {c.layout_par}</span>
                    ) : null}
                    {c.default_layout_name ? (
                      <span className="rounded-full bg-muted px-2 py-0.5">
                        Default: {c.default_layout_name}
                        {c.default_layout_par ? ` · Par ${c.default_layout_par}` : ""}
                      </span>
                    ) : null}
                    {c.layout_distance_ft ? (
                      <span className="rounded-full bg-muted px-2 py-0.5">
                        {c.layout_distance_ft.toLocaleString()} ft
                      </span>
                    ) : null}
                    {c.layout_mandos ? (
                      <span className="rounded-full bg-muted px-2 py-0.5">
                        {c.layout_mandos} mando{c.layout_mandos === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    {c.layout_water_holes ? (
                      <span className="rounded-full bg-muted px-2 py-0.5">
                        Water on {c.layout_water_holes}
                      </span>
                    ) : null}

                    {c.pdga_rating != null ? (
                      <span className="rounded-full bg-muted px-2 py-0.5">
                        {c.pdga_rating.toFixed(1)}★
                        {c.pdga_rating_votes ? ` · ${c.pdga_rating_votes}` : ""}
                      </span>
                    ) : null}
                    {c.year_established ? (
                      <span className="rounded-full bg-muted px-2 py-0.5">
                        Est. {c.year_established}
                      </span>
                    ) : null}
                    {c.difficulty ? (
                      <span className="rounded-full bg-muted px-2 py-0.5">{c.difficulty}</span>
                    ) : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {lastPage > 1 ? (
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <div className="text-xs text-muted-foreground">
              Page {page} of {lastPage}
            </div>
            <Button
              variant="outline"
              disabled={page >= lastPage}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
