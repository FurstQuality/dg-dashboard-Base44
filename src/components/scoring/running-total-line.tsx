import { ArrowRight, Flag, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatToPar, paceProjection, type RunningTotals } from "@/lib/scoring-progress";
import { cn } from "@/lib/utils";
import { projectedRoundRating } from "@/lib/score-display";

type Props = {
  totals: RunningTotals;
  totalHoles: number;
  /** First hole still missing a score, if any. */
  nextUnscoredHole: number | null;
  onJumpToUnscored: (hole: number) => void;
  className?: string;
  /** Exact par of the layout being played; omitted when unknown. */
  layoutPar?: number | null;
  /** Layout calibration for the Projected DGD Round Rating. */
  scratchRating?: number | null;
  strokeValue?: number | null;
};

function toParTone(toPar: number) {
  if (toPar < 0) return "text-primary";
  if (toPar === 0) return "text-foreground";
  if (toPar <= 2) return "text-warning";
  return "text-destructive";
}

/** Compact running score, pace projection, and a jump to the next open hole. */
export function RunningTotalLine({
  totals,
  totalHoles,
  nextUnscoredHole,
  onJumpToUnscored,
  className,
  layoutPar,
  scratchRating,
  strokeValue,
}: Props) {
  const pace = paceProjection(totals, totalHoles);
  const projected = projectedRoundRating({
    projectedToPar: pace?.projectedToPar ?? null,
    scratchRating,
    strokeValue,
  });
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-card px-3 py-2",
        className,
      )}
    >
      <div className="flex items-baseline gap-1.5">
        <span className={cn("text-lg font-semibold leading-none", toParTone(totals.toPar))}>
          {formatToPar(totals.toPar)}
        </span>
        <span className="text-sm text-muted-foreground">
          {totals.strokes} strokes · thru {totals.thru}/{totalHoles}
          {layoutPar ? ` · Par ${layoutPar}` : ""}
        </span>
      </div>

      {pace ? (
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
          On pace for {formatToPar(pace.projectedToPar)}
          {pace.remaining > 0 ? ` · ${pace.remaining} to play` : ""}
        </span>
      ) : null}
      {pace && projected != null ? (
        <span className="text-sm">
          <span className="text-muted-foreground">Projected DGD Round Rating </span>
          <span className="font-semibold tabular-nums">{projected}</span>
        </span>
      ) : null}
      {pace ? null : (
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <Flag className="h-3.5 w-3.5" aria-hidden="true" />
          Score hole {nextUnscoredHole ?? 1} to start your pace line
        </span>
      )}

      {nextUnscoredHole != null ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto h-8 px-2 text-sm"
          onClick={() => onJumpToUnscored(nextUnscoredHole)}
        >
          Go to hole {nextUnscoredHole}
          <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
