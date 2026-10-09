import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link2, Loader2, Play, RefreshCcw } from "lucide-react";

import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { DataIntelTabs } from "@/components/admin/data-intel-tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/lib/current-user";
import { useAdminAccess } from "@/lib/admin-access";
import {
  getDgpIngestStatus,
  getDgpUnmatchedMolds,
  ingestDgpBatch,
  relinkDgpDiscs,
} from "@/lib/dgp-ingest.functions";

export const Route = createFileRoute("/_authenticated/admin/disc-intel")({
  component: DiscIntelAdmin,
  head: () => ({
    meta: [
      { title: "Disc intelligence · Admin · DG Dashboard" },
      {
        name: "description",
        content:
          "Admin console for the skill-group disc survey knowledge base: ingest batches, coverage and unmatched molds.",
      },
      { property: "og:title", content: "Disc intelligence · Admin · DG Dashboard" },
      {
        property: "og:description",
        content: "Ingest and monitor the skill-group disc survey knowledge base.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const BATCH_SIZE = 16;
const OFFSET_KEY = "dgp:ingest-offset";

function DiscIntelAdmin() {
  const { user, loading } = useSession();
  const { isAdmin } = useAdminAccess();
  const qc = useQueryClient();
  // Local hint only — the saved read history on the server is the real record,
  // so progress survives cleared storage or a different device.
  const [localOffset, setLocalOffsetState] = useState(() => {
    if (typeof window === "undefined") return 0;
    const stored = Number(window.localStorage.getItem(OFFSET_KEY));
    return Number.isFinite(stored) && stored >= 0 ? stored : 0;
  });
  const setLocalOffset = (next: number) => {
    setLocalOffsetState(next);
    if (typeof window !== "undefined") window.localStorage.setItem(OFFSET_KEY, String(next));
  };

  const status = useServerFn(getDgpIngestStatus);
  const unmatched = useServerFn(getDgpUnmatchedMolds);
  const ingest = useServerFn(ingestDgpBatch);
  const relinkDiscs = useServerFn(relinkDgpDiscs);

  const statusQ = useQuery({
    queryKey: ["dgp", "status"],
    enabled: !!user && isAdmin,
    queryFn: () => status(),
  });

  const serverOffset = statusQ.data?.next_offset ?? 0;
  const totalPages = statusQ.data?.total_pages ?? 0;
  const finished = totalPages > 0 && (statusQ.data?.pages_read ?? 0) >= totalPages;
  // Never restart from the beginning while pages remain unread.
  const offset = finished ? 0 : Math.max(serverOffset, localOffset);

  const unmatchedQ = useQuery({
    queryKey: ["dgp", "unmatched"],
    enabled: !!user && isAdmin,
    queryFn: () => unmatched(),
  });

  const runBatch = useMutation({
    mutationFn: () => ingest({ data: { offset, limit: BATCH_SIZE } }),

    onSuccess: (result) => {
      setLocalOffset(result.next_offset ?? 0);
      toast.success(
        `Read ${result.pages_fetched} pages · ${result.profiles_written} shot profiles · ${result.molds_created} discs added${
          result.failures ? ` · ${result.failures} failed` : ""
        }`,
      );
      qc.invalidateQueries({ queryKey: ["dgp"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const relink = useMutation({
    mutationFn: () => relinkDiscs(),
    onSuccess: (result) => {
      toast.success(
        `Added ${result.created} discs · linked ${result.linked}${
          result.skipped ? ` · ${result.skipped} skipped` : ""
        }`,
      );
      qc.invalidateQueries({ queryKey: ["dgp"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (loading) return null;
  if (!isAdmin) {
    return (
      <PageShell>
        <PageHeader
          title="Disc intelligence"
          description="This console is limited to platform admins."
        />
      </PageShell>
    );
  }

  const s = statusQ.data;

  return (
    <PageShell>
      <PageHeader
        title="Disc intelligence"
        description="Skill-group survey data: which discs players at each rating band actually throw."
        primaryAction={
          <Button
            onClick={() => runBatch.mutate()}
            disabled={runBatch.isPending}
            className="min-h-10"
          >
            {runBatch.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Read next {BATCH_SIZE} pages
          </Button>
        }
        secondaryAction={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="min-h-10"
              onClick={() => relink.mutate()}
              disabled={relink.isPending}
            >
              {relink.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="mr-2 h-4 w-4" />
              )}
              Add &amp; match discs
            </Button>
            <Button
              variant="outline"
              className="min-h-10"
              onClick={() => qc.invalidateQueries({ queryKey: ["dgp"] })}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        }
      />
      <DataIntelTabs />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label={finished ? "All pages read" : "Next page"}
          value={
            finished
              ? `${s?.pages_read ?? 0} / ${s?.total_pages ?? "—"}`
              : `${offset + 1} / ${s?.total_pages ?? "—"}`
          }
        />

        <Stat label="Skill groups" value={s?.skill_groups ?? "—"} />
        <Stat label="Shot profiles" value={s?.profiles ?? "—"} />
        <Stat label="Answers" value={s?.answers ?? "—"} />
        <Stat label="Submissions" value={s?.total_submissions ?? "—"} />
        <Stat label="Discs matched" value={s ? `${s.matched_molds}/${s.disc_answers}` : "—"} />
        <Stat label="Added from survey" value={s?.survey_molds ?? "—"} />
      </div>

      <section className="mt-6 rounded-lg border">
        <div className="border-b px-4 py-3 text-sm font-semibold">Recent reads</div>
        {(s?.recent_runs ?? []).length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Nothing read yet. Start with the button above — each run takes one batch of pages.
          </p>
        ) : (
          <ul className="divide-y">
            {(s?.recent_runs ?? []).map((run) => (
              <li key={run.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="tabular-nums text-muted-foreground">
                  {new Date(run.started_at).toLocaleString()}
                </span>
                <Badge variant="secondary" className="font-normal">
                  {run.pages_fetched} pages
                </Badge>
                <Badge variant="secondary" className="font-normal">
                  {run.profiles_written} profiles
                </Badge>
                <Badge variant="secondary" className="font-normal">
                  {run.answers_written} answers
                </Badge>
                {run.failures > 0 && <Badge variant="destructive">{run.failures} failed</Badge>}
                <span className="text-xs text-muted-foreground">{run.notes}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-lg border">
        <div className="border-b px-4 py-3 text-sm font-semibold">
          Survey discs we could not add
        </div>
        {(unmatchedQ.data ?? []).length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Every disc named in the survey is in our disc library.
          </p>
        ) : (
          <ul className="divide-y">
            {(unmatchedQ.data ?? []).slice(0, 40).map((row) => (
              <li
                key={`${row.brand}-${row.mold}`}
                className="flex items-start justify-between gap-3 px-4 py-2 text-sm"
              >
                <span>
                  {row.mold ?? "Unknown mold"}
                  {row.brand ? <span className="text-muted-foreground"> · {row.brand}</span> : null}
                  <span className="block text-xs text-muted-foreground">{row.reason}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">{row.submissions}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold tabular-nums">{value}</div>
    </div>
  );
}
