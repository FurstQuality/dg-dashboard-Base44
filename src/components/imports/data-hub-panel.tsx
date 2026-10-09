import { useQuery } from "@tanstack/react-query";

import { IngestJobList } from "@/components/ingest/ingest-job-list";

import { listRecentIngestJobs } from "@/lib/data-connectors.functions";

export function DataHubPage() {
  return (
    <div className="mx-auto max-w-[1560px] space-y-6 p-4">
      <header>
        <h1 className="font-graphic text-3xl text-primary sm:text-4xl">Recent Activity</h1>
        <p className="text-muted-foreground">
          The latest imports and syncs we ran for you, newest first.
        </p>
      </header>

      <HistoryPanel />
    </div>
  );
}

/* ------------------- History ------------------- */
function HistoryPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["ingest-jobs"],
    queryFn: () => listRecentIngestJobs(),
  });

  if (isLoading)
    return <div className="p-6 text-muted-foreground">Loading your data health report…</div>;
  return <IngestJobList jobs={data?.jobs ?? []} limit={25} />;
}
