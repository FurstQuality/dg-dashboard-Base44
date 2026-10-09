import * as React from "react";
import { hapticTap } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { Minus, Plus, Pencil } from "lucide-react";

/**
 * Centered score composition: [ − ] [ SCORE ] [ + ] with adaptive quick chips.
 *
 * - Par-anchored: parent seeds `value` to par when the hole activates.
 * - Tap the numeral to type any score (blow-up holes, 10s, 15s, etc.).
 * - Press-and-hold ± to rapid-fire increment past the chip range.
 * - Debounced press: repeat taps within 90ms are ignored to prevent double-ups.
 * - Announces score changes via a polite live region below the numeral.
 */
const MAX_STROKES = 30;

export function ScoreDial({
  value,
  par,
  onChange,
  onCommit,
  disabled,
  playerLabel,
  compact,
  className,
}: {
  value: number;
  par: number;
  onChange: (next: number) => void;
  /** Optional: called after a debounce so callers can autosave without hammering the DB. */
  onCommit?: (next: number) => void;
  disabled?: boolean;
  playerLabel?: string;
  /** Dense variant used when several players share one screen. */
  compact?: boolean;
  className?: string;
}) {
  const lastTap = React.useRef(0);
  const commitTimer = React.useRef<number | null>(null);
  const holdTimer = React.useRef<number | null>(null);
  const holdInterval = React.useRef<number | null>(null);
  const valueRef = React.useRef(value);
  React.useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<string>("");

  const commitValue = React.useCallback(
    (next: number) => {
      const clamped = Math.min(MAX_STROKES, Math.max(1, Math.round(next)));
      if (clamped === valueRef.current) return;
      onChange(clamped);
      if (onCommit) {
        if (commitTimer.current) window.clearTimeout(commitTimer.current);
        commitTimer.current = window.setTimeout(() => onCommit(clamped), 250);
      }
    },
    [onChange, onCommit],
  );

  const bump = React.useCallback(
    (delta: -1 | 1) => {
      if (disabled) return;
      const now = performance.now();
      if (now - lastTap.current < 60) return;
      hapticTap(8);
      lastTap.current = now;
      commitValue(valueRef.current + delta);
    },
    [disabled, commitValue],
  );

  const clearHold = React.useCallback(() => {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (holdInterval.current) {
      window.clearInterval(holdInterval.current);
      holdInterval.current = null;
    }
  }, []);

  const startHold = React.useCallback(
    (delta: -1 | 1) => {
      if (disabled) return;
      clearHold();
      holdTimer.current = window.setTimeout(() => {
        holdInterval.current = window.setInterval(() => bump(delta), 90);
      }, 350);
    },
    [bump, clearHold, disabled],
  );

  React.useEffect(() => {
    return () => {
      if (commitTimer.current) window.clearTimeout(commitTimer.current);
      clearHold();
    };
  }, [clearHold]);

  const openEditor = () => {
    if (disabled) return;
    setDraft(String(value));
    setEditing(true);
  };

  const submitEditor = () => {
    const parsed = parseInt(draft, 10);
    if (Number.isFinite(parsed)) commitValue(parsed);
    setEditing(false);
  };

  const rel = value - par;
  const relLabel = scoreLabel(value, par);
  const toneClass =
    rel < 0
      ? "text-primary"
      : rel === 0
        ? "text-foreground"
        : rel === 1
          ? "text-warning"
          : "text-destructive";

  return (
    <div className={cn("mx-auto w-full max-w-[640px]", compact ? "px-0" : "px-2", className)}>
      <div className={cn("flex items-center justify-center", compact ? "gap-2" : "gap-3 sm:gap-5")}>
        <button
          type="button"
          onClick={() => bump(-1)}
          onPointerDown={() => startHold(-1)}
          onPointerUp={clearHold}
          onPointerLeave={clearHold}
          onPointerCancel={clearHold}
          disabled={disabled || value <= 1}
          aria-label={`Decrease stroke${playerLabel ? ` for ${playerLabel}` : ""}`}
          className={cn(
            "grid shrink-0 place-items-center rounded-full border-2 border-border bg-background shadow-sm",
            compact ? "h-9 w-9 text-base" : "h-11 w-11 text-xl sm:h-12 sm:w-12",
            "transition-[colors,transform] duration-150 hover:border-primary hover:bg-muted active:scale-90 motion-reduce:transform-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          <Minus className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </button>

        <div
          className={cn("flex flex-col items-center", compact ? "min-w-[56px]" : "min-w-[88px]")}
        >
          {editing ? (
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_STROKES}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={submitEditor}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitEditor();
                if (e.key === "Escape") setEditing(false);
              }}
              className={cn(
                "rounded-md border-2 border-primary bg-background text-center font-display font-black tabular-nums leading-none outline-none",
                compact ? "w-16 text-2xl" : "w-24 text-4xl sm:text-5xl",
                toneClass,
              )}
              aria-label={`Enter strokes${playerLabel ? ` for ${playerLabel}` : ""}`}
            />
          ) : (
            <button
              type="button"
              onClick={openEditor}
              disabled={disabled}
              className={cn(
                "group inline-flex items-baseline gap-1 rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:cursor-not-allowed",
              )}
              aria-label={`Edit strokes${playerLabel ? ` for ${playerLabel}` : ""} (currently ${value})`}
              title="Tap to type any score"
            >
              <span
                key={value}
                className={cn(
                  "dg-success-pop font-display font-black tabular-nums leading-none",
                  compact ? "text-2xl" : "text-4xl sm:text-5xl",
                  toneClass,
                )}
              >
                {value}
              </span>
              <Pencil
                className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                aria-hidden
              />
            </button>
          )}
          <div
            className={cn(
              "mt-0.5 font-semibold uppercase tracking-wide",
              compact ? "text-[11px]" : "text-[12px]",
              toneClass,
            )}
            role="status"
            aria-live="polite"
          >
            {compact ? relLabel : `${relLabel} · Par ${par}`}
          </div>
        </div>

        <button
          type="button"
          onClick={() => bump(1)}
          onPointerDown={() => startHold(1)}
          onPointerUp={clearHold}
          onPointerLeave={clearHold}
          onPointerCancel={clearHold}
          disabled={disabled || value >= MAX_STROKES}
          aria-label={`Increase stroke${playerLabel ? ` for ${playerLabel}` : ""}`}
          className={cn(
            "grid shrink-0 place-items-center rounded-full border-2 border-border bg-background shadow-sm",
            compact ? "h-9 w-9 text-base" : "h-11 w-11 text-xl sm:h-12 sm:w-12",
            "transition-[colors,transform] duration-150 hover:border-primary hover:bg-muted active:scale-90 motion-reduce:transform-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          <Plus className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </button>
      </div>
    </div>
  );
}

export function scoreLabel(strokes: number, par: number) {
  if (strokes === 1) return "Ace";
  const rel = strokes - par;
  if (rel === -3) return "Albatross";
  if (rel === -2) return "Eagle";
  if (rel === -1) return "Birdie";
  if (rel === 0) return "Par";
  if (rel === 1) return "Bogey";
  if (rel === 2) return "Double";
  if (rel === 3) return "Triple";
  if (rel >= 4) return "Blow-up";
  return `${rel}`;
}
