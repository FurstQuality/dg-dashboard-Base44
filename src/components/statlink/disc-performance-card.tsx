import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Disc, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SourceBadge } from "@/lib/statlink-taxonomy";

import { getDiscPerformance } from "@/lib/stats.functions";
import { statsKeys, STATS_STALE } from "@/lib/stats-queries";
import { StatlinkErrorState, StatlinkPanelSkeleton } from "@/components/statlink/statlink-states";

/**
 * Per-disc distance and shape trends. Aggregation happens in the
 * getDiscPerformance server function so the browser never downloads the
 * player's raw throw log.
 */
export function DiscPerformanceCard({ userId }: { userId: string | null }) {
  const fetchDiscs = useServerFn(getDiscPerformance);
  const q = useQuery({
    queryKey: statsKeys.discPerformance(userId ?? undefined),
    queryFn: () => fetchDiscs(),
    staleTime: STATS_STALE.aggregates,
  });

  const rows = q.data?.discs ?? null;

  if (q.isError) {
    return (
      <StatlinkErrorState
        title="Disc performance didn't load"
        message="We couldn't reach your throw log just now."
        onRetry={() => void q.refetch()}
        retrying={q.isFetching}
      />
    );
  }
  if (q.isPending || rows === null) {
    return <StatlinkPanelSkeleton label="Loading disc performance…" rows={3} />;
  }
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Log throws from the Digital Driving Range or during a round to see per-disc distance and
          shape trends.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-3">
          <Link to="/range">
            Open the Driving Range
            <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <Disc className="h-4 w-4 text-primary" aria-hidden="true" />
        <div className="text-sm font-semibold">Disc performance</div>
        <SourceBadge ratingClass="chainlink_calc" compact />
        <span className="ml-auto text-[11px] text-muted-foreground">

          Top {rows.length} by throws logged
        </span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div
            key={r.key}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2.5"
          >
            <div className="min-w-[9rem] flex-1">
              <div className="truncate text-sm font-medium">{r.label}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                {r.category ? (
                  <span className="capitalize">{r.category.replace(/_/g, " ")}</span>
                ) : null}
                <span>{r.count} throws</span>
                {r.top_shape ? (
                  <span className="capitalize">Mostly {r.top_shape.replace(/_/g, " ")}</span>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-4 text-right">
              {r.avg_ft != null ? (
                <div>
                  <div className="text-sm font-semibold tabular-nums">
                    {r.avg_ft}
                    <span className="text-[11px] text-muted-foreground"> ft</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">avg</div>
                </div>
              ) : null}
              {r.max_ft != null ? (
                <div>
                  <div className="text-sm font-semibold tabular-nums">
                    {r.max_ft}
                    <span className="text-[11px] text-muted-foreground"> ft</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">max</div>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
