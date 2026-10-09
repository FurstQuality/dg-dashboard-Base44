import { useEffect, useState } from "react";
import { MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGeolocationPermission } from "@/hooks/use-geolocation";

const DISMISS_KEY = "dgd.geo.banner.dismissed";

/**
 * App-wide GPS permission banner. Shown once (per browser) when the
 * geolocation permission is still in "prompt" state, so every location-aware
 * tool (course builder, scoring, range, putting, weather, tee-time GPS drop)
 * has a chance to be granted access up-front.
 */
export function LocationPermissionBanner() {
  const { state, request } = useGeolocationPermission();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed) return null;
  if (state !== "prompt" && state !== "denied") return null;

  const denied = state === "denied";

  function close() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  return (
    <div className="mb-3 flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center sm:gap-3">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary sm:mt-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {denied ? "Location is blocked" : "Enable GPS for DG Dashboard"}
          </div>
          <div className="text-xs text-muted-foreground">
            {denied
              ? "Unblock location in your browser's site settings to use the course builder, scoring, range, putting, and weather."
              : "One tap to power the course builder, live scoring distances, range/putting stats, and local weather."}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={close}
          aria-label="Dismiss"
          className="shrink-0 sm:hidden"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-2 sm:ml-auto">
        {!denied ? (
          <Button size="sm" onClick={() => request()} className="flex-1 sm:flex-none">
            Allow location
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          onClick={close}
          aria-label="Dismiss"
          className="hidden shrink-0 sm:inline-flex"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
