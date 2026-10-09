/**
 * EventWeather — shows the forecast for a specific event location and date.
 *
 * Geocodes the free-form event location once (Zippopotam for US zips, Open-Meteo
 * otherwise), then pulls a day forecast with an hourly breakdown from Open-Meteo.
 * For past events the archive endpoint provides the observed conditions.
 */
import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  geocodeLocation,
  fetchDayForecast,
  type DayForecast,
} from "@/lib/data-connectors.functions";
import {
  HourlyStrip,
  weatherCodeIcon,
  weatherCodeLabel,
  windCompass,
  type HourlyPoint,
} from "@/components/weather-widget";
import { AlertCircle, CalendarDays, CloudRain, MapPin, Thermometer, Wind } from "lucide-react";

function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function daysBetween(iso: string) {
  const target = new Date(`${iso}T12:00:00Z`).getTime();
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86_400_000);
}

/** Slice hourly points down to typical daylight play hours (7a–8p local). */
function daytimeHours(hourly: DayForecast["hourly"]): HourlyPoint[] {
  if (!hourly.length) return [];
  const filtered = hourly.filter((h) => {
    const t = new Date(h.time);
    const hour = t.getHours();
    return hour >= 7 && hour <= 20;
  });
  const source = filtered.length ? filtered : hourly;
  // Show a compact strip: every ~2 hours, up to 6 slots.
  const step = source.length > 6 ? Math.ceil(source.length / 6) : 1;
  const out: HourlyPoint[] = [];
  for (let i = 0; i < source.length && out.length < 6; i += step) {
    out.push(source[i]);
  }
  return out;
}

export function EventWeather({
  location,
  date,
  className,
}: {
  location: string | null | undefined;
  date: string | null | undefined;
  className?: string;
}) {
  const geocode = useServerFn(geocodeLocation);
  const fetchDay = useServerFn(fetchDayForecast);

  const geoQuery = useQuery({
    queryKey: ["event-geocode", location ?? ""],
    queryFn: () => geocode({ data: { query: location!.trim() } }),
    enabled: !!location && location.trim().length >= 2,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 0,
  });

  const wxQuery = useQuery({
    queryKey: ["event-weather", geoQuery.data?.latitude, geoQuery.data?.longitude, date],
    queryFn: () =>
      fetchDay({
        data: {
          latitude: geoQuery.data!.latitude,
          longitude: geoQuery.data!.longitude,
          date: date!,
        },
      }),
    enabled: !!geoQuery.data && !!date,
    staleTime: 15 * 60 * 1000,
    retry: 0,
  });

  const strip = useMemo(() => daytimeHours(wxQuery.data?.hourly ?? []), [wxQuery.data]);

  if (!location || !date) return null;
  const daysAway = daysBetween(date);

  return (
    <div
      className={`rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-3 ${className ?? ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" /> Event day forecast
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-xs font-medium">
            <span>{fmtDate(date)}</span>
            {geoQuery.data ? (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-3 w-3" />{" "}
                  <span className="truncate">{geoQuery.data.name}</span>
                </span>
              </>
            ) : null}
          </div>
        </div>
        {wxQuery.data && !wxQuery.data.in_range ? (
          <span className="text-[10px] text-muted-foreground">Beyond 16-day forecast</span>
        ) : null}
      </div>

      {geoQuery.isLoading || wxQuery.isLoading ? (
        <div className="mt-2 text-xs text-muted-foreground">Loading forecast for {location}…</div>
      ) : geoQuery.isError ? (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          Could not locate "{location}" on the map. Add a zip or city to enable weather.
        </div>
      ) : wxQuery.isError ? (
        <div className="mt-2 text-xs text-muted-foreground">
          Weather service unavailable — try again later.
        </div>
      ) : wxQuery.data && !wxQuery.data.in_range && wxQuery.data.hi == null ? (
        <div className="mt-2 text-xs text-muted-foreground">
          Event is more than 16 days out. Check back closer to tee time for a live forecast.
        </div>
      ) : wxQuery.data ? (
        <>
          <div className="mt-2 flex items-center gap-3">
            {(() => {
              const Icon = weatherCodeIcon(wxQuery.data.code);
              return <Icon className="h-10 w-10 shrink-0 text-primary drop-shadow" />;
            })()}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold leading-none tabular-nums">
                  {wxQuery.data.hi != null && wxQuery.data.lo != null
                    ? `${Math.round(wxQuery.data.hi)}° / ${Math.round(wxQuery.data.lo)}°`
                    : "—"}
                </span>
                <span className="truncate text-xs font-medium text-muted-foreground">
                  {weatherCodeLabel(wxQuery.data.code)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                <span className="inline-flex items-center gap-1" title="Peak wind & gusts">
                  <Wind className="h-3 w-3 text-primary" />
                  {wxQuery.data.wind_max != null ? `${Math.round(wxQuery.data.wind_max)} mph` : "—"}
                  {wxQuery.data.gust_max != null &&
                  wxQuery.data.wind_max != null &&
                  wxQuery.data.gust_max > wxQuery.data.wind_max
                    ? ` / ${Math.round(wxQuery.data.gust_max)}g`
                    : ""}
                  {wxQuery.data.wind_dir != null ? ` ${windCompass(wxQuery.data.wind_dir)}` : ""}
                </span>
                <span className="inline-flex items-center gap-1" title="Chance of rain">
                  <CloudRain className="h-3 w-3 text-sky-500" />
                  {wxQuery.data.precip_prob != null
                    ? `${Math.round(wxQuery.data.precip_prob)}%`
                    : wxQuery.data.precip_sum != null
                      ? `${wxQuery.data.precip_sum.toFixed(2)}"`
                      : "—"}
                </span>
                {wxQuery.data.is_past ? (
                  <span className="inline-flex items-center gap-1">
                    <Thermometer className="h-3 w-3 text-amber-500" /> Observed
                  </span>
                ) : daysAway >= 0 ? (
                  <span className="text-muted-foreground">
                    {daysAway === 0 ? "Today" : daysAway === 1 ? "Tomorrow" : `In ${daysAway} days`}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {strip.length > 0 ? (
            <HourlyStrip
              hourly={strip}
              className="mt-2"
              heading="Hourly outlook"
              subheading="Local time"
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
