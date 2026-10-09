/**
 * Admin view of the always-on outside-data crawler: what it is working on,
 * how much of today's allowance is left, coverage by state, and controls to
 * run a batch now, pause it, or put failed items back in line.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pause, Play, RefreshCcw, Radar } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  getIngestOverview,
  runIngestNow,
  setIngestPaused,
  retryDeadIngestItems,
} from "@/lib/ingest.functions";

const SOURCE_LABEL: Record<string, string> = {
  pdga: "PDGA",
  disc_golf_scene: "Disc Golf Scene",
  udisc: "UDisc",
};

const KIND_LABEL: Record<string, string> = {
  directory: "Event listings",
  event: "Event details",
  course: "Courses",
  player: "Players",
  geocode: "Locations",
};

function timeAgo(value: string | null): string {
  if (!value) return "never";
  const ms = Date.now() - Date.parse(value);
  if (!Number.isFinite(ms)) return "never";
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

export function IngestPanel({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const overview = useServerFn(getIngestOverview);
  const runNow = useServerFn(runIngestNow);
  const pause = useServerFn(setIngestPaused);
  const retry = useServerFn(retryDeadIngestItems);

  const q = useQuery({
    queryKey: ["ingest", "overview"],
    enabled,
    queryFn: () => overview(),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const runMutation = useMutation({
    mutationFn: () => runNow(),
    onSuccess: (r) => {
      toast.success(
        r.ran
          ? `Fetched ${r.succeeded} of ${r.claimed}, queued ${r.discovered} new items`
          : (r.reason ?? "Nothing to do right now"),
      );
      qc.invalidateQueries({ queryKey: ["ingest"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "That batch didn't run"),
  });

  const pauseMutation = useMutation({
    mutationFn: (paused: boolean) => pause({ data: { paused } }),
    onSuccess: (r) => {
      toast.success(r.paused ? "Data collecting paused" : "Data collecting running again");
      qc.invalidateQueries({ queryKey: ["ingest"] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => retry(),
    onSuccess: (r) => {
      toast.success(`${r.requeued} item(s) back in line`);
      qc.invalidateQueries({ queryKey: ["ingest"] });
    },
  });

  const data = q.data;
  const pct = data?.budget.total ? Math.round((data.budget.used / data.budget.total) * 100) : 0;

  return (
    <section className="rounded-card border border-border bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Radar className="h-4 w-4 text-primary" aria-hidden />
            Live data collecting
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Works through PDGA, Disc Golf Scene and UDisc in the background — nearest states first —
            and never fetches more than today's allowance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
          >
            {runMutation.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCcw className="mr-1.5 h-4 w-4" aria-hidden />
            )}
            Run a batch now
          </Button>
          <Button
            size="sm"
            variant={data?.paused ? "default" : "ghost"}
            onClick={() => pauseMutation.mutate(!data?.paused)}
            disabled={pauseMutation.isPending}
          >
            {data?.paused ? (
              <Play className="mr-1.5 h-4 w-4" aria-hidden />
            ) : (
              <Pause className="mr-1.5 h-4 w-4" aria-hidden />
            )}
            {data?.paused ? "Resume" : "Pause"}
          </Button>
          {!!data?.queue.dead && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => retryMutation.mutate()}
              disabled={retryMutation.isPending}
            >
              Retry {data.queue.dead} stuck
            </Button>
          )}
        </div>
      </header>

      {q.isLoading && (
        <p className="mt-4 text-sm text-muted-foreground">Checking on the collector…</p>
      )}

      {data && (
        <div className="mt-4 space-y-4">
          {data.paused && (
            <p className="rounded-control border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              Paused — {data.pauseReason ?? "an admin stopped it"}. It will test one page on each
              pass and start again on its own once that works.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Waiting" value={data.queue.pending} />
            <Stat label="Finished" value={data.queue.success} />
            <Stat label="Stuck" value={data.queue.dead} />
            <Stat label="Last pass" value={timeAgo(data.lastRunAt)} />
          </div>

          <div className="rounded-control border border-border/60 bg-muted/20 p-3">
            <h3 className="text-sm font-medium">Data health</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Events on the map"
                value={`${data.health.events.placed} of ${data.health.events.total}`}
              />
              <Stat label="Events refreshed today" value={data.health.events.refreshedToday} />
              <Stat
                label="Courses on the map"
                value={`${data.health.courses.placed} of ${data.health.courses.total}`}
              />
              <Stat label="Player profiles stored" value={data.health.players} />
            </div>
            {!!data.health.eventsBySource.length && (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.health.eventsBySource.map((s) => (
                  <Badge key={s.source} variant="outline">
                    {SOURCE_LABEL[s.source] ?? s.source}: {s.total} events, {s.placed} mapped
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Today's page allowance</span>
              <span className="text-muted-foreground">
                {data.budget.used} of {data.budget.total}
              </span>
            </div>
            <Progress value={pct} className="mt-2 h-2" />
          </div>

          {!!data.byKind.length && (
            <div className="flex flex-wrap gap-2">
              {data.byKind.map((k) => (
                <Badge key={k.kind} variant="secondary">
                  {KIND_LABEL[k.kind] ?? k.kind}: {k.pending} waiting
                </Badge>
              ))}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">State</th>
                  <th className="py-2 pr-3">Wave</th>
                  <th className="py-2 pr-3">Events found</th>
                  <th className="py-2 pr-3">Last checked</th>
                </tr>
              </thead>
              <tbody>
                {data.regions.slice(0, 12).map((r) => (
                  <tr key={r.state} className="border-t border-border/60">
                    <td className="py-2 pr-3 font-medium">{r.state}</td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {r.ring === 0 ? "Home" : r.ring === 1 ? "Nearby" : `Wave ${r.ring}`}
                    </td>
                    <td className="py-2 pr-3">{r.events}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{timeAgo(r.lastSweptAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!!data.recentErrors.length && (
            <div>
              <h3 className="text-sm font-semibold">Recent problems</h3>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {data.recentErrors.map((e, i) => (
                  <li key={`${e.kind}-${e.target}-${i}`}>
                    {KIND_LABEL[e.kind] ?? e.kind} {e.target}: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-control border border-border bg-background px-3 py-2">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
