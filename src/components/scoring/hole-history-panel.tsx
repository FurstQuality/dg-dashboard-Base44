import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface HoleHistoryPanelProps {
  userId: string | null;
  courseId: string | null;
  layoutId: string | null;
  holeNumber: number;
  par: number;
}

interface HistoryRow {
  round_id: string;
  played_on: string | null;
  strokes: number;
  par: number;
}

/**
 * Prior performance for the signed-in player on this exact hole at this course.
 * Shows best, average, most-common score, and the last few attempts.
 */
export function HoleHistoryPanel({
  userId,
  courseId,
  layoutId,
  holeNumber,
  par,
}: HoleHistoryPanelProps) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!userId || !courseId) {
      setRows(null);
      return;
    }
    setLoading(true);
    (async () => {
      // Rounds this player has on this course (optionally this layout).
      let q = supabase
        .from("rounds")
        .select("id, started_at, layout_id, course_id")
        .eq("course_id", courseId);
      if (layoutId) q = q.eq("layout_id", layoutId);
      const { data: rounds } = await q.limit(200);
      const roundIds = (rounds ?? []).map((r) => r.id);
      if (roundIds.length === 0) {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
        return;
      }

      const { data: rps } = await supabase
        .from("round_players")
        .select("id, round_id, user_id")
        .in("round_id", roundIds)
        .eq("user_id", userId);
      const rpIds = (rps ?? []).map((r) => r.id);
      const rpToRound = new Map((rps ?? []).map((r) => [r.id, r.round_id]));
      if (rpIds.length === 0) {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
        return;
      }

      // Fetch hole scores + par for those rounds.
      const parLookup = layoutId
        ? (
            await supabase
              .from("holes")
              .select("par")
              .eq("layout_id", layoutId)
              .eq("number", holeNumber)
          ).data
        : null;
      const { data: scoresData } = await supabase
        .from("round_scores")
        .select("round_player_id, hole_number, strokes")
        .in("round_player_id", rpIds)
        .eq("hole_number", holeNumber);
      const roundStartMap = new Map((rounds ?? []).map((r) => [r.id, r.started_at ?? null]));
      const parVal = (parLookup?.[0]?.par as number | undefined) ?? par;

      const out: HistoryRow[] = (scoresData ?? [])
        .map((s) => ({
          round_id: rpToRound.get(s.round_player_id) ?? "",
          played_on: roundStartMap.get(rpToRound.get(s.round_player_id) ?? "") ?? null,
          strokes: s.strokes,
          par: parVal,
        }))
        .sort((a, b) => (b.played_on ?? "").localeCompare(a.played_on ?? ""));

      if (!cancelled) {
        setRows(out);
        setLoading(false);
      }
    })().catch(() => {
      if (!cancelled) {
        setRows([]);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId, courseId, layoutId, holeNumber, par]);

  if (!userId || !courseId) return null;

  const stats = (() => {
    if (!rows || rows.length === 0) return null;
    const strokesArr = rows.map((r) => r.strokes);
    const best = Math.min(...strokesArr);
    const avg = strokesArr.reduce((s, n) => s + n, 0) / strokesArr.length;
    const modeMap = new Map<number, number>();
    for (const n of strokesArr) modeMap.set(n, (modeMap.get(n) ?? 0) + 1);
    let mode = strokesArr[0],
      modeCount = 0;
    for (const [k, v] of modeMap)
      if (v > modeCount) {
        mode = k;
        modeCount = v;
      }
    const relAvg = avg - par;
    return { best, avg, mode, modeCount, relAvg, count: rows.length };
  })();

  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1">
          <History className="h-3 w-3" /> Your history · Hole {holeNumber}
        </span>
        <span>{rows ? `${rows.length}×` : "—"}</span>
      </div>
      {loading ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">Loading past attempts…</div>
      ) : !rows || rows.length === 0 ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          First time here. Score this hole to start a history.
        </div>
      ) : (
        <div className="divide-y divide-border/60 text-sm">
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs text-muted-foreground">Best</span>
            <span className="tabular-nums font-semibold text-primary">
              {stats!.best}
              <span className="ml-1 text-[10px] text-muted-foreground">
                ({stats!.best - par <= 0 ? stats!.best - par : `+${stats!.best - par}`})
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs text-muted-foreground">Average</span>
            <span className="tabular-nums text-xs">
              {stats!.avg.toFixed(2)}
              <span
                className={
                  "ml-1 " +
                  (stats!.relAvg < 0
                    ? "text-primary"
                    : stats!.relAvg > 0
                      ? "text-destructive"
                      : "text-muted-foreground")
                }
              >
                {stats!.relAvg === 0
                  ? "E"
                  : stats!.relAvg > 0
                    ? `+${stats!.relAvg.toFixed(2)}`
                    : stats!.relAvg.toFixed(2)}
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs text-muted-foreground">Most common</span>
            <span className="tabular-nums text-xs">
              {stats!.mode} <span className="text-muted-foreground">({stats!.modeCount}×)</span>
            </span>
          </div>
          <div className="px-3 py-1.5">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Recent
            </div>
            <div className="flex flex-wrap gap-1">
              {rows.slice(0, 8).map((r, i) => {
                const rel = r.strokes - r.par;
                return (
                  <span
                    key={`${r.round_id}:${i}`}
                    className={
                      "inline-flex h-6 min-w-6 items-center justify-center rounded px-1 text-[11px] tabular-nums font-semibold " +
                      (rel < 0
                        ? "bg-primary/15 text-primary"
                        : rel > 0
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-foreground")
                    }
                    title={r.played_on ? new Date(r.played_on).toLocaleDateString() : ""}
                  >
                    {r.strokes}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
