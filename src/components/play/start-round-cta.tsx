import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Play, ArrowRight, Users, CalendarDays, Target, Plus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/current-user";
import {
  getRoundHistory,
  type NativeRoundRow,
  type RoundHistoryResult,
} from "@/lib/round-history.functions";
import { statsKeys, STATS_STALE } from "@/lib/stats-queries";
import { formatToPar } from "@/lib/score-display";
import { ActiveRoundCard } from "@/components/play/play-rounds-panel";

/**
 * Play Now — one adaptive surface. With a round in progress, Resume is the
 * strongest action on the page and starting another round is secondary.
 */
export function StartRoundCta() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const roundHistoryFn = useServerFn(getRoundHistory);
  const historyKey = statsKeys.roundHistory(user?.id);
  const { data: history } = useQuery({
    queryKey: historyKey,
    queryFn: () => roundHistoryFn({ data: {} }),
    enabled: !!user,
    staleTime: STATS_STALE.rounds,
  });

  const inProgress: NativeRoundRow[] = useMemo(
    () => (history?.native ?? []).filter((r) => r.status === "in_progress"),
    [history],
  );

  const patchNative = (update: (rows: NativeRoundRow[]) => NativeRoundRow[]) => {
    queryClient.setQueryData<RoundHistoryResult>(historyKey, (prev) =>
      prev ? { ...prev, native: update(prev.native) } : prev,
    );
  };

  const [main, ...others] = inProgress;

  if (main) {
    return (
      <section className="rounded-xl border border-primary/50 bg-primary/[0.06] p-3 sm:p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full rounded-full bg-primary/60 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Round in progress
            </div>
            <div className="mt-1 truncate font-display text-xl font-bold">
              {main.course?.name ?? "Your round"}
            </div>
            <div className="truncate text-sm text-muted-foreground">
              {[main.layout_name, main.holes_total ? `${main.holes_scored} / ${main.holes_total} holes` : `${main.holes_scored} holes`, formatToPar(main.toPar)]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
          <Button asChild size="lg" className="h-12 px-5 text-base font-bold">
            <Link to="/play/$roundId" params={{ roundId: main.id }}>
              <Play className="h-5 w-5" />
              <span className="ml-1">Resume round</span>
            </Link>
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link to="/play/pick-course" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <Plus className="h-3.5 w-3.5" /> Start a different round
          </Link>
        </div>
        {others.length ? (
          <div className="mt-3 grid gap-2">
            {others.map((r) => (
              <ActiveRoundCard
                key={r.id}
                compact
                r={r}
                onDeleted={(id) => patchNative((rows) => rows.filter((x) => x.id !== id))}
                onUpdated={(id, patch) =>
                  patchNative((rows) => rows.map((x) => (x.id === id ? { ...x, ...patch } : x)))
                }
              />
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2 sm:flex-row sm:items-center">
      <Button asChild className="h-auto shrink-0 justify-between gap-3 rounded-lg px-4 py-2.5 text-left sm:w-64">
        <Link to="/play/pick-course" className="min-w-0">
          <span className="flex min-w-0 items-center gap-2.5">
            <Play className="h-4 w-4 shrink-0" />
            <span className="min-w-0">
              <span className="block font-display text-base font-bold leading-tight">Start a round</span>
              <span className="block truncate text-xs font-medium opacity-80">Pick a course, set your card</span>
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </Link>
      </Button>
      <div className="flex flex-wrap gap-1.5 px-1">
        <Button asChild size="sm" variant="ghost">
          <Link to="/friends"><Users className="h-4 w-4" /><span className="ml-1">Find players</span></Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link to="/events"><CalendarDays className="h-4 w-4" /><span className="ml-1">Find an event</span></Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link to="/practice"><Target className="h-4 w-4" /><span className="ml-1">Practice</span></Link>
        </Button>
      </div>
    </section>
  );
}
