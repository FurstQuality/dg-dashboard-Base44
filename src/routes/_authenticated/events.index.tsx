import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NowEvents } from "@/components/now/now-events";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { UseCurrentLocationButton } from "@/components/use-current-location-button";
import { supabase } from "@/integrations/supabase/client";
import { normalizeStateCode } from "@/lib/us-states";
import { timeAgo } from "@/lib/current-user";
import { listUnifiedEvents } from "@/lib/events.functions";
import {
  listDirectoryEvents,
  refreshDirectoryEvents,
  type DirectoryEventRow,
} from "@/lib/event-directory.functions";
import {
  tournamentsListQueryOptions,
  leaguesListQueryOptions,
  leagueNightsQueryOptions,
} from "@/lib/entities/events";
import { expandLeagueSeries } from "@/lib/event-series";
import { mergeDirectoryDuplicates } from "@/lib/league-duplicates";
import {
  buildTextMatch,
  buildWindowFilters,
  resolveEventWindow,
  serverSearchTerm,
  EVENT_LIBRARY_LIMITS,
  type EventWhen,
} from "@/lib/events-library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowUpDown,
  Calendar as CalIcon,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Columns3,
  HeartHandshake,
  Info,
  LayoutGrid,
  Link2,
  Map as MapIcon,
  MapPin,
  Plus,
  RefreshCw,
  Rows3,
  Radar,
  Search,
  SlidersHorizontal,
  Table as TableIcon,
  Trophy,
  X,
} from "lucide-react";
import { PlannerPanel } from "@/components/planner/planner-panel";
import { PageShell, PageHeader } from "@/components/shell";
import { useDirectorAccess } from "@/lib/director-access";
import { EventsViewTabs, type EventsView } from "@/components/events/events-view-tabs";
import { MyEventsCalendar } from "@/components/events/my-events-calendar";
import { OutreachEventsPanel } from "@/components/events/outreach-events-panel";
import { SmartLink } from "@/components/statboard/smart-link";
import { classifyEvent } from "@/lib/tournament-knowledge";
import { SanctioningInfoPopover } from "@/components/sanctioning-info-popover";
import { EventsTable } from "@/components/events/events-table";
import { TrackedEventsPanel } from "@/components/tracker/tracked-events-panel";
import { EventsCardGrid } from "@/components/events/events-card-grid";
import {
  ALL_COLUMNS,
  DEFAULT_COLUMNS,
  SOURCE_META,
  inferKindFromTitle,
  type BucketFilter,
  type ColumnKey,
  type DateRange,
  type Density,
  type Kind,
  type KindTab,
  type SortKey,
  type Source,
  type UnifiedRow,
  type ViewMode,
} from "@/components/events/events-types";
import {
  EventsAdvancedFilters,
  type AdvancedFilterValues,
} from "@/components/events/events-advanced-filters";
import { EventsActiveChips, type ChipDef } from "@/components/events/events-active-chips";
import {
  EventsSmartPresets,
  TIER_GROUP_META,
  TIER_GROUP_ORDER,
  tierGroupOf,
  tierRank,
  type SmartPresetPatch,
  type TierGroup,
} from "@/components/events/events-smart-filters";
import { EventsSavedViews } from "@/components/events/events-saved-views";
import { EventsExportMenu } from "@/components/events/events-export-menu";
import { collectStates, extractState } from "@/components/events/events-facets";
import { groupRows, VALID_GROUP, type GroupBy } from "@/components/events/events-grouping";
import { EventsCalendar } from "@/components/events/events-calendar";
import { matchesOmnisearch } from "@/lib/omnisearch";
import {
  buildPlaceIndex,
  coordPlacement,
  eventPlacement,
  isOutsideUnitedStates,
  US_STATE_CENTROIDS,
  type LatLng,
} from "@/lib/event-geo";

// ---------------------------------------------------------------------------
// URL search-param schema — filters are shareable via URL
// ---------------------------------------------------------------------------
const SEARCH_DEFAULTS = {
  q: "",
  kind: "all" as KindTab,
  sources: "chainlink,pdga,udisc,scene",
  bucket: "all" as BucketFilter,
  tier: "any",
  tierGroup: "any",
  status: "any",
  division: "any",
  when: "any" as DateRange,
  sort: "distance_asc" as SortKey,
  view: "grid" as ViewMode,
  density: "comfortable" as Density,
  page: 1,
  pageSize: 24,
  // Advanced filters
  from: "",
  to: "",
  loc: "",
  state: "",
  radius: "any",
  cover: 0,
  crew: 0,
  mind: 0,
  // Grouping (grid view only)
  group: "none" as GroupBy,
};

const searchSchema = z.object({
  q: z.string().catch(SEARCH_DEFAULTS.q).default(SEARCH_DEFAULTS.q),
  kind: z.string().catch(SEARCH_DEFAULTS.kind).default(SEARCH_DEFAULTS.kind),
  sources: z.string().catch(SEARCH_DEFAULTS.sources).default(SEARCH_DEFAULTS.sources),
  bucket: z.string().catch(SEARCH_DEFAULTS.bucket).default(SEARCH_DEFAULTS.bucket),
  tier: z.string().catch(SEARCH_DEFAULTS.tier).default(SEARCH_DEFAULTS.tier),
  tierGroup: z.string().catch(SEARCH_DEFAULTS.tierGroup).default(SEARCH_DEFAULTS.tierGroup),
  status: z.string().catch(SEARCH_DEFAULTS.status).default(SEARCH_DEFAULTS.status),
  division: z.string().catch(SEARCH_DEFAULTS.division).default(SEARCH_DEFAULTS.division),
  when: z.string().catch(SEARCH_DEFAULTS.when).default(SEARCH_DEFAULTS.when),
  sort: z.string().catch(SEARCH_DEFAULTS.sort).default(SEARCH_DEFAULTS.sort),
  view: z.string().catch(SEARCH_DEFAULTS.view).default(SEARCH_DEFAULTS.view),
  density: z.string().catch(SEARCH_DEFAULTS.density).default(SEARCH_DEFAULTS.density),
  page: z.number().int().catch(SEARCH_DEFAULTS.page).default(SEARCH_DEFAULTS.page),
  pageSize: z.number().int().catch(SEARCH_DEFAULTS.pageSize).default(SEARCH_DEFAULTS.pageSize),
  from: z.string().catch("").default(""),
  to: z.string().catch("").default(""),
  loc: z.string().catch("").default(""),
  state: z.string().catch("").default(""),
  radius: z.string().catch(SEARCH_DEFAULTS.radius).default(SEARCH_DEFAULTS.radius),
  cover: z.number().int().catch(0).default(0),
  crew: z.number().int().catch(0).default(0),
  mind: z.number().int().catch(0).default(0),
  group: z.string().catch("none").default("none"),
  /** "mine" shows only the events you track or signed up for. */
  scope: z.string().catch("all").default("all"),
  /** Top-level view: the directory, your own calendar, or community outreach. */
  hub: z.string().catch("browse").default("browse"),
});

type EventsSearch = z.infer<typeof searchSchema>;

/** Distance filter options, in miles. "any" removes the distance limit. */
const RADIUS_VALUES = ["any", "10", "25", "50", "100", "250", "500"];
const ORIGIN_STORAGE_KEY = "dgd:events:origin:v1";

const VALID_SOURCES = new Set<Source>(["chainlink", "pdga", "udisc", "scene"]);
const VALID_KINDS = new Set(["all", "tournament", "league", "casual"]);
const VALID_BUCKETS = new Set(["all", "sanctioned", "unsanctioned", "casual"]);
const VALID_WHEN = new Set<DateRange>(["any", "upcoming", "today", "tomorrow", "weekend", "week", "month", "year", "past"]);
const VALID_VIEW = new Set<ViewMode>(["grid", "table", "calendar", "map", "week", "month"]);
const PLANNER_VIEWS = new Set<ViewMode>(["map", "week", "month"]);
const VALID_DENSITY = new Set<Density>(["compact", "comfortable"]);
const VALID_SORTS = new Set<SortKey>([
  "date_asc",
  "date_desc",
  "name_asc",
  "name_desc",
  "tier_asc",
  "tier_desc",
  "source_asc",
  "location_asc",
  "crew_desc",
  "bucket_asc",
  "distance_asc",
  "tier_rank_asc",
  "tier_rank_desc",
  "kind_asc",
]);
const VALID_TIER_GROUPS = new Set<string>(["any", ...TIER_GROUP_ORDER]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const safeDate = (v: string) => (ISO_DATE.test(v) ? v : "");

function parseSources(csv: string): Set<Source> {
  const parts = csv
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Source => VALID_SOURCES.has(s as Source));
  if (parts.length === 0) return new Set<Source>(["chainlink", "pdga", "udisc", "scene"]);
  return new Set(parts);
}

function normalizeSearch(s: EventsSearch) {
  return {
    q: s.q.slice(0, 200),
    kind: (VALID_KINDS.has(s.kind) ? s.kind : "all") as KindTab,
    sources: parseSources(s.sources),
    bucket: (VALID_BUCKETS.has(s.bucket) ? s.bucket : "all") as BucketFilter,
    tier: s.tier || "any",
    tierGroup: (VALID_TIER_GROUPS.has(s.tierGroup) ? s.tierGroup : "any") as TierGroup | "any",
    status: s.status || "any",
    division: s.division || "any",
    when: (VALID_WHEN.has(s.when as DateRange) ? s.when : "any") as DateRange,
    sort: (VALID_SORTS.has(s.sort as SortKey) ? s.sort : SEARCH_DEFAULTS.sort) as SortKey,
    view: (VALID_VIEW.has(s.view as ViewMode) ? s.view : "grid") as ViewMode,
    density: (VALID_DENSITY.has(s.density as Density) ? s.density : "comfortable") as Density,
    page: Math.max(1, s.page),
    pageSize: Math.max(12, Math.min(200, s.pageSize)),
    from: safeDate(s.from),
    to: safeDate(s.to),
    loc: (s.loc || "").slice(0, 100),
    state: (s.state || "").slice(0, 4).toUpperCase(),
    radius: RADIUS_VALUES.includes(s.radius) ? s.radius : SEARCH_DEFAULTS.radius,
    cover: s.cover ? 1 : 0,
    crew: s.crew ? 1 : 0,
    mind: Math.max(0, Math.min(30, s.mind || 0)),
    group: (VALID_GROUP.has(s.group as GroupBy) ? s.group : "none") as GroupBy,
    scope: (s.scope === "mine" ? "mine" : "all") as "mine" | "all",
  };
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
export const Route = createFileRoute("/_authenticated/events/")({
  validateSearch: searchSchema,
  component: EventsPage,
  head: () => ({
    meta: [
      { title: "Events library · DG Dashboard" },
      {
        name: "description",
        content:
          "Every Disc Golf Dashboard, PDGA, UDisc, and Disc Golf Scene event — one searchable directory with filters, sorting, table/grid views, column selection, and CSV export.",
      },
      { property: "og:title", content: "Events library · DG Dashboard" },
      {
        property: "og:description",
        content:
          "Search and filter every tournament and league across Disc Golf Dashboard, PDGA, UDisc, and Disc Golf Scene.",
      },
    ],
  }),
});

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------
type CommunityRow = {
  id: string;
  title: string;
  kind: string;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string | null;
  cover_url: string | null;
};

type ScheduledRow = {
  id: string;
  source: string;
  title: string;
  event_url: string | null;
  location: string | null;
  starts_on: string | null;
  ends_on: string | null;
  tier: string | null;
  status: string | null;
};

// ---------------------------------------------------------------------------
// Date range predicate
// ---------------------------------------------------------------------------
function withinRange(startISO: string | null, endISO: string | null, when: DateRange): boolean {
  if (when === "any") return true;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = startISO
    ? new Date(startISO.length === 10 ? `${startISO}T12:00:00` : startISO)
    : null;
  const end = endISO ? new Date(endISO.length === 10 ? `${endISO}T12:00:00` : endISO) : start;
  if (!start) return true;

  const overlaps = (from: Date, days: number) => {
    const to = new Date(from);
    to.setDate(to.getDate() + days);
    return start < to && (end ?? start) >= from;
  };
  switch (when) {
    case "today":
      return overlaps(today, 1);
    case "tomorrow": {
      const t = new Date(today);
      t.setDate(t.getDate() + 1);
      return overlaps(t, 1);
    }
    case "weekend": {
      // Upcoming Sat–Sun (today counts if it's already the weekend).
      const dow = today.getDay();
      const sat = new Date(today);
      if (dow === 0) sat.setDate(sat.getDate() - 1);
      else sat.setDate(sat.getDate() + (6 - dow));
      return overlaps(sat < today ? today : sat, dow === 0 ? 1 : 2);
    }
    case "upcoming":
      return (end ?? start) >= today;
    case "past":
      return (end ?? start) < today;
    case "week": {
      const in7 = new Date(today);
      in7.setDate(in7.getDate() + 7);
      return start <= in7 && (end ?? start) >= today;
    }
    case "month": {
      const in30 = new Date(today);
      in30.setDate(in30.getDate() + 30);
      return start <= in30 && (end ?? start) >= today;
    }
    case "year": {
      const inYear = new Date(today);
      inYear.setFullYear(inYear.getFullYear() + 1);
      return start <= inYear && (end ?? start) >= today;
    }
    default:
      return true;
  }
}

/** Loose key used to collapse the same event arriving from two sources. */
function directoryDedupeKey(title: string, start: string | null): string {
  return `${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()}|${(start ?? "").slice(0, 10)}`;
}

function directoryLocation(row: DirectoryEventRow): string | null {
  const place = [row.city, row.state ?? row.country].filter(Boolean).join(", ");
  if (row.venue_name && place) return `${row.venue_name} — ${place}`;
  return row.venue_name || place || null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
function ManageMyEventsLink() {
  const { isDirector } = useDirectorAccess();
  if (!isDirector) return null;
  return (
    <Link to="/director" className="text-sm font-medium text-primary hover:underline">
      Manage my events →
    </Link>
  );
}

function EventsPage() {
  const { hub } = Route.useSearch();
  if (hub === "mine") return <MyEventsCalendar />;
  if (hub === "outreach" || hub === "community") return <OutreachEventsPanel />;
  return <EventsLibrary />;
}

function EventsLibrary() {
  const search = Route.useSearch();
  const s = useMemo(() => normalizeSearch(search as EventsSearch), [search]);
  const navigate = useNavigate();

  function setSearch(patch: Partial<EventsSearch>) {
    navigate({
      to: "/events",
      search: ((prev: EventsSearch) => ({ ...prev, ...patch, page: patch.page ?? 1 })) as never,
      replace: true,
    });
  }

  // ---- Default view: soonest upcoming events in the player's home region ----
  // Only applied on a bare visit (no `when`/`state`/`loc` in the URL) so shared
  // links and manual filter resets are never overridden.
  const homeRegionQuery = useQuery({
    queryKey: ["events-library", "home-region"],
    queryFn: async (): Promise<{ state: string; location: string | null }> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return { state: "", location: null };
      const { data } = await supabase
        .from("profiles")
        .select("home_state, location")
        .eq("id", uid)
        .maybeSingle();
      // "Indiana" and "IN" must resolve to the same filter value.
      const explicit = normalizeStateCode(data?.home_state ?? null) ?? "";
      const fromLocation = normalizeStateCode(data?.location ?? null) ?? "";
      return {
        state: explicit || fromLocation,
        location: data?.location ?? null,
      };
    },
    staleTime: 5 * 60_000,
  });

  // ---- Distance filter -------------------------------------------------
  // Events only carry a free-text location, so distances come from resolving
  // "City, ST" against course coordinates (falling back to the state).
  const [origin, setOrigin] = useState<LatLng | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(ORIGIN_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as LatLng) : null;
      return parsed && typeof parsed.lat === "number" && typeof parsed.lng === "number"
        ? parsed
        : null;
    } catch {
      return null;
    }
  });
  const [locating, setLocating] = useState(false);
  const askedLocation = useRef(false);

  function requestLocation(explicit = false) {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      if (explicit) toast.error("Your browser can't share a location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setOrigin(next);
        try {
          localStorage.setItem(ORIGIN_STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* storage unavailable — distance still works this visit */
        }
        setLocating(false);
      },
      () => {
        setLocating(false);
        if (explicit)
          toast.error("We couldn't get your location", {
            description: "Allow location access, or filter by state instead.",
          });
      },
      { timeout: 8000, maximumAge: 10 * 60_000 },
    );
  }

  const radiusMiles = s.radius === "any" ? null : Number(s.radius);

  useEffect(() => {
    if (askedLocation.current) return;
    if (origin) return;
    askedLocation.current = true;
    requestLocation(false);
  }, [origin]);

  // Fall back to the player's home state centre when they don't share a location.
  const homeCentroid = useMemo(() => {
    const code = homeRegionQuery.data?.state ?? "";
    return code ? (US_STATE_CENTROIDS[code] ?? null) : null;
  }, [homeRegionQuery.data?.state]);
  const distanceOrigin = origin ?? homeCentroid;
  const originIsPrecise = !!origin;

  const placeIndexQuery = useQuery({
    queryKey: ["events-library", "place-index"],
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    queryFn: async () => {
      // One coordinate per city/state, deduplicated in Postgres, so the browser
      // never downloads the whole course table just to place event locations.
      const { data, error } = await supabase.rpc("course_place_index");
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        city: string | null;
        state: string | null;
        lat: number | null;
        lng: number | null;
      }>;
      return buildPlaceIndex(
        rows.map((row) => ({
          city: row.city,
          state: row.state,
          latitude: row.lat,
          longitude: row.lng,
        })),
      );
    },
  });

  const placeIndex = placeIndexQuery.data ?? null;

  /** Distance for one row: explicit coordinates first, then its city/state text. */
  function rowPlacement(r: UnifiedRow) {
    if (!distanceOrigin) return null;
    const byCoords = coordPlacement(r.lat, r.lng, distanceOrigin);
    if (byCoords) return byCoords;
    if (!placeIndex) return null;
    return eventPlacement(r.location, distanceOrigin, placeIndex);
  }

  /** Distance-filter verdict for one row. */
  function withinRadius(r: UnifiedRow): boolean {
    if (!radiusMiles || !distanceOrigin) return true;
    // Overseas and Canadian listings are never "near you", so they never show
    // up under a distance filter.
    if (isOutsideUnitedStates(r.location)) return false;
    const placed = rowPlacement(r);
    // A listing we can't put on the map can't be shown to be nearby either —
    // it's counted below the filters so nothing disappears silently.
    if (!placed) return false;
    // Distance is the only test, whatever the source or state: a chosen radius
    // means every event shown is inside it.
    return placed.miles <= radiusMiles;
  }

  const appliedHomeDefault = useRef(false);
  // Remembers a state filter the app chose for the player (not one they typed),
  // so an empty home region can fall back to the national view.
  const autoAppliedState = useRef<string | null>(null);
  const widenedFromHome = useRef(false);
  useEffect(() => {
    if (appliedHomeDefault.current) return;
    if (typeof window === "undefined") return;
    if (!homeRegionQuery.isSuccess) return;
    // Router writes schema defaults into the URL, so compare values instead of
    // key presence: only a filter-free view gets the home-region default.
    const untouched = s.when === "any" && !s.state && !s.loc && !s.from && !s.to && !s.q;
    appliedHomeDefault.current = true;
    if (!untouched) return;
    if (sessionStorage.getItem("dgd:events:home-default") === "1") return;
    sessionStorage.setItem("dgd:events:home-default", "1");
    autoAppliedState.current = null;
    setSearch({ when: "upcoming", sort: "distance_asc" });
  }, [
    homeRegionQuery.isSuccess,
    homeRegionQuery.data?.state,
    s.when,
    s.state,
    s.loc,
    s.from,
    s.to,
    s.q,
  ]);

  // Column visibility persists in localStorage — treat as user preference, not URL state.
  const [columns, setColumns] = useState<ColumnKey[]>(() => {
    if (typeof window === "undefined") return DEFAULT_COLUMNS;
    try {
      const raw = localStorage.getItem("dgd:events:columns");
      if (!raw) return ALL_COLUMNS.filter((c) => c.defaultOn).map((c) => c.key);
      const parsed = JSON.parse(raw) as ColumnKey[];
      return parsed.filter((c) => (ALL_COLUMNS as { key: ColumnKey }[]).some((x) => x.key === c));
    } catch {
      return ALL_COLUMNS.filter((c) => c.defaultOn).map((c) => c.key);
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("dgd:events:columns", JSON.stringify(columns));
  }, [columns]);

  // ---- Data sources ----
  const listUnified = useServerFn(listUnifiedEvents);

  // Coarse narrowing pushed to Postgres: the active date window and any query
  // long enough to be selective. Facets, grouping, and column choices stay
  // client-side, so these filters only ever remove rows the UI would hide.
  const eventWindow = useMemo(
    () => resolveEventWindow({ when: s.when as EventWhen, from: s.from, to: s.to }),
    [s.when, s.from, s.to],
  );
  const searchTerm = useMemo(() => serverSearchTerm(s.q), [s.q]);

  const pdgaQuery = useQuery({
    queryKey: ["events-library", "pdga"],
    // Matches the other sources so the list doesn't reload on every tab focus.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: () =>
      listUnified({
        data: { q: null, tier: null, division: null, hasCrew: null, sort: "date" } as never,
      }),
  });

  const tournamentsQuery = useQuery(
    tournamentsListQueryOptions(EVENT_LIBRARY_LIMITS.tournaments, {
      window: eventWindow,
      q: s.q,
    }),
  );
  const leaguesQuery = useQuery(leaguesListQueryOptions({ q: s.q }));
  const leagueNightsQuery = useQuery(leagueNightsQueryOptions());
  const casualQuery = useQuery({
    queryKey: ["events-library", "community", { eventWindow, searchTerm }],
    queryFn: async (): Promise<CommunityRow[]> => {
      let query = supabase
        .from("community_events")
        .select("id, title, kind, location, starts_at, ends_at, status, cover_url")
        .neq("status", "cancelled");
      const { orExpr, startTo } = buildWindowFilters(eventWindow, {
        start: "starts_at",
        end: "ends_at",
      });
      if (orExpr) query = query.or(orExpr);
      if (startTo) query = query.lte("starts_at", `${startTo}T23:59:59`);
      const textMatch = buildTextMatch(searchTerm, ["title", "location"]);
      if (textMatch) query = query.or(textMatch);
      const { data, error } = await query
        .order("starts_at", { ascending: true })
        .limit(EVENT_LIBRARY_LIMITS.community);
      if (error) throw error;
      return (data as CommunityRow[]) ?? [];
    },
    staleTime: 60_000,
  });
  const scheduledQuery = useQuery({
    queryKey: ["events-library", "scheduled-udisc-scene", { eventWindow, searchTerm }],
    queryFn: async (): Promise<ScheduledRow[]> => {
      let query = supabase
        .from("scheduled_events")
        .select("id, source, title, event_url, location, starts_on, ends_on, tier, status")
        .in("source", ["udisc", "disc_golf_scene"]);
      const { orExpr, startTo } = buildWindowFilters(eventWindow, {
        start: "starts_on",
        end: "ends_on",
      });
      if (orExpr) query = query.or(orExpr);
      if (startTo) query = query.lte("starts_on", startTo);
      const textMatch = buildTextMatch(searchTerm, ["title", "location"]);
      if (textMatch) query = query.or(textMatch);
      const { data, error } = await query
        .order("starts_on", { ascending: true })
        .limit(EVENT_LIBRARY_LIMITS.scheduled);
      if (error) throw error;
      return (data as ScheduledRow[]) ?? [];
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
    refetchIntervalInBackground: false,
  });

  // Live directory: PDGA tour search + Disc Golf Scene + UDisc, swept server-side
  // into event_directory so the browser shows what is actually scheduled rather
  // than only events somebody imported. Refreshes itself when the mirror is stale.
  const loadDirectory = useServerFn(listDirectoryEvents);
  const directoryQuery = useQuery({
    queryKey: ["events-library", "directory", { state: s.state, searchTerm }],
    queryFn: () =>
      loadDirectory({
        data: {
          q: searchTerm || null,
          state: s.state || null,
          sources: null,
          dateFrom: eventWindow.startFrom ?? null,
          dateTo: eventWindow.startTo ?? null,
          autoRefresh: true,
        } as never,
      }),
    staleTime: 5 * 60_000,
    // Outside listings refresh on the server timer; keep an open page in step.
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  // Sources that failed their most recent sweep, labelled for players.
  const failedDirectorySources = useMemo(() => {
    const labels: Record<string, string> = {
      pdga: "PDGA",
      disc_golf_scene: "Disc Golf Scene",
      udisc: "UDisc",
    };
    return (directoryQuery.data?.syncs ?? [])
      .filter((sync) => !sync.ok)
      .map((sync) => labels[sync.source] ?? sync.source);
  }, [directoryQuery.data?.syncs]);

  const queryClient = useQueryClient();
  const runRefresh = useServerFn(refreshDirectoryEvents);
  const refreshMutation = useMutation({
    mutationFn: () => runRefresh({ data: { state: s.state || null, sources: null } as never }),
    onSuccess: (result) => {
      if (result.failed.length) {
        toast.warning(
          `Refreshed with ${result.failed.length} source${result.failed.length > 1 ? "s" : ""} unavailable`,
          { description: `Saved ${result.upserted} events. Try again in a few minutes.` },
        );
      } else {
        toast.success("Event directory refreshed", {
          description: `${result.upserted} live events from PDGA, Disc Golf Scene, and UDisc.`,
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["events-library", "directory"] });
    },
    onError: () =>
      toast.error("We couldn't reach the event sources", {
        description: "PDGA, Disc Golf Scene, or UDisc may be busy. Try again shortly.",
      }),
  });

  // A source that came back exactly at its cap may have more rows behind it —
  // tell the player to narrow instead of silently showing a partial library.
  const truncatedSources = useMemo(() => {
    const hit: string[] = [];
    if ((tournamentsQuery.data?.length ?? 0) >= EVENT_LIBRARY_LIMITS.tournaments)
      hit.push("tournaments");
    if ((leaguesQuery.data?.length ?? 0) >= EVENT_LIBRARY_LIMITS.leagues) hit.push("leagues");
    if ((casualQuery.data?.length ?? 0) >= EVENT_LIBRARY_LIMITS.community)
      hit.push("community events");
    if ((scheduledQuery.data?.length ?? 0) >= EVENT_LIBRARY_LIMITS.scheduled)
      hit.push("imported schedules");
    return hit;
  }, [tournamentsQuery.data, leaguesQuery.data, casualQuery.data, scheduledQuery.data]);

  // Name the sources that failed so a missing chunk of the library is obvious
  // instead of looking like "there are no events".
  const failedSources = useMemo(() => {
    const out: Array<{ label: string; retry: () => void }> = [];
    if (pdgaQuery.isError) out.push({ label: "PDGA", retry: () => void pdgaQuery.refetch() });
    if (tournamentsQuery.isError)
      out.push({ label: "tournaments", retry: () => void tournamentsQuery.refetch() });
    if (leaguesQuery.isError)
      out.push({ label: "leagues", retry: () => void leaguesQuery.refetch() });
    if (casualQuery.isError)
      out.push({ label: "community events", retry: () => void casualQuery.refetch() });
    if (scheduledQuery.isError)
      out.push({ label: "imported schedules", retry: () => void scheduledQuery.refetch() });
    if (directoryQuery.isError)
      out.push({ label: "UDisc & Disc Golf Scene", retry: () => void directoryQuery.refetch() });
    if (placeIndexQuery.isError)
      out.push({ label: "course locations", retry: () => void placeIndexQuery.refetch() });
    return out;
  }, [
    pdgaQuery.isError,
    pdgaQuery.refetch,
    tournamentsQuery.isError,
    tournamentsQuery.refetch,
    leaguesQuery.isError,
    leaguesQuery.refetch,
    casualQuery.isError,
    casualQuery.refetch,
    scheduledQuery.isError,
    scheduledQuery.refetch,
    directoryQuery.isError,
    directoryQuery.refetch,
    placeIndexQuery.isError,
    placeIndexQuery.refetch,
  ]);

  const loading =
    pdgaQuery.isLoading ||
    tournamentsQuery.isPending ||
    leaguesQuery.isPending ||
    casualQuery.isLoading ||
    scheduledQuery.isLoading ||
    directoryQuery.isLoading ||
    placeIndexQuery.isLoading;

  const showEveryNight = s.view === "calendar" || s.view === "week" || s.view === "month";
  const rows: UnifiedRow[] = useMemo(() => {
    const out: UnifiedRow[] = [];

    for (const t of tournamentsQuery.data ?? []) {
      out.push({
        id: `t:${t.id}`,
        kind: "tournament",
        source: "chainlink",
        bucket: classifyEvent({
          source: "chainlink",
          kind: "tournament",
          tier: t.pdga_tier,
          title: t.name,
          pdga_sanctioned: t.pdga_sanctioned,
        }),
        title: t.name,
        start_date: t.start_date,
        end_date: t.end_date,
        location: t.location,
        tier: t.pdga_tier,
        status: t.status,
        crew_count: null,
        divisions: [],
        cover_url: t.cover_url,
        lat: t.latitude,
        lng: t.longitude,
        register: t.registration_url
          ? { label: "Register", url: t.registration_url }
          : { label: "Register", to: "/tournaments/$slug", params: { slug: t.slug } },
        linkTo: { to: "/tournaments/$slug", params: { slug: t.slug } },
      });
    }

    // A league is a season, so it is listed as its nights: one row per date,
    // each pointing back at the full schedule.
    const nightsByLeague = new Map<string, typeof leagueNightsQuery.data>();
    for (const n of leagueNightsQuery.data ?? []) {
      nightsByLeague.set(n.league_id, [...(nightsByLeague.get(n.league_id) ?? []), n]);
    }
    for (const l of leaguesQuery.data ?? []) {
      const nights = nightsByLeague.get(l.id) ?? [];
      const base = {
        kind: "league" as const,
        source: "chainlink" as const,
        bucket: "unsanctioned" as const,
        location: null,
        tier: l.season,
        status: l.status,
        crew_count: null,
        divisions: [],
        cover_url: null,
        register: { label: "Join league", to: "/leagues/$slug", params: { slug: l.slug } },
        linkTo: { to: "/leagues/$slug", params: { slug: l.slug } },
      };
      if (nights.length === 0) {
        out.push({ ...base, id: `l:${l.id}`, title: l.name, start_date: null, end_date: null });
        continue;
      }
      // Lists show each league once, at its next night; calendars keep every night.
      const todayIso = new Date().toISOString().slice(0, 10);
      const nextIdx = Math.max(
        0,
        nights.findIndex((n) => (n.event_date ?? "") >= todayIso),
      );
      nights.forEach((n, i) => {
        if (!showEveryNight && i !== (nights.some((x) => (x.event_date ?? "") >= todayIso) ? nextIdx : nights.length - 1)) return;
        out.push({
          ...base,
          id: `l:${l.id}:${n.id}`,
          title: n.name?.trim()
            ? `${l.name} — ${n.name.trim()}`
            : `${l.name} — Week ${n.week_number}`,
          start_date: n.event_date,
          end_date: n.event_date,
          status: n.status ?? l.status,
          series: {
            key: `l:${l.id}`,
            label: l.name,
            index: i + 1,
            total: nights.length,
            to: "/leagues/$slug",
            params: { slug: l.slug },
          },
        });
      });
    }

    for (const e of pdgaQuery.data ?? []) {
      if (e.tournament_slug) continue;
      const kind: Kind = inferKindFromTitle(e.name ?? "", e.tier, e.start_date, e.end_date);
      out.push({
        id: `p:${e.event_ref}`,
        kind,
        source: "pdga",
        bucket: classifyEvent({
          source: "pdga",
          kind: kind === "league" ? "league" : "tournament",
          tier: e.tier,
          title: e.name,
        }),
        title: e.name,
        start_date: e.start_date,
        end_date: e.end_date,
        location: e.location,
        tier: e.tier,
        status: null,
        crew_count: e.crew_count,
        divisions: e.divisions ?? [],
        cover_url: null,
        register: {
          label: "Register",
          to: "/events/pdga/$eventRef",
          params: { eventRef: e.event_ref },
        },
        linkTo: { to: "/events/pdga/$eventRef", params: { eventRef: e.event_ref } },
      });
    }

    for (const c of casualQuery.data ?? []) {
      out.push({
        id: `c:${c.id}`,
        kind: "casual",
        source: "chainlink",
        bucket: "casual",
        title: c.title,
        start_date: c.starts_at,
        end_date: c.ends_at,
        location: c.location,
        tier: c.kind,
        status: c.status,
        crew_count: null,
        divisions: [],
        cover_url: c.cover_url,
        register: { label: "RSVP", to: "/community/$eventId", params: { eventId: c.id } },
        linkTo: { to: "/community/$eventId", params: { eventId: c.id } },
      });
    }

    for (const sr of scheduledQuery.data ?? []) {
      const source: Source = sr.source === "udisc" ? "udisc" : "scene";
      out.push({
        id: `s:${sr.id}`,
        kind: inferKindFromTitle(sr.title, sr.tier, sr.starts_on, sr.ends_on),
        source,
        bucket: "unsanctioned",
        title: sr.title,
        start_date: sr.starts_on,
        end_date: sr.ends_on,
        location: sr.location,
        tier: sr.tier,
        status: sr.status,
        crew_count: null,
        divisions: [],
        cover_url: null,
        external_url: sr.event_url,
        register: sr.event_url
          ? { label: `Register on ${SOURCE_META[source].short}`, url: sr.event_url }
          : null,
      });
    }

    // Live directory rows. PDGA rows already carried by `pdgaQuery` are skipped so
    // the crew-aware row wins; imported schedule rows for the same event are
    // dropped in favour of the live listing.
    const knownPdgaRefs = new Set((pdgaQuery.data ?? []).map((e) => e.event_ref));
    // The same event is often listed on PDGA and on Scene/UDisc. Keep the PDGA
    // listing (it links to the in-app event page) and hide the mirror copies.
    const pdgaKeys = new Set(
      (directoryQuery.data?.rows ?? [])
        .filter((d) => d.source === "pdga")
        .map((d) => directoryDedupeKey(d.name, d.start_date))
        .concat((pdgaQuery.data ?? []).map((e) => directoryDedupeKey(e.name ?? "", e.start_date))),
    );
    const seenDirectoryKeys = new Set<string>();
    for (const d of directoryQuery.data?.rows ?? []) {
      if (d.source === "pdga" && knownPdgaRefs.has(d.source_event_id)) continue;
      const key = directoryDedupeKey(d.name, d.start_date);
      if (d.source !== "pdga" && pdgaKeys.has(key)) continue;
      if (seenDirectoryKeys.has(key)) continue;
      const source: Source =
        d.source === "pdga" ? "pdga" : d.source === "udisc" ? "udisc" : "scene";
      const kind: Kind =
        d.kind === "league"
          ? "league"
          : inferKindFromTitle(d.name, d.tier, d.start_date, d.end_date);
      out.push({
        id: `d:${d.id}`,
        kind,
        source,
        bucket: classifyEvent({
          source: source === "pdga" ? "pdga" : source,
          kind: kind === "league" ? "league" : "tournament",
          tier: d.tier,
          title: d.name,
          pdga_sanctioned: d.sanctioning === "PDGA" || undefined,
        }),
        title: d.name,
        start_date: d.start_date,
        end_date: d.end_date,
        location: directoryLocation(d),
        tier: d.tier,
        status:
          d.registration_status === "open"
            ? "Registration open"
            : d.field_capacity && d.field_size && d.field_size >= d.field_capacity
              ? "Field full"
              : null,
        crew_count: null,
        divisions: [],
        cover_url: d.cover_url,
        external_url: d.url,
        register: d.pdga_event_ref
          ? {
              label: "Register",
              to: "/events/pdga/$eventRef",
              params: { eventRef: d.pdga_event_ref },
            }
          : d.url
            ? { label: `Register on ${SOURCE_META[source].short}`, url: d.url }
            : null,
        ...(d.pdga_event_ref
          ? {
              linkTo: {
                to: "/events/pdga/$eventRef",
                params: { eventRef: d.pdga_event_ref },
              },
            }
          : {}),
      });
      seenDirectoryKeys.add(key);
    }

    // Drop imported schedule rows that the live directory already covers.
    const directoryKeys = new Set(
      (directoryQuery.data?.rows ?? []).map((d) => directoryDedupeKey(d.name, d.start_date)),
    );
    const expanded = out
      .filter(
        (r) =>
          !r.id.startsWith("s:") || !directoryKeys.has(directoryDedupeKey(r.title, r.start_date)),
      )
      // Mirrored league seasons arrive as one long row; list the nights instead.
      .flatMap((r) => expandLeagueSeries(r));
    // The same event is often posted on PDGA and UDisc both — show it once and
    // keep the sanctioned listing as the one players see.
    return mergeDirectoryDuplicates(expanded);
  }, [
    tournamentsQuery.data,
    leaguesQuery.data,
    leagueNightsQuery.data,
    pdgaQuery.data,
    casualQuery.data,
    scheduledQuery.data,
    directoryQuery.data,
    showEveryNight,
  ]);

  const tiers = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.tier) set.add(r.tier);
    return Array.from(set).sort();
  }, [rows]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.status) set.add(r.status);
    return Array.from(set).sort();
  }, [rows]);

  const divisions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const d of r.divisions) set.add(d);
    return Array.from(set).sort();
  }, [rows]);

  // Base filter — every predicate except the one that owns a chip count.
  function baseMatch(
    r: UnifiedRow,
    skip: "kind" | "bucket" | "source" | "radius" | "none" = "none",
  ) {
    const needle = s.q.trim().toLowerCase();
    if (skip !== "kind" && s.kind !== "all" && r.kind !== s.kind) return false;
    if (skip !== "source" && !s.sources.has(r.source)) return false;
    if (skip !== "bucket" && s.bucket !== "all" && r.bucket !== s.bucket) return false;
    if (s.tier !== "any" && r.tier !== s.tier) return false;
    if (s.tierGroup !== "any" && tierGroupOf(r.tier) !== s.tierGroup) return false;
    if (s.status !== "any" && r.status !== s.status) return false;
    if (s.division !== "any" && !r.divisions.includes(s.division)) return false;
    // Custom date range overrides the quick preset when either bound is set.
    if (s.from || s.to) {
      const start = r.start_date ?? "";
      const end = r.end_date ?? start;
      if (!start) return false;
      if (s.from && end < s.from) return false;
      if (s.to && start > s.to) return false;
    } else if (!withinRange(r.start_date, r.end_date, s.when)) {
      return false;
    }
    if (s.loc) {
      const hay = (r.location ?? "").toLowerCase();
      if (!hay.includes(s.loc.toLowerCase())) return false;
    }
    if (s.state) {
      const st = extractState(r.location);
      if (st !== s.state) return false;
    }
    if (skip !== "radius" && !withinRadius(r)) return false;
    if (s.cover && !r.cover_url) return false;
    if (s.crew && !(r.crew_count && r.crew_count > 0)) return false;
    if (s.mind > 0 && r.divisions.length < s.mind) return false;
    if (needle) {
      if (!matchesOmnisearch(r, needle)) return false;
    }
    return true;
  }

  const isPlannerView = PLANNER_VIEWS.has(s.view as ViewMode);
  // The calendar spans the whole filtered set, so it pages by month, not by list page.
  const isCalendarView = s.view === "calendar";

  const filtered = useMemo(() => {
    const list = rows.filter((r) => baseMatch(r));
    const dateKey = (r: UnifiedRow) => r.start_date ?? "9999-12-31";
    const distanceKey = (r: UnifiedRow) => {
      const placed = rowPlacement(r);
      return placed ? placed.miles : Number.POSITIVE_INFINITY;
    };
    // "Soonest" means soonest from today — an event that already finished can never
    // be soonest, so finished events fall below the live/upcoming ones (newest first).
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate(),
    ).padStart(2, "0")}`;
    const isFinished = (r: UnifiedRow) => {
      const end = r.end_date ?? r.start_date;
      return !!end && end < todayKey;
    };
    const byTimeliness = (a: UnifiedRow, b: UnifiedRow) => {
      const pa = isFinished(a);
      const pb = isFinished(b);
      if (pa !== pb) return Number(pa) - Number(pb);
      if (pa) return dateKey(b).localeCompare(dateKey(a));
      return dateKey(a).localeCompare(dateKey(b));
    };
    switch (s.sort) {
      case "distance_asc":
        // Events hosted in Disc Golf Dashboard lead the list — they're the ones a
        // player can register for and score here — then everything else by distance.
        list.sort(
          (a, b) =>
            Number(isFinished(a)) - Number(isFinished(b)) ||
            Number(b.source === "chainlink") - Number(a.source === "chainlink") ||
            distanceKey(a) - distanceKey(b) ||
            byTimeliness(a, b),
        );
        break;
      case "date_asc":
        // Date-first, but distance breaks ties so same-day events show nearest first.
        list.sort((a, b) => byTimeliness(a, b) || distanceKey(a) - distanceKey(b));
        break;
      case "date_desc":
        list.sort(
          (a, b) => dateKey(b).localeCompare(dateKey(a)) || distanceKey(a) - distanceKey(b),
        );
        break;
      case "name_asc":
        list.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "name_desc":
        list.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case "tier_asc":
        list.sort((a, b) => (a.tier ?? "zzz").localeCompare(b.tier ?? "zzz"));
        break;
      case "tier_desc":
        list.sort((a, b) => (b.tier ?? "zzz").localeCompare(a.tier ?? "zzz"));
        break;
      case "tier_rank_asc":
        list.sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || byTimeliness(a, b));
        break;
      case "tier_rank_desc":
        list.sort((a, b) => tierRank(b.tier) - tierRank(a.tier) || byTimeliness(a, b));
        break;
      case "kind_asc": {
        const kindRank: Record<string, number> = { tournament: 0, league: 1, casual: 2 };
        list.sort(
          (a, b) => (kindRank[a.kind] ?? 9) - (kindRank[b.kind] ?? 9) || byTimeliness(a, b),
        );
        break;
      }
      case "source_asc":
        list.sort(
          (a, b) =>
            SOURCE_META[a.source].label.localeCompare(SOURCE_META[b.source].label) ||
            byTimeliness(a, b),
        );
        break;
      case "location_asc":
        list.sort((a, b) => (a.location ?? "zzz").localeCompare(b.location ?? "zzz"));
        break;
      case "crew_desc":
        list.sort((a, b) => (b.crew_count ?? 0) - (a.crew_count ?? 0) || byTimeliness(a, b));
        break;
      case "bucket_asc": {
        const rank: Record<string, number> = { sanctioned: 0, unsanctioned: 1, casual: 2 };
        list.sort((a, b) => (rank[a.bucket] ?? 9) - (rank[b.bucket] ?? 9) || byTimeliness(a, b));
        break;
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, s, distanceOrigin, placeIndex]);

  // Pagination — clamp page against filtered length.
  const totalPages = Math.max(1, Math.ceil(filtered.length / s.pageSize));
  const currentPage = Math.min(s.page, totalPages);
  const startIdx = (currentPage - 1) * s.pageSize;
  const paged = filtered.slice(startIdx, startIdx + s.pageSize);

  // If the auto-applied home state has nothing scheduled, widen to the national
  // view once instead of greeting the player with an empty library.
  useEffect(() => {
    if (widenedFromHome.current) return;
    if (loading) return;
    if (!autoAppliedState.current) return;
    if (s.state !== autoAppliedState.current) return;
    if (filtered.length > 0) return;
    widenedFromHome.current = true;
    setSearch({ state: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, filtered.length, s.state]);

  // Kind tab counts respect every other filter.
  const tabCounts = useMemo(() => {
    const c: Record<KindTab, number> = { all: 0, tournament: 0, league: 0, casual: 0 };
    for (const r of rows) {
      if (!baseMatch(r, "kind")) continue;
      c.all++;
      c[r.kind]++;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, s, distanceOrigin, placeIndex]);

  // Bucket segment counts.
  const bucketCounts = useMemo(() => {
    const c = { all: 0, sanctioned: 0, unsanctioned: 0, casual: 0 };
    for (const r of rows) {
      if (!baseMatch(r, "bucket")) continue;
      c.all++;
      c[r.bucket]++;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, s, distanceOrigin, placeIndex]);

  // How many listings the distance filter is holding back, split between ones
  // that sit too far away and ones whose location text we couldn't place.
  const distanceHidden = useMemo(() => {
    let farAway = 0;
    let unplaced = 0;
    if (!radiusMiles || !distanceOrigin) return { farAway, unplaced };
    for (const r of rows) {
      if (!baseMatch(r, "radius")) continue;
      if (withinRadius(r)) continue;
      if (isOutsideUnitedStates(r.location) || rowPlacement(r)) farAway++;
      else unplaced++;
    }
    return { farAway, unplaced };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, s, distanceOrigin, placeIndex, radiusMiles]);

  const advancedActiveCount =
    (s.from ? 1 : 0) +
    (s.to ? 1 : 0) +
    (s.loc ? 1 : 0) +
    (s.state ? 1 : 0) +
    (s.cover ? 1 : 0) +
    (s.crew ? 1 : 0) +
    (s.mind > 0 ? 1 : 0);

  const anyFilterActive =
    !!s.q ||
    s.kind !== "all" ||
    s.bucket !== "all" ||
    s.tier !== "any" ||
    s.tierGroup !== "any" ||
    s.status !== "any" ||
    s.division !== "any" ||
    s.when !== "any" ||
    s.sources.size !== 4 ||
    s.radius !== SEARCH_DEFAULTS.radius ||
    advancedActiveCount > 0;

  const availableStates = useMemo(() => collectStates(rows), [rows]);

  // Build removable chips for every active filter.
  const activeChips: ChipDef[] = [];
  if (s.q)
    activeChips.push({ key: "q", label: `Search: "${s.q}"`, onRemove: () => setSearch({ q: "" }) });
  if (s.kind !== "all")
    activeChips.push({
      key: "kind",
      label: `Kind: ${s.kind}`,
      onRemove: () => setSearch({ kind: "all" }),
    });
  if (s.bucket !== "all")
    activeChips.push({
      key: "bucket",
      label: `Sanctioning: ${s.bucket}`,
      onRemove: () => setSearch({ bucket: "all" }),
    });
  if (s.sources.size !== 4)
    activeChips.push({
      key: "sources",
      label: `Sources: ${Array.from(s.sources)
        .map((x) => SOURCE_META[x].short)
        .join(", ")}`,
      onRemove: () => setSearch({ sources: SEARCH_DEFAULTS.sources }),
    });
  if (s.tier !== "any")
    activeChips.push({
      key: "tier",
      label: `Tier: ${s.tier}`,
      onRemove: () => setSearch({ tier: "any" }),
    });
  if (s.tierGroup !== "any")
    activeChips.push({
      key: "tierGroup",
      label: `Tier family: ${TIER_GROUP_META[s.tierGroup as TierGroup].label}`,
      onRemove: () => setSearch({ tierGroup: "any" }),
    });
  if (s.status !== "any")
    activeChips.push({
      key: "status",
      label: `Status: ${s.status.replace(/_/g, " ")}`,
      onRemove: () => setSearch({ status: "any" }),
    });
  if (s.division !== "any")
    activeChips.push({
      key: "division",
      label: `Division: ${s.division}`,
      onRemove: () => setSearch({ division: "any" }),
    });
  if (s.when !== "any" && !s.from && !s.to)
    activeChips.push({
      key: "when",
      label: `When: ${s.when}`,
      onRemove: () => setSearch({ when: "any" }),
    });
  if (s.from)
    activeChips.push({
      key: "from",
      label: `From ${s.from}`,
      onRemove: () => setSearch({ from: "" }),
    });
  if (s.to)
    activeChips.push({ key: "to", label: `To ${s.to}`, onRemove: () => setSearch({ to: "" }) });
  if (s.loc)
    activeChips.push({
      key: "loc",
      label: `Location: "${s.loc}"`,
      onRemove: () => setSearch({ loc: "" }),
    });
  if (s.state)
    activeChips.push({
      key: "state",
      label: `State: ${s.state}`,
      onRemove: () => setSearch({ state: "" }),
    });
  if (s.radius !== "any")
    activeChips.push({
      key: "radius",
      label: distanceOrigin
        ? `Within ${s.radius} miles${originIsPrecise ? "" : " of your home state"}`
        : `Within ${s.radius} miles (needs your location)`,
      onRemove: () => setSearch({ radius: "any" }),
    });
  if (s.cover)
    activeChips.push({
      key: "cover",
      label: "Has cover image",
      onRemove: () => setSearch({ cover: 0 }),
    });
  if (s.crew)
    activeChips.push({ key: "crew", label: "Has crew", onRemove: () => setSearch({ crew: 0 }) });
  if (s.mind > 0)
    activeChips.push({
      key: "mind",
      label: `≥${s.mind} divisions`,
      onRemove: () => setSearch({ mind: 0 }),
    });

  function toggleSource(src: Source) {
    const next = new Set(s.sources);
    if (next.has(src)) next.delete(src);
    else next.add(src);
    const csv =
      next.size === 0 || next.size === 4 ? SEARCH_DEFAULTS.sources : Array.from(next).join(",");
    setSearch({ sources: csv });
  }

  function clearAll() {
    navigate({
      to: "/events",
      search: {
        ...SEARCH_DEFAULTS,
        view: s.view,
        density: s.density,
      } as EventsSearch,
      replace: true,
    });
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Shareable link copied", {
        description: "Every filter and sort is encoded in the URL.",
      });
    } catch {
      toast.error("Couldn't copy — copy the URL from the address bar.");
    }
  }

  function toggleColumn(key: ColumnKey) {
    setColumns((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev; // keep at least one column
        return prev.filter((c) => c !== key);
      }
      // Preserve canonical column order.
      const order = ALL_COLUMNS.map((c) => c.key);
      return order.filter((c) => prev.includes(c) || c === key);
    });
  }

  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [showDisplayOptions, setShowDisplayOptions] = useState(false);

  return (
    <PageShell section="tournaments">
      <PageHeader
        title="Events"
        description="Find tournaments, leagues, Series and community events."
        secondaryAction={<ManageMyEventsLink />}
      />

      <NowEvents />

      <EventsViewTabs current={"browse" as EventsView} />

      {s.scope === "mine" ? <TrackedEventsPanel /> : null}

      <div className={s.scope === "mine" ? "hidden" : "contents"}>
        {/* Step 1 — pick what you're looking for */}
        <Tabs value={s.kind} onValueChange={(v) => setSearch({ kind: v as KindTab })}>
          <TabsList className="flex h-auto w-full justify-start flex-wrap whitespace-nowrap sm:w-auto sm:flex-wrap">
            <TabsTrigger value="all">
              All <span className="ml-1.5 text-xs text-muted-foreground">({tabCounts.all})</span>
            </TabsTrigger>
            <TabsTrigger value="tournament">
              <Trophy className="mr-1 h-3.5 w-3.5" />
              Tournaments
              <span className="ml-1.5 text-xs text-muted-foreground">({tabCounts.tournament})</span>
            </TabsTrigger>
            <TabsTrigger value="league">
              <CalIcon className="mr-1 h-3.5 w-3.5" />
              Leagues
              <span className="ml-1.5 text-xs text-muted-foreground">({tabCounts.league})</span>
            </TabsTrigger>
            <TabsTrigger value="casual">
              <HeartHandshake className="mr-1 h-3.5 w-3.5" />
              Casual
              <span className="ml-1.5 text-xs text-muted-foreground">({tabCounts.casual})</span>
            </TabsTrigger>
            <Link
              to="/series"
              className="inline-flex items-center rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <Trophy className="mr-1 h-3.5 w-3.5" />
              Series
            </Link>
            <Link
              to="/events"
              search={{ hub: "community" } as never}
              className="inline-flex items-center rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <HeartHandshake className="mr-1 h-3.5 w-3.5" />
              Community
            </Link>
          </TabsList>
        </Tabs>

        {/* Quick dates — the common questions, one tap each */}
        <div role="group" aria-label="Quick dates" className="flex flex-wrap gap-1.5">
          {([
            ["today", "Today"],
            ["tomorrow", "Tomorrow"],
            ["weekend", "This weekend"],
            ["week", "This week"],
            ["month", "Next 30 days"],
          ] as const).map(([k, label]) => (
            <Button
              key={k}
              size="sm"
              variant={s.when === k ? "default" : "outline"}
              className="h-8 rounded-full"
              aria-pressed={s.when === k}
              onClick={() => setSearch({ when: s.when === k ? "upcoming" : k })}
            >
              {label}
            </Button>
          ))}
        </div>

        {/* Step 2 — narrow it down */}
        <div className="space-y-3">
            {/* The four things players change most often */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <div className="relative min-w-0 flex-1 basis-full sm:min-w-[220px] sm:basis-auto">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={s.q}
                  onChange={(e) => setSearch({ q: e.target.value })}
                  placeholder="Search by event name, course, city, division…"
                  className="h-11 pl-8 sm:h-9"
                />
              </div>
              <Button
                variant="outline"
                className="h-11 flex-1 gap-1 sm:hidden"
                onClick={() => setShowMoreFilters((v) => !v)}
                aria-expanded={showMoreFilters}
              >
                <SlidersHorizontal className="h-4 w-4" />
                {showMoreFilters ? "Hide filters" : "Filters"}
                {advancedActiveCount ? <span className="text-xs text-muted-foreground">({advancedActiveCount})</span> : null}
              </Button>
              <div className={(showMoreFilters ? "flex" : "hidden") + " w-full flex-wrap items-center gap-2 sm:contents"}>

              <Select value={s.when} onValueChange={(v) => setSearch({ when: v as DateRange })}>
                <SelectTrigger className="h-9 w-[150px]">
                  <CalIcon className="mr-1 h-3.5 w-3.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any date</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="tomorrow">Tomorrow</SelectItem>
                  <SelectItem value="weekend">This weekend</SelectItem>
                  <SelectItem value="week">Next 7 days</SelectItem>
                  <SelectItem value="month">Next 30 days</SelectItem>
                  <SelectItem value="year">Next 12 months</SelectItem>
                  <SelectItem value="past">Past events</SelectItem>
                </SelectContent>
              </Select>

              <Select value={s.radius} onValueChange={(v) => setSearch({ radius: v })}>
                <SelectTrigger className="h-9 w-[165px]">
                  <MapPin className="mr-1 h-3.5 w-3.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any distance</SelectItem>
                  {["25", "50", "100", "250"].map((r) => (
                    <SelectItem key={r} value={r}>
                      Within {r} miles
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <UseCurrentLocationButton
                className="h-9"
                onLocated={(coords) => {
                  setOrigin(coords);
                  try {
                    localStorage.setItem(ORIGIN_STORAGE_KEY, JSON.stringify(coords));
                  } catch {
                    /* storage unavailable — distance still works this visit */
                  }
                }}
              />

              <Select value={s.sort} onValueChange={(v) => setSearch({ sort: v as SortKey })}>
                <SelectTrigger className="h-9 w-[180px]">
                  <ArrowUpDown className="mr-1 h-3.5 w-3.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="distance_asc">Distance · closest first</SelectItem>
                  <SelectItem value="date_asc">Date · soonest</SelectItem>
                  <SelectItem value="date_desc">Date · newest</SelectItem>
                  <SelectItem value="name_asc">Name (A–Z)</SelectItem>
                  <SelectItem value="name_desc">Name (Z–A)</SelectItem>
                  <SelectItem value="tier_asc">Tier / Season · asc</SelectItem>
                  <SelectItem value="tier_desc">Tier / Season · desc</SelectItem>
                  <SelectItem value="source_asc">Source</SelectItem>
                  <SelectItem value="location_asc">Location (A–Z)</SelectItem>
                  <SelectItem value="crew_desc">Crew · most first</SelectItem>
                  <SelectItem value="bucket_asc">Sanctioning</SelectItem>
                  <SelectItem value="tier_rank_asc">Tier · biggest first</SelectItem>
                  <SelectItem value="tier_rank_desc">Tier · smallest first</SelectItem>
                  <SelectItem value="kind_asc">Event type</SelectItem>
                </SelectContent>
              </Select>

              {anyFilterActive ? (
                <Button size="sm" variant="ghost" className="h-9" onClick={clearAll}>
                  <X className="mr-1 h-3.5 w-3.5" />
                  Clear
                </Button>
              ) : null}
              </div>
            </div>

            {/* Sanctioning + the door to everything else */}
            <div className={(showMoreFilters ? "flex" : "hidden") + " flex-wrap items-center gap-2 sm:flex"}>
              {(["all", "sanctioned", "unsanctioned", "casual"] as const).map((b) => {
                const label =
                  b === "all"
                    ? "All"
                    : b === "sanctioned"
                      ? "Sanctioned"
                      : b === "unsanctioned"
                        ? "Unsanctioned"
                        : "Casual";
                const on = s.bucket === b;
                const tone =
                  b === "sanctioned"
                    ? "bg-amber-500 text-black border-transparent"
                    : b === "casual"
                      ? "bg-emerald-500 text-white border-transparent"
                      : b === "unsanctioned"
                        ? "bg-muted text-foreground border-transparent"
                        : "bg-primary text-primary-foreground border-transparent";
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setSearch({ bucket: b })}
                    aria-pressed={on}
                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                      on
                        ? tone
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                    <span
                      className={`ml-1.5 text-xs ${on ? "opacity-80" : "text-muted-foreground"}`}
                    >
                      ({bucketCounts[b]})
                    </span>
                  </button>
                );
              })}
              <SanctioningInfoPopover />

              <Button
                variant="outline"
                size="sm"
                className="ml-auto hidden h-9 gap-1 sm:inline-flex"
                onClick={() => setShowMoreFilters((v) => !v)}
                aria-expanded={showMoreFilters}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {showMoreFilters ? "Fewer filters" : "More filters"}
                {advancedActiveCount ? (
                  <span className="text-xs text-muted-foreground">({advancedActiveCount})</span>
                ) : null}
              </Button>
            </div>

            {showMoreFilters ? (
              <div className="space-y-3 border-t border-border pt-3">
                {/* Smart presets — one tap for the combinations players ask for most */}
                <EventsSmartPresets
                  current={{
                    kind: s.kind,
                    bucket: s.bucket,
                    tierGroup: s.tierGroup,
                    tier: s.tier,
                    status: s.status,
                    when: s.when,
                    radius: s.radius,
                  }}
                  onApply={(patch: SmartPresetPatch) =>
                    setSearch({
                      kind: patch.kind ?? "all",
                      bucket: patch.bucket ?? "all",
                      tierGroup: patch.tierGroup ?? "any",
                      tier: patch.tier ?? "any",
                      status: patch.status ?? "any",
                      when: patch.when ?? "any",
                      radius: patch.radius ?? s.radius,
                      sort: patch.sort ?? s.sort,
                    })
                  }
                />

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Select
                    value={s.tierGroup}
                    onValueChange={(v) => setSearch({ tierGroup: v, tier: "any" })}
                  >
                    <SelectTrigger className="h-9 w-[180px]">
                      <SelectValue placeholder="Tier family" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any tier family</SelectItem>
                      {TIER_GROUP_ORDER.map((g) => (
                        <SelectItem key={g} value={g}>
                          {TIER_GROUP_META[g].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={s.tier} onValueChange={(v) => setSearch({ tier: v })}>
                    <SelectTrigger className="h-9 w-[150px]">
                      <SelectValue placeholder="Tier / Season" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any tier / season</SelectItem>
                      {tiers.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={s.division} onValueChange={(v) => setSearch({ division: v })}>
                    <SelectTrigger className="h-9 w-[140px]">
                      <SelectValue placeholder="Division" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[320px]">
                      <SelectItem value="any">Any division</SelectItem>
                      {divisions.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={s.status} onValueChange={(v) => setSearch({ status: v })}>
                    <SelectTrigger className="h-9 w-[140px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any status</SelectItem>
                      {statuses.map((st) => (
                        <SelectItem key={st} value={st}>
                          {st.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <EventsAdvancedFilters
                    values={
                      {
                        from: s.from,
                        to: s.to,
                        loc: s.loc,
                        state: s.state,
                        cover: !!s.cover,
                        crew: !!s.crew,
                        mind: s.mind,
                      } satisfies AdvancedFilterValues
                    }
                    states={availableStates}
                    onChange={(patch) =>
                      setSearch({
                        from: patch.from ?? undefined,
                        to: patch.to ?? undefined,
                        loc: patch.loc ?? undefined,
                        state: patch.state ?? undefined,
                        cover: patch.cover === undefined ? undefined : patch.cover ? 1 : 0,
                        crew: patch.crew === undefined ? undefined : patch.crew ? 1 : 0,
                        mind: patch.mind ?? undefined,
                      })
                    }
                    onReset={() =>
                      setSearch({
                        from: "",
                        to: "",
                        loc: "",
                        state: "",
                        cover: 0,
                        crew: 0,
                        mind: 0,
                      })
                    }
                    activeCount={advancedActiveCount}
                  />
                </div>

                {/* Sources */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Source</span>
                  {(Object.keys(SOURCE_META) as Source[]).map((src) => {
                    const meta = SOURCE_META[src];
                    const on = s.sources.has(src);
                    return (
                      <button
                        key={src}
                        type="button"
                        onClick={() => toggleSource(src)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                          on
                            ? `${meta.tone} border-transparent`
                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                        }`}
                        aria-pressed={on}
                      >
                        {meta.label}
                      </button>
                    );
                  })}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                      >
                        <Info className="h-3.5 w-3.5" /> What are these?
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] space-y-2 text-xs">
                      {(Object.keys(SOURCE_META) as Source[]).map((src) => (
                        <div key={src} className="flex gap-2">
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${SOURCE_META[src].tone}`}
                          >
                            {SOURCE_META[src].short}
                          </span>
                          <span className="text-muted-foreground">{SOURCE_META[src].blurb}</span>
                        </div>
                      ))}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            ) : null}

            {radiusMiles && distanceHidden.farAway + distanceHidden.unplaced > 0 ? (
              <p className="text-sm text-muted-foreground">
                Showing events within {s.radius} miles
                {originIsPrecise ? " of you" : " of your home state"}.{" "}
                {[
                  distanceHidden.farAway > 0 ? `${distanceHidden.farAway} farther away` : null,
                  distanceHidden.unplaced > 0
                    ? `${distanceHidden.unplaced} without a clear location`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" and ")}{" "}
                {distanceHidden.farAway + distanceHidden.unplaced === 1 ? "is" : "are"} hidden.{" "}
                <button
                  type="button"
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                  onClick={() => setSearch({ radius: "any" })}
                >
                  Show every distance
                </button>
              </p>
            ) : null}

            {/* How the results are shown */}
            <div className="flex w-full min-w-0 flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
              <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1 rounded-lg border border-border p-0.5">
                <button
                  type="button"
                  onClick={() => setSearch({ view: "grid" })}
                  className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition ${
                    s.view === "grid"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={s.view === "grid"}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Cards
                </button>
                <button
                  type="button"
                  onClick={() => setSearch({ view: "table" })}
                  className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition ${
                    s.view === "table"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={s.view === "table"}
                >
                  <TableIcon className="h-3.5 w-3.5" />
                  Table
                </button>
                {(
                  [
                    ["calendar", "Calendar", CalendarDays],
                    ["map", "Map", MapIcon],
                    ["week", "Week", CalendarRange],
                  ] as const
                ).map(([mode, label, Icon]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSearch({ view: mode })}
                    className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition ${
                      s.view === mode
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    aria-pressed={s.view === mode}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1 text-muted-foreground"
                onClick={() => setShowDisplayOptions((v) => !v)}
                aria-expanded={showDisplayOptions}
              >
                <Columns3 className="h-3.5 w-3.5" />
                {showDisplayOptions ? "Hide layout & export" : "Layout & export"}
              </Button>

              <p className="w-full min-w-0 text-xs text-muted-foreground sm:ml-auto sm:w-auto sm:max-w-[26rem] sm:text-right">
                {directoryQuery.data?.last_refreshed_at
                  ? `PDGA, UDisc, and Disc Golf Scene listings updated ${timeAgo(directoryQuery.data.last_refreshed_at)} ago`
                  : directoryQuery.isLoading
                    ? "Checking PDGA, UDisc, and Disc Golf Scene…"
                    : "Live listings not pulled yet"}
                {failedDirectorySources.length ? (
                  <span className="ml-1 text-amber-600 dark:text-amber-400">
                    {failedDirectorySources.join(", ")} didn&apos;t answer last sweep.
                  </span>
                ) : null}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-9 gap-1 text-muted-foreground"
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
                title="Refresh live listings"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${refreshMutation.isPending ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>

            {showDisplayOptions ? (
              <div className="flex w-full min-w-0 flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
                <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1 rounded-lg border border-border p-0.5">
                  <button
                    type="button"
                    onClick={() => setSearch({ density: "comfortable" })}
                    className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition ${
                      s.density === "comfortable"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    aria-pressed={s.density === "comfortable"}
                    title="Comfortable spacing"
                  >
                    <Rows3 className="h-3.5 w-3.5" />
                    Comfortable
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearch({ density: "compact" })}
                    className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition ${
                      s.density === "compact"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    aria-pressed={s.density === "compact"}
                    title="Compact spacing"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Compact
                  </button>
                </div>

                {s.view === "table" ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 gap-1">
                        <Columns3 className="h-3.5 w-3.5" />
                        Columns
                        <span className="text-xs text-muted-foreground">({columns.length})</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {ALL_COLUMNS.map((c) => (
                        <DropdownMenuCheckboxItem
                          key={c.key}
                          checked={columns.includes(c.key)}
                          onCheckedChange={() => toggleColumn(c.key)}
                          onSelect={(e) => e.preventDefault()}
                        >
                          {c.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                      <DropdownMenuSeparator />
                      <div className="flex justify-between px-2 py-1 text-xs">
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            setColumns(ALL_COLUMNS.filter((c) => c.defaultOn).map((c) => c.key))
                          }
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => setColumns(ALL_COLUMNS.map((c) => c.key))}
                        >
                          Show all
                        </button>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}

                {s.view === "grid" ? (
                  <Select value={s.group} onValueChange={(v) => setSearch({ group: v as GroupBy })}>
                    <SelectTrigger className="h-9 w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No grouping</SelectItem>
                      <SelectItem value="month">Group by month</SelectItem>
                      <SelectItem value="source">Group by source</SelectItem>
                      <SelectItem value="tier">Group by tier</SelectItem>
                      <SelectItem value="bucket">Group by sanctioning</SelectItem>
                      <SelectItem value="kind">Group by kind</SelectItem>
                    </SelectContent>
                  </Select>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <EventsSavedViews
                    currentSearch={search as unknown as Record<string, unknown>}
                    onApply={(snap) =>
                      navigate({ to: "/events", search: snap as EventsSearch, replace: true })
                    }
                  />

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1"
                    onClick={copyShareLink}
                    title="Copy shareable URL with these filters"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Share
                  </Button>

                  <EventsExportMenu rows={filtered} />
                </div>
              </div>
            ) : null}
        </div>

        {/* Active filter chips */}
        <EventsActiveChips chips={activeChips} onClearAll={clearAll} />

        {/* Result meta — list/table paging only; planner views page by date. */}
        <div
          className={`flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground ${
            isPlannerView || isCalendarView ? "hidden" : ""
          }`}
        >
          <div>
            {loading
              ? "Loading events…"
              : filtered.length === 0
                ? "0 events"
                : `Showing ${startIdx + 1}–${Math.min(
                    startIdx + s.pageSize,
                    filtered.length,
                  )} of ${filtered.length} · ${rows.length} total across all filters`}
            {failedSources.length > 0 ? (
              <div className="mt-1 text-[11px] text-destructive">
                {failedSources.map((src) => (
                  <div key={src.label} className="flex items-center gap-2">
                    <span>We couldn&apos;t load {src.label}.</span>
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={src.retry}
                    >
                      Try again
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {!loading && truncatedSources.length > 0 ? (
              <div className="mt-1 text-[11px] text-muted-foreground">
                Showing the first {truncatedSources.join(", ")} that match. Narrow the date range,
                state, or search to see the rest.
              </div>
            ) : null}
          </div>
          {!loading && filtered.length > 0 ? (
            <div className="flex items-center gap-2">
              <Select
                value={String(s.pageSize)}
                onValueChange={(v) => setSearch({ pageSize: Number(v) })}
              >
                <SelectTrigger className="h-8 w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[12, 24, 48, 96, 200].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage <= 1}
                  onClick={() => setSearch({ page: currentPage - 1 })}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[70px] text-center tabular-nums">
                  Page {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage >= totalPages}
                  onClick={() => setSearch({ page: currentPage + 1 })}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Results */}
        {isPlannerView ? (
          <PlannerPanel view={s.view as "map" | "week" | "month"} q={s.q} state={s.state} />
        ) : loading ? (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Pulling Disc Golf Dashboard, PDGA, UDisc, and Disc Golf Scene events…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState onClear={clearAll} />
        ) : s.view === "calendar" ? (
          <EventsCalendar rows={filtered} />
        ) : s.view === "table" ? (
          <EventsTable
            rows={paged}
            columns={columns}
            sort={s.sort}
            onSortChange={(next) => setSearch({ sort: next })}
            density={s.density}
          />
        ) : s.group !== "none" ? (
          <div className="space-y-6">
            {groupRows(paged, s.group).map((g) => (
              <section key={g.key} className="space-y-2">
                <div className="flex items-baseline gap-2 border-b border-border pb-1">
                  <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
                    {g.label}
                  </h3>
                  <span className="text-xs text-muted-foreground">{g.sublabel}</span>
                </div>
                <EventsCardGrid rows={g.rows} density={s.density} />
              </section>
            ))}
          </div>
        ) : (
          <EventsCardGrid rows={paged} density={s.density} />
        )}

        {/* Bottom pager for long lists */}
        {!isPlannerView && !isCalendarView && !loading && filtered.length > s.pageSize ? (
          <div className="flex items-center justify-center gap-1 pt-1 text-xs text-muted-foreground">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage <= 1}
              onClick={() => {
                setSearch({ page: currentPage - 1 });
                if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[70px] text-center tabular-nums">
              Page {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage >= totalPages}
              onClick={() => {
                setSearch({ page: currentPage + 1 });
                if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <Trophy className="mx-auto h-8 w-8 text-muted-foreground" />
      <h3 className="mt-2 font-display text-lg font-semibold">No events match your filters</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Try clearing a source, sanctioning, or date filter — or widen the date range.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <Button variant="outline" onClick={onClear}>
          Clear filters
        </Button>
      </div>
    </div>
  );
}
