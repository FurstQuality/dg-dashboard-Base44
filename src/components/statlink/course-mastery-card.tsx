import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trophy, TrendingUp, Target } from "lucide-react";
import { SourceBadge } from "@/lib/statlink-taxonomy";

import { getCourseMastery } from "@/lib/stats.functions";
import { statsKeys, STATS_STALE } from "@/lib/stats-queries";
import { StatlinkErrorState, StatlinkPanelSkeleton } from "@/components/statlink/statlink-states";

/**
 * Event mastery — VERIFIED DATA ONLY.
 * Grouping and trend math happen in the getCourseMastery server function, so
 * this card only renders the summary rows it receives. PDGA-verified round
 * ratings only; mock DGD estimates from UDisc are intentionally excluded.
 */
export function CourseMasteryCard({
  userId,
  targetRating,
  limit = 6,
}: {
  userId?: string | null;
  targetRating?: number | null;
  limit?: number;
}) {
  const fetchMastery = useServerFn(getCourseMastery);
  const q = useQuery({
    queryKey: statsKeys.mastery(userId ?? undefined, limit),
    queryFn: () => fetchMastery({ data: { limit } }),
    staleTime: STATS_STALE.aggregates,
  });

  const rows = q.data?.events ?? null;

  if (q.isError) {
    return (
      <StatlinkErrorState
        title="Event mastery didn't load"
        message="We couldn't reach your PDGA round history just now."
        onRetry={() => void q.refetch()}
        retrying={q.isFetching}
      />
    );
  }
  if (q.isPending || rows === null) {
    return <StatlinkPanelSkeleton label="Loading event mastery…" rows={3} />;
  }
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Event mastery uses PDGA-verified round ratings only. Play the same sanctioned event twice or
        more, or{" "}
        <Link to="/settings/imports" className="text-primary hover:underline">
          sync your PDGA history
        </Link>
        , to see mastery here.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <Trophy className="h-4 w-4 text-primary" aria-hidden="true" />
        <div className="text-sm font-semibold">Event mastery</div>
        <SourceBadge ratingClass="official_pdga" compact />

        {typeof targetRating === "number" ? (
          <span className="ml-auto text-xs text-muted-foreground">
            Target rating: {targetRating}
          </span>
        ) : null}
      </div>
      <div className="divide-y divide-border">
        {rows.map((m) => {
          const gap =
            typeof targetRating === "number" && m.avg_rating != null
              ? m.avg_rating - targetRating
              : null;
          return (
            <div
              key={m.key}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2.5"
            >
              <div className="min-w-[9rem] flex-1">
                <div className="truncate text-sm font-medium">{m.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>
                    {m.plays} PDGA round{m.plays === 1 ? "" : "s"}
                  </span>
                  {m.best_to_par !== null ? (
                    <span>
                      Best{" "}
                      {m.best_to_par > 0
                        ? `+${m.best_to_par}`
                        : m.best_to_par === 0
                          ? "E"
                          : m.best_to_par}
                    </span>
                  ) : null}
                  {m.best_rating != null ? <span>Peak {m.best_rating}</span> : null}
                </div>
              </div>
              <div className="flex items-center gap-3 text-right">
                {m.avg_rating != null ? (
                  <div>
                    <div className="text-sm font-semibold tabular-nums">{m.avg_rating}</div>
                    <div className="text-[11px] text-muted-foreground">avg PDGA rating</div>
                  </div>
                ) : null}
                {gap !== null ? (
                  <div
                    className={gap >= 0 ? "text-emerald-500" : "text-amber-500"}
                    title="Gap to your target rating"
                  >
                    <Target className="mx-auto h-3.5 w-3.5" aria-hidden="true" />
                    <div className="text-[11px] tabular-nums">{gap > 0 ? `+${gap}` : gap}</div>
                  </div>
                ) : null}
                {m.trend !== null ? (
                  <div
                    className={m.trend >= 0 ? "text-emerald-500" : "text-red-500"}
                    title="Recent form versus your earlier rounds here"
                  >
                    <TrendingUp
                      className={`mx-auto h-3.5 w-3.5 ${m.trend < 0 ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                    <div className="text-[11px] tabular-nums">
                      {m.trend > 0 ? `+${m.trend}` : m.trend}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
