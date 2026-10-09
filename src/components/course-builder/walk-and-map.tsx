import { useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Fix = { lat: number; lng: number; acc: number };

/** Fixes worse than this are ignored; the spot is averaged from the rest. */
const MAX_ACCURACY_M = 15;
const TARGET_FIXES = 8;

export function averageFixes(fixes: Fix[]): Fix | null {
  const good = fixes.filter((f) => f.acc <= MAX_ACCURACY_M);
  if (!good.length) return null;
  // Weight by 1/acc² so sharper readings count more.
  let w = 0, lat = 0, lng = 0;
  for (const f of good) {
    const k = 1 / Math.max(1, f.acc) ** 2;
    w += k; lat += f.lat * k; lng += f.lng * k;
  }
  const best = Math.min(...good.map((f) => f.acc));
  // Averaging n readings tightens the estimate roughly by √n.
  const acc = Math.max(1, best / Math.sqrt(good.length));
  return { lat: lat / w, lng: lng / w, acc: Math.round(acc * 10) / 10 };
}

export function WalkAndMap({
  hole,
  onPlace,
}: {
  hole: number;
  onPlace: (target: "tee" | "basket", p: [number, number], accuracyM: number) => void;
}) {
  const [target, setTarget] = useState<"tee" | "basket" | null>(null);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [error, setError] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);

  const stop = () => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
  };
  useEffect(() => stop, []);

  const start = (t: "tee" | "basket") => {
    if (!("geolocation" in navigator)) {
      setError("This device can't share its location.");
      return;
    }
    stop();
    setTarget(t);
    setFixes([]);
    setError(null);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) =>
        setFixes((prev) => [
          ...prev.slice(-29),
          { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy },
        ]),
      () => setError("Location is turned off. Allow location for this site and try again."),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  };

  const cancel = () => { stop(); setTarget(null); setFixes([]); setError(null); };
  const avg = averageFixes(fixes);
  const good = fixes.filter((f) => f.acc <= MAX_ACCURACY_M).length;
  const latest = fixes[fixes.length - 1];

  if (!target) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => start("tee")}>
          <Crosshair className="mr-1 h-4 w-4" /> Stand on tee {hole}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => start("basket")}>
          <Crosshair className="mr-1 h-4 w-4" /> Stand at basket {hole}
        </Button>
        {error ? <p className="w-full text-sm text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="w-72 rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-md">
      <div className="flex items-center justify-between">
        <div className="font-medium">
          Hole {hole} {target === "tee" ? "tee" : "basket"}
        </div>
        <button aria-label="Cancel" onClick={cancel} className="rounded p-1 hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-muted-foreground">
        Stand {target === "tee" ? "on the front of the tee pad" : "next to the basket pole"} and hold still.
      </p>
      {error ? (
        <p className="mt-2 text-destructive">{error}</p>
      ) : (
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2">
            {good < TARGET_FIXES ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span>
              {good} of {TARGET_FIXES} good readings
            </span>
          </div>
          <div className="text-muted-foreground">
            {latest ? `Phone accuracy now: ±${Math.round(latest.acc * 3.28)} ft` : "Waiting for GPS…"}
            {latest && latest.acc > MAX_ACCURACY_M ? " — too rough, keep waiting" : ""}
          </div>
          {avg ? <div>Averaged spot: ±{Math.round(avg.acc * 3.28)} ft</div> : null}
        </div>
      )}
      <Button
        size="sm"
        className="mt-3 w-full"
        disabled={!avg}
        onClick={() => {
          if (!avg) return;
          onPlace(target, [avg.lat, avg.lng], avg.acc);
          cancel();
        }}
      >
        {good >= TARGET_FIXES ? "Use this spot" : "Use this spot now"}
      </Button>
    </div>
  );
}
