import { WidgetNote, WidgetSourceNote } from "@/components/shell";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Crosshair, Dumbbell, Target } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getPracticeSummary } from "@/lib/play.functions";
import { PLAY_STALE, playKeys } from "@/lib/play-queries";

/**
 * Practice snapshot for the Play overview — one widget per Play tab so the
 * overview always summarises the whole section.
 */
export function PlayPracticeCard({ userId }: { userId: string | null | undefined }) {
  const fetchSummary = useServerFn(getPracticeSummary);
  const { data, isLoading } = useQuery({
    queryKey: playKeys.practiceSummary(userId ?? undefined),
    enabled: !!userId,
    staleTime: PLAY_STALE.short,
    queryFn: () => fetchSummary({}),
  });

  const range = data?.range;
  const putting = data?.putting;

  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <Dumbbell className="h-4 w-4" />
          </span>
          Practice
        </h2>
        <Link
          to="/practice"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Open practice <ArrowRight className="h-3 w-3" />
        </Link>
      </header>
      <WidgetNote className="px-4 pt-3">
        Your practice work: field-work sessions at the range and putting reps, with your latest
        totals.
      </WidgetNote>
      <WidgetSourceNote
        className="px-4"
        sources={["Practice sessions you log in DG Dashboard"]}
        note="Practice is kept separate from played rounds and is never rated."
      />

      <div className="p-4">
        {isLoading ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              to="/range"
              className="rounded-xl border border-border/60 p-3 transition hover:border-primary/50"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Target className="h-3.5 w-3.5 text-primary" /> Driving range
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{range?.throws ?? 0}</div>
              <p className="text-xs text-muted-foreground">
                throws logged across {range?.sessions ?? 0} session
                {(range?.sessions ?? 0) === 1 ? "" : "s"}
              </p>
            </Link>

            <Link
              to="/putting"
              className="rounded-xl border border-border/60 p-3 transition hover:border-primary/50"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Crosshair className="h-3.5 w-3.5 text-community-green" /> Putting green
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {putting?.makePct ?? 0}%
              </div>
              <p className="text-xs text-muted-foreground">
                make rate over {putting?.putts ?? 0} putt{(putting?.putts ?? 0) === 1 ? "" : "s"}
              </p>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
