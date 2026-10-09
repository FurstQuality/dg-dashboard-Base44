import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Timer, Radar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { friendsPlayingNowQueryOptions } from "@/lib/entities";
import { PlayerLink } from "@/components/shared/entity-link";

/**
 * Shared "Friends playing now" surface. One component, one query — consumed
 * by Feed, Play Overview, and Community Overview. Any changes to the read or
 * empty-state copy happen here.
 */
export function FriendsPlayingNow({
  userId,
  limit = 4,
  variant = "list",
}: {
  userId: string | null | undefined;
  limit?: number;
  variant?: "list" | "compact";
}) {
  const { data, isLoading } = useQuery(friendsPlayingNowQueryOptions(userId));

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    );
  }

  const rows = (data ?? []).slice(0, limit);

  if (rows.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
        <Radar className="h-4 w-4 text-primary/70" />
        No friends on the course right now.
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.round_id} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">
              <PlayerLink username={r.player_username} userId={r.player_id} className="font-medium">
                {r.player_name}
              </PlayerLink>
              {r.course_name ? (
                <span className="text-muted-foreground"> · {r.course_name}</span>
              ) : null}
            </span>
            <RelativeTime iso={r.started_at} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.round_id}
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/60 px-3 py-2"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              <PlayerLink username={r.player_username} userId={r.player_id}>
                {r.player_name}
              </PlayerLink>
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {r.course_name ?? "Round in progress"}
            </div>
          </div>
          <Link
            to="/play"
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Timer className="h-3.5 w-3.5" />
            <RelativeTime iso={r.started_at} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RelativeTime({ iso }: { iso: string }) {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  const label = mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`;
  return <span className="tabular-nums">{label} ago</span>;
}
