import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Target, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { Progress } from "@/components/ui/progress";

type Row = {
  id: string;
  key: string;
  title: string;
  description: string;
  kind: "daily" | "weekly" | "seasonal";
  goal_target: number;
  xp_reward: number;
  ends_at: string | null;
};

export function DailyGoalsWidget() {
  const { user } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [progressMap, setProgressMap] = useState<
    Record<string, { progress: number; completed: boolean }>
  >({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: challenges } = await supabase
        .from("challenges")
        .select(
          "id, key, title, description, kind, goal_target, xp_reward, ends_at, starts_at, active",
        )
        .eq("active", true)
        .in("kind", ["daily", "weekly"])
        .order("kind")
        .limit(6);
      if (!alive || !challenges) return;
      const now = new Date();
      const filtered = challenges.filter(
        (c) =>
          (!c.ends_at || new Date(c.ends_at) > now) &&
          (!c.starts_at || new Date(c.starts_at) <= now),
      );
      setRows(filtered as Row[]);
      if (user?.id) {
        const { data: progRows } = await supabase
          .from("user_challenge_progress")
          .select("challenge_id, progress, completed_at")
          .eq("user_id", user.id)
          .in(
            "challenge_id",
            filtered.map((c) => c.id),
          );
        const map: Record<string, { progress: number; completed: boolean }> = {};
        progRows?.forEach((p) => {
          map[p.challenge_id] = { progress: p.progress, completed: !!p.completed_at };
        });
        if (alive) setProgressMap(map);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  if (!rows.length) return null;

  const visible = rows.slice(0, 3);
  const totalEarned = visible.reduce((sum, c) => {
    const p = progressMap[c.id];
    return sum + (p?.completed ? c.xp_reward : 0);
  }, 0);
  const allDone = visible.every((c) => progressMap[c.id]?.completed);

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Target className="h-3.5 w-3.5 text-primary" /> Today's goals
        </div>
        <Link to="/challenges" className="text-[11px] font-medium text-primary hover:underline">
          View all
        </Link>
      </div>
      <ul className="space-y-2">
        {visible.map((c) => {
          const p = progressMap[c.id];
          const pct = p ? Math.min(100, (p.progress / c.goal_target) * 100) : 0;
          const done = p?.completed ?? false;
          return (
            <li key={c.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex min-w-0 items-center gap-1.5">
                  {done ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : null}
                  <span
                    className={
                      "truncate font-medium " + (done ? "text-muted-foreground line-through" : "")
                    }
                    title={c.title}
                  >
                    {c.title}
                  </span>
                </div>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {Math.min(p?.progress ?? 0, c.goal_target)}/{c.goal_target}
                </span>
              </div>
              <Progress
                value={pct}
                className="h-1.5"
                aria-label={`${c.title} progress`}
                aria-valuetext={`${Math.min(p?.progress ?? 0, c.goal_target)} of ${c.goal_target}`}
              />
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-amber-500" /> {totalEarned} XP earned
        </span>
        {allDone ? <span className="font-semibold text-emerald-500">All done today</span> : null}
      </div>
    </div>
  );
}
