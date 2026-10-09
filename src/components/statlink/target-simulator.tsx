import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, FlaskConical, RotateCcw } from "lucide-react";
import { currentRating, ratingBreakdown, type RatedRound } from "@/lib/rating-projection";

/**
 * DG Statboard Rating Studio — What-if Simulator.
 *
 * Adds hypothetical rounds against the player's real rated-round pool and
 * shows how DG Dashboard's projected rating would move. Uses the Phase 1
 * taxonomy: "Official PDGA Rating" for what PDGA published, "DG Dashboard
 * Projection" for the modeled result — never presented as an official
 * rating change.
 */
export function TargetSimulator({
  rounds,
  officialRating,
}: {
  rounds: RatedRound[];
  officialRating: number | null;
}) {
  const [pending, setPending] = useState<Array<{ id: string; rating: number; label: string }>>([]);
  const [ratingInput, setRatingInput] = useState("");
  const [labelInput, setLabelInput] = useState("");

  const baseRating = useMemo(() => currentRating(rounds), [rounds]);

  const combined = useMemo<RatedRound[]>(
    () => [
      ...rounds,
      ...pending.map((p) => ({
        played_on: new Date().toISOString().slice(0, 10),
        round_rating: p.rating,
        event_name: p.label || "Simulated round",
        included: true,
      })),
    ],
    [rounds, pending],
  );

  const projected = useMemo(() => currentRating(combined), [combined]);
  const delta = projected - baseRating;
  const breakdown = useMemo(() => ratingBreakdown(combined), [combined]);

  function add() {
    const n = parseInt(ratingInput, 10);
    if (!Number.isFinite(n) || n < 500 || n > 1200) return;
    setPending((p) => [
      ...p,
      { id: crypto.randomUUID(), rating: n, label: labelInput.trim() || `Round ${p.length + 1}` },
    ]);
    setRatingInput("");
    setLabelInput("");
  }

  function addBatch(rating: number, count: number) {
    setPending((p) => [
      ...p,
      ...Array.from({ length: count }, (_, i) => ({
        id: crypto.randomUUID(),
        rating,
        label: `@ ${rating}`,
      })),
    ]);
  }

  function remove(id: string) {
    setPending((p) => p.filter((x) => x.id !== id));
  }

  function reset() {
    setPending([]);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">What-if simulator</CardTitle>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase tracking-widest">
          DG Dashboard projection
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Add hypothetical rounds to see how your projected rating would move. Uses PDGA math
          (12-month window, 2× weight on the most recent 25%, low-outlier drop). This is a DG
          Dashboard projection — not an official PDGA rating change.
        </p>

        {/* Projection strip */}
        <div className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-muted/20 p-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Official PDGA
            </div>
            <div className="font-mono text-2xl font-bold tabular-nums">{officialRating ?? "—"}</div>
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Current form
            </div>
            <div className="font-mono text-2xl font-bold tabular-nums">{baseRating}</div>
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-primary">
              With sim rounds
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold tabular-nums text-primary">
                {projected}
              </span>
              {pending.length > 0 && delta !== 0 ? (
                <span
                  className={`text-sm font-bold tabular-nums ${
                    delta > 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {delta > 0 ? "+" : ""}
                  {delta}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Add controls */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[110px]">
            <Label htmlFor="sim-rating" className="text-[10px] uppercase tracking-widest">
              Round rating
            </Label>
            <Input
              id="sim-rating"
              inputMode="numeric"
              value={ratingInput}
              onChange={(e) => setRatingInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
              placeholder="e.g. 975"
            />
          </div>
          <div className="min-w-[140px] flex-1">
            <Label htmlFor="sim-label" className="text-[10px] uppercase tracking-widest">
              Label (optional)
            </Label>
            <Input
              id="sim-label"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder="e.g. Fall tournament R1"
            />
          </div>
          <Button onClick={add} size="sm">
            <Plus className="mr-1 h-4 w-4" />
            Add round
          </Button>
          {pending.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="mr-1 h-4 w-4" />
              Reset
            </Button>
          ) : null}
        </div>

        {/* Quick presets */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Quick add:</span>
          {[baseRating, baseRating + 25, baseRating + 50].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => addBatch(r, 4)}
              className="rounded-full border border-border bg-card px-2.5 py-1 font-mono text-xs font-semibold hover:border-primary/50 hover:text-primary"
            >
              4× @ {r}
            </button>
          ))}
        </div>

        {/* Pending list */}
        {pending.length > 0 ? (
          <div className="space-y-1 rounded-lg border border-border bg-background/40 p-2">
            {pending.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded px-2 py-1 text-sm hover:bg-muted/30"
              >
                <span className="w-14 font-mono font-bold tabular-nums">{p.rating}</span>
                <span className="flex-1 truncate text-muted-foreground">{p.label}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove planned round"
                  onClick={() => remove(p.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        {/* Breakdown */}
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <Metric label="Rounds counted" value={breakdown.included} />
          <Metric label="Recent (2× weight)" value={breakdown.doubleWeighted} />
          <Metric label="Low outliers dropped" value={breakdown.droppedLow} />
          <Metric label="Simple mean" value={breakdown.simpleMean || "—"} />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}
