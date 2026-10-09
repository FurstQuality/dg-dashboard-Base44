import * as React from "react";
import { ChevronDown, ChevronUp, Search, Timer, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** PDGA Official Rules of Disc Golf, 804.02 Lost Disc — three minutes to search. */
const LOST_DISC_MS = 3 * 60_000;


/**
 * Pace-of-play tracker for the fullscreen scorer.
 * - Tracks elapsed time since round started and time on the current hole.
 * - Estimates a projected finish time based on average pace per hole so far.
 * - Warns when the current hole is running slow relative to average.
 */
export function PaceTracker({
  activeHole,
  totalHoles,
  holesPlayed,
  className,
}: {
  activeHole: number;
  totalHoles: number;
  /** Number of holes fully scored (thru). */
  holesPlayed: number;
  className?: string;
}) {
  const startedAtRef = React.useRef<number>(Date.now());
  const holeStartRef = React.useRef<{ hole: number; at: number }>({
    hole: activeHole,
    at: Date.now(),
  });
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    holeStartRef.current = { hole: activeHole, at: Date.now() };
  }, [activeHole]);

  React.useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, []);

  const elapsedMs = now - startedAtRef.current;
  const holeMs = now - holeStartRef.current.at;
  const avgMs = holesPlayed > 0 ? elapsedMs / holesPlayed : 0;
  const remaining = Math.max(0, totalHoles - holesPlayed);
  const projectedMs = avgMs > 0 ? remaining * avgMs : 0;
  const slow = avgMs > 0 && holeMs > avgMs * 1.5 && holeMs > 8 * 60_000;

  const [open, setOpen] = React.useState(false);

  return (
    <div className={cn("shrink-0 rounded-xl border border-border bg-background p-2", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          <Timer className="h-3 w-3" /> Pace of play
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className={cn(
              "font-display text-sm font-bold tabular-nums",
              slow ? "text-warning" : "text-foreground",
            )}
          >
            {formatDuration(elapsedMs)}
          </span>
          {open ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>
      </button>

      {open ? (
        <>
          <div className="mt-1 flex flex-col gap-1">
            <Stat label="Elapsed" value={formatDuration(elapsedMs)} />
            <Stat
              label={`Hole ${activeHole}`}
              value={formatDuration(holeMs)}
              tone={slow ? "warn" : "default"}
            />
            <Stat label="Avg / hole" value={holesPlayed ? formatDuration(avgMs) : "—"} />
          </div>

          <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {remaining ? `${remaining} to go` : "Round complete"}
            </span>
            <span className="tabular-nums">
              {projectedMs
                ? `Finish ~${formatDuration(elapsedMs + projectedMs)}`
                : "Projection pending"}
            </span>
          </div>
          {slow ? (
            <div className="mt-1 rounded-md bg-warning/10 px-2 py-1 text-[11px] font-medium text-warning">
              This hole is running slow — keep the group moving.
            </div>
          ) : null}
        </>
      ) : null}


      <LostDiscClock now={now} />
    </div>
  );
}

/**
 * Three-minute search clock for a disc that may be lost.
 * PDGA Official Rules of Disc Golf 804.02.A: a disc is declared lost when it
 * cannot be found within three minutes, timed from when the player and the
 * group arrive at the area where the disc is thought to be. A lost disc costs
 * one penalty throw and the lie is the previous lie (804.02.B).
 */
function LostDiscClock({ now }: { now: number }) {
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const remainingMs = startedAt == null ? LOST_DISC_MS : Math.max(0, LOST_DISC_MS - (now - startedAt));
  const expired = startedAt != null && remainingMs === 0;

  return (
    <div className="mt-1.5 space-y-1 border-t border-border/60 pt-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          <Search className="h-3 w-3" /> Lost disc search
        </span>
        <span
          className={cn(
            "font-display text-sm font-bold tabular-nums",
            expired ? "text-destructive" : startedAt != null ? "text-warning" : "text-muted-foreground",
          )}
        >
          {formatDuration(remainingMs)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant={startedAt == null ? "outline" : "ghost"}
          className="h-7 flex-1 text-[11px]"
          onClick={() => setStartedAt(Date.now())}
        >
          {startedAt == null ? "Start 3 minute clock" : "Restart clock"}
        </Button>
        {startedAt != null ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px]"
            onClick={() => setStartedAt(null)}
          >
            Found it
          </Button>
        ) : null}
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">
        {expired
          ? "Time is up — the disc is declared lost. Add one penalty throw and play from the previous lie (PDGA 804.02.B)."
          : "Three minutes from when the group reaches the area the disc is thought to be (PDGA Official Rules of Disc Golf 804.02.A)."}
      </p>
    </div>
  );
}


function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/40 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          "font-display text-sm font-bold tabular-nums",
          tone === "warn" ? "text-warning" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
