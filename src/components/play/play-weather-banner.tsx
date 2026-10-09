import { lazy, Suspense } from "react";

const WeatherWidget = lazy(() =>
  import("@/components/weather-widget").then((m) => ({ default: m.WeatherWidget })),
);

/**
 * Conditions banner pinned across the top of every Play tab. Sits directly
 * under the Play subnav so wind, temperature, and rain chance stay visible
 * while a player moves between Overview, Rounds, Courses, and Schedule.
 */
export function PlayWeatherBanner() {
  return (
    <div className="w-full min-w-0">
      <Suspense
        fallback={
          <div className="h-[52px] rounded-xl border border-border bg-card/80 backdrop-blur" />
        }
      >
        <div className="rounded-xl border border-border bg-card/70 backdrop-blur">
          <WeatherWidget compact />
        </div>
      </Suspense>
    </div>
  );
}
