import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface HoleFieldPanelProps {
  courseId: string | null;
  layoutId: string | null;
  holeNumber: number;
  par: number;
}

interface Bucket {
  label: string;
  count: number;
  color: string;
}

/**
 * Field-wide scoring distribution for this hole — how everyone playing
 * this physical hole tends to score. Uses `physical_hole_key` so all
 * layouts that share the same tee/basket combo are aggregated.
 */
export function HoleFieldPanel({ courseId, layoutId, holeNumber, par }: HoleFieldPanelProps) {
  const [rows, setRows] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [holeKey, setHoleKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!courseId) {
      setRows(null);
      return;
    }
    setLoading(true);
    (async () => {
      if (!layoutId) {
        if (!cancelled) {
          setRows([]);
          setHoleKey(null);
          setLoading(false);
        }
        return;
      }
      // Resolve physical_hole_key for this hole in this layout.
      const { data: keyRows } = await supabase
        .from("holes")
        .select("physical_hole_key")
        .eq("layout_id", layoutId)
        .eq("number", holeNumber)
        .limit(1);
      const key = keyRows?.[0]?.physical_hole_key ?? null;
      if (!key) {
        if (!cancelled) {
          setRows([]);
          setHoleKey(null);
          setLoading(false);
        }
        return;
      }

      // Every layout+hole row that shares this physical key.
      const { data: siblings } = await supabase
        .from("holes")
        .select("layout_id, number")
        .eq("physical_hole_key", key);
      const sib = (siblings ?? []) as Array<{ layout_id: string; number: number }>;
      if (sib.length === 0) {
        if (!cancelled) {
          setRows([]);
          setHoleKey(key);
          setLoading(false);
        }
        return;
      }

      const layoutIds = Array.from(new Set(sib.map((h) => h.layout_id)));
      const { data: rounds } = await supabase
        .from("rounds")
        .select("id, layout_id")
        .in("layout_id", layoutIds)
        .limit(2000);
      const roundIds = (rounds ?? []).map((r) => r.id);
      if (roundIds.length === 0) {
        if (!cancelled) {
          setRows([]);
          setHoleKey(key);
          setLoading(false);
        }
        return;
      }

      const { data: scoreRows } = await supabase
        .from("round_scores")
        .select("strokes, hole_number")
        .in("round_id", roundIds)
        .eq("hole_number", holeNumber)
        .limit(5000);
      const strokes = (scoreRows ?? [])
        .map((r) => r.strokes as number | null)
        .filter((v): v is number => typeof v === "number" && v > 0);

      if (!cancelled) {
        setRows(strokes);
        setHoleKey(key);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, layoutId, holeNumber]);

  const strokes = rows ?? [];
  const total = strokes.length;
  const avg = total > 0 ? +(strokes.reduce((s, v) => s + v, 0) / total).toFixed(2) : null;
  const buckets: Bucket[] =
    total === 0
      ? []
      : (() => {
          let eagleOrBetter = 0,
            birdie = 0,
            parCount = 0,
            bogey = 0,
            dbl = 0,
            worse = 0;
          for (const s of strokes) {
            const diff = s - par;
            if (diff <= -2) eagleOrBetter++;
            else if (diff === -1) birdie++;
            else if (diff === 0) parCount++;
            else if (diff === 1) bogey++;
            else if (diff === 2) dbl++;
            else worse++;
          }
          return [
            { label: "Eagle+", count: eagleOrBetter, color: "bg-purple-500" },
            { label: "Birdie", count: birdie, color: "bg-emerald-500" },
            { label: "Par", count: parCount, color: "bg-primary" },
            { label: "Bogey", count: bogey, color: "bg-amber-500" },
            { label: "Double", count: dbl, color: "bg-orange-500" },
            { label: "Worse", count: worse, color: "bg-red-500" },
          ];
        })();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Field scoring · Hole {holeNumber}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {loading ? (
          <div className="text-muted-foreground">Loading field data…</div>
        ) : total === 0 ? (
          <div className="text-muted-foreground">
            {holeKey
              ? "No community scores logged for this hole yet."
              : "Layout hasn't been mapped to a physical hole yet."}
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Community average</span>
              <span className="tabular-nums font-semibold">
                {avg} <span className="text-xs text-muted-foreground">({total} scores)</span>
              </span>
            </div>
            <div className="space-y-1.5">
              {buckets
                .filter((b) => b.count > 0)
                .map((b) => {
                  const pct = Math.round((b.count / total) * 100);
                  return (
                    <div key={b.label}>
                      <div className="flex justify-between text-xs">
                        <span>{b.label}</span>
                        <span className="tabular-nums text-muted-foreground">{pct}%</span>
                      </div>
                      <div className="h-2 rounded bg-muted overflow-hidden">
                        <div className={`h-full ${b.color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
