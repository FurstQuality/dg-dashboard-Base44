import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Radar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { listTrackerGroups } from "@/lib/tracker.functions";
import { listTrackedEvents } from "@/lib/tracker-watchlist.functions";
import { trackerKeys, TRACKER_STALE } from "@/lib/tracker-queries";

function Metric({
  value,
  label,
  to,
  warn,
}: {
  value: number;
  label: string;
  to: "/tracker" | "/community/trackers";
  warn?: boolean;
}) {
  return (
    <Link
      to={to}
      className="rounded-control border border-border bg-background px-3 py-2 transition hover:border-primary/40"
    >
      <div
        className={`text-2xl font-semibold tabular-nums ${warn && value ? "text-amber-500" : "text-foreground"}`}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Link>
  );
}

export function TrackersSnapshotPanel() {
  const groupsFn = useServerFn(listTrackerGroups);
  const eventsFn = useServerFn(listTrackedEvents);

  const groupsQ = useQuery({
    queryKey: trackerKeys.groups(),
    staleTime: TRACKER_STALE.group,
    queryFn: () => groupsFn(),
  });
  const eventsQ = useQuery({
    queryKey: trackerKeys.watchlist(),
    staleTime: TRACKER_STALE.watchlist,
    queryFn: () => eventsFn(),
  });

  const groups = groupsQ.data ?? [];
  const players = groups.reduce((sum, g) => sum + (g.member_count ?? 0), 0);
  const trackedEvents = eventsQ.data?.events.length ?? 0;
  const missingTeeTimes = groups.reduce((s, g) => s + (g.missing_tee_times ?? 0), 0);
  const recentChanges = groups.reduce((s, g) => s + (g.recent_changes ?? 0), 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-500/10 text-cyan-500 ring-1 ring-cyan-500/20">
            <Radar className="h-4 w-4" />
          </span>
          <h2 className="truncate text-[15px] font-semibold">Players and events you track</h2>
        </div>
        <Link
          to="/tracker"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Open Trackers <ArrowRight className="h-3 w-3" />
        </Link>
      </header>
      <div className="space-y-3 p-4">
        {groupsQ.isPending || eventsQ.isPending ? (
          <Skeleton className="h-20 w-full rounded-lg" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric value={players} label="Players tracked" to="/tracker" />
              <Metric value={groups.length} label="Crew trackers" to="/tracker" />
              <Metric value={trackedEvents} label="Events tracked" to="/tracker" />
              <Metric value={missingTeeTimes} label="Tee times missing" to="/tracker" warn />
            </div>
            <Link
              to="/tracker"
              className="inline-block text-xs text-muted-foreground hover:text-primary"
            >
              {recentChanges
                ? `${recentChanges} tee time or field change${recentChanges === 1 ? "" : "s"} in the last day.`
                : "No schedule changes since you last looked."}
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
