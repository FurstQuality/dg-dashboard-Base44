import { classifyEventMatches, MATCH_LABEL, pdgaRefFromQuery, type EventMatch } from "@/lib/tracker/event-match";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  ExternalLink,
  ListChecks,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  listPdgaTourEvents,
  listNearbyPdgaTourEvents,
  refreshPdgaTourEvents,
  NEARBY_EVENT_RADIUS_MILES,
} from "@/lib/season-planner.functions";
import { kbSearchEvents } from "@/lib/pdga-kb-lookup.functions";
import {
  listTrackerGroups,
  createTrackerGroup,
  importTrackerEventFromUrl,
} from "@/lib/tracker.functions";
import { trackEventByPdgaRef, listTrackedEvents } from "@/lib/tracker-watchlist.functions";
import { trackerKeys, TRACKER_STALE } from "@/lib/tracker-queries";

/** Normalized event row shown in the list, from either source. */
type EventRow = {
  key: string;
  pdgaEventId: string | null;
  name: string;
  tier: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  url: string | null;
  registrationStatus?: string | null;
  distanceMiles?: number | null;
};

function formatRange(start: string | null, end: string | null): string {
  if (!start) return "Dates TBD";
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  if (!end || end === start) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

function pdgaUrl(row: EventRow): string | null {
  if (row.url) return row.url;
  if (row.pdgaEventId) return `https://www.pdga.com/tour/event/${row.pdgaEventId}`;
  return null;
}

/** Read bounds so the discover tab can never fan out unbounded. */
const LIVE_LIMIT = 40;
const SEARCH_LIMIT = 25;

/** Maps cached PDGA registry rows into the panel's row shape. */
function mapLiveRows(rows: Record<string, unknown>[]): EventRow[] {
  return rows.map((e) => ({
    key: `live-${e.id as string}`,
    pdgaEventId: (e.pdga_event_id as string) ?? null,
    name: (e.name as string) ?? "Untitled event",
    tier: (e.tier as string) ?? null,
    startDate: (e.start_date as string) ?? null,
    endDate: (e.end_date as string) ?? null,
    location: ((e.location as string) ?? [e.city, e.state].filter(Boolean).join(", ")) || null,
    url: (e.url as string) ?? null,
    registrationStatus: (e.registration_status as string) ?? null,
    distanceMiles: (e.distanceMiles as number | null) ?? null,
  }));
}

/** Maps knowledgebase event rows (past + future) into the panel's row shape. */
function mapKbRows(rows: Record<string, unknown>[]): EventRow[] {
  return rows.map((e) => ({
    key: `kb-${e.id as string}`,
    pdgaEventId: (e.pdga_event_id as string) ?? null,
    name: (e.name as string) ?? "Untitled event",
    tier: (e.tier as string) ?? null,
    startDate: (e.start_date as string) ?? null,
    endDate: (e.end_date as string) ?? null,
    location: [e.city, e.state, e.country].filter(Boolean).join(", ") || null,
    url: (e.pdga_url as string) ?? null,
  }));
}

export function TournamentSearchPanel({
  onPreview,
  bare = false,
}: {
  onPreview?: (eventRef: string) => void;
  /** Render without the card chrome and heading, for use inside a combined panel. */
  bare?: boolean;
}) {
  const navigate = useNavigate();
  const listLive = useServerFn(listPdgaTourEvents);
  const listNearby = useServerFn(listNearbyPdgaTourEvents);
  const refreshLive = useServerFn(refreshPdgaTourEvents);
  const searchKb = useServerFn(kbSearchEvents);
  const listGroups = useServerFn(listTrackerGroups);
  const createGroup = useServerFn(createTrackerGroup);
  const importEvent = useServerFn(importTrackerEventFromUrl);
  const trackEvent = useServerFn(trackEventByPdgaRef);
  const listTracked = useServerFn(listTrackedEvents);
  const queryClient = useQueryClient();

  // Discovery defaults to a 100-mile radius around the player's location.
  const [radius, setRadius] = useState<number | null>(NEARBY_EVENT_RADIUS_MILES);
  // Sanctioned tournaments by default — PDGA league series otherwise flood the list.
  const [kind, setKind] = useState<"tournaments" | "leagues" | "all">("tournaments");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [nearInput, setNearInput] = useState("");
  const [nearPlace, setNearPlace] = useState("");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [trackTarget, setTrackTarget] = useState<EventRow | null>(null);
  const [groupChoice, setGroupChoice] = useState<string>("new");
  const [tracking, setTracking] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const t = setTimeout(() => setNearPlace(nearInput.trim()), 500);
    return () => clearTimeout(t);
  }, [nearInput]);

  /** Ask the browser for the player's position on demand. */
  function handleUseMyLocation() {
    if (!("geolocation" in navigator)) {
      toast.error("This browser can't share your location. Type a city or ZIP instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setNearInput("");
        setNearPlace("");
        if (radius == null) setRadius(NEARBY_EVENT_RADIUS_MILES);
        setLocating(false);
        toast.success("Showing events near you");
      },
      () => {
        setLocating(false);
        toast.error("Couldn't get your location. Type a city, state, or ZIP instead.");
      },
      { timeout: 10000, maximumAge: 300000 },
    );
  }

  // Use the device location when the browser already has permission; the server
  // falls back to the saved profile location otherwise.
  useEffect(() => {
    if (!("geolocation" in navigator) || !navigator.permissions) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (cancelled || status.state !== "granted") return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!cancelled) setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          },
          () => {},
          { timeout: 8000, maximumAge: 600000 },
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Live upcoming PDGA events (cached registry). Bounded to 40 rows.
  const liveQuery = useQuery({
    queryKey: [...trackerKeys.liveSchedule(LIVE_LIMIT), kind],
    enabled: radius == null,
    staleTime: TRACKER_STALE.schedule,
    queryFn: async () => {
      const res = await listLive({ data: { limit: LIVE_LIMIT, kind } });
      return {
        refreshedAt: (res.refreshedAt as string | null) ?? null,
        events: mapLiveRows((res.events ?? []) as Record<string, unknown>[]),
      };
    },
  });
  // Nearby upcoming events (default view). Radius null = show everything.
  const nearbyQuery = useQuery({
    queryKey: [
      ...trackerKeys.nearbySchedule(radius ?? 0, LIVE_LIMIT),
      coords?.lat ?? null,
      coords?.lng ?? null,
      nearPlace || null,
      kind,
    ],
    enabled: radius != null,
    staleTime: TRACKER_STALE.schedule,
    queryFn: async () => {
      const res = await listNearby({
        data: {
          limit: LIVE_LIMIT,
          radius_miles: radius ?? NEARBY_EVENT_RADIUS_MILES,
          kind,
          ...(coords ? { latitude: coords.lat, longitude: coords.lng } : {}),
          ...(!coords && nearPlace.length >= 2 ? { near: nearPlace } : {}),
        },
      });

      return {
        refreshedAt: res.refreshedAt ?? null,
        origin: res.origin,
        events: mapLiveRows(res.events as unknown as Record<string, unknown>[]),
      };
    },
  });

  const nearbyActive = radius != null;
  const originLabel = nearbyQuery.data?.origin?.label ?? null;
  const locationKnown = !!nearbyQuery.data?.origin;
  const live = nearbyActive ? (nearbyQuery.data?.events ?? []) : (liveQuery.data?.events ?? []);
  const refreshedAt = nearbyActive
    ? (nearbyQuery.data?.refreshedAt ?? null)
    : (liveQuery.data?.refreshedAt ?? null);
  const loading = nearbyActive ? nearbyQuery.isPending : liveQuery.isPending;

  // Search the full PDGA event knowledgebase (past + future). Bounded per source.
  const searchQuery = useQuery({
    queryKey: [...trackerKeys.eventSearch(debounced), kind],
    enabled: debounced.length >= 2,
    staleTime: TRACKER_STALE.schedule,
    queryFn: async (): Promise<EventRow[]> => {
      const [kb, liveMatches] = await Promise.all([
        searchKb({ data: { q: debounced, limit: SEARCH_LIMIT } }).catch(() => []),
        listLive({ data: { search: debounced, limit: SEARCH_LIMIT, kind } }).catch(() => ({
          events: [] as unknown[],
        })),
      ]);
      const rows: EventRow[] = [
        ...mapLiveRows((liveMatches as { events?: Record<string, unknown>[] }).events ?? []),
        ...mapKbRows(kb as Record<string, unknown>[]),
      ];
      // De-duplicate by PDGA event id, keeping the first (live) hit.
      const seen = new Set<string>();
      return rows.filter((r) => {
        const id = r.pdgaEventId ?? r.name.toLowerCase();
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    },
  });
  const results = debounced.length >= 2 ? (searchQuery.data ?? null) : null;
  const searching = debounced.length >= 2 && searchQuery.isPending;

  // Crew trackers, loaded only when the "save into a crew" dialog is open.
  const groupsQuery = useQuery({
    queryKey: trackerKeys.groups(),
    enabled: !!trackTarget,
    staleTime: TRACKER_STALE.watchlist,
    queryFn: async () => {
      const gs = await listGroups();
      return ((gs ?? []) as { id: string; name: string }[]).map((g) => ({
        id: g.id,
        name: g.name,
      }));
    },
  });
  const groups = groupsQuery.data ?? [];
  // Keep the mirrored PDGA schedule fresh on its own: the server call is
  // cached for six hours, so this is a no-op on most visits.
  useEffect(() => {
    let cancelled = false;
    void refreshLive({ data: {} })
      .then((res) => {
        if (cancelled || res.cached || !res.count) return;
        void queryClient.invalidateQueries({ queryKey: ["tracker", "pdga-schedule"] });
        void queryClient.invalidateQueries({ queryKey: ["tracker", "pdga-schedule-nearby"] });
      })
      .catch(() => {
        /* background refresh; the cached schedule still renders */
      });
    return () => {
      cancelled = true;
    };
  }, [refreshLive, queryClient]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      const res = await refreshLive({ data: { force: true } });
      if (res.error) toast.error(`Couldn't refresh the PDGA schedule: ${res.error}`);
      else if (res.cached) toast.info("Schedule is already up to date");
      else toast.success(`Pulled ${res.count} events from PDGA`);
      await queryClient.invalidateQueries({ queryKey: ["tracker", "pdga-schedule"] });
      await queryClient.invalidateQueries({ queryKey: ["tracker", "pdga-schedule-nearby"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  /**
   * One-click save into the caller's personal tracker. Idempotent server-side,
   * so tapping twice reports "already tracking" rather than failing.
   */
  async function quickTrack(row: EventRow) {
    if (matchByKey.get(row.key) === "AMBIGUOUS") {
      toast.info("Several events look like this one. Open it to check it's the right event first.");
      if (onPreview && row.pdgaEventId) onPreview(row.pdgaEventId);
      return;
    }
    if (!row.pdgaEventId) {
      toast.error("This event has no PDGA number yet, so it can't be tracked automatically.");
      return;
    }
    setSavingKey(row.key);
    try {
      const res = await trackEvent({
        data: {
          pdga_event_ref: row.pdgaEventId,
          name: row.name.slice(0, 200),
          event_date: row.startDate ?? null,
          location: row.location ?? null,
          tier: row.tier ?? null,
          url: pdgaUrl(row) ?? null,
        },
      });
      void queryClient.invalidateQueries({ queryKey: trackerKeys.watchlist() });
      const notified = (res as { friendsNotified?: number }).friendsNotified ?? 0;
      if (res.created) {
        toast.success(
          notified > 0
            ? `Tracking ${row.name} — ${notified} ${notified === 1 ? "friend" : "friends"} in the field were notified`
            : `Tracking ${row.name}`,
        );
      } else toast.info("You're already tracking this event");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingKey(null);
    }
  }

  function openTrack(row: EventRow) {
    setTrackTarget(row);
    setGroupChoice("new");
  }

  async function confirmTrack() {
    if (!trackTarget) return;
    const url = pdgaUrl(trackTarget);
    if (!url) {
      toast.error("This event has no PDGA page to pull from yet");
      return;
    }
    setTracking(true);
    try {
      let groupId = groupChoice;
      if (groupChoice === "new") {
        const g = await createGroup({
          data: {
            name: trackTarget.name.slice(0, 120),
            trip_start: trackTarget.startDate ?? null,
            trip_end: trackTarget.endDate ?? trackTarget.startDate ?? null,
          },
        });
        groupId = g.id;
      }
      await importEvent({ data: { group_id: groupId, url } });
      toast.success("Event added to your tracker");
      setTrackTarget(null);
      navigate({ to: "/tracker/$groupId", params: { groupId } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTracking(false);
    }
  }

  // A pasted PDGA link or bare event number can be tracked directly, even when
  // the cached schedule doesn't know the event yet.
  const directRef = useMemo(() => {
    return pdgaRefFromQuery(debounced);
  }, [debounced]);

  const rows = results ?? live;
  // Match strength only applies to typed searches, never the plain schedule.
  const matchByKey = useMemo(() => {
    const m = new Map<string, EventMatch>();
    if (!results) return m;
    const grades = classifyEventMatches(debounced, results);
    results.forEach((r, i) => m.set(r.key, grades[i]!));
    return m;
  }, [results, debounced]);
  const showing = results ? "search" : "upcoming";
  const lastSync = useMemo(
    () =>
      refreshedAt
        ? new Date(refreshedAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : null,
    [refreshedAt],
  );

  // Which events the caller already follows, so the directory can show state
  // instead of offering "Track event" twice.
  const trackedQuery = useQuery({
    queryKey: trackerKeys.watchlist(),
    queryFn: () => listTracked(),
    staleTime: TRACKER_STALE.watchlist,
  });
  const trackedRefs = useMemo(() => {
    const set = new Set<string>();
    for (const e of trackedQuery.data?.events ?? []) if (e.pdgaEventRef) set.add(e.pdgaEventRef);
    return set;
  }, [trackedQuery.data]);

  /**
   * Splits the directory into what a player actually chooses between: events
   * playing right now, events teeing off inside a week, and everything later.
   */
  const sections = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekOut = new Date(today);
    weekOut.setDate(weekOut.getDate() + 7);
    const parse = (d: string | null) => (d ? new Date(d + "T00:00:00") : null);
    const now: EventRow[] = [];
    const week: EventRow[] = [];
    const later: EventRow[] = [];
    const past: EventRow[] = [];
    for (const row of rows) {
      const start = parse(row.startDate);
      const end = parse(row.endDate) ?? start;
      if (!start) {
        later.push(row);
        continue;
      }
      if (end && end < today) past.push(row);
      else if (start <= today) now.push(row);
      else if (start <= weekOut) week.push(row);
      else later.push(row);
    }
    return [
      {
        key: "now",
        label: "Happening now",
        hint: "Rounds are underway — track it to follow scoring live.",
        rows: now,
      },
      {
        key: "week",
        label: "Starting this week",
        hint: "Tee off within the next 7 days.",
        rows: week,
      },
      { key: "later", label: "Coming up", hint: null, rows: later },
      { key: "past", label: "Recently finished", hint: null, rows: past },
    ].filter((s) => s.rows.length > 0);
  }, [rows]);

  return (
    <Card className={bare ? "border-0 bg-transparent shadow-none" : undefined}>
      <CardHeader className={bare ? "p-0 pb-3" : "pb-3"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {bare ? (
              <p className="text-xs text-muted-foreground">
                Search every event happening now and coming up, then save the ones you want to
                follow.
              </p>
            ) : (
              <>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ListChecks className="h-4 w-4 text-primary" /> Event directory
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Every event happening now and coming up. Pick the ones you want to follow and
                  we'll keep tee times, pools, round ratings, and results updated.
                </p>
              </>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Refresh schedule
          </Button>
        </div>
      </CardHeader>
      <CardContent className={bare ? "space-y-3 p-0" : "space-y-3"}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-8"
            placeholder="Search by event name, city, state, or paste a PDGA event link…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search tournaments"
          />
          {searching ? (
            <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        {directRef ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
            <p className="text-sm">
              Track PDGA event <span className="font-semibold">#{directRef}</span> straight from
              PDGA.
            </p>
            {onPreview ? (
              <Button variant="outline" size="sm" onClick={() => onPreview(directRef)}>
                Preview
              </Button>
            ) : null}
            <Button
              size="sm"
              onClick={() =>
                quickTrack({
                  key: `direct-${directRef}`,
                  pdgaEventId: directRef,
                  name: `PDGA event #${directRef}`,
                  tier: null,
                  startDate: null,
                  endDate: null,
                  location: null,
                  url: `https://www.pdga.com/tour/event/${directRef}`,
                })
              }
            >
              Track event
            </Button>
          </div>
        ) : null}

        {showing === "upcoming" ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 pl-8"
                  placeholder="Search near a city, state, or ZIP…"
                  value={nearInput}
                  onChange={(e) => {
                    setNearInput(e.target.value);
                    if (e.target.value.trim().length >= 2) setCoords(null);
                    if (radius == null) setRadius(NEARBY_EVENT_RADIUS_MILES);
                  }}
                  aria-label="Search events near a place"
                />
              </div>
              <Button
                variant={coords ? "default" : "outline"}
                size="sm"
                className="h-9"
                onClick={handleUseMyLocation}
                disabled={locating}
              >
                {locating ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MapPin className="mr-1.5 h-3.5 w-3.5" />
                )}
                Use my location
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">Show</span>
              {(
                [
                  ["tournaments", "Tournaments"],
                  ["leagues", "Leagues"],
                  ["all", "Everything"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={kind === value ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setKind(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">Distance</span>
              {[50, NEARBY_EVENT_RADIUS_MILES, 250].map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant={radius === r ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setRadius(r)}
                >
                  {r} mi
                </Button>
              ))}
              <Button
                size="sm"
                variant={radius === null ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                onClick={() => setRadius(null)}
              >
                Anywhere
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {showing === "search"
              ? `${rows.length} event${rows.length === 1 ? "" : "s"} match "${debounced}"`
              : nearbyActive && locationKnown
                ? `Events happening now and coming up within ${radius} miles of ${originLabel ?? "you"}`
                : nearbyActive
                  ? "Type a city or ZIP above, or tap Use my location, to narrow this to your area — showing every current and upcoming event"
                  : "Every current and upcoming PDGA event"}
          </span>

          {lastSync ? <span>Schedule updated {lastSync}</span> : null}
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Loading the PDGA schedule…
          </p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {showing === "search"
              ? "No events match that search yet. Try a shorter name, or refresh the schedule."
              : nearbyActive && locationKnown
                ? `No PDGA events inside ${radius} miles yet. Widen the distance or hit Refresh schedule.`
                : "No upcoming events cached yet — hit Refresh schedule to pull the latest from PDGA."}
          </p>
        ) : (
          <div className="space-y-4">
            {sections.map((section) => (
              <div key={section.key} className="space-y-1.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-sm font-semibold">{section.label}</h3>
                  <span className="text-xs text-muted-foreground">
                    {section.rows.length} event{section.rows.length === 1 ? "" : "s"}
                  </span>
                  {section.hint ? (
                    <span className="text-xs text-muted-foreground">· {section.hint}</span>
                  ) : null}
                </div>
                <ul className="divide-y rounded-lg border">
                  {section.rows.map((row) => {
                    const link = pdgaUrl(row);
                    const canOpen = !!(onPreview && row.pdgaEventId);
                    const isTracked = !!row.pdgaEventId && trackedRefs.has(row.pdgaEventId);
                    return (
                      <li
                        key={row.key}
                        className="flex flex-wrap items-center gap-3 p-3 transition-colors hover:bg-muted/40"
                      >
                        {canOpen ? (
                          <button
                            type="button"
                            className="min-w-0 flex-1 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            onClick={() => onPreview!(row.pdgaEventId!)}
                            aria-label={`Open tracking for ${row.name}`}
                          >
                            <RowSummary
                              row={row}
                              live={section.key === "now"}
                              tracked={isTracked}
                            />
                          </button>
                        ) : link ? (
                          <a
                            href={link}
                            target="_blank"
                            rel="noreferrer"
                            className="min-w-0 flex-1"
                            aria-label={`Open ${row.name} on PDGA`}
                          >
                            <RowSummary
                              row={row}
                              live={section.key === "now"}
                              tracked={isTracked}
                            />
                          </a>
                        ) : (
                          <div className="min-w-0 flex-1">
                            <RowSummary
                              row={row}
                              live={section.key === "now"}
                              tracked={isTracked}
                            />
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          {matchByKey.has(row.key) ? (
                            <span
                              className={`rounded-full border px-2 py-0.5 text-xs ${
                                matchByKey.get(row.key) === "EXACT"
                                  ? "border-primary/40 text-primary"
                                  : matchByKey.get(row.key) === "AMBIGUOUS"
                                    ? "border-amber-500/40 text-amber-500"
                                    : "border-border text-muted-foreground"
                              }`}
                            >
                              {MATCH_LABEL[matchByKey.get(row.key)!]}
                            </span>
                          ) : null}
                          {onPreview && row.pdgaEventId ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onPreview(row.pdgaEventId!)}
                            >
                              {isTracked ? "Open scoring" : "Preview"}
                            </Button>
                          ) : null}
                          {link ? (
                            <Button asChild variant="ghost" size="sm">
                              <a
                                href={link}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Open ${row.name} on PDGA`}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          ) : null}
                          {isTracked ? (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-primary">
                              <Check className="h-3.5 w-3.5" /> Tracking
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              disabled={savingKey === row.key}
                              onClick={() => quickTrack(row)}
                            >
                              {savingKey === row.key ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : null}
                              Track event
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => openTrack(row)}>
                            Add to crew
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!trackTarget} onOpenChange={(o) => !o && setTrackTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Track {trackTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              We'll pull the field, tee times, pools, and results from PDGA and keep them updated.
            </p>
            <label className="block text-xs font-medium" htmlFor="tracker-choice">
              Add to
            </label>
            <select
              id="tracker-choice"
              value={groupChoice}
              onChange={(e) => setGroupChoice(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="new">New crew tracker for this event</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTrackTarget(null)} disabled={tracking}>
              Cancel
            </Button>
            <Button onClick={confirmTrack} disabled={tracking}>
              {tracking ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {tracking ? "Setting up…" : "Start tracking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Name, tier, dates and location for one schedule row. */
function RowSummary({ row, live, tracked }: { row: EventRow; live?: boolean; tracked?: boolean }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className="truncate text-sm font-semibold">{row.name}</p>
        {live ? <Badge className="text-[10px]">Live now</Badge> : null}
        {tracked ? (
          <Badge variant="outline" className="border-primary/50 text-[10px] text-primary">
            In your tracker
          </Badge>
        ) : null}
        {row.tier ? (
          <Badge variant="secondary" className="text-[10px]">
            {row.tier}
          </Badge>
        ) : null}
        {row.registrationStatus ? (
          <Badge variant="outline" className="text-[10px]">
            {row.registrationStatus}
          </Badge>
        ) : null}
      </div>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-3 w-3" /> {formatRange(row.startDate, row.endDate)}
        </span>
        {row.location ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {row.location}
          </span>
        ) : null}
        {row.distanceMiles != null ? <span>{Math.round(row.distanceMiles)} mi away</span> : null}
      </p>
    </>
  );
}
