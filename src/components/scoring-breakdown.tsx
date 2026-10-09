import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

type Row = { hole_number: number; strokes: number; par: number };

const BUCKETS = [
  {
    key: "eagle",
    label: "Eagles",
    color: "bg-emerald-500",
    text: "text-emerald-500",
    min: -Infinity,
    max: -2,
  },
  {
    key: "birdie",
    label: "Birdies",
    color: "bg-emerald-400",
    text: "text-emerald-400",
    min: -1,
    max: -1,
  },
  {
    key: "par",
    label: "Pars",
    color: "bg-muted-foreground/60",
    text: "text-muted-foreground",
    min: 0,
    max: 0,
  },
  { key: "bogey", label: "Bogeys", color: "bg-amber-400", text: "text-amber-400", min: 1, max: 1 },
  { key: "dbl", label: "Double Bogeys", color: "bg-red-400", text: "text-red-400", min: 2, max: 2 },
  { key: "trp", label: "Triple Bogeys", color: "bg-red-500", text: "text-red-500", min: 3, max: 3 },
  {
    key: "quad",
    label: "Quad+ Bogeys",
    color: "bg-red-600",
    text: "text-red-600",
    min: 4,
    max: Infinity,
  },
] as const;

export function ScoringBreakdown({
  roundId,
  userId,
  layoutId,
}: {
  roundId: string;
  userId: string;
  layoutId: string;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: player } = await supabase
        .from("round_players")
        .select("id")
        .eq("round_id", roundId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!player) {
        if (!cancelled) setRows([]);
        return;
      }
      const [{ data: scs }, { data: holes }] = await Promise.all([
        supabase
          .from("round_scores")
          .select("hole_number, strokes")
          .eq("round_player_id", player.id),
        supabase.from("holes").select("number, par").eq("layout_id", layoutId),
      ]);
      const parMap = new Map<number, number>();
      for (const h of (holes as any[]) ?? []) parMap.set(h.number, h.par);
      const out: Row[] = [];
      for (const s of (scs as any[]) ?? []) {
        if (!s.strokes || s.strokes <= 0) continue;
        out.push({
          hole_number: s.hole_number,
          strokes: s.strokes,
          par: parMap.get(s.hole_number) ?? 3,
        });
      }
      if (!cancelled) setRows(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [roundId, userId, layoutId]);

  if (rows === null) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Crunching your scoring breakdown…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        This round doesn't have hole-by-hole scores — only the total was recorded.
      </div>
    );
  }

  const total = rows.length;
  const counts = BUCKETS.map((b) => {
    const n = rows.filter((r) => {
      const diff = r.strokes - r.par;
      return diff >= b.min && diff <= b.max;
    }).length;
    return { ...b, n, pct: (n / total) * 100 };
  });

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Scoring
      </div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
        {counts.map((c) =>
          c.n > 0 ? (
            <div
              key={c.key}
              className={c.color}
              style={{ width: `${c.pct}%` }}
              title={`${c.label}: ${c.n}`}
            />
          ) : null,
        )}
      </div>
      <div className="mt-3 space-y-1.5">
        {counts.map((c) => (
          <div key={c.key} className="flex items-center gap-3 text-sm">
            <span className={`inline-block h-2 w-2 rounded-full ${c.color}`} />
            <span className="w-28 shrink-0">{c.label}</span>
            <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
              <div className={c.color + " h-full"} style={{ width: `${c.pct}%` }} />
            </div>
            <span className="w-8 text-right tabular-nums font-semibold">{c.n}</span>
            <span className="w-14 text-right tabular-nums text-xs text-muted-foreground">
              {c.pct.toFixed(c.pct >= 10 ? 1 : 2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
