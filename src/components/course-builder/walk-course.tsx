import {StudioEndpointPlacement} from "./studio-endpoint-placement";
import type {StudioHole} from "@/lib/course-builder/studio-fairways";
import type {EndpointKind, EndpointIdentity} from "@/lib/course-builder/endpoint-identity";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Crosshair, Loader2, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { averageFixes } from "@/components/course-builder/walk-and-map";

type Pt = [number, number];
type Fix = { lat: number; lng: number; acc: number };

/** One spot to visit on the walk: a tee pad or a basket on a hole. */
export type WalkStep = {
  key: string;
  hole: number;
  holeLabel: string;
  kind: "tee" | "basket";
  /** Main tee/basket, or an extra pad's id. */
  padId: string | null;
  name: string;
  spot: Pt | null;
};

const MAX_ACCURACY_M = 15;
const TARGET_FIXES = 6;

function distM(a: Pt, b: Pt) {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * Walk the course: one big card that steps through every tee pad and basket in hole order.
 * At each spot the user either drops it where they stand (averaged GPS) or confirms the spot already on the map.
 */
export function WalkCourse({
  steps,
  startHole,
  onPlace,
  onFocus,
  onHole,
  onClose,
  holes,
  onAdd,
}: {
  steps: WalkStep[];
  holes: (StudioHole & {number: number})[];
  onAdd: (hole: number, kind: EndpointKind, identity: EndpointIdentity) => string;
  startHole: number;
  onPlace: (step: WalkStep, p: Pt, accuracyM: number) => void;
  onFocus: (p: Pt) => void;
  onHole: (hole: number) => void;
  onClose: () => void;
}) {
  const [currentKey, setCurrentKey] = useState(() => (steps.find(s => s.hole === startHole) ?? steps[0])?.key);
  const [adding, setAdding] = useState(false);
  const i = Math.max(0, steps.findIndex(s => s.key === currentKey));
  const [done, setDone] = useState<Record<string, "dropped" | "confirmed">>({});
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [error, setError] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);
  const step = steps[Math.min(i, steps.length - 1)];

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setError("This device can't share its location. You can still confirm spots already on the map.");
      return;
    }
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        setFixes((prev) => [...prev.slice(-11), { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }]);
      },
      () => setError("Location is off. Allow location for this site to drop spots where you stand."),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  // Fresh readings for each spot, so one spot's average never leaks into the next.
  useEffect(() => {
    setFixes([]);
    if (step) {
      onHole(step.hole);
      if (step.spot) onFocus(step.spot);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.key]);

  const avg = averageFixes(fixes);
  const good = fixes.filter((f) => f.acc <= MAX_ACCURACY_M).length;
  const latest = fixes[fixes.length - 1];
  const away = useMemo(() => (step?.spot && latest ? distM([latest.lat, latest.lng], step.spot) : null), [step?.spot, latest]);
  const doneCount = steps.filter((s) => done[s.key]).length;

  if (!step) {
    return (
      <div className="pointer-events-auto rounded-t-2xl border border-border bg-background p-4 shadow-xl">
        <p className="text-sm">This course has no holes yet. Add holes first, then walk it.</p>
        <Button className="mt-3 w-full" onClick={onClose}>Close</Button>
      </div>
    );
  }

  const next = () => setCurrentKey(steps[Math.min(steps.length - 1, i + 1)].key);
  const finish = (how: "dropped" | "confirmed") => {
    setDone((d) => ({ ...d, [step.key]: how }));
    if (i < steps.length - 1) next();
  };
  const what = step.kind === "tee" ? "tee pad" : "basket";

  return (
    <div role="region" aria-label="Walk course" className="pointer-events-auto max-h-[65dvh] overflow-y-auto rounded-t-2xl border border-border bg-background/95 p-4 shadow-xl backdrop-blur md:rounded-2xl">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Walk the course · {doneCount} of {steps.length} spots done
          </p>
          <h2 className="truncate text-xl font-bold">
            Hole {step.holeLabel} · {step.name}
          </h2>
        </div>
        <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0" aria-label="Stop walking" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>

      <label className="mt-3 block text-xs">Location to map
        <select aria-label="Walk location" className="mt-1 w-full rounded border bg-background p-2 text-sm" value={step.key} onChange={e => {setCurrentKey(e.target.value); setAdding(false);}}>
          {steps.map(s => <option key={s.key} value={s.key}>Hole {s.holeLabel} · {s.name}</option>)}
        </select>
      </label>
      <Button className="mt-2 w-full" variant="outline" aria-expanded={adding} onClick={() => setAdding(v => !v)}>Add tee pad or basket</Button>
      {adding && <div className="mt-2"><StudioEndpointPlacement key={step.hole} hole={holes.find(h => h.number === step.hole)} holeNumber={step.hole}
        teeNames={holes.flatMap(h => [{name: h.tee_name ?? "", color: h.tee_color ?? "#2563eb"}, ...h.extra_tees.map(t => ({name: t.name, color: t.color}))])}
        onAdd={(kind, identity) => {setCurrentKey(onAdd(step.hole, kind, identity));setAdding(false);}} /></div>}
      <p className="mt-2 text-xs text-muted-foreground">Placed tees connect to the hole’s baskets automatically. Add as many locations as you need.</p>
      <p className="mt-3 text-sm">
        {step.spot
          ? done[step.key]
            ? `Done — ${done[step.key] === "dropped" ? "dropped where you stood" : "confirmed"}.`
            : `This ${what} is on the map${away != null ? `, about ${Math.round(away * 3.28)} ft from you` : ""}. Stand ${step.kind === "tee" ? "on the front of the pad" : "next to the pole"} and confirm it, or drop it where you are.`
          : `No ${what} on the map yet. Stand ${step.kind === "tee" ? "on the front of the pad" : "next to the pole"} and drop it.`}
      </p>

      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        {error ? (
          <span className="text-destructive">{error}</span>
        ) : (
          <>
            {good < TARGET_FIXES ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-primary" />}
            <span>
              {latest ? `GPS ±${Math.round(latest.acc * 3.28)} ft` : "Finding you…"}
              {latest && latest.acc > MAX_ACCURACY_M ? " — hold still, still too rough" : ""}
              {avg ? ` · ${good} good readings` : ""}
            </span>
          </>
        )}
      </div>

      <div className="mt-3 grid gap-2">
        <Button
          size="lg"
          className="h-12 text-base"
          disabled={!avg}
          onClick={() => {
            if (!avg) return;
            onPlace(step, [avg.lat, avg.lng], avg.acc);
            finish("dropped");
          }}
        >
          <Crosshair className="mr-2 h-5 w-5" />
          {step.kind === "tee" ? "Drop tee pad here" : "Drop basket here"}
        </Button>
        {step.spot ? (
          <Button size="lg" variant="secondary" className="h-12 text-base" onClick={() => finish("confirmed")}>
            <MapPin className="mr-2 h-5 w-5" />
            {step.kind === "tee" ? "Confirm pad placement" : "Confirm basket placement"}
          </Button>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <Button variant="outline" className="h-11" disabled={i === 0} onClick={() => setCurrentKey(steps[Math.max(0, i - 1)].key)}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <span className="text-sm text-muted-foreground">
          {i + 1} / {steps.length}
        </span>
        {i < steps.length - 1 ? (
          <Button variant="outline" className="h-11" onClick={next}>
            Skip <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button className="h-11" onClick={onClose}>
            Finish
          </Button>
        )}
      </div>
      {i === steps.length - 1 && done[step.key] ? (
        <p className="mt-2 text-sm text-primary">Last spot done. Tap Save changes to keep your walk.</p>
      ) : null}
    </div>
  );
}
