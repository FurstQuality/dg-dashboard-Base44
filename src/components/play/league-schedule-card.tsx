/**
 * "Leagues happening today" for the Play home page. Play is where a round gets
 * started, so this only answers one question: what league night can I join now?
 * Mirrored league nights from PDGA, Disc Golf Scene and UDisc, filtered to a
 * distance around you. The full month calendar lives in the events directory.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, Clock, Crosshair, ExternalLink, MapPin, Users } from "lucide-react";
import { toast } from "sonner";
import { meetingSchedule, meetingSummary, meetsOn } from "@/lib/league-recurrence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddToCalendarButton } from "@/components/events/add-to-calendar-button";
import {
  buildPlaceIndex,
  coordPlacement,
  eventPlacement,
  US_STATE_CENTROIDS,
  type LatLng,
  type PlaceIndex,
} from "@/lib/event-geo";
import { supabase } from "@/integrations/supabase/client";
import { haversineMiles } from "@/lib/play-geo";
import {
  listLeagueCalendar,
  type LeagueOccurrence,
  type LeagueSource,
} from "@/lib/league-schedule.functions";
import { refreshPdgaTourEvents } from "@/lib/season-planner.functions";
import { mergeLeagueMirrors, type MergedListing } from "@/lib/league-duplicates";
import { PlayErrorState } from "@/components/play/play-widget-states";

const SOURCE_LABEL: Record<LeagueSource, string> = {
  pdga: "PDGA",
  disc_golf_scene: "Disc Golf Scene",
  udisc: "UDisc",
  chainlink: "Organized here",
};

const CALENDAR_SOURCE: Record<LeagueSource, "pdga" | "scene" | "udisc" | "chainlink"> = {
  pdga: "pdga",
  disc_golf_scene: "scene",
  udisc: "udisc",
  chainlink: "chainlink",
};

/** Distance options in miles; "any" drops the limit. */
const RADIUS_VALUES = ["10", "25", "50", "100", "250", "any"] as const;
const DEFAULT_RADIUS = "50";
const ORIGIN_STORAGE_KEY = "dgd:events:origin:v1";
const RADIUS_STORAGE_KEY = "dgd:play:league-radius:v1";
const EMPTY_PLACE_INDEX = new Map<string, LatLng>();

function readStoredOrigin(): LatLng | null {
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
}

function readStoredRadius(): string {
  if (typeof window === "undefined") return DEFAULT_RADIUS;
  try {
    const raw = localStorage.getItem(RADIUS_STORAGE_KEY);
    return raw && (RADIUS_VALUES as readonly string[]).includes(raw) ? raw : DEFAULT_RADIUS;
  } catch {
    return DEFAULT_RADIUS;
  }
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function placeOf(row: LeagueOccurrence): string {
  return [row.venue_name, row.city, row.state].filter(Boolean).join(", ");
}

/**
 * Tee times aren't stored as their own field, so pull one out of the listing
 * name when the organiser wrote it there ("Doubles 6pm", "5:30 PM shotgun").
 * Returns minutes past midnight, or null when no time is published.
 */
function teeMinutes(row: LeagueOccurrence): number | null {
  const match = /\b(1[0-2]|0?[1-9])(?::([0-5][0-9]))?\s*([ap])\.?m\.?\b/i.exec(row.name);
  if (match) {
    let hour = Number(match[1]) % 12;
    if (match[3].toLowerCase() === "p") hour += 12;
    return hour * 60 + Number(match[2] ?? 0);
  }
  const military = /\b([01]?[0-9]|2[0-3]):([0-5][0-9])\b/.exec(row.name);
  if (military) return Number(military[1]) * 60 + Number(military[2]);
  return null;
}

function formatTee(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(mins).padStart(2, "0")} ${hour24 < 12 ? "AM" : "PM"}`;
}

/** Multi-day league blocks read better with their run of dates spelled out. */
function formatDayRange(row: LeagueOccurrence): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };
  const end = row.end_date;
  if (!end || end === row.start_date) return fmt(row.start_date);
  const schedule = meetingSchedule(row);
  // A season block plays one night a week — spell that out instead of implying
  // it runs every day between the two dates. Flex leagues really are any day.
  if (schedule.basis === "flex_window") return `Flex start — any day through ${fmt(end)}`;
  const summary = meetingSummary(row);
  if (summary) return `${summary} through ${fmt(end)}`;
  return `${fmt(row.start_date)} – ${fmt(end)}`;
}

export function LeagueScheduleCard() {
  const fetchCalendar = useServerFn(listLeagueCalendar);
  const [radius, setRadius] = useState<string>(() => readStoredRadius());
  const [origin, setOrigin] = useState<LatLng | null>(() => readStoredOrigin());
  const [locating, setLocating] = useState(false);
  const askedLocation = useRef(false);

  const radiusMiles = radius === "any" ? null : Number(radius);
  const today = useMemo(() => toISODate(new Date()), []);

  function changeRadius(next: string) {
    setRadius(next);
    try {
      localStorage.setItem(RADIUS_STORAGE_KEY, next);
    } catch {
      /* storage unavailable — the filter still applies this visit */
    }
  }

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
            description: "Allow location access, or switch the distance to any.",
          });
      },
      { timeout: 8000, maximumAge: 10 * 60_000 },
    );
  }

  useEffect(() => {
    if (askedLocation.current) return;
    if (!radiusMiles || origin) return;
    askedLocation.current = true;
    requestLocation(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusMiles, origin]);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["leagues-today", today],
    queryFn: () => fetchCalendar({ data: { from: today, to: today } }),
    staleTime: 10 * 60_000,
  });

  // PDGA sanctioned league nights only reach the calendar once the upcoming feed
  // has been mirrored, so top it up quietly on arrival. The server caches the
  // scrape for six hours, so repeat visits cost nothing.
  const refreshPdga = useServerFn(refreshPdgaTourEvents);
  const toppedUp = useRef(false);
  useEffect(() => {
    if (toppedUp.current) return;
    toppedUp.current = true;
    refreshPdga({ data: {} as never })
      .then((result) => {
        if (result && !result.cached) void refetch();
      })
      .catch(() => {
        /* the calendar still shows what's already mirrored */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One coordinate per city/state so a listing that only names "Whiting, IN" is
  // placed in Whiting rather than at the middle of Indiana.
  const placeIndexQuery = useQuery({
    queryKey: ["events-library", "place-index"],
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    queryFn: async () => {
      const { data: rpcRows, error } = await supabase.rpc("course_place_index");
      if (error) throw error;
      const rows = (rpcRows ?? []) as Array<{
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

  const placeIndex: PlaceIndex = placeIndexQuery.data ?? EMPTY_PLACE_INDEX;

  /** State you're standing in, so state-only listings there aren't discarded. */
  const homeState = useMemo(() => {
    if (!origin) return "";
    let best = "";
    let bestMiles = Infinity;
    for (const [code, centre] of Object.entries(US_STATE_CENTROIDS)) {
      const miles = haversineMiles(origin, centre);
      if (miles < bestMiles) {
        bestMiles = miles;
        best = code;
      }
    }
    return best;
  }, [origin]);

  /** Distance to a league's venue, coordinates first then city/state text. */
  function rowPlace(
    row: LeagueOccurrence,
  ): { miles: number; precision: "city" | "state"; state: string } | null {
    if (!origin) return null;
    const byCoords = coordPlacement(row.latitude, row.longitude, origin);
    if (byCoords) return { ...byCoords, state: (row.state ?? "").toUpperCase() };
    const text = [row.city, row.state].filter(Boolean).join(", ");
    return text ? eventPlacement(text, origin, placeIndex) : null;
  }

  function rowMiles(row: LeagueOccurrence): number | null {
    return rowPlace(row)?.miles ?? null;
  }

  /** True when we only know the state, so the mileage is a rough guess. */
  function rowApproximate(row: LeagueOccurrence): boolean {
    return rowPlace(row)?.precision === "state";
  }

  const { rows, hiddenByDistance, unplaceable } = useMemo(() => {
    // Sanctioned leagues publish one row for the whole season, so a date inside
    // the block is not a playing day unless it lands on the league's weekday.
    // The same night is usually posted on PDGA and UDisc both, so collapse those
    // mirrors into one entry that links to every place it's listed.
    const all = mergeLeagueMirrors((data?.occurrences ?? []).filter((r) => meetsOn(r, today)));
    let unplaced = 0;
    const near =
      radiusMiles && origin
        ? all.filter((r) => {
            const place = rowPlace(r);
            // Without a location we can't claim it's nearby — leave it out.
            if (!place) {
              unplaced += 1;
              return false;
            }
            // A listing we could only place by state still counts as local when
            // it's in your state — the state centroid is too coarse to judge.
            if (place.precision === "state") {
              return place.miles <= radiusMiles || (!!homeState && place.state === homeState);
            }
            return place.miles <= radiusMiles;
          })
        : all;
    // Soonest first: upcoming tee times in order, then ones already underway,
    // then listings with no published time (closest of those first).
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const rank = (row: LeagueOccurrence) => {
      const tee = teeMinutes(row);
      if (tee == null) return { group: 2, key: 0 };
      return tee >= nowMinutes ? { group: 0, key: tee } : { group: 1, key: tee };
    };
    const sorted = [...near].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra.group !== rb.group) return ra.group - rb.group;
      if (ra.key !== rb.key) return ra.key - rb.key;
      const am = rowMiles(a);
      const bm = rowMiles(b);
      if (am != null && bm != null) return am - bm;
      if (am != null) return -1;
      if (bm != null) return 1;
      return a.name.localeCompare(b.name);
    });

    return {
      rows: sorted,
      hiddenByDistance: all.length - near.length - unplaced,
      unplaceable: unplaced,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, radiusMiles, origin, today, placeIndex, homeState]);

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Leagues happening today</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            League nights teeing off today — PDGA sanctioned, Disc Golf Scene, and UDisc —{" "}
            {radiusMiles ? `within ${radiusMiles} miles of you` : "at any distance"}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={radius} onValueChange={changeRadius}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Within 50 miles" />
            </SelectTrigger>
            <SelectContent>
              {RADIUS_VALUES.map((v) => (
                <SelectItem key={v} value={v}>
                  {v === "any" ? "Any distance" : `Within ${v} miles`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/events" search={{ kind: "league", view: "calendar" } as never}>
              Full league calendar
            </Link>
          </Button>
        </div>
      </header>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {rows.length} league {rows.length === 1 ? "night" : "nights"} today
          </span>
          {hiddenByDistance > 0 ? (
            <span>
              {hiddenByDistance} more outside {radiusMiles} miles — widen the distance to see them.
            </span>
          ) : null}
          {unplaceable > 0 ? (
            <span>{unplaceable} without a listed location aren't shown.</span>
          ) : null}
        </div>

        {radiusMiles && !origin ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-3">
            <p className="text-sm text-muted-foreground">
              Share your location and we'll only show leagues within {radiusMiles} miles.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              disabled={locating}
              onClick={() => requestLocation(true)}
            >
              <Crosshair className="mr-1 h-3.5 w-3.5" />
              {locating ? "Locating…" : "Use my location"}
            </Button>
          </div>
        ) : null}

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : isError ? (
          <PlayErrorState
            message="We couldn't reach the league listings just now."
            onRetry={() => void refetch()}
            retrying={isFetching}
          />
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <Users className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-semibold">No league nights near you today</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Widen the distance, check the full league calendar for later this week, or start a
              casual round instead.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link to="/events" search={{ kind: "league", view: "calendar" } as never}>
                  Full league calendar
                </Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/play/pick-course">Start a round</Link>
              </Button>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.slice(0, 3).map((r) => {
              const miles = rowMiles(r);
              const approximate = rowApproximate(r);
              const tee = teeMinutes(r);
              const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
              return (
                <li key={r.id} className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {r.sources.map((s) =>
                        s.url ? (
                          <a
                            key={s.source}
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`See this night on ${SOURCE_LABEL[s.source]}`}
                          >
                            <Badge
                              variant="outline"
                              className="text-[10px] hover:border-primary hover:text-primary"
                            >
                              {SOURCE_LABEL[s.source]}
                            </Badge>
                          </a>
                        ) : (
                          <Badge key={s.source} variant="outline" className="text-[10px]">
                            {SOURCE_LABEL[s.source]}
                          </Badge>
                        ),
                      )}
                      {r.sources.length > 1 ? (
                        <span className="text-xs text-muted-foreground">
                          Listed on {r.sources.length} sites — shown once
                        </span>
                      ) : null}
                      {tee != null ? (
                        <Badge
                          variant={tee >= nowMinutes ? "secondary" : "outline"}
                          className="text-[10px]"
                        >
                          <Clock className="mr-1 h-3 w-3" />
                          {tee >= nowMinutes
                            ? `Tees off ${formatTee(tee)}`
                            : `Started ${formatTee(tee)}`}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Tee time not listed</span>
                      )}
                      {miles != null && !approximate ? (
                        <span className="text-xs text-muted-foreground">
                          {miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi away
                        </span>
                      ) : approximate ? (
                        <span className="text-xs text-muted-foreground">
                          In your state — exact spot not pinned yet
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 break-words text-sm font-semibold">
                      {r.url ? (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:text-primary"
                        >
                          {r.name}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        r.name
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {formatDayRange(r)}
                      </span>
                      {placeOf(r) ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {placeOf(r)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <AddToCalendarButton
                    event={{
                      id: r.id,
                      title: r.name,
                      source: CALENDAR_SOURCE[r.source],
                      start_date: r.start_date,
                      end_date: r.end_date,
                      location: placeOf(r),
                      tier: null,
                      external_url: r.url,
                    }}
                    label="Add night"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
