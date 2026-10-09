import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { throwKindForDistanceFt } from "@/lib/putting-zones";
import {
  ChevronDown,
  ChevronUp,
  Crosshair,
  Flag,
  MapPin,
  RotateCcw,
  Target,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

export type LatLng = { latitude: number; longitude: number };

/** A single marked lie. `ob` flags the throw that went out of bounds. */
type Throw = { lat: number; lng: number; ts: number; ob: boolean };

const R_M = 6371000; // Earth radius in meters
function haversineFeet(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * R_M * Math.asin(Math.sqrt(s));
  return meters * 3.28084;
}

type Props = {
  holeNumber: number;
  strokes: number;
  teePoint: LatLng | null;
  basketPoint: LatLng | null;
  onStatsChange?: (stats: HoleShotStats) => void;
};

/** Auto-derived per-hole shot stats. All distances are in feet. */
export type HoleShotStats = {
  throws: number; // marks the player logged
  longest_throw_ft: number | null;
  drive_ft: number | null; // first throw
  c1_putts: number; // putts attempted from inside 33 ft
  c2_putts: number; // putts attempted from 33-66 ft
  throw_in_ft: number | null; // make distance when scored from outside C1
  fairway_hit: boolean | null; // drive landed near the tee-basket line (best effort)
  /** Throws marked out of bounds on this hole. */
  ob_strokes: number;
  /** Penalty strokes (currently OB only). */
  penalties: number;
  /** Drive finished inside 33 ft of the basket. */
  parked: boolean;
  /** Player tapped "Holed out" on the final mark. */
  holed: boolean;
  /** Remaining distance to the basket from the current lie. */
  to_basket_ft: number | null;
};

type ShotKind = "Drive" | "Upshot" | "C2 putt" | "C1 putt" | "Throw";

/**
 * GPS shot tracker. Each hole starts at the tee; the player taps "Mark throw"
 * after each shot to log throw distance and remaining distance to the basket.
 * Every marked throw can be flagged OB or deleted, each one is classified
 * (drive / approach / C2 putt / C1 putt) from the distance left at the time,
 * and the derived per-hole stats — drive, longest throw, circle putts, OB and
 * penalty strokes, parked drive, throw-in distance — are reported up via
 * `onStatsChange` so the Shots tab and the saved scorecard stay in sync.
 */
export function GpsHoleTracker({
  holeNumber,
  strokes,
  teePoint,
  basketPoint,
  onStatsChange,
}: Props) {
  const [supported] = useState(() => typeof navigator !== "undefined" && !!navigator.geolocation);
  const [live, setLive] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [throws, setThrows] = useState<Throw[]>([]);
  const [holed, setHoled] = useState(false);
  const [watching, setWatching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  // Reset shot list whenever we advance to a new hole.
  useEffect(() => {
    setThrows([]);
    setHoled(false);
  }, [holeNumber]);

  // Watch position for live "distance to basket" updates.
  useEffect(() => {
    if (!supported) return;
    setWatching(true);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setLive({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setAccuracy(pos.coords.accuracy ?? null);
        setPermError(null);
      },
      (err) => {
        setPermError(err.message || "Location error");
        setWatching(false);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
    watchIdRef.current = id;
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      setWatching(false);
    };
  }, [supported]);

  const addMark = useCallback((point: LatLng) => {
    setThrows((prev) => [
      ...prev,
      { lat: point.latitude, lng: point.longitude, ts: Date.now(), ob: false },
    ]);
  }, []);

  function markThrow() {
    if (!navigator.geolocation) {
      toast.error("GPS is not available on this device");
      return;
    }
    if (live) {
      addMark(live);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPermError(null);
        const point = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setLive(point);
        setAccuracy(pos.coords.accuracy ?? null);
        addMark(point);
      },
      (err) => {
        setLocating(false);
        setPermError(err.message || "Location error");
        toast.error("Couldn't get GPS", { description: err.message });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );
  }

  /** Log the make: mark the basket as the final lie so the throw-in measures. */
  function markHoledOut() {
    if (basketPoint) {
      addMark(basketPoint);
      setHoled(true);
      setShowLog(true);
      return;
    }
    if (live) {
      addMark(live);
      setHoled(true);
      setShowLog(true);
      return;
    }
    toast.error("Mark a throw first, or map the basket to log a make.");
  }

  function undoThrow() {
    setThrows((prev) => prev.slice(0, -1));
    setHoled(false);
  }
  function resetHole() {
    setThrows([]);
    setHoled(false);
  }
  function removeThrow(index: number) {
    setThrows((prev) => prev.filter((_, i) => i !== index));
    setHoled(false);
  }
  function toggleOb(index: number) {
    setThrows((prev) => prev.map((t, i) => (i === index ? { ...t, ob: !t.ob } : t)));
  }

  // Distance from most-recent lie to basket
  const lastLie: LatLng | null = throws.length
    ? { latitude: throws[throws.length - 1].lat, longitude: throws[throws.length - 1].lng }
    : teePoint;
  const distToBasket =
    basketPoint && (live ?? lastLie) ? haversineFeet(live ?? lastLie!, basketPoint) : null;
  const lieToBasket = basketPoint && lastLie ? haversineFeet(lastLie, basketPoint) : null;
  // Never show impossible location values: poor fix or far outside any hole.
  const holeSpanFt = teePoint && basketPoint ? haversineFeet(teePoint, basketPoint) : 1200;
  const maxPlausibleFt = Math.max(1500, holeSpanFt * 2.5);
  const gpsBad = (accuracy != null && accuracy > 30) || (distToBasket != null && distToBasket > maxPlausibleFt);

  /**
   * Per-throw breakdown: length of each throw, distance left before it, and the
   * shot type that distance implies. Drives every stat and the shot log below.
   */
  const marks = useMemo(() => {
    return throws.map((t, i) => {
      const from: LatLng | null =
        i === 0 ? teePoint : { latitude: throws[i - 1].lat, longitude: throws[i - 1].lng };
      const dist = from ? haversineFeet(from, { latitude: t.lat, longitude: t.lng }) : null;
      const before = from && basketPoint ? haversineFeet(from, basketPoint) : null;
      const after = basketPoint ? haversineFeet({ latitude: t.lat, longitude: t.lng }, basketPoint) : null;
      // Drives are off the tee; anything over C2 is an upshot.
      const kind: ShotKind = throwKindForDistanceFt(before, i === 0);

      return { dist, before, after, kind, ob: t.ob };
    });
  }, [throws, teePoint, basketPoint]);

  const lastThrowFt = marks.length ? marks[marks.length - 1].dist : null;

  // Derive per-hole stats and emit up to the parent whenever they change.
  const stats = useMemo<HoleShotStats>(() => {
    const distances = marks
      .map((m) => m.dist)
      .filter((d): d is number => d != null && Number.isFinite(d));
    const longest = distances.length ? Math.max(...distances) : null;
    const drive = distances.length ? distances[0] : null;

    let c1Putts = 0;
    let c2Putts = 0;
    marks.forEach((m) => {
      if (m.kind === "C1 putt") c1Putts += 1;
      else if (m.kind === "C2 putt") c2Putts += 1;
    });

    const obStrokes = marks.filter((m) => m.ob).length;

    // Throw-in = made the hole from outside C1. Credit it when the hole is
    // complete (holed out, or a mark per stroke that finished at the basket).
    let throwIn: number | null = null;
    const last = marks.length ? marks[marks.length - 1] : null;
    const finishedAtBasket = last?.after != null && last.after <= 10;
    const complete = holed || (strokes > 0 && marks.length === strokes && finishedAtBasket);
    if (complete && last?.before != null && last.before > 33) throwIn = last.before;

    const first = marks.length ? marks[0] : null;
    const parked = !!(first && first.after != null && first.after <= 33 && marks.length >= 1);

    return {
      throws: marks.length,
      longest_throw_ft: longest != null ? Math.round(longest) : null,
      drive_ft: drive != null ? Math.round(drive) : null,
      c1_putts: c1Putts,
      c2_putts: c2Putts,
      throw_in_ft: throwIn != null ? Math.round(throwIn) : null,
      fairway_hit: null,
      ob_strokes: obStrokes,
      penalties: obStrokes,
      parked,
      holed,
      to_basket_ft: lieToBasket != null ? Math.round(lieToBasket) : null,
    };
  }, [marks, strokes, holed, lieToBasket]);

  useEffect(() => {
    onStatsChange?.(stats);
  }, [stats, onStatsChange]);

  if (!supported) {
    return (
      <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
        GPS is not supported on this device.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Crosshair className="h-3.5 w-3.5 text-primary" /> GPS shot tracker
        </div>
        <div className="text-[10px] text-muted-foreground">
          {locating ? (
            "Locating…"
          ) : watching ? (
            <>{accuracy != null ? `±${Math.round(accuracy * 3.28084)} ft` : "Live"}</>
          ) : permError ? (
            permError
          ) : (
            "Idle"
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Stat
          label="Last throw"
          value={lastThrowFt != null ? `${Math.round(lastThrowFt)} ft` : "—"}
          icon={<Flag className="h-3 w-3 text-primary" />}
        />
        <Stat
          label="To basket"
          value={gpsBad ? "GPS unavailable" : distToBasket != null ? `${Math.round(distToBasket)} ft` : "—"}
          icon={<Target className="h-3 w-3 text-primary" />}
          highlight
        />
        <Stat
          label="From lie"
          value={lieToBasket != null ? `${Math.round(lieToBasket)} ft` : "—"}
          icon={<MapPin className="h-3 w-3 text-primary" />}
        />
      </div>

      {/* Live derived stats — the same numbers that save with the hole. */}
      <div className="mt-2 flex flex-wrap gap-1">
        <Chip label="Drive" value={stats.drive_ft != null ? `${stats.drive_ft} ft` : "—"} />
        <Chip
          label="Longest"
          value={stats.longest_throw_ft != null ? `${stats.longest_throw_ft} ft` : "—"}
        />
        <Chip label="C1 putts" value={String(stats.c1_putts)} />
        <Chip label="C2 putts" value={String(stats.c2_putts)} />
        {stats.ob_strokes ? <Chip label="OB" value={String(stats.ob_strokes)} tone="bad" /> : null}
        {stats.parked ? <Chip label="Parked" value="Yes" tone="good" /> : null}
        {stats.throw_in_ft ? (
          <Chip label="Throw-in" value={`${stats.throw_in_ft} ft`} tone="good" />
        ) : null}
      </div>

      <div className="mt-2 flex gap-1.5">
        <Button size="sm" className="flex-1" onClick={markThrow} disabled={!supported || locating}>
          <Crosshair className="mr-1 h-4 w-4" />
          {locating ? "Locating…" : <>Mark throw {throws.length ? `(${throws.length})` : ""}</>}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={undoThrow}
          disabled={!throws.length}
          title="Undo last throw"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={resetHole}
          disabled={!throws.length}
          title="Reset hole shots"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-1.5 flex gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-xs"
          onClick={markHoledOut}
          disabled={holed}
          title="Log the make at the basket"
        >
          <Target className="mr-1 h-3.5 w-3.5" />
          {holed ? "Holed out" : "Holed out"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-xs"
          onClick={() => throws.length && toggleOb(throws.length - 1)}
          disabled={!throws.length}
          title="Flag the last throw out of bounds"
        >
          <TriangleAlert className="mr-1 h-3.5 w-3.5" />
          {throws.length && throws[throws.length - 1].ob ? "OB on" : "Mark OB"}
        </Button>
      </div>

      {throws.length ? (
        <>
          <button
            type="button"
            onClick={() => setShowLog((v) => !v)}
            className="mt-2 flex w-full items-center justify-between rounded-md border border-border bg-background/60 px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground hover:bg-muted/60"
          >
            <span>
              Shot log · {throws.length} {throws.length === 1 ? "throw" : "throws"}
            </span>
            {showLog ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showLog ? (
            <ul className="mt-1 space-y-1">
              {marks.map((m, i) => (
                <li
                  key={throws[i].ts}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/60 px-2 py-1"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-medium">
                      {i + 1}. {m.kind}
                      {m.ob ? <span className="ml-1 text-destructive">OB</span> : null}
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      {m.dist != null ? `${Math.round(m.dist)} ft` : "—"}
                      {m.after != null ? ` · ${Math.round(m.after)} ft left` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleOb(i)}
                      aria-label={`Toggle OB on throw ${i + 1}`}
                      title="Toggle out of bounds"
                      className={
                        "rounded p-1 " +
                        (m.ob
                          ? "bg-destructive/15 text-destructive"
                          : "text-muted-foreground hover:bg-muted")
                      }
                    >
                      <TriangleAlert className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeThrow(i)}
                      aria-label={`Delete throw ${i + 1}`}
                      title="Delete this throw"
                      className="rounded p-1 text-muted-foreground hover:bg-muted"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      {!basketPoint || !teePoint ? (
        <div className="mt-2 text-[10px] text-muted-foreground">
          Course builder hasn't mapped {!basketPoint ? "the basket" : "the tee"} for this hole yet,
          so distances rely on your marked shots.
        </div>
      ) : null}
    </div>
  );
}

function Chip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "border-primary/40 bg-primary/10 text-primary"
      : tone === "bad"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-border bg-background/60 text-foreground";
  return (
    <span
      className={"inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] " + toneClass}
    >
      <span className="uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function Stat({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "flex items-center justify-between gap-2 rounded-md border px-2 py-1 " +
        (highlight ? "border-primary/40 bg-primary/10" : "border-border bg-background/60")
      }
    >
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <div
        className={
          "font-display text-sm font-bold tabular-nums " + (highlight ? "text-primary" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
