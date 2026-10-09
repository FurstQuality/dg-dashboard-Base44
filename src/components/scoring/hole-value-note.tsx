import { useQuery } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parValueNote } from "@/lib/scoring-caddy";

/**
 * How the field actually scores this hole, and what par is worth here.
 * Complements HoleHistoryPanel (your own scores) with the field baseline.
 */
export function HoleValueNote({
  layoutId,
  holeNumber,
  par,
}: {
  layoutId: string | null;
  holeNumber: number;
  par: number;
}) {
  const { data } = useQuery({
    queryKey: ["hole-value", layoutId, holeNumber],
    enabled: !!layoutId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data: intel } = await supabase
        .from("hole_intel")
        .select("avg_strokes, scores_count, birdie_count")
        .eq("layout_id", layoutId!)
        .eq("hole_number", holeNumber)
        .maybeSingle();
      return intel ?? null;
    },
  });

  if (!data || !data.scores_count) return null;
  const note = parValueNote(data.avg_strokes ?? null, par);
  const birdiePct = data.scores_count
    ? Math.round((data.birdie_count / data.scores_count) * 100)
    : null;

  return (
    <div className="rounded-xl border border-border bg-background p-2">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1">
          <Target className="h-3 w-3" /> Hole value
        </span>
        <span className="tabular-nums">
          Field {data.avg_strokes?.toFixed(2) ?? "—"} · {data.scores_count} scores
        </span>
      </div>
      {note ? <p className="px-1 text-[11px] text-foreground">{note}</p> : null}
      {birdiePct != null ? (
        <p className="px-1 text-[11px] text-muted-foreground tabular-nums">
          {birdiePct}% of tracked scores here go under par.
        </p>
      ) : null}
    </div>
  );
}
