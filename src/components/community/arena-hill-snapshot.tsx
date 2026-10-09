/**
 * Compact King of the Hill snapshot for the Community overview.
 *
 * Reuses the Arena crown-score ranking so the widget and the full Arena board
 * always agree on who is on top.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Crown, Flame, Medal, Trophy } from "lucide-react";

import { useSession } from "@/lib/current-user";
import { arenaLeaderboardQueryOptions } from "@/lib/arena";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function ArenaHillSnapshot({ limit = 5 }: { limit?: number }) {
  const { user } = useSession();
  const leaders = useQuery(arenaLeaderboardQueryOptions(user?.id));

  if (leaders.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (leaders.isError) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          We couldn&apos;t load the hill just now. Give it another try in a moment.
        </p>
        <Button size="sm" variant="outline" onClick={() => leaders.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const rows = leaders.data ?? [];
  if (!rows.length) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Add a few friends and the hill fills in with their ratings, badges, streaks, and duel
          records.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/friends">Find players</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/arena">Open Arena</Link>
          </Button>
        </div>
      </div>
    );
  }

  const top = rows[0]!;
  const me = rows.find((r) => r.is_self) ?? null;
  const max = top.crownScore || 1;
  const shown = rows.slice(0, limit);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-3">
        <Avatar className="h-12 w-12 border-2 border-amber-500/60">
          {top.avatar_url ? <AvatarImage src={top.avatar_url} alt={top.display_name} /> : null}
          <AvatarFallback>{initials(top.display_name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Crown className="h-4 w-4 text-amber-500" /> {top.display_name}
            {top.is_self ? (
              <Badge variant="secondary" className="h-5">
                You
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Top dog · {top.crownScore.toLocaleString()} crown points
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Medal className="h-3.5 w-3.5" /> {top.achievements}
          </span>
          <span className="inline-flex items-center gap-1">
            <Trophy className="h-3.5 w-3.5" /> {top.duel_wins}
          </span>
          <span className="inline-flex items-center gap-1">
            <Flame className="h-3.5 w-3.5" /> {top.streak_days}d
          </span>
        </div>
      </div>

      <ul className="divide-y divide-border/60">
        {shown.map((r) => (
          <li key={r.user_id} className="flex items-center gap-3 py-2.5">
            <span
              className={
                "w-6 text-center text-sm font-semibold " +
                (r.rank === 1 ? "text-amber-500" : "text-muted-foreground")
              }
            >
              {r.rank}
            </span>
            <Avatar className="h-8 w-8">
              {r.avatar_url ? <AvatarImage src={r.avatar_url} alt={r.display_name} /> : null}
              <AvatarFallback>{initials(r.display_name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 truncate text-sm font-medium">
                {r.display_name}
                {r.is_self ? (
                  <Badge variant="secondary" className="h-5">
                    You
                  </Badge>
                ) : null}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                Lv {r.level} · {r.pdga_rating ? `${r.pdga_rating} rated` : "unrated"} ·{" "}
                {r.duel_wins}W / {Math.max(0, r.duels_played - r.duel_wins)}L
              </div>
              <Progress value={(r.crownScore / max) * 100} className="mt-1.5 h-1.5" />
            </div>
            <span className="text-sm font-semibold tabular-nums">
              {r.crownScore.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {me
            ? `You're #${me.rank} of ${rows.length} with ${me.crownScore.toLocaleString()} crown points.`
            : `${rows.length} players on the hill.`}
        </span>
        <Button asChild size="sm" variant="outline">
          <Link to="/arena">Open Arena</Link>
        </Button>
      </div>
    </div>
  );
}
