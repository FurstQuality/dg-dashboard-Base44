import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, ChevronDown, ChevronUp, CloudRain, MapPin, Plane, Wind } from "lucide-react";

import {
  fetchDayForecast,
  geocodeLocation,
  type DayForecast,
} from "@/lib/data-connectors.functions";
import { listMySchedule } from "@/lib/scheduled-events.functions";
import { searchEventsNearLocation } from "@/lib/play.functions";
import {
  LocationSearch,
  weatherCodeIcon,
  weatherCodeLabel,
  windCompass,
} from "@/components/weather-widget";

type Place = { latitude: number; longitude: number; name: string };

type UpcomingEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  teeTime: string | null; // ISO
  place: string | null;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function hourLabel(iso: string): string {
  const d = new Date(iso.length <= 16 ? `${iso}:00` : iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric" });
}

/** "Playing somewhere else?" — forecast for a searched city/state or an upcoming event day. */
export function PlayingElsewhereCard({ className }: { className?: string } = {}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [date, setDate] = useState<string>(todayIso());
  const [teeTime, setTeeTime] = useState<string | null>(null);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [lookupError, setLookupError] = useState<string | null>(null);

  const geocode = useServerFn(geocodeLocation);
  const dayForecast = useServerFn(fetchDayForecast);
  const schedule = useServerFn(listMySchedule);
  const searchEvents = useServerFn(searchEventsNearLocation);

  const scheduleQuery = useQuery({
    queryKey: ["weather-elsewhere", "schedule"],
    queryFn: () => schedule({}),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const upcoming = useMemo<UpcomingEvent[]>(() => {
    const data = scheduleQuery.data;
    if (!data) return [];
    const today = todayIso();
    const rows: UpcomingEvent[] = [];
    for (const e of data.scheduled) {
      const startsOn = e.starts_on ?? (e.starts_at ? e.starts_at.slice(0, 10) : null);
      if (!startsOn || startsOn < today) continue;
      if (e.status === "withdrawn" || e.status === "cancelled" || e.status === "completed")
        continue;
      const where =
        e.city && e.state ? `${e.city}, ${e.state}` : (e.location ?? e.city ?? e.state ?? null);
      rows.push({
        id: e.id,
        title: e.title,
        date: startsOn,
        teeTime: e.starts_at ?? null,
        place: where,
      });
    }
    for (const t of data.registered_tournaments) {
      if (!t.start_date || t.start_date < today) continue;
      rows.push({
        id: `t-${t.id}`,
        title: t.name,
        date: t.start_date,
        teeTime: null,
        place: t.location ?? null,
      });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));
    return rows.slice(0, 6);
  }, [scheduleQuery.data]);

  const forecastQuery = useQuery({
    queryKey: ["weather-elsewhere", "forecast", place?.latitude, place?.longitude, date],
    queryFn: () =>
      dayForecast({ data: { latitude: place!.latitude, longitude: place!.longitude, date } }),
    enabled: !!place,
    staleTime: 10 * 60_000,
  });

  const areaEventsQuery = useQuery({
    queryKey: ["weather-elsewhere", "area-events", searchQuery],
    queryFn: () => searchEvents({ data: { query: searchQuery, limit: 6 } }),
    enabled: open && searchQuery.trim().length >= 2,
    staleTime: 10 * 60_000,
  });

  const pickEvent = async (evt: UpcomingEvent) => {
    setLookupError(null);
    setActiveEventId(evt.id);
    setDate(evt.date);
    setTeeTime(evt.teeTime);
    if (!evt.place) {
      setPlace(null);
      setLookupError("This event has no city saved yet — search the city below.");
      return;
    }
    try {
      const loc = await geocode({ data: { query: evt.place } });
      setPlace(loc);
    } catch {
      setPlace(null);
      setLookupError(`Could not locate "${evt.place}" — search the city below.`);
    }
  };

  return (
    <div className={`rounded-xl border border-border bg-card/60 p-2.5 ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
          <Plane className="h-3.5 w-3.5 text-primary" /> Playing somewhere else?
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {!open ? (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Check the forecast for another city or an upcoming event day.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              City, state or zip
            </div>
            <LocationSearch
              onPick={(loc) => {
                setPlace(loc);
                setSearchQuery(loc.name);
                setActiveEventId(null);
                setLookupError(null);
              }}
            />

          </div>

          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Round day
            </div>
            <input
              type="date"
              value={date}
              min={todayIso()}
              onChange={(e) => {
                setDate(e.target.value || todayIso());
                setTeeTime(null);
              }}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <div className="mb-1 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <CalendarDays className="h-3 w-3" /> Upcoming events
            </div>
            {scheduleQuery.isLoading ? (
              <div className="text-[10px] text-muted-foreground">Loading your schedule…</div>
            ) : upcoming.length === 0 ? (
              <div className="text-[10px] text-muted-foreground">
                Nothing on your schedule yet — add an event to see its round-day forecast here.
              </div>
            ) : (
              <div className="space-y-1">
                {upcoming.map((evt) => (
                  <button
                    key={evt.id}
                    type="button"
                    onClick={() => void pickEvent(evt)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1 text-left text-[11px] hover:bg-muted ${
                      activeEventId === evt.id ? "border-primary bg-primary/10" : "border-border"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">
                        {evt.title}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {dayLabel(evt.date)}
                        {evt.place ? ` · ${evt.place}` : ""}
                        {evt.teeTime
                          ? ` · ${new Date(evt.teeTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
                          : ""}
                      </span>
                    </span>
                    <CloudRain className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {searchQuery.trim().length >= 2 ? (
            <div>
              <div className="mb-1 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <CalendarDays className="h-3 w-3" /> Events near {searchQuery}
              </div>
              {areaEventsQuery.isLoading ? (
                <div className="text-[10px] text-muted-foreground">Looking for events there…</div>
              ) : areaEventsQuery.error ? (
                <div className="text-[10px] text-destructive">
                  {(areaEventsQuery.error as Error).message}
                </div>
              ) : (areaEventsQuery.data ?? []).length === 0 ? (
                <div className="text-[10px] text-muted-foreground">
                  No upcoming sanctioned events found around {searchQuery} yet.
                </div>
              ) : (
                <div className="space-y-1">
                  {(areaEventsQuery.data ?? []).map((evt) => (
                    <button
                      key={evt.id}
                      type="button"
                      onClick={() =>
                        void pickEvent({
                          id: `pdga-${evt.id}`,
                          title: evt.name,
                          date: evt.startDate ?? todayIso(),
                          teeTime: null,
                          place:
                            evt.city && evt.state
                              ? `${evt.city}, ${evt.state}`
                              : (evt.location ?? evt.city ?? evt.state ?? null),
                        })
                      }
                      className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1 text-left text-[11px] hover:bg-muted ${
                        activeEventId === `pdga-${evt.id}`
                          ? "border-primary bg-primary/10"
                          : "border-border"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">
                          {evt.name}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {evt.startDate ? dayLabel(evt.startDate) : "Date TBA"}
                          {evt.city && evt.state ? ` · ${evt.city}, ${evt.state}` : ""}
                          {evt.tier ? ` · ${evt.tier}` : ""}
                        </span>
                      </span>
                      <CloudRain className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}



          {lookupError ? <div className="text-[10px] text-destructive">{lookupError}</div> : null}

          {place ? (
            <ForecastPreview
              place={place}
              date={date}
              teeTime={teeTime}
              forecast={forecastQuery.data ?? null}
              loading={forecastQuery.isFetching}
              error={forecastQuery.error ? (forecastQuery.error as Error).message : null}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function ForecastPreview({
  place,
  date,
  teeTime,
  forecast,
  loading,
  error,
}: {
  place: Place;
  date: string;
  teeTime: string | null;
  forecast: DayForecast | null;
  loading: boolean;
  error: string | null;
}) {
  const roundHours = useMemo(() => {
    if (!forecast) return [];
    const startHour = teeTime ? new Date(teeTime).getHours() : 9;
    return forecast.hourly
      .filter((h) => {
        const hr = Number(h.time.slice(11, 13));
        return hr >= startHour && hr <= startHour + 4;
      })
      .slice(0, 5);
  }, [forecast, teeTime]);

  if (loading && !forecast) {
    return (
      <div className="rounded-md border border-border bg-background/60 p-2 text-[10px] text-muted-foreground">
        Pulling the forecast for {place.name}…
      </div>
    );
  }
  if (error) {
    return <div className="text-[10px] text-destructive">{error}</div>;
  }
  if (!forecast) return null;
  if (!forecast.in_range) {
    return (
      <div className="rounded-md border border-border bg-background/60 p-2 text-[10px] text-muted-foreground">
        {dayLabel(date)} is beyond the 16-day forecast window. Check back closer to the round.
      </div>
    );
  }

  const Icon = weatherCodeIcon(forecast.code, true);
  const hiLo =
    forecast.hi != null && forecast.lo != null
      ? `${Math.round(forecast.hi)}° / ${Math.round(forecast.lo)}°`
      : "—";
  const wind =
    forecast.wind_max != null
      ? `${Math.round(forecast.wind_max)} mph${forecast.gust_max != null ? ` g${Math.round(forecast.gust_max)}` : ""}${
          windCompass(forecast.wind_dir) ? ` ${windCompass(forecast.wind_dir)}` : ""
        }`
      : "—";

  return (
    <div className="rounded-md border border-border bg-background/60 p-2">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <MapPin className="h-3 w-3 shrink-0" />
        <span className="truncate">{place.name}</span>
        <span>· {dayLabel(date)}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <Icon className="h-8 w-8 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="text-sm font-semibold tabular-nums text-foreground">{hiLo}</div>
          <div className="truncate text-[10px] text-muted-foreground">
            {weatherCodeLabel(forecast.code, true)}
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground tabular-nums">
        <span className="inline-flex items-center gap-1">
          <Wind className="h-3 w-3 text-amber-500" /> {wind}
        </span>
        <span className="inline-flex items-center gap-1">
          <CloudRain className="h-3 w-3 text-sky-500" />{" "}
          {forecast.precip_prob != null ? `${Math.round(forecast.precip_prob)}%` : "—"}
          {forecast.precip_sum != null ? ` · ${forecast.precip_sum.toFixed(2)}"` : ""}
        </span>
      </div>
      {roundHours.length > 0 ? (
        <div className="mt-2">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {teeTime ? "During your round" : "Midday window"}
          </div>
          <div className="grid grid-cols-5 gap-1 text-center">
            {roundHours.map((h) => (
              <div key={h.time} className="rounded border border-border px-1 py-1">
                <div className="text-[9px] text-muted-foreground">{hourLabel(h.time)}</div>
                <div className="text-[11px] font-semibold tabular-nums text-foreground">
                  {h.temp != null ? `${Math.round(h.temp)}°` : "—"}
                </div>
                <div className="text-[9px] text-muted-foreground tabular-nums">
                  {h.precipProb != null ? `${Math.round(h.precipProb)}%` : "—"}
                </div>
                <div className="text-[9px] text-muted-foreground tabular-nums">
                  {h.wind != null ? `${Math.round(h.wind)}mph` : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
