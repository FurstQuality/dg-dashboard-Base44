import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  AlertTriangle,
  CloudRain,
  Droplets,
  Locate,
  MapPin,
  RefreshCw,
  Thermometer,
  Wind,
  Zap,
} from "lucide-react";
import {
  HourlyStrip,
  LocationSearch,
  playHint,
  useWeather,
  useWeatherLocation,
  weatherCodeIcon,
  weatherCodeLabel,
  windCompass,
  type HourlyPoint,
} from "@/components/weather-widget";
import { PageShell } from "@/components/shell/page-shell";

export const Route = createFileRoute("/_authenticated/weather")({
  component: WeatherPage,
  head: () => ({
    meta: [
      { title: "Weather · DG Dashboard" },
      {
        name: "description",
        content:
          "Live disc golf weather: current conditions, active alerts, next-hour outlook and multi-day hourly forecast for your course.",
      },
      { property: "og:title", content: "Weather · DG Dashboard" },
      {
        property: "og:description",
        content: "Live conditions, alerts, and hourly outlook for your round.",
      },
    ],
  }),
});

type OverrideLocation = { latitude: number; longitude: number; name: string } | null;

function WeatherPage() {
  const {
    coords,
    placeName,
    geoError,
    requestGps,
    setOverrideLocation,
    usingOverride,
    usingFallback,
  } = useWeatherLocation();

  const setLoc = (loc: OverrideLocation) => setOverrideLocation(loc);

  const { weather, loading, error, refresh, refreshedAt } = useWeather(coords);

  const hint = weather ? playHint(weather) : null;
  const Icon = weather ? weatherCodeIcon(weather.code, weather.isDay) : Thermometer;

  const updatedLabel = useMemo(() => {
    const iso = weather?.fetchedAt ?? (refreshedAt ? new Date(refreshedAt).toISOString() : null);
    if (!iso) return "—";
    const diff = Math.max(0, Date.now() - new Date(iso).getTime());
    const s = Math.round(diff / 1000);
    if (s < 45) return "Just now";
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    return `${h}h ago`;
  }, [weather?.fetchedAt, refreshedAt]);

  // Bucket hourly into "today / tomorrow / later" days for a fuller forecast.
  const days = useMemo(() => {
    const hourly = weather?.hourly ?? [];
    const buckets = new Map<string, HourlyPoint[]>();
    for (const h of hourly) {
      const d = new Date(h.time);
      const key = d.toISOString().slice(0, 10);
      const arr = buckets.get(key) ?? [];
      arr.push(h);
      buckets.set(key, arr);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, hours]) => ({ key, hours }));
  }, [weather?.hourly]);

  const nextFour = weather?.hourly.slice(0, 4) ?? [];

  return (
    <PageShell>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Weather</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live conditions, official alerts, and hourly outlook for your next round.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <span className="text-xs text-muted-foreground">Updated {updatedLabel}</span>
        </div>
      </header>

      {/* Location controls */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="truncate font-medium">
              {placeName || (geoError ? "Location unavailable" : "Requesting location…")}
            </span>
            {weather?.observedStation ? (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                · Station {weather.observedStation}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setLoc(null);
                requestGps();
              }}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <Locate className="h-3.5 w-3.5" /> Use my location
            </button>
          </div>
        </div>
        <div className="mt-3">
          <LocationSearch onPick={(loc) => setLoc(loc)} />
          {geoError && !usingOverride ? (
            <div className="mt-2 text-xs text-muted-foreground">
              {usingFallback
                ? `Live location is off, so we're using ${placeName}. Enter a zip or city above for anywhere else.`
                : `${geoError}. Enter a zip or city above to load conditions anywhere.`}
            </div>
          ) : null}
        </div>
      </section>

      {/* Alerts */}
      {weather && weather.alerts.length > 0 ? (
        <section className="space-y-2">
          {weather.alerts.map((a) => (
            <div
              key={a.id}
              className="rounded-2xl border border-destructive/60 bg-destructive/10 p-4"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-destructive">{a.event}</div>
                  <div className="text-xs uppercase tracking-wide text-destructive/80">
                    {a.severity} · {a.urgency}
                  </div>
                  <div className="mt-1 text-sm font-medium">{a.headline}</div>
                  <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                    {a.description}
                  </p>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    In effect {new Date(a.effective).toLocaleString()} —{" "}
                    {new Date(a.expires).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {/* Current + advisory */}
      {weather ? (
        <section
          className={`rounded-2xl border p-5 ${
            hint?.severe
              ? "border-destructive/60 bg-gradient-to-br from-destructive/15 via-card to-card"
              : "border-border bg-gradient-to-br from-primary/10 via-card to-card"
          }`}
        >
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex items-center gap-4">
              <Icon
                className={`h-16 w-16 shrink-0 ${
                  hint?.severe ? "text-destructive" : "text-primary"
                }`}
              />
              <div className="min-w-0">
                <div className="font-display text-5xl font-bold leading-none tabular-nums">
                  {weather.temp != null ? `${Math.round(weather.temp)}°` : "—"}
                </div>
                <div className="mt-1 text-sm font-medium">
                  {weatherCodeLabel(weather.code, weather.isDay)}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Feels like {weather.feelsLike != null ? `${Math.round(weather.feelsLike)}°` : "—"}{" "}
                  · H/L {weather.hi != null ? `${Math.round(weather.hi)}°` : "—"} /{" "}
                  {weather.lo != null ? `${Math.round(weather.lo)}°` : "—"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <Stat
                icon={<Wind className="h-3.5 w-3.5" />}
                label="Wind"
                value={
                  weather.wind != null
                    ? `${Math.round(weather.wind)} mph${
                        windCompass(weather.windDir) ? ` ${windCompass(weather.windDir)}` : ""
                      }`
                    : "—"
                }
              />
              <Stat
                icon={<Zap className="h-3.5 w-3.5" />}
                label="Gusts"
                value={weather.gust != null ? `${Math.round(weather.gust)} mph` : "—"}
              />
              <Stat
                icon={<CloudRain className="h-3.5 w-3.5" />}
                label="Rain chance"
                value={weather.precipProb != null ? `${Math.round(weather.precipProb)}%` : "—"}
              />
              <Stat
                icon={<Droplets className="h-3.5 w-3.5" />}
                label="Humidity"
                value={weather.humidity != null ? `${Math.round(weather.humidity)}%` : "—"}
              />
              <Stat
                icon={<CloudRain className="h-3.5 w-3.5" />}
                label="Precip"
                value={weather.precip != null ? `${weather.precip.toFixed(2)}"` : "—"}
              />
              <Stat
                icon={<Thermometer className="h-3.5 w-3.5" />}
                label="Feels like"
                value={weather.feelsLike != null ? `${Math.round(weather.feelsLike)}°` : "—"}
              />
            </div>
          </div>

          {hint ? (
            <div
              className={`mt-4 rounded-lg border px-3 py-2 text-sm font-medium ${
                hint.severe
                  ? "border-destructive/60 bg-destructive/10 text-destructive"
                  : "border-primary/30 bg-primary/5 text-foreground"
              }`}
            >
              {hint.text}
            </div>
          ) : null}
        </section>
      ) : loading ? (
        <section className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Loading conditions…
        </section>
      ) : error ? (
        <section className="rounded-2xl border border-destructive/50 bg-destructive/10 p-6 text-sm text-destructive">
          {error}
        </section>
      ) : null}

      {/* Next 4 hours */}
      {nextFour.length > 0 ? (
        <section className="rounded-2xl border border-border bg-card p-4">
          <HourlyStrip hourly={nextFour} heading="Next 4 hours" subheading="Grip & wind outlook" />
        </section>
      ) : null}

      {/* Multi-day hourly forecast */}
      {days.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Hourly forecast
          </h2>
          {days.slice(0, 4).map((day, idx) => {
            const d = new Date(day.hours[0].time);
            const label =
              idx === 0
                ? "Today"
                : idx === 1
                  ? "Tomorrow"
                  : d.toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    });
            return (
              <div key={day.key} className="rounded-2xl border border-border bg-card p-4">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {d.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[640px]">
                    <HourlyStrip hourly={day.hours} />
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      ) : null}
    </PageShell>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-0.5 font-semibold tabular-nums">{value}</div>
    </div>
  );
}
