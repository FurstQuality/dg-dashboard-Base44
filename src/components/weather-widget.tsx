import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { fetchWeatherForPoint, geocodeLocation } from "@/lib/data-connectors.functions";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudMoon,
  CloudRain,
  Droplets,
  Locate,
  MapPin,
  Moon,
  RefreshCw,
  Search,
  Sun,
  Thermometer,
  Wind,
  Zap,
} from "lucide-react";

export type WeatherAlert = {
  id: string;
  event: string;
  severity: string;
  urgency: string;
  headline: string;
  description: string;
  effective: string;
  expires: string;
};

export type HourlyPoint = {
  time: string;
  temp: number | null;
  precipProb: number | null;
  precip: number | null;
  wind: number | null;
  gust: number | null;
  windDir: number | null;
  code: number | null;
  isDay?: boolean | null;
};

export type CurrentWeather = {
  temp: number | null;
  feelsLike: number | null;
  humidity: number | null;
  wind: number | null;
  gust: number | null;
  windDir: number | null;
  precip: number | null;
  precipProb: number | null;
  code: number | null;
  isDay?: boolean | null;
  hi: number | null;
  lo: number | null;
  alerts: WeatherAlert[];
  hourly: HourlyPoint[];
  fetchedAt: string | null;
  observedAt: string | null;
  observedStation: string | null;
};

export function weatherCodeLabel(code: number | null, isDay: boolean | null = true): string {
  if (code == null) return "—";
  const night = isDay === false;
  if (code === 0) return night ? "Clear night" : "Clear";
  if (code <= 2) return night ? "Mostly clear" : "Mostly sunny";
  if (code === 3) return "Overcast";
  if (code <= 48) return "Fog";
  if (code <= 57) return "Drizzle";
  if (code <= 65) return "Rain";
  if (code === 66 || code === 67) return "Freezing rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Heavy showers";
  if (code <= 86) return "Snow showers";
  if (code === 95) return "Thunderstorm";
  if (code >= 96) return "Severe thunderstorm";
  return "—";
}

export function weatherCodeIcon(code: number | null, isDay: boolean | null = true) {
  const night = isDay === false;
  if (code == null) return night ? Moon : Cloud;
  if (code === 0) return night ? Moon : Sun;
  if (code <= 2) return night ? CloudMoon : Sun;
  if (code >= 95) return Zap;
  if (code <= 48) return Cloud;
  if (code <= 82) return CloudRain;
  return Cloud;
}

export function windCompass(deg: number | null): string {
  if (deg == null) return "";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round((deg % 360) / 45) % 8];
}

type WeatherRaw = {
  current?: Record<string, number | string>;
  hourly?: Record<string, Array<number | string>>;
  daily?: Record<string, Array<number | string>>;
  timezone?: string;
  alerts?: WeatherAlert[];
  fetchedAt?: string | null;
  observedAt?: string | null;
  observedStation?: string | null;
};

export function parseCurrent(raw: WeatherRaw | null): CurrentWeather | null {
  if (!raw) return null;
  // Some queries (past-date archives, partial responses) omit `current`. Fall
  // back to the closest hourly slice so the widget still renders live data
  // instead of collapsing to "Weather unavailable".
  const cur: Record<string, number | string> = raw.current
    ? { ...(raw.current as Record<string, number | string>) }
    : {};

  const daily = raw.daily;
  const hourly = raw.hourly;
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  let precipProb: number | null = null;
  let nowIdx = -1;
  if (hourly?.time) {
    const now = Date.now();
    const times = hourly.time as unknown as string[];
    let closestDiff = Infinity;
    for (let i = 0; i < times.length; i++) {
      const t = new Date(String(times[i])).getTime();
      const diff = Math.abs(t - now);
      if (diff < closestDiff) {
        closestDiff = diff;
        nowIdx = i;
      }
    }
    if (hourly.precipitation_probability && nowIdx >= 0) {
      precipProb = num(hourly.precipitation_probability[nowIdx]);
    }
  }
  if (precipProb == null && daily?.precipitation_probability_max) {
    precipProb = num(daily.precipitation_probability_max[0]);
  }

  // Backfill missing "current" values from the nearest hourly slice so a
  // response without a `current` block still renders a live snapshot.
  if (hourly && nowIdx >= 0) {
    const pick = (arr: unknown, key: string) => {
      if (cur[key] != null) return;
      const list = arr as unknown as Array<number | string> | undefined;
      const v = list?.[nowIdx];
      if (v != null) cur[key] = v;
    };
    pick(hourly.temperature_2m, "temperature_2m");
    pick(hourly.temperature_2m, "apparent_temperature");
    pick(hourly.precipitation, "precipitation");
    pick(hourly.weather_code, "weather_code");
    pick(hourly.wind_speed_10m, "wind_speed_10m");
    pick(hourly.wind_gusts_10m, "wind_gusts_10m");
    pick(hourly.wind_direction_10m, "wind_direction_10m");
    pick(hourly.is_day, "is_day");
  }

  // If neither current nor hourly produced anything usable, bail so the
  // widget shows its "unavailable" state instead of a blank card.
  if (Object.keys(cur).length === 0 && !daily) return null;

  // Build the next-4-hours outlook starting at the hour AFTER "now" so the
  // scoring-focused strip is genuinely forward-looking.
  const hourlyOut: HourlyPoint[] = [];
  if (hourly?.time && nowIdx >= 0) {
    const times = hourly.time as unknown as string[];
    const startIdx = nowIdx + 1;
    for (let i = startIdx; i < Math.min(startIdx + 4, times.length); i++) {
      hourlyOut.push({
        time: String(times[i]),
        temp: num(hourly.temperature_2m?.[i]),
        precipProb: num(hourly.precipitation_probability?.[i]),
        precip: num(hourly.precipitation?.[i]),
        wind: num(hourly.wind_speed_10m?.[i]),
        gust: num(hourly.wind_gusts_10m?.[i]),
        windDir: num(hourly.wind_direction_10m?.[i]),
        code: num(hourly.weather_code?.[i]),
        isDay: (() => {
          const v = num(hourly.is_day?.[i]);
          return v == null ? null : v === 1;
        })(),
      });
    }
  }

  return {
    temp: num(cur.temperature_2m),
    feelsLike: num(cur.apparent_temperature),
    humidity: num(cur.relative_humidity_2m),
    wind: num(cur.wind_speed_10m),
    gust: num(cur.wind_gusts_10m),
    windDir: num(cur.wind_direction_10m),
    precip: num(cur.precipitation),
    precipProb,
    code: num(cur.weather_code),
    isDay: (() => {
      const v = num(cur.is_day);
      return v == null ? null : v === 1;
    })(),
    hi: daily?.temperature_2m_max ? num(daily.temperature_2m_max[0]) : null,
    lo: daily?.temperature_2m_min ? num(daily.temperature_2m_min[0]) : null,
    alerts: Array.isArray(raw.alerts) ? raw.alerts : [],
    hourly: hourlyOut,
    fetchedAt: raw.fetchedAt ?? null,
    observedAt: raw.observedAt ?? null,
    observedStation: raw.observedStation ?? null,
  };
}

// NWS station observations update every few minutes, but the upstream weather
// provider rate-limits by IP, so poll on a calmer cadence and rely on the
// server-side cache for freshness. Also refetches on tab focus / reconnect.
const REFRESH_MS = 5 * 60 * 1000;
// Never fire two live requests for the same point closer together than this.
const MIN_FETCH_GAP_MS = 45 * 1000;

/** Last good raw payload per point, so a reload during a provider outage still shows conditions. */
const LAST_PAYLOAD_KEY = "dgd:weather-last-payload";
const LAST_PAYLOAD_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function payloadSlot(coords: { latitude: number; longitude: number }): string {
  return `${coords.latitude.toFixed(2)},${coords.longitude.toFixed(2)}`;
}

function readStoredPayload(
  coords: { latitude: number; longitude: number } | null,
): CurrentWeather | null {
  if (!coords || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_PAYLOAD_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { slot?: string; at?: number; payload?: WeatherRaw };
    if (saved.slot !== payloadSlot(coords)) return null;
    if (!saved.at || Date.now() - saved.at > LAST_PAYLOAD_MAX_AGE_MS) return null;
    return parseCurrent(saved.payload ?? null);
  } catch {
    return null;
  }
}

function storePayload(coords: { latitude: number; longitude: number }, payload: WeatherRaw): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LAST_PAYLOAD_KEY,
      JSON.stringify({ slot: payloadSlot(coords), at: Date.now(), payload }),
    );
  } catch {
    // Storage full or blocked — non-fatal.
  }
}

export function useWeather(coords: { latitude: number; longitude: number } | null) {
  const [data, setData] = useState<CurrentWeather | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const fetchWeather = useServerFn(fetchWeatherForPoint);
  const loadRef = useRef<(force?: boolean) => void>(() => {});

  useEffect(() => {
    if (!coords) {
      loadRef.current = () => {};
      return;
    }
    let cancelled = false;
    // Show the last good reading immediately; the live fetch replaces it.
    const stored = readStoredPayload(coords);
    if (stored) {
      setData((prev) => prev ?? stored);
      setError(null);
    }
    let lastAttempt = 0;
    let pending = false;
    const load = (force = false) => {
      if (pending) return;
      const now = Date.now();
      if (!force && now - lastAttempt < MIN_FETCH_GAP_MS) return;
      lastAttempt = now;
      pending = true;
      setLoading(true);
      fetchWeather({ data: { latitude: coords.latitude, longitude: coords.longitude } })
        .then((raw) => {
          if (cancelled) return;
          const parsed = parseCurrent(raw as WeatherRaw);
          if (parsed) {
            setData(parsed);
            storePayload(coords, raw as WeatherRaw);
          }
          setError(null);
          setRefreshedAt(Date.now());
        })
        .catch((e: Error) => {
          // Keep the last good reading on screen instead of blanking the card.
          if (!cancelled) setError(e.message || "Weather unavailable");
        })
        .finally(() => {
          pending = false;
          if (!cancelled) setLoading(false);
        });
    };
    loadRef.current = load;
    load(true);
    const t = setInterval(() => load(), REFRESH_MS);
    const onFocus = () => load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [coords?.latitude, coords?.longitude, fetchWeather]);

  const refresh = useCallback(() => loadRef.current(true), []);

  return { weather: data, loading, error, refresh, refreshedAt };
}

const PlayingElsewhereLazy = lazy(() =>
  import("@/components/weather-elsewhere").then((m) => ({ default: m.PlayingElsewhereCard })),
);

type OverrideLocation = { latitude: number; longitude: number; name: string } | null;
const OVERRIDE_KEY = "dgd:weather-override";
/** Last point that successfully produced weather — reused when GPS is blocked. */
const LAST_POINT_KEY = "dgd:weather-last-point";
/** Coordinates the course picker already resolved for this player. */
const PLAY_COORDS_KEY = "dgd.play.lastCoords";

function readPoint(key: string): OverrideLocation {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw) as { latitude?: unknown; longitude?: unknown; name?: unknown };
    if (typeof p?.latitude === "number" && typeof p.longitude === "number") {
      return {
        latitude: p.latitude,
        longitude: p.longitude,
        name: typeof p.name === "string" && p.name ? p.name : "Last known area",
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function loadOverride(): OverrideLocation {
  return readPoint(OVERRIDE_KEY);
}

/**
 * Resolves the point weather should be shown for. Order of preference: a manual
 * override the player picked, live GPS, then the last point we already have for
 * them (recent weather look-up, course-picker coords, or their profile
 * location). Browsers that block geolocation — including embedded preview
 * frames — still get live conditions instead of an empty card.
 */
export function useWeatherLocation() {
  const [gpsCoords, setGpsCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [override, setOverride] = useState<OverrideLocation>(() => loadOverride());
  const [fallback, setFallback] = useState<OverrideLocation>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const geocode = useServerFn(geocodeLocation);

  const requestGps = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Geolocation isn't available in this browser");
      return;
    }
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => setGpsCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => setGeoError(err.message || "Location access denied"),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
    );
  }, []);

  useEffect(() => {
    if (override) return; // manual override wins
    requestGps();
    // Refresh coords every 10 min if GPS is granted (keeps travel/live rounds accurate).
    const t = setInterval(
      () => {
        if (!override) requestGps();
      },
      10 * 60 * 1000,
    );
    return () => clearInterval(t);
  }, [override, requestGps]);

  // Resolve a stand-in point whenever GPS hasn't produced coordinates.
  useEffect(() => {
    if (override || gpsCoords || fallback) return;
    let cancelled = false;
    const cached = readPoint(LAST_POINT_KEY) ?? readPoint(PLAY_COORDS_KEY);
    if (cached) {
      setFallback(cached);
      return;
    }
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid || cancelled) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("location, home_state")
        .eq("id", uid)
        .maybeSingle();
      const query = [profile?.location, profile?.home_state].filter(Boolean).join(", ").trim();
      if (!query || cancelled) return;
      try {
        const hit = (await geocode({ data: { query } })) as {
          latitude?: number;
          longitude?: number;
          name?: string;
        } | null;
        if (!cancelled && hit && typeof hit.latitude === "number") {
          setFallback({
            latitude: hit.latitude,
            longitude: hit.longitude as number,
            name: hit.name || query,
          });
        }
      } catch {
        /* leave the manual search as the remaining option */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [override, gpsCoords, fallback, geocode]);

  const coords = override ?? gpsCoords ?? fallback;
  const placeName = override?.name ?? (gpsCoords ? "Current location" : (fallback?.name ?? ""));

  // Remember whatever point we ended up using so the next visit is instant even
  // if geolocation is unavailable then.
  const lat = coords?.latitude;
  const lon = coords?.longitude;
  useEffect(() => {
    if (typeof lat !== "number" || typeof lon !== "number" || typeof window === "undefined") return;
    window.localStorage.setItem(
      LAST_POINT_KEY,
      JSON.stringify({ latitude: lat, longitude: lon, name: placeName || "Last known area" }),
    );
  }, [lat, lon, placeName]);

  const setOverrideLocation = useCallback((loc: OverrideLocation) => {
    setOverride(loc);
    if (typeof window !== "undefined") {
      if (loc) window.localStorage.setItem(OVERRIDE_KEY, JSON.stringify(loc));
      else window.localStorage.removeItem(OVERRIDE_KEY);
    }
  }, []);

  return {
    coords,
    placeName,
    geoError,
    requestGps,
    setOverrideLocation,
    usingOverride: !!override,
    usingFallback: !override && !gpsCoords && !!fallback,
  };
}

/** Home-feed weather widget. */
export function WeatherWidget({ compact = false }: { compact?: boolean } = {}) {
  const { coords, placeName, geoError, requestGps, setOverrideLocation, usingOverride } =
    useWeatherLocation();

  const { weather, loading, error, refresh, refreshedAt } = useWeather(coords);

  if (!coords) {
    return (
      <div className="rounded-2xl border border-border bg-card p-3 text-xs">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <MapPin className="h-4 w-4" /> Live weather
        </div>
        <div className="mt-1 text-muted-foreground">
          {geoError
            ? `${geoError}. Enter a zip or city below for live conditions.`
            : "Finding your area…"}
        </div>
        <LocationSearch onPick={setOverrideLocation} className="mt-2" />
        <button
          type="button"
          onClick={requestGps}
          className="mt-2 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"
        >
          <Locate className="h-3 w-3" /> Try GPS again
        </button>
      </div>
    );
  }

  if (loading && !weather) {
    return (
      <div className="rounded-2xl border border-border bg-card p-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <Cloud className="h-4 w-4" /> Live weather
        </div>
        <div className="mt-1">Checking conditions for {placeName || "your area"}…</div>
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="rounded-2xl border border-border bg-card p-3 text-xs">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <Cloud className="h-4 w-4" /> Live weather
        </div>
        <div className="mt-1 text-muted-foreground">
          {error || "We couldn't reach the weather service"}
        </div>
        <button
          type="button"
          onClick={refresh}
          className="mt-2 rounded-lg border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
        >
          Try again
        </button>
        <LocationSearch onPick={setOverrideLocation} className="mt-2" />
      </div>
    );
  }

  if (compact) {
    return (
      <WeatherCompactCard
        weather={weather}
        placeName={placeName}
        onRefresh={refresh}
        refreshing={loading}
      />
    );
  }

  return (
    <WeatherFullCard
      weather={weather}
      placeName={placeName}
      usingOverride={usingOverride}
      onOverride={setOverrideLocation}
      onUseGps={() => {
        setOverrideLocation(null);
        requestGps();
      }}
      onRefresh={refresh}
      refreshing={loading}
      refreshedAt={refreshedAt}
    />
  );
}

/**
 * Compact home-feed weather card. Shows the full current-conditions set at a
 * glance and expands for the short-term outlook without leaving the feed.
 */
function WeatherCompactCard({
  weather,
  placeName,
  onRefresh,
  refreshing,
}: {
  weather: CurrentWeather;
  placeName: string;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [open, setOpen] = useState(false);
  const Icon = weatherCodeIcon(weather.code, weather.isDay);
  const hint = playHint(weather);
  const topAlert = weather.alerts[0];

  const dirTxt = windCompass(weather.windDir);
  const windTxt =
    weather.wind != null ? `${Math.round(weather.wind)} mph${dirTxt ? ` ${dirTxt}` : ""}` : "—";
  const gustTxt = weather.gust != null ? `${Math.round(weather.gust)} mph` : "—";
  const feelsTxt = weather.feelsLike != null ? `${Math.round(weather.feelsLike)}°` : "—";
  const humidityTxt = weather.humidity != null ? `${Math.round(weather.humidity)}%` : "—";
  const rainTxt = weather.precipProb != null ? `${Math.round(weather.precipProb)}%` : "—";
  const precipAmtTxt = weather.precip != null ? `${weather.precip.toFixed(2)}"` : "—";
  const hiLoTxt =
    weather.hi != null && weather.lo != null
      ? `${Math.round(weather.hi)}° / ${Math.round(weather.lo)}°`
      : "—";
  const observedTxt = (() => {
    const iso = weather.observedAt ?? weather.fetchedAt;
    if (!iso) return null;
    const time = new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return weather.observedAt
      ? `${weather.observedStation ?? "Nearest station"} · ${time}`
      : `Forecast updated ${time}`;
  })();

  return (
    <div
      className={`rounded-xl border px-2.5 py-1.5 ${
        hint.severe
          ? "border-destructive/60 bg-gradient-to-br from-destructive/15 via-card to-card"
          : "border-border bg-gradient-to-br from-primary/10 via-card to-card"
      }`}
    >
      {/* One compact row: conditions, metrics, controls. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <Icon
            className={`h-6 w-6 shrink-0 ${hint.severe ? "text-destructive" : "text-primary"}`}
          />
          <span className="font-display text-lg font-bold leading-none tabular-nums">
            {weather.temp != null ? `${Math.round(weather.temp)}°` : "—"}
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[11px] font-medium">
              {weatherCodeLabel(weather.code, weather.isDay)}
            </div>
            <div className="inline-flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{placeName || "Your area"}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
          <span className="tabular-nums" title="Today's high / low">
            H/L <span className="font-semibold text-foreground">{hiLoTxt}</span>
          </span>
          <span className="tabular-nums" title="Feels like">
            Feels <span className="font-semibold text-foreground">{feelsTxt}</span>
          </span>
          <span className="inline-flex items-center gap-1" title="Wind and gusts">
            <Wind className="h-3 w-3 text-amber-500" />
            <span className="font-semibold tabular-nums text-foreground">{windTxt}</span>
            <span className="tabular-nums">({gustTxt} gusts)</span>
          </span>
          <span className="inline-flex items-center gap-1" title="Rain chance and amount">
            <CloudRain className="h-3 w-3 text-sky-500" />
            <span className="font-semibold tabular-nums text-foreground">{rainTxt}</span>
            <span className="tabular-nums">({precipAmtTxt})</span>
          </span>
          <span className="inline-flex items-center gap-1" title="Humidity">
            <Droplets className="h-3 w-3 text-primary" />
            <span className="font-semibold tabular-nums text-foreground">{humidityTxt}</span>
          </span>
        </div>

        <span
          className={`truncate text-[10px] font-medium ${hint.severe ? "text-destructive" : "text-primary/90"}`}
        >
          {hint.text}
        </span>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh weather"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {open ? (
              <>
                <ChevronUp className="h-3 w-3" /> Less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" /> Hourly
              </>
            )}
          </button>
          <Link
            to="/weather"
            className="rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary hover:bg-primary/10"
          >
            Forecast
          </Link>
        </div>
      </div>

      {topAlert ? (
        <div
          className="mt-1 flex items-start gap-1.5 rounded-md border border-destructive/60 bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive"
          title={topAlert.description}
        >
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold leading-tight">{topAlert.event}</div>
            <div className="truncate opacity-90">{topAlert.headline}</div>
          </div>
        </div>
      ) : null}

      {open && weather.hourly.length > 0 ? (
        <HourlyStrip
          hourly={weather.hourly}
          className="mt-1.5"
          heading="Next 4 hours"
          subheading="Will conditions hold for your round?"
        />
      ) : null}

      {open && observedTxt ? (
        <div className="mt-1.5 text-[10px] text-muted-foreground">{observedTxt}</div>
      ) : null}

      {open ? (
        <Suspense fallback={null}>
          <PlayingElsewhereLazy className="mt-1.5" />
        </Suspense>
      ) : null}
    </div>
  );
}

/** Advisory text for scoring: never says "good" while severe weather is active. */
export function playHint(weather: CurrentWeather): { text: string; severe: boolean } {
  if (weather.alerts.length > 0) {
    const a = weather.alerts[0];
    return { text: `${a.event} in effect — do not play`, severe: true };
  }
  const code = weather.code ?? -1;
  if (code >= 95) return { text: "Thunderstorms — get off the course", severe: true };
  if (code === 66 || code === 67 || (code >= 71 && code <= 77)) {
    return { text: "Winter precip — hazardous", severe: true };
  }
  const gust = weather.gust ?? 0;
  if (gust >= 40)
    return { text: `Damaging gusts (${Math.round(gust)} mph) — seek shelter`, severe: true };
  const precip = weather.precip ?? 0;
  if (precip >= 0.3 || code === 65 || code === 82) {
    return { text: "Heavy rain — expect wet grips and casual water", severe: false };
  }
  const prob = weather.precipProb ?? 0;
  if (prob >= 60) return { text: "Rain likely — pack a towel", severe: false };
  if (code >= 51 && code <= 57) return { text: "Drizzle — grip management matters", severe: false };
  if (code >= 61 && code <= 63)
    return { text: "Light rain — playable with a towel", severe: false };
  const wind = weather.wind ?? 0;
  if (wind >= 20)
    return {
      text: `Very windy — read ${windCompass(weather.windDir) || "the wind"} carefully`,
      severe: false,
    };
  if (wind >= 12)
    return { text: `Windy — ${windCompass(weather.windDir) || "check direction"}`, severe: false };
  if (code === 3) return { text: "Overcast — steady conditions", severe: false };
  return { text: "Good conditions for a round", severe: false };
}

function WeatherFullCard({
  weather,
  placeName,
  usingOverride,
  onOverride,
  onUseGps,
  onRefresh,
  refreshing,
  refreshedAt,
}: {
  weather: CurrentWeather;
  placeName: string;
  usingOverride: boolean;
  onOverride: (loc: OverrideLocation) => void;
  onUseGps: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  refreshedAt: number | null;
}) {
  const [open, setOpen] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [, forceTick] = useState(0);
  // Re-render every 15s so the "Updated Xs ago" label stays accurate.
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  const Icon = weatherCodeIcon(weather.code, weather.isDay);
  const windDirTxt = windCompass(weather.windDir);
  const windTxt =
    weather.wind != null
      ? `${Math.round(weather.wind)} mph${windDirTxt ? ` ${windDirTxt}` : ""}`
      : "—";
  const gustTxt = weather.gust != null ? `${Math.round(weather.gust)} mph` : "—";
  const feelsTxt = weather.feelsLike != null ? `${Math.round(weather.feelsLike)}°` : "—";
  const hiLoTxt =
    weather.hi != null && weather.lo != null
      ? `${Math.round(weather.hi)}° / ${Math.round(weather.lo)}°`
      : "—";
  const rainTxt = weather.precipProb != null ? `${Math.round(weather.precipProb)}%` : "—";
  const precipAmtTxt = weather.precip != null ? `${weather.precip.toFixed(2)}"` : "—";
  const humidityTxt = weather.humidity != null ? `${Math.round(weather.humidity)}%` : "—";

  const hint = playHint(weather);

  const updatedLabel = (() => {
    const iso = weather.fetchedAt ?? (refreshedAt ? new Date(refreshedAt).toISOString() : null);
    if (!iso) return "Just now";
    const diff = Math.max(0, Date.now() - new Date(iso).getTime());
    const s = Math.round(diff / 1000);
    if (s < 45) return "Just now";
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    return `${h}h ago`;
  })();

  return (
    <div
      className={`rounded-2xl border p-3 ${
        hint.severe
          ? "border-destructive/60 bg-gradient-to-br from-destructive/15 via-card to-card"
          : "border-border bg-gradient-to-br from-primary/10 via-card to-card"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{placeName || "—"}</span>
          <button
            type="button"
            onClick={() => setShowSearch((s) => !s)}
            className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Change location"
          >
            <Search className="h-3 w-3" />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Link
            to="/weather"
            className="rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary hover:bg-primary/10"
            title="Open the full weather page"
          >
            Full forecast
          </Link>
          <span className="tabular-nums">H/L {hiLoTxt}</span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh weather"
            title={`Weather refreshed ${updatedLabel}${weather.observedStation ? ` · ${weather.observedStation}` : ""}`}
            className="inline-flex items-center gap-1 rounded p-0.5 hover:bg-muted hover:text-foreground disabled:opacity-60"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            <span className="text-[10px] normal-case tracking-normal">{updatedLabel}</span>
          </button>
        </div>
      </div>

      {showSearch ? (
        <div className="mt-2 space-y-1.5">
          <LocationSearch
            onPick={(loc) => {
              onOverride(loc);
              setShowSearch(false);
            }}
          />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <button
              type="button"
              onClick={() => {
                onUseGps();
                setShowSearch(false);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 hover:bg-muted"
            >
              <Locate className="h-3 w-3" /> Use my location
            </button>
            {usingOverride ? (
              <span>Showing a manual location</span>
            ) : (
              <span>Live from your device</span>
            )}
          </div>
        </div>
      ) : null}

      {weather.alerts.length > 0 ? (
        <div className="mt-2 space-y-1">
          {weather.alerts.slice(0, 2).map((a) => (
            <div
              key={a.id}
              className="flex items-start gap-1.5 rounded-md border border-destructive/60 bg-destructive/10 px-2 py-1 text-[11px] text-destructive"
              title={a.description}
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold leading-tight">{a.event}</div>
                <div className="truncate opacity-90">{a.headline}</div>
              </div>
            </div>
          ))}
          {weather.alerts.length > 2 ? (
            <div className="text-[10px] text-destructive/80">
              +{weather.alerts.length - 2} more active alert
              {weather.alerts.length - 2 === 1 ? "" : "s"}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 flex items-center gap-3">
        <Icon
          className={`h-12 w-12 shrink-0 drop-shadow ${hint.severe ? "text-destructive" : "text-primary"}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-4xl font-bold leading-none tabular-nums">
              {weather.temp != null ? `${Math.round(weather.temp)}°` : "—"}
            </span>
            <span className="truncate text-xs font-medium text-muted-foreground">
              {weatherCodeLabel(weather.code, weather.isDay)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
            <span className="inline-flex items-center gap-1">
              <Wind className="h-3 w-3 text-primary" /> {windTxt}
            </span>
            <span className="inline-flex items-center gap-1">
              <CloudRain className="h-3 w-3 text-sky-500" /> {rainTxt}
            </span>
          </div>
        </div>
      </div>

      <div
        className={`mt-2 text-[11px] font-medium ${hint.severe ? "text-destructive" : "text-primary/90"}`}
      >
        {hint.text}
      </div>

      {weather.hourly.length > 0 ? (
        <HourlyStrip
          hourly={weather.hourly}
          className="mt-2"
          heading="Next 4 hours"
          subheading="Will conditions hold for your round?"
        />
      ) : null}

      {open ? (
        <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
          <WeatherStat
            icon={<Thermometer className="h-3 w-3 text-primary" />}
            label="Feels"
            value={feelsTxt}
          />
          <WeatherStat
            icon={<Wind className="h-3 w-3 text-amber-500" />}
            label="Gusts"
            value={gustTxt}
          />
          <WeatherStat
            icon={<CloudRain className="h-3 w-3 text-sky-500" />}
            label="Precip"
            value={precipAmtTxt}
          />
          <WeatherStat
            icon={<Droplets className="h-3 w-3 text-primary" />}
            label="Humidity"
            value={humidityTxt}
          />
        </div>
      ) : null}

      {weather.observedAt ? (
        <div className="mt-1.5 text-[10px] text-muted-foreground">
          Station obs from {weather.observedStation ?? "nearest NWS station"} ·{" "}
          {new Date(weather.observedAt).toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })}
        </div>
      ) : weather.fetchedAt ? (
        <div className="mt-1.5 text-[10px] text-muted-foreground">
          Forecast refreshed ·{" "}
          {new Date(weather.fetchedAt).toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })}
        </div>
      ) : null}

      <Suspense fallback={null}>
        <PlayingElsewhereLazy className="mt-2" />
      </Suspense>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-2 flex w-full items-center justify-center gap-1 rounded-md py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {open ? (
          <>
            <ChevronUp className="h-3 w-3" /> Less
          </>
        ) : (
          <>
            <ChevronDown className="h-3 w-3" /> More details
          </>
        )}
      </button>
    </div>
  );
}

export function LocationSearch({
  onPick,
  className,
}: {
  onPick: (loc: { latitude: number; longitude: number; name: string }) => void;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const geocode = useServerFn(geocodeLocation);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (query.length < 2) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await geocode({ data: { query } });
      onPick(res);
      setQ("");
    } catch (e) {
      setErr((e as Error).message || "Could not find that location");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={className}>
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zip or city (e.g. 61614 or Peoria, IL)"
            className="w-full rounded-md border border-border bg-background py-1 pl-6 pr-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
            inputMode="text"
            autoComplete="postal-code"
          />
        </div>
        <button
          type="submit"
          disabled={busy || q.trim().length < 2}
          className="inline-flex min-h-8 items-center justify-center rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "…" : "Go"}
        </button>
      </div>
      {err ? <div className="mt-1 text-[10px] text-destructive">{err}</div> : null}
    </form>
  );
}

function WeatherStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background/60 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-0.5 font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/** Compact chip used in the scoring header. */
export function WeatherChip({ weather }: { weather: CurrentWeather | null }) {
  if (!weather) return null;
  const Icon = weatherCodeIcon(weather.code, weather.isDay);
  const hasAlert = weather.alerts.length > 0;
  return (
    <div
      className={`flex items-center gap-3 rounded-md border px-3 py-1 text-xs ${
        hasAlert
          ? "border-destructive/60 bg-destructive/10 text-destructive"
          : "border-border bg-background/60"
      }`}
      title={hasAlert ? weather.alerts[0].headline : undefined}
    >
      <span className="flex items-center gap-1">
        {hasAlert ? (
          <AlertTriangle className="h-3.5 w-3.5" />
        ) : (
          <Icon className="h-3.5 w-3.5 text-primary" />
        )}
        {weather.temp != null ? `${Math.round(weather.temp)}°` : "—"}
      </span>
      <span className="flex items-center gap-1">
        <Wind className="h-3 w-3" />
        {weather.wind != null ? `${Math.round(weather.wind)}` : "—"}
        {weather.gust != null && weather.gust > (weather.wind ?? 0)
          ? ` / ${Math.round(weather.gust)}g`
          : ""}
        {weather.windDir != null ? ` ${windCompass(weather.windDir)}` : ""}
      </span>
      <span className="flex items-center gap-1">
        <CloudRain className="h-3 w-3" />
        {weather.precipProb != null ? `${Math.round(weather.precipProb)}%` : "—"}
      </span>
    </div>
  );
}

/** Horizontal strip of hourly conditions. Used inline in the widget and on
 * event pages so players can see whether the weather holds for their round. */
export function HourlyStrip({
  hourly,
  className,
  heading,
  subheading,
  hoursPerLabel = "h",
  showDate = false,
}: {
  hourly: HourlyPoint[];
  className?: string;
  heading?: string;
  subheading?: string;
  hoursPerLabel?: "h" | "hh";
  showDate?: boolean;
}) {
  if (!hourly.length) return null;
  return (
    <div className={className}>
      {heading ? (
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {heading}
          </div>
          {subheading ? (
            <div className="truncate text-[10px] text-muted-foreground">{subheading}</div>
          ) : null}
        </div>
      ) : null}
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${hourly.length}, minmax(0, 1fr))` }}
      >
        {hourly.map((h) => {
          const Icon = weatherCodeIcon(h.code, h.isDay);
          const t = new Date(h.time);
          const label = t.toLocaleTimeString(undefined, {
            hour: hoursPerLabel === "hh" ? "2-digit" : "numeric",
            hour12: true,
          });
          const dateLabel = showDate ? t.toLocaleDateString(undefined, { weekday: "short" }) : null;
          const rain = h.precipProb ?? 0;
          const rainClass =
            rain >= 60
              ? "text-destructive"
              : rain >= 30
                ? "text-amber-500"
                : "text-muted-foreground";
          const stormy = (h.code ?? 0) >= 95;
          return (
            <div
              key={h.time}
              className={`flex flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-[10px] tabular-nums ${
                stormy ? "border-destructive/50 bg-destructive/5" : "border-border bg-background/60"
              }`}
              title={`${weatherCodeLabel(h.code, h.isDay)} · ${h.temp != null ? `${Math.round(h.temp)}°` : "—"} · rain ${Math.round(rain)}%`}
            >
              {dateLabel ? (
                <div className="text-[9px] uppercase text-muted-foreground">{dateLabel}</div>
              ) : null}
              <div className="font-medium">{label}</div>
              <Icon className={`h-4 w-4 ${stormy ? "text-destructive" : "text-primary"}`} />
              <div className="font-semibold text-foreground">
                {h.temp != null ? `${Math.round(h.temp)}°` : "—"}
              </div>
              <div className={`inline-flex items-center gap-0.5 ${rainClass}`}>
                <CloudRain className="h-2.5 w-2.5" />
                {Math.round(rain)}%
              </div>
              {h.wind != null ? (
                <div className="inline-flex items-center gap-0.5 text-muted-foreground">
                  <Wind className="h-2.5 w-2.5" />
                  {Math.round(h.wind)}
                  {h.gust != null && h.gust > h.wind ? `g${Math.round(h.gust)}` : ""}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
