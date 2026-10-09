import * as React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Minus, Plus, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isSegmentBoundary,
  segmentLabel,
  segmentSize,
  segmentTotal as segmentTotalFor,
} from "@/lib/scorecard-segments";

export type ScorecardPlayer = { id: string; display: string; isMe?: boolean; editable?: boolean };
export type ScorecardHole = { number: number; par: number };

/**
 * Full-round scorecard grid for the Round Companion.
 * Rows are players, columns are holes. Tapping a hole header jumps the round to
 * that hole; tapping an editable cell corrects a single stroke count in place so
 * players never have to walk the card back to fix a mis-tap.
 */
export function RoundScorecardGrid({
  players,
  holes,
  scores,
  activeHole,
  conflicts,
  onJumpHole,
  onSaveScore,
}: {
  players: ScorecardPlayer[];
  holes: ScorecardHole[];
  /** Saved strokes keyed by `${playerId}:${holeNumber}`. */
  scores: Map<string, number>;
  activeHole: number;
  /** Keys `${playerId}:${holeNumber}` where a cardmate's confirmation disagrees. */
  conflicts?: Set<string>;
  onJumpHole: (hole: number) => void;
  onSaveScore: (playerId: string, hole: number, strokes: number) => Promise<void>;
}) {
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState(0);
  const [saving, setSaving] = React.useState(false);

  const totalPar = holes.reduce((sum, h) => sum + h.par, 0);

  function totalsFor(playerId: string) {
    let total = 0;
    let played = 0;
    let parPlayed = 0;
    for (const h of holes) {
      const v = scores.get(`${playerId}:${h.number}`);
      if (v == null) continue;
      total += v;
      played += 1;
      parPlayed += h.par;
    }
    return { total, played, toPar: total - parPlayed };
  }



  async function commit(playerId: string, hole: number) {
    setSaving(true);
    try {
      await onSaveScore(playerId, hole, draft);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-background px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Player
            </th>
            {holes.map((h, i) => (
              <React.Fragment key={h.number}>
              <th className="px-0.5 py-1">
                <button
                  type="button"
                  onClick={() => onJumpHole(h.number)}
                  aria-label={`Go to hole ${h.number}`}
                  className={cn(
                    "min-h-9 w-10 rounded-md text-center text-xs font-semibold tabular-nums",
                    h.number === activeHole
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {h.number}
                  <span className="block text-[10px] font-normal opacity-80">P{h.par}</span>
                </button>
              </th>
              {isSegmentBoundary(i, holes.length) ? (
                <th className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {segmentLabel(i)}
                </th>
              ) : null}
              </React.Fragment>
            ))}
            <th className="px-2 py-1 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Total
            </th>
            <th className="px-2 py-1 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              +/-
            </th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const t = totalsFor(p.id);
            return (
              <tr key={p.id} className={cn("border-t border-border", p.isMe && "bg-primary/5")}>
                <td className="sticky left-0 z-10 max-w-[140px] truncate bg-background px-2 py-1.5 font-medium">
                  {p.display}
                  {p.isMe ? <span className="ml-1 text-[10px] text-primary">YOU</span> : null}
                </td>
                {holes.map((h, i) => {
                  const key = `${p.id}:${h.number}`;
                  const segment = isSegmentBoundary(i, holes.length)
                    ? segmentTotalFor(holes, scores, p.id, i)
                    : undefined;
                  const segmentCell =
                    segment === undefined ? null : (
                      <td className="px-1 py-1 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                        {segment ?? "—"}
                      </td>
                    );
                  const value = scores.get(key);
                  const rel = value != null ? value - h.par : null;
                  const conflicted = conflicts?.has(key) ?? false;
                  const cell = (
                    <span
                      title={conflicted ? "Score conflict — cardmates disagree" : undefined}
                      className={cn(
                        "relative grid min-h-9 w-10 place-items-center rounded-md text-sm font-semibold tabular-nums",
                        value == null && "text-muted-foreground",
                        rel != null && rel < 0 && "bg-primary/15 text-primary",
                        rel != null && rel > 0 && "bg-destructive/10 text-destructive",
                        conflicted && "ring-2 ring-destructive",
                      )}
                    >
                      {value ?? "—"}
                      {conflicted ? (
                        <AlertTriangle className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 text-destructive" />
                      ) : null}
                    </span>
                  );
                  if (!p.editable) {
                    return (
                      <React.Fragment key={key}>
                        <td className="px-0.5 py-1 text-center">{cell}</td>
                        {segmentCell}
                      </React.Fragment>
                    );
                  }
                  return (
                    <React.Fragment key={key}>
                    <td className="px-0.5 py-1 text-center">
                      <Popover
                        open={editing === key}
                        onOpenChange={(open) => {
                          if (open) {
                            setDraft(value ?? h.par);
                            setEditing(key);
                          } else if (!saving) {
                            setEditing(null);
                          }
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Edit ${p.display} hole ${h.number}`}
                            className="rounded-md hover:ring-2 hover:ring-primary/40"
                          >
                            {cell}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2" align="center">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              aria-label="Decrease stroke"
                              className="min-h-10 min-w-10"
                              onClick={() => setDraft((d) => Math.max(1, d - 1))}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-10 text-center text-xl font-bold tabular-nums">
                              {draft}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              aria-label="Increase stroke"
                              className="min-h-10 min-w-10"
                              onClick={() => setDraft((d) => Math.min(20, d + 1))}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              disabled={saving}
                              onClick={() => void commit(p.id, h.number)}
                              className="min-h-10"
                            >
                              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                            </Button>
                          </div>
                          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
                            Hole {h.number} · par {h.par}
                          </p>
                        </PopoverContent>
                      </Popover>
                    </td>
                    {segmentCell}
                    </React.Fragment>
                  );
                })}
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                  {t.played ? t.total : "—"}
                  {t.played && t.played < holes.length ? (
                    <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                      thru {t.played}
                    </span>
                  ) : null}
                </td>
                <td
                  className={cn(
                    "px-2 py-1.5 text-right font-semibold tabular-nums",
                    t.toPar < 0 ? "text-primary" : t.toPar > 0 ? "text-destructive" : "",
                  )}
                >
                  {t.played ? (t.toPar === 0 ? "E" : t.toPar > 0 ? `+${t.toPar}` : t.toPar) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border text-[11px] text-muted-foreground">
            <td className="sticky left-0 z-10 bg-background px-2 py-1.5 font-semibold uppercase tracking-wide">
              Par
            </td>
            {holes.map((h, i) => {
              const segmentPar = isSegmentBoundary(i, holes.length)
                ? holes.slice(Math.max(0, i - 8), i + 1).reduce((sum, x) => sum + x.par, 0)
                : null;
              return (
                <React.Fragment key={`par-${h.number}`}>
                  <td className="px-0.5 py-1.5 text-center tabular-nums">{h.par}</td>
                  {segmentPar != null ? (
                    <td className="px-1 py-1.5 text-center font-semibold tabular-nums">
                      {segmentPar}
                    </td>
                  ) : null}
                </React.Fragment>
              );
            })}
            <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{totalPar}</td>
            <td className="px-2 py-1.5" />
          </tr>
        </tfoot>
      </table>

      <p className="px-2 py-2 text-[11px] text-muted-foreground">
        Course par {totalPar}. Tap a hole number to jump there, or tap a score to correct it.
        {conflicts && conflicts.size > 0
          ? " Outlined scores are disputed by a cardmate — confirm the right number to clear them."
          : ""}
      </p>
    </div>
  );
}
