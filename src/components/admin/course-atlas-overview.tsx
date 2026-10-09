import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CheckCircle2, Clock, Loader2, Play, RefreshCw, Square, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getAtlasOverview, startAtlasUpdate, stopAtlasUpdate, type AtlasOverview } from "@/lib/course-atlas/atlas.functions";

const STAGES: Array<[string, string]> = [
  ["discover", "Discovering courses"],
  ["listings", "Reading listings & par"],
  ["locations", "Finding locations"],
  ["maps", "Building course maps"],
  ["layouts", "Building layouts"],
  ["repairs", "Retrying earlier failures"],
];

const RESULTS: Array<[string, string]> = [
  ["coursesAdded", "Courses discovered"],
  ["listingsRead", "Listings read"],
  ["parFilled", "Holes given real par"],
  ["locationsImproved", "Locations improved"],
  ["sceneLinks", "Event venues linked"],
  ["mapSpotsFilled", "Tee & basket spots filled"],
  ["layoutsCreated", "Layouts created"],
  ["layoutsUpdated", "Layouts improved"],
  ["repairsDone", "Repairs finished"],
];

function when(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function useAtlasOverview() {
  const fetchFn = useServerFn(getAtlasOverview);
  return useQuery({
    queryKey: ["course-atlas-overview"],
    queryFn: () => fetchFn(),
    refetchInterval: (q) => ((q.state.data as AtlasOverview | undefined)?.run?.status === "running" ? 20_000 : false),
  });
}

export function CourseAtlasOverview({ onReview }: { onReview: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useAtlasOverview();
  const start = useServerFn(startAtlasUpdate);
  const stop = useServerFn(stopAtlasUpdate);
  const [busy, setBusy] = useState(false);
  const run = data?.run ?? null;
  const running = run?.status === "running";

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't go through — try again.");
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: ["course-atlas-overview"] });
    }
  };

  if (isLoading || !data) {
    return <div className="h-40 animate-pulse rounded-2xl border border-border bg-card" />;
  }

  const delayed = running && Object.values(run?.stages ?? {}).some((s) => s.delayed);
  const statusLabel = running ? (delayed ? "Running — one source is slow, retrying" : "Running") : run?.status === "done" ? "Up to date" : run ? "Stopped" : "Not run yet";
  const StatusIcon = running ? Loader2 : run?.status === "done" ? CheckCircle2 : delayed ? TriangleAlert : Clock;

  const kpis: Array<[string, number]> = [
    ["U.S. courses", data.courses],
    ["On the directory map", data.onMap],
    ["With usable course maps", data.usableMaps],
    ["Fully mapped & verified", data.completeMaps],
    ["Still need a location", data.unlocated],
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Course Atlas status</h2>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <StatusIcon className={`h-4 w-4 ${running ? "animate-spin motion-reduce:animate-none text-primary" : run?.status === "done" ? "text-success" : ""}`} />
              {statusLabel} · Last update {when(run?.last_pass_at ?? null)}
            </p>
          </div>
          <div className="flex gap-2">
            {running ? (
              <Button variant="outline" className="gap-2" disabled={busy} onClick={() => act(() => stop(), "Update stopped. Start again any time — it picks up where it left off.")}>
                <Square className="h-4 w-4" /> Stop update
              </Button>
            ) : null}
            <Button className="gap-2" disabled={busy || running} onClick={() => act(() => start(), "Update started. It keeps running in the background — you can close this page.")}>
              {run ? <RefreshCw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              Update Course Atlas
            </Button>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {kpis.map(([label, n]) => (
            <div key={label} className="rounded-lg border border-border px-3 py-2">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{n.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      </section>

      {run ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">Latest pass</h3>
            <ul className="mt-2 divide-y divide-border">
              {STAGES.map(([key, label]) => {
                const s = run.stages?.[key];
                const text = !s ? "Waiting" : s.delayed ? "Source slow — retrying" : s.worked > 0 ? `${s.worked.toLocaleString()} handled` : "Nothing new";
                return (
                  <li key={key} className="flex items-center justify-between py-2 text-sm">
                    <span>{label}</span>
                    <span className={s?.delayed ? "text-warning" : "text-muted-foreground"}>{text}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-sm text-muted-foreground">
              {run.passes.toLocaleString()} passes since {when(run.started_at)}. A pass runs about every 5 minutes; three quiet passes in a row finish the update.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">This update</h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {RESULTS.map(([key, label]) => (
                <div key={key} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-semibold tabular-nums">+{(run.totals?.[key] ?? 0).toLocaleString()}</dd>
                </div>
              ))}
            </dl>
            {(run.totals?.failed ?? 0) > 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {run.totals.failed.toLocaleString()} reads didn't go through and will be retried.
              </p>
            ) : null}
            {data.review.total > 0 ? (
              <Button variant="outline" className="mt-3" onClick={onReview}>
                Review {data.review.total.toLocaleString()} issues
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
