import { ArrowUp, Footprints, Mountain, Wind } from "lucide-react";
import { mToFt, mToMi, type WalkTotals } from "@/lib/round-walk";

/**
 * One-line, at-a-glance conditions under the scorecard header: wind (speed,
 * gusts, where it's coming from, and how it plays on this hole), the hole's
 * elevation change, and the round's walk so far when tracking is on.
 */
export function RoundGlanceStrip({
  wind,
  gust,
  windFromDeg,
  windFromLabel,
  windNote,
  holeBearingDeg,
  elevationFt,
  walk,
  onOpenWalk,
}: {
  wind: number | null;
  gust: number | null;
  windFromDeg: number | null;
  windFromLabel: string | null;
  windNote: string | null;
  holeBearingDeg: number | null;
  elevationFt: number | null;
  walk: WalkTotals | null;
  onOpenWalk?: () => void;
}) {
  // Arrow points where the wind is blowing, relative to the hole when the tee
  // line is mapped (up = toward the basket), otherwise relative to north.
  const blowingTo = windFromDeg != null ? (windFromDeg + 180) % 360 : null;
  const arrowDeg = blowingTo == null ? null : holeBearingDeg != null ? blowingTo - holeBearingDeg : blowingTo;
  const hasWind = wind != null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-border bg-card/60 px-3 py-1.5 text-sm">
      <span className="flex shrink-0 items-center gap-1.5" title={windNote ?? "Wind"}>
        <Wind className="h-4 w-4 text-primary" />
        {hasWind ? (
          <>
            <span className="font-semibold tabular-nums">
              {Math.round(wind)}
              {gust != null && gust > wind ? `–${Math.round(gust)}` : ""} mph
            </span>
            {arrowDeg != null ? (
              <ArrowUp
                className="h-4 w-4 text-primary"
                style={{ transform: `rotate(${arrowDeg}deg)` }}
                aria-label={windFromLabel ? `From ${windFromLabel}` : "Wind direction"}
              />
            ) : null}
            {windFromLabel ? <span className="text-muted-foreground">{windFromLabel}</span> : null}
          </>
        ) : (
          <span className="text-muted-foreground">Wind —</span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1.5" title="Elevation change, tee to basket">
        <Mountain className="h-4 w-4 text-primary" />
        {elevationFt == null || elevationFt === 0 ? (
          <span className="text-muted-foreground">{elevationFt === 0 ? "Flat" : "Elevation —"}</span>
        ) : (
          <span className="font-semibold tabular-nums">
            {elevationFt > 0 ? `${Math.round(elevationFt)} ft up` : `${Math.round(-elevationFt)} ft down`}
          </span>
        )}
      </span>
      {hasWind && windNote ? (
        <span className="order-last basis-full truncate text-muted-foreground">{windNote}</span>
      ) : null}
      {walk ? (
        <button
          type="button"
          onClick={onOpenWalk}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-1 hover:bg-muted"
          title="Your walk this round"
        >
          <Footprints className="h-4 w-4 text-primary" />
          <span className="font-semibold tabular-nums">{mToMi(walk.distance_m).toFixed(2)} mi</span>
          <span className="tabular-nums text-muted-foreground">
            {walk.steps.toLocaleString()} steps · {walk.calories} cal · ↑{Math.round(mToFt(walk.elevation_gain_m))} ft
          </span>
        </button>
      ) : null}
    </div>
  );
}
