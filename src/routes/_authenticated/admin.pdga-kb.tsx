import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Database as DatabaseIcon,
  Play,
  RefreshCcw,
  Link as LinkIcon,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Clock,
} from "lucide-react";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { DataIntelTabs } from "@/components/admin/data-intel-tabs";
import { IngestPanel } from "@/components/admin/ingest-panel";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useSession } from "@/lib/current-user";
import { useAdminAccess } from "@/lib/admin-access";
import {
  AdminErrorState,
  AdminPanelSkeleton,
  AdminEmptyState,
} from "@/components/admin/admin-states";
import {
  pdgaKbStats,
  pdgaKbRecentJobs,
  pdgaIngestUrl,
  enqueueSeedBatch,
  processSeedBatch,
  pdgaKbRetryJob,
} from "@/lib/pdga-kb.functions";

export const Route = createFileRoute("/_authenticated/admin/pdga-kb")({
  component: PdgaKbAdmin,
  head: () => ({
    meta: [
      { title: "PDGA knowledgebase · Admin · DG Dashboard" },
      {
        name: "description",
        content: "Super-admin console for the PDGA course, player, and event knowledgebase.",
      },
      { property: "og:title", content: "PDGA knowledgebase · Admin · DG Dashboard" },
      {
        property: "og:description",
        content: "Super-admin console for the PDGA course, player, and event knowledgebase.",
      },
    ],
  }),
});

/** How often auto-run processes the next batch (rate-limit friendly). */
const AUTO_INTERVAL_MS = 60_000;
const AUTO_RUN_KEY = "pdga-kb:auto-run";

function PdgaKbAdmin() {
  const { user, loading } = useSession();
  const { isAdmin } = useAdminAccess();
  const qc = useQueryClient();

  const stats = useServerFn(pdgaKbStats);
  const jobs = useServerFn(pdgaKbRecentJobs);
  const ingest = useServerFn(pdgaIngestUrl);
  const enqueue = useServerFn(enqueueSeedBatch);
  const process = useServerFn(processSeedBatch);
  const retry = useServerFn(pdgaKbRetryJob);

  const statsQ = useQuery({
    queryKey: ["pdga-kb", "stats"],
    enabled: !!user && isAdmin,
    queryFn: () => stats(),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
  const jobsQ = useQuery({
    queryKey: ["pdga-kb", "jobs"],
    enabled: !!user && isAdmin,
    queryFn: () => jobs(),
    staleTime: 10_000,
    refetchInterval: 10_000,
  });

  const [url, setUrl] = useState("");
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["pdga-kb"] });
  };

  const ingestM = useMutation({
    mutationFn: () => ingest({ data: { url: url.trim() } }),
    onSuccess: () => {
      toast.success("Ingested from PDGA");
      setUrl("");
      invalidateAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const enqueueM = useMutation({
    mutationFn: () => enqueue({ data: { count: 10 } }),
    onSuccess: (r) => {
      toast.success(`Queued ${r.queued} seed jobs`);
      invalidateAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const processM = useMutation({
    mutationFn: () => process({ data: { batch: 3 } }),
    onSuccess: (r) => {
      toast.success(`Processed ${r.processed}`);
      invalidateAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const retryM = useMutation({
    mutationFn: (id: string) => retry({ data: { id } }),
    onSuccess: () => {
      toast.success("Requeued");
      invalidateAll();
    },
  });

  // ---- Auto-run: keeps queueing and processing batches without clicks ----
  const [autoRun, setAutoRun] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(AUTO_RUN_KEY) === "1";
  });
  const [autoStatus, setAutoStatus] = useState("Waiting for next batch…");
  const runningRef = useRef(false);
  const pendingRef = useRef(0);
  pendingRef.current = statsQ.data?.pending ?? 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AUTO_RUN_KEY, autoRun ? "1" : "0");
  }, [autoRun]);

  const runAutoTick = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      if (pendingRef.current === 0) {
        setAutoStatus("Queueing new seed jobs…");
        await enqueue({ data: { count: 10 } });
      }
      setAutoStatus("Processing batch…");
      const r = await process({ data: { batch: 3 } });
      setAutoStatus(
        r.processed > 0
          ? `Processed ${r.processed} · next batch in ${AUTO_INTERVAL_MS / 1000}s`
          : `Queue empty · rechecking in ${AUTO_INTERVAL_MS / 1000}s`,
      );
      invalidateAll();
    } catch (e) {
      setAutoStatus(
        `Paused after an error: ${e instanceof Error ? e.message : "unknown"} · retrying`,
      );
    } finally {
      runningRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enqueue, process]);

  useEffect(() => {
    if (!autoRun || !user || !isAdmin) return;
    void runAutoTick();
    const id = window.setInterval(() => void runAutoTick(), AUTO_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [autoRun, user, isAdmin, runAutoTick]);

  if (loading) return null;
  if (!user || !isAdmin) {
    return (
      <PageShell>
        <PageHeader title="Admin only" description="Super-admin access is required." />
        <div className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4" /> Access denied.
        </div>
      </PageShell>
    );
  }

  const s = statsQ.data;
  const jobList = jobsQ.data?.jobs ?? [];

  return (
    <PageShell>
      <PageHeader
        title="PDGA knowledgebase"
        description="Continuously ingest courses, players, and events from PDGA to enrich the app. Runs slowly to respect PDGA rate limits."
        eyebrow="Super admin"
      />
      <DataIntelTabs />

      <IngestPanel enabled={!!user && isAdmin} />



      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Courses indexed" value={s?.courses ?? 0} />
        <Stat label="Players indexed" value={s?.players ?? 0} />
        <Stat label="Events indexed" value={s?.events ?? 0} />
        <Stat label="Pending jobs" value={s?.pending ?? 0} />
        <Stat label="Failed jobs" value={s?.failed ?? 0} tone={s && s.failed > 0 ? "warn" : "ok"} />
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 font-semibold">
            <LinkIcon className="h-4 w-4" /> Ingest a PDGA URL
          </div>
          <p className="text-xs text-muted-foreground">
            Paste any pdga.com course, player, or event URL — dispatched to the right scraper.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="https://www.pdga.com/course-directory/course/1234"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button onClick={() => ingestM.mutate()} disabled={!url.trim() || ingestM.isPending}>
              {ingestM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ingest"}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold">
              <DatabaseIcon className="h-4 w-4" /> Bulk read: courses and players
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Auto-run</span>
              <Switch checked={autoRun} onCheckedChange={setAutoRun} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Reads PDGA course pages (location, holes, designer) for every course linked to PDGA, then
            player profiles for known PDGA numbers. Courses and players always run first; leftover event
            jobs only run when nothing else is waiting. With auto-run on, batches run every {AUTO_INTERVAL_MS / 1000}s
            and new jobs are queued when the queue empties, at a slow pace so PDGA doesn't block us.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => enqueueM.mutate()}
              disabled={enqueueM.isPending}
            >
              {enqueueM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>Queue courses and players</>
              )}
            </Button>
            <Button onClick={() => processM.mutate()} disabled={processM.isPending}>
              {processM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" /> Process next batch
                </>
              )}
            </Button>
            {autoRun ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {autoStatus}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2 font-semibold">
            <Clock className="h-4 w-4" /> Recent sync jobs
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["pdga-kb", "jobs"] })}
          >
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
        <div className="divide-y">
          {jobsQ.isError ? (
            <AdminErrorState
              className="m-3"
              title="We couldn't load recent sync jobs"
              message="The job history didn't come back. Try again in a moment."
              onRetry={() => void jobsQ.refetch()}
              retrying={jobsQ.isFetching}
            />
          ) : jobsQ.isPending ? (
            <AdminPanelSkeleton className="m-3" rows={3} />
          ) : jobList.length === 0 ? (
            <AdminEmptyState
              className="m-3"
              title="No sync jobs yet"
              message="Queue a page above and its progress will show up here."
            />
          ) : (
            jobList.map((j) => (
              <div
                key={j.id}
                className="grid grid-cols-[100px_1fr_auto_auto] items-center gap-3 p-3 text-sm"
              >
                <span className="text-xs uppercase text-muted-foreground">{j.kind}</span>
                <span className="truncate font-mono text-xs">{j.target}</span>
                <StatusPill status={j.status} httpStatus={j.http_status} />
                {j.status === "failed" ? (
                  <Button size="sm" variant="ghost" onClick={() => retryM.mutate(j.id)}>
                    Retry
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {j.finished_at
                      ? new Date(j.finished_at).toLocaleTimeString()
                      : new Date(j.created_at).toLocaleTimeString()}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </PageShell>
  );
}

function Stat({
  label,
  value,
  tone = "ok",
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 font-display text-3xl font-semibold tabular-nums ${
          tone === "warn" ? "text-amber-500" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function StatusPill({ status, httpStatus }: { status: string; httpStatus: number | null }) {
  const map: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    running: "bg-sky-500/15 text-sky-600",
    success: "bg-emerald-500/15 text-emerald-600",
    failed: "bg-rose-500/15 text-rose-600",
    skipped: "bg-muted text-muted-foreground",
  };
  const icon =
    status === "success" ? (
      <CheckCircle2 className="h-3 w-3" />
    ) : status === "failed" ? (
      <AlertTriangle className="h-3 w-3" />
    ) : status === "running" ? (
      <Loader2 className="h-3 w-3 animate-spin" />
    ) : (
      <Clock className="h-3 w-3" />
    );
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        map[status] ?? "bg-muted"
      }`}
    >
      {icon}
      {status}
      {httpStatus ? ` · ${httpStatus}` : ""}
    </span>
  );
}
