import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calculator, Plus, Trash2, RotateCcw } from "lucide-react";
import { currentRating, ratingBreakdown, type RatedRound } from "@/lib/rating-projection";

/**
 * Rating Impact Calculator — add one or more hypothetical round ratings and
 * see how they would move the DG Dashboard projection when added to the
 * player's rated PDGA-eligible round pool. Uses the same 12-month, recency
 * weighted, low-outlier drop model as the rest of DG Statboard.
 */
type Pending = { id: string; rating: number };

export function RatingImpactCalculator({
  rounds,
  officialRating,
  source = "pdga",
}: {
  rounds: RatedRound[];
  officialRating: number | null;
  source?: "pdga" | "udisc" | "chainlink";
}) {
  const sourceLabel =
    source === "udisc"
      ? "UDisc Mock DGD"
      : source === "chainlink"
        ? "DG Dashboard rating"
        : "Official PDGA";
  const badgeLabel =
    source === "udisc"
      ? "UDisc projection"
      : source === "chainlink"
        ? "DG Dashboard projection"
        : "DG Dashboard projection";
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);

  const parsed = parseInt(input, 10);
  const validInput = Number.isFinite(parsed) && parsed >= 500 && parsed <= 1200;

  const baseRating = useMemo(() => currentRating(rounds), [rounds]);

  const combined = useMemo<RatedRound[]>(() => {
    const today = new Date().toISOString().slice(0, 10);
    return [
      ...rounds,
      ...pending.map((p, i) => ({
        played_on: today,
        round_rating: p.rating,
        event_name: `Hypothetical round ${i + 1}`,
        included: true,
      })),
    ];
  }, [rounds, pending]);

  const projected = useMemo(() => currentRating(combined), [combined]);
  const delta = pending.length > 0 ? projected - baseRating : 0;
  const breakdown = useMemo(() => ratingBreakdown(combined), [combined]);

  function addRound() {
    if (!validInput) return;
    setPending((p) => [...p, { id: crypto.randomUUID(), rating: parsed }]);
    setInput("");
  }

  function remove(id: string) {
    setPending((p) => p.filter((x) => x.id !== id));
  }

  function reset() {
    setPending([]);
    setInput("");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Round rating impact calculator</CardTitle>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase tracking-widest">
          {badgeLabel}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Add one or more round ratings to see how they would move your projected rating. Uses the
          PDGA 12-month window with 2× weight on the most recent 25% and the low-outlier drop. This
          is a DG Dashboard projection — not an official PDGA rating change.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[140px]">
            <Label htmlFor="impact-rating" className="text-[10px] uppercase tracking-widest">
              Round rating
            </Label>
            <Input
              id="impact-rating"
              inputMode="numeric"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addRound();
              }}
              placeholder="e.g. 975"
            />
          </div>
          <Button onClick={addRound} size="sm" disabled={!validInput}>
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
        {input && !validInput ? (
          <p className="-mt-2 text-xs text-red-400">Enter a rating between 500 and 1200.</p>
        ) : null}

        <div className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-muted/20 p-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {sourceLabel}
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
              With {pending.length > 0 ? `${pending.length} new` : "new"} round
              {pending.length === 1 ? "" : "s"}
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

        {pending.length > 0 ? (
          <div className="space-y-1 rounded-lg border border-border bg-background/40 p-2">
            {pending.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded px-2 py-1 text-sm hover:bg-muted/30"
              >
                <span className="w-6 text-xs text-muted-foreground tabular-nums">#{i + 1}</span>
                <span className="w-16 font-mono font-bold tabular-nums">{p.rating}</span>
                <span className="flex-1 text-muted-foreground">Hypothetical round</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove round"
                  onClick={() => remove(p.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}

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
