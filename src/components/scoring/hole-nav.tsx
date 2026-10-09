import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronLeft, ChevronRight, Grid3x3 } from "lucide-react";
import {
  MobileSheet,
  MobileSheetContent,
  MobileSheetHeader,
  MobileSheetTitle,
} from "@/components/mobile/mobile-sheet";

export type HoleNavItem = {
  number: number;
  par: number;
  nickname?: string | null;
  scored: boolean;
  incomplete: boolean;
  toPar?: number | null;
  conflict?: boolean;
};


/**
 * Hole navigation control: previous / selector chip / next.
 * The selector opens a grid of hole tiles with status + relative score.
 */
export function HoleNav({
  holes,
  activeNumber,
  onSelect,
  canAdvance,
  advanceHint,
}: {
  holes: HoleNavItem[];
  activeNumber: number;
  onSelect: (n: number) => void;
  canAdvance?: boolean;
  advanceHint?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const idx = holes.findIndex((h) => h.number === activeNumber);
  const prev = holes[idx - 1];
  const next = holes[idx + 1];
  const conflictCount = holes.filter((h) => h.conflict).length;


  return (
    <div className="mx-auto flex w-full max-w-[520px] items-center justify-between gap-2 px-3 py-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => prev && onSelect(prev.number)}
        disabled={!prev}
        aria-label="Previous hole"
        className="min-h-11 gap-1"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="text-xs">Prev</span>
      </Button>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={
          conflictCount > 0
            ? `Jump to hole. ${conflictCount} hole${conflictCount === 1 ? "" : "s"} with a score conflict`
            : "Jump to hole"
        }
      >
        <Grid3x3 className="h-4 w-4 text-muted-foreground" />
        Hole {activeNumber}
        <span className="text-xs text-muted-foreground">of {holes.length}</span>
        {conflictCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
            <AlertTriangle className="h-3 w-3" />
            {conflictCount}
          </span>
        ) : null}
      </button>


      <Button
        variant="default"
        size="sm"
        onClick={() => next && onSelect(next.number)}
        disabled={!next || canAdvance === false}
        aria-label={
          canAdvance === false ? advanceHint || "Score every player before advancing" : "Next hole"
        }
        title={canAdvance === false ? advanceHint : undefined}
        className="min-h-11 gap-1"
      >
        <span className="text-xs">Next</span>
        <ChevronRight className="h-4 w-4" />
      </Button>

      <MobileSheet open={open} onOpenChange={setOpen}>
        <MobileSheetContent className="max-w-lg">
          <MobileSheetHeader>
            <MobileSheetTitle>Jump to hole</MobileSheetTitle>
          </MobileSheetHeader>
          <div className="grid grid-cols-6 gap-2 p-3 sm:grid-cols-9">
            {holes.map((h) => {
              const active = h.number === activeNumber;
              return (
                <button
                  key={h.number}
                  type="button"
                  onClick={() => {
                    onSelect(h.number);
                    setOpen(false);
                  }}
                  className={cn(
                    "relative flex min-h-14 flex-col items-center justify-center rounded-xl border p-1.5 text-center transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : h.conflict
                        ? "border-destructive/60 bg-destructive/10 text-foreground hover:bg-destructive/15"
                        : h.scored
                          ? "border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15"
                          : h.incomplete
                            ? "border-amber-400/60 bg-amber-500/10 text-foreground hover:bg-amber-500/15"
                            : "border-border bg-background text-muted-foreground hover:bg-muted",
                  )}
                  aria-label={`Hole ${h.number}, par ${h.par}${h.scored ? ", scored" : h.incomplete ? ", incomplete" : ""}${h.conflict ? ", score conflict" : ""}`}
                >
                  {h.conflict ? (
                    <AlertTriangle className="absolute right-1 top-1 h-3 w-3 text-destructive" />
                  ) : null}
                  <span className="text-base font-black tabular-nums leading-none">{h.number}</span>
                  <span className="text-[10px] uppercase tracking-wide opacity-75">
                    Par {h.par}
                  </span>
                  {h.toPar != null && h.scored ? (
                    <span className="text-[10px] font-semibold tabular-nums">
                      {h.toPar === 0 ? "E" : h.toPar > 0 ? `+${h.toPar}` : h.toPar}
                    </span>
                  ) : null}

                </button>
              );
            })}
          </div>
        </MobileSheetContent>
      </MobileSheet>
    </div>
  );
}
