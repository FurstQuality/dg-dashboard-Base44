import { useEffect, useMemo, useState } from "react";
import { Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface RoundRatingPanelProps {
  layoutId: string | null;
  meId: string | null;
  scores: Array<{ playerId: string; hole: number; strokes: number }>;
  holes: Array<{ number: number; par: number }>;
}

/**
 * Live PDGA-style Round Rating projection.
 *   round_rating = scratch_rating - (strokes - scratch_rating) * stroke_value
 * scratch_rating and stroke_value come from the layout when set; otherwise this
 * panel shows a friendly "not calibrated" message.
 */
export function RoundRatingPanel({ layoutId, meId, scores, holes }: RoundRatingPanelProps) {
  const [layout, setLayout] = useState<{
    scratch_rating: number;
    stroke_value: number;
    hole_count: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancel = false;
    if (!layoutId) {
      setLayout(null);
      return;
    }
    setLoading(true);
    supabase
      .from("course_layouts")
      .select("scratch_rating, stroke_value, hole_count")
      .eq("id", layoutId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancel) return;
        setLayout(
          data as { scratch_rating: number; stroke_value: number; hole_count: number } | null,
        );
        setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [layoutId]);

  const projection = useMemo(() => {
    if (!layout || !meId) return null;
    if (!layout.scratch_rating || !layout.stroke_value) return { calibrated: false as const };

    const parByHole = new Map(holes.map((h) => [h.number, h.par]));
    const played = scores
      .filter((s) => s.playerId === meId && parByHole.has(s.hole))
      .sort((a, b) => a.hole - b.hole);
    if (played.length === 0) return { calibrated: true as const, empty: true as const };

    const strokesSoFar = played.reduce((s, p) => s + p.strokes, 0);
    const parSoFar = played.reduce((s, p) => s + (parByHole.get(p.hole) ?? 3), 0);
    const totalPar = holes.reduce((s, h) => s + h.par, 0);
    const holeCount = holes.length || layout.hole_count;

    // Extrapolate current pace vs par over remaining holes.
    const avgRel = played.length > 0 ? (strokesSoFar - parSoFar) / played.length : 0;
    const projectedStrokes = Math.round(
      strokesSoFar + avgRel * Math.max(0, holeCount - played.length),
    );

    const projectedRating = Math.round(
      layout.scratch_rating - (projectedStrokes - layout.scratch_rating) * layout.stroke_value,
    );

    // Also show a rating for the current partial round if you froze it now.
    const partialSSA = layout.scratch_rating * (played.length / holeCount);
    const partialRating = Math.round(
      layout.scratch_rating - (strokesSoFar - partialSSA) * layout.stroke_value,
    );

    // Score needed on remaining holes for a target rating (e.g. current +25).
    const targetRating = projectedRating + 25;
    const targetStrokes =
      layout.scratch_rating - (targetRating - layout.scratch_rating) / layout.stroke_value;
    const remainingBudget = Math.max(0, holeCount - played.length);
    const neededPerHole =
      remainingBudget > 0
        ? (targetStrokes - strokesSoFar) / remainingBudget - (totalPar - parSoFar) / remainingBudget
        : 0;

    return {
      calibrated: true as const,
      empty: false as const,
      strokesSoFar,
      projectedStrokes,
      projectedRating,
      partialRating,
      scratchRating: layout.scratch_rating,
      strokeValue: layout.stroke_value,
      targetRating,
      neededPerHole,
      holesLeft: remainingBudget,
    };
  }, [layout, meId, scores, holes]);

  if (!layoutId) return null;

  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1">
          <Target className="h-3 w-3" /> Round rating
        </span>
        {layout && layout.scratch_rating ? (
          <span>
            SSA {layout.scratch_rating.toFixed(1)} · {layout.stroke_value.toFixed(1)}/thr
          </span>
        ) : (
          <span>—</span>
        )}
      </div>

      {loading ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">Loading layout ratings…</div>
      ) : !projection ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">No player context yet.</div>
      ) : !projection.calibrated ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          This layout doesn't have an SSA / stroke value yet. Add course ratings in the builder to
          enable live rating projection.
        </div>
      ) : projection.empty ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          Score a hole to project your Round Rating for this layout.
        </div>
      ) : (
        <div className="divide-y divide-border/60 text-sm">
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs text-muted-foreground">Projected rating</span>
            <span className="tabular-nums font-semibold text-primary">
              {projection.projectedRating}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs text-muted-foreground">If frozen now</span>
            <span className="tabular-nums text-xs">{projection.partialRating}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs text-muted-foreground">Projected total</span>
            <span className="tabular-nums text-xs">{projection.projectedStrokes}</span>
          </div>
          {projection.holesLeft > 0 ? (
            <div className="px-3 py-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">For +25 rating</span>
                <span className="tabular-nums font-semibold">
                  {projection.neededPerHole <= 0
                    ? "Stay clean"
                    : `avg ${projection.neededPerHole > 0 ? "+" : ""}${projection.neededPerHole.toFixed(2)}/hole`}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Target {projection.targetRating} across the remaining {projection.holesLeft} hole
                {projection.holesLeft === 1 ? "" : "s"}.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
