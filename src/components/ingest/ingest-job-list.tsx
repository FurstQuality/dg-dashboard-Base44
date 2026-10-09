import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type IngestJobRow = {
  id: string;
  kind: string;
  status: string;
  source_url?: string | null;
  error?: string | null;
  created_at: string;
};

const KIND_LABEL: Record<string, string> = {
  club: "Club page",
  tournament: "Tournament page",
  course: "Course page",
  event: "Event page",
  facebook: "Facebook page",
  instagram: "Instagram page",
  profile: "Player profile",
  udisc: "UDisc CSV",
  pdga: "PDGA sync",
  dgs: "Disc Golf Scene",
};

function relative(iso: string) {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Shared, compact list of recent ingest jobs (data_ingest_jobs rows).
 * Use anywhere sync/scraper history should surface.
 */
export function IngestJobList({
  jobs,
  emptyLabel = "No sync activity yet — jobs land here as they run.",
  limit,
  className,
}: {
  jobs: IngestJobRow[];
  emptyLabel?: string;
  limit?: number;
  className?: string;
}) {
  const items = limit ? jobs.slice(0, limit) : jobs;
  if (!items.length) {
    return (
      <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className={cn("space-y-2", className)}>
      {items.map((j) => {
        const label = KIND_LABEL[j.kind] ?? j.kind;
        const variant =
          j.status === "completed"
            ? "default"
            : j.status === "failed"
              ? "destructive"
              : "secondary";
        return (
          <div
            key={j.id}
            className="flex items-start justify-between gap-3 rounded border p-3 text-sm"
          >
            <div className="min-w-0">
              <div className="font-medium">{label}</div>
              <div className="truncate text-xs text-muted-foreground">
                {relative(j.created_at)}
                {j.source_url ? ` · ${j.source_url}` : ""}
              </div>
              {j.status === "failed" && j.error ? (
                <div className="mt-1 text-xs text-rose-600 dark:text-rose-400">{j.error}</div>
              ) : null}
            </div>
            <Badge variant={variant}>{j.status}</Badge>
          </div>
        );
      })}
    </div>
  );
}
