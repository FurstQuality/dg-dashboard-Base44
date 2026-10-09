import { useMemo } from "react";
import { Flame, TrendingDown, TrendingUp, Target, Sparkles } from "lucide-react";

export interface RoundInsightsPanelProps {
  meId: string | null;
  scores: Array<{ playerId: string; hole: number; strokes: number }>;
  holes: Array<{ number: number; par: number }>;
}

/**
 * Round Insights — live momentum + projection for the signed-in player.
 * - Best / worst hole (relative to par)
 * - Current birdie streak & bogey-free streak
 * - Projected final total (holds current +/- vs par pace across remaining holes)
 */
export function RoundInsightsPanel({ meId, scores, holes }: RoundInsightsPanelProps) {
  const insights = useMemo(() => {
    if (!meId || holes.length === 0) return null;
    const parByHole = new Map(holes.map((h) => [h.number, h.par]));
    const totalPar = holes.reduce((s, h) => s + h.par, 0);

    // Chronological by hole number.
    const played = scores
      .filter((s) => s.playerId === meId && parByHole.has(s.hole))
      .sort((a, b) => a.hole - b.hole)
      .map((s) => ({
        hole: s.hole,
        strokes: s.strokes,
        par: parByHole.get(s.hole)!,
        rel: s.strokes - parByHole.get(s.hole)!,
      }));

    if (played.length === 0) return { empty: true } as const;

    let toPar = 0;
    let strokes = 0;
    let parSoFar = 0;
    let best = played[0];
    let worst = played[0];
    let birdieOrBetter = 0;
    let pars = 0;
    let bogeyOrWorse = 0;

    for (const p of played) {
      toPar += p.rel;
      strokes += p.strokes;
      parSoFar += p.par;
      if (p.rel < best.rel) best = p;
      if (p.rel > worst.rel) worst = p;
      if (p.rel <= -1) birdieOrBetter += 1;
      else if (p.rel === 0) pars += 1;
      else bogeyOrWorse += 1;
    }

    // Trailing streaks from the most recent hole backwards.
    let birdieStreak = 0;
    let bogeyFreeStreak = 0;
    for (let i = played.length - 1; i >= 0; i -= 1) {
      if (played[i].rel <= -1) birdieStreak += 1;
      else break;
    }
    for (let i = played.length - 1; i >= 0; i -= 1) {
      if (played[i].rel <= 0) bogeyFreeStreak += 1;
      else break;
    }

    // Momentum: last up to 3 holes vs par.
    const tail = played.slice(-3);
    const momentum = tail.reduce((s, p) => s + p.rel, 0);

    // Projection: assume the current pace vs par continues.
    const holesLeft = Math.max(0, holes.length - played.length);
    const avgRel = toPar / played.length;
    const projectedRel = Math.round(toPar + avgRel * holesLeft);
    const projectedTotal = totalPar + projectedRel;

    return {
      empty: false as const,
      thru: played.length,
      strokes,
      parSoFar,
      toPar,
      best,
      worst,
      birdieOrBetter,
      pars,
      bogeyOrWorse,
      birdieStreak,
      bogeyFreeStreak,
      momentum,
      holesLeft,
      projectedTotal,
      projectedRel,
    };
  }, [meId, scores, holes]);

  if (!insights) return null;

  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> Round insights
        </span>
        <span>{insights.empty ? "—" : `Thru ${insights.thru}`}</span>
      </div>

      {insights.empty ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          Score a hole to see momentum, streaks, and a projected final total.
        </div>
      ) : (
        <div className="divide-y divide-border/60 text-sm">
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs text-muted-foreground">Projected final</span>
            <span className="tabular-nums font-semibold">
              {insights.projectedTotal}
              <span
                className={
                  "ml-2 text-xs " +
                  (insights.projectedRel < 0
                    ? "text-primary"
                    : insights.projectedRel > 0
                      ? "text-destructive"
                      : "text-muted-foreground")
                }
              >
                {insights.projectedRel === 0
                  ? "E"
                  : insights.projectedRel > 0
                    ? `+${insights.projectedRel}`
                    : insights.projectedRel}
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs text-muted-foreground">Holes left</span>
            <span className="tabular-nums">{insights.holesLeft}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-primary" /> Best hole
            </span>
            <span className="tabular-nums text-xs">
              #{insights.best.hole} · {insights.best.strokes}{" "}
              <span className="text-primary">
                ({insights.best.rel <= 0 ? insights.best.rel : `+${insights.best.rel}`})
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-3 w-3 text-destructive" /> Worst hole
            </span>
            <span className="tabular-nums text-xs">
              #{insights.worst.hole} · {insights.worst.strokes}{" "}
              <span className="text-destructive">
                ({insights.worst.rel <= 0 ? insights.worst.rel : `+${insights.worst.rel}`})
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Flame className="h-3 w-3 text-amber-500" /> Birdie streak
            </span>
            <span className="tabular-nums text-xs">{insights.birdieStreak}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" /> Bogey-free
            </span>
            <span className="tabular-nums text-xs">{insights.bogeyFreeStreak} holes</span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs text-muted-foreground">Last 3 vs par</span>
            <span
              className={
                "tabular-nums text-xs font-semibold " +
                (insights.momentum < 0
                  ? "text-primary"
                  : insights.momentum > 0
                    ? "text-destructive"
                    : "text-muted-foreground")
              }
            >
              {insights.momentum === 0
                ? "E"
                : insights.momentum > 0
                  ? `+${insights.momentum}`
                  : insights.momentum}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-0 text-center text-[11px]">
            <div className="px-2 py-1.5">
              <div className="tabular-nums font-semibold text-primary">
                {insights.birdieOrBetter}
              </div>
              <div className="text-muted-foreground">Birdie+</div>
            </div>
            <div className="px-2 py-1.5 border-x border-border/60">
              <div className="tabular-nums font-semibold">{insights.pars}</div>
              <div className="text-muted-foreground">Par</div>
            </div>
            <div className="px-2 py-1.5">
              <div className="tabular-nums font-semibold text-destructive">
                {insights.bogeyOrWorse}
              </div>
              <div className="text-muted-foreground">Bogey+</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
