import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ArrowRight, Sparkles, Swords, Trophy, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { listGamePlanEvents, analyzeEventOdds } from "@/lib/game-plan.functions";

type MatchInput = {
  eventId?: string;
  pdgaEventRef?: string;
  tournamentId?: string;
  leagueId?: string;
};

type Props = MatchInput & {
  className?: string;
  /** Compact single-line strip vs. full card. */
  variant?: "card" | "strip";
  /** Extra copy above the numbers, e.g. "Check your odds of winning". */
  headline?: string;
};

/**
 * EventOddsInsight — cross-link surface that previews the Monte-Carlo odds
 * for a specific event and deep-links into DG Statboard → Game Plan.
 *
 * The caller passes any of eventId / pdgaEventRef / tournamentId / leagueId;
 * we resolve to the caller's own scheduled-events row via listGamePlanEvents
 * (cached across the app). If the event isn't on the caller's plan yet, we
 * render a "Preview it in Game Plan" CTA instead of forcing an odds run.
 */
export function EventOddsInsight({
  eventId,
  pdgaEventRef,
  tournamentId,
  leagueId,
  className,
  variant = "card",
  headline = "Check your odds of winning this event",
}: Props) {
  const list = useServerFn(listGamePlanEvents);
  const analyze = useServerFn(analyzeEventOdds);

  const eventsQuery = useQuery({
    queryKey: ["game-plan", "events"],
    queryFn: () => list(),
    staleTime: 60_000,
  });

  const resolvedEventId = useMemo(() => {
    if (eventId) return eventId;
    const events = eventsQuery.data?.events ?? [];
    return (
      events.find(
        (e) =>
          (pdgaEventRef && e.pdga_event_ref === pdgaEventRef) ||
          (tournamentId && e.tournament_id === tournamentId) ||
          (leagueId && e.league_id === leagueId),
      )?.id ?? null
    );
  }, [eventId, pdgaEventRef, tournamentId, leagueId, eventsQuery.data]);

  const oddsQuery = useQuery({
    enabled: !!resolvedEventId,
    queryKey: ["game-plan", "odds", resolvedEventId],
    queryFn: () => analyze({ data: { eventId: resolvedEventId! } }),
    staleTime: 60_000,
  });

  const searchParams = resolvedEventId
    ? { event: resolvedEventId }
    : pdgaEventRef
      ? { pdga: pdgaEventRef }
      : undefined;

  // Not on the caller's plan — offer a CTA to open Game Plan directly.
  if (!eventsQuery.isLoading && !resolvedEventId) {
    return (
      <Link
        to="/game-plan"
        search={searchParams as never}
        className={cn(
          "group flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 transition hover:border-amber-500/60 hover:bg-amber-500/10",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-amber-600 dark:text-amber-400">
              {headline}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Add this event to your schedule and DG Statboard will run Monte Carlo odds against the
              real field.
            </span>
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-amber-600 transition group-hover:translate-x-0.5 dark:text-amber-400" />
      </Link>
    );
  }

  if (eventsQuery.isLoading || oddsQuery.isLoading) {
    return (
      <div className={cn("rounded-xl border border-primary/20 bg-primary/5 p-3", className)}>
        <Skeleton className="h-4 w-2/3" />
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      </div>
    );
  }

  const odds = oddsQuery.data;
  if (!odds || odds.competition.fieldSize === 0) {
    return (
      <Link
        to="/game-plan"
        search={searchParams as never}
        className={cn(
          "group flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 transition hover:border-primary/60 hover:bg-primary/10",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-primary">{headline}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Open Game Plan to sync the field and run your Monte Carlo simulation.
            </span>
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-primary transition group-hover:translate-x-0.5" />
      </Link>
    );
  }

  const win = Math.round(odds.odds.winPct);
  const top3 = Math.round(odds.odds.top3Pct);
  const cash = Math.round(odds.odds.cashPct);
  const strength = odds.competition.strengthDelta;

  if (variant === "strip") {
    return (
      <Link
        to="/game-plan"
        search={searchParams as never}
        className={cn(
          "group flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 transition hover:border-primary/60 hover:bg-primary/10",
          className,
        )}
      >
        <span className="flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" /> {headline}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Trophy className="h-3 w-3" /> Win{" "}
            <b className="ml-0.5 text-foreground tabular-nums">{win}%</b>
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            Top 3 <b className="text-foreground tabular-nums">{top3}%</b>
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" /> Field{" "}
            <b className="text-foreground tabular-nums">{odds.competition.fieldSize}</b>
            {odds.divisionCode ? <span className="ml-1">· {odds.divisionCode}</span> : null}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
          Open in Game Plan{" "}
          <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </span>
      </Link>
    );
  }

  return (
    <Link
      to="/game-plan"
      search={searchParams as never}
      className={cn(
        "group block rounded-xl border border-primary/30 bg-primary/5 p-3 transition hover:border-primary/60 hover:bg-primary/10",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4" />
            {headline}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Monte Carlo across {odds.competition.fieldSize} players
            {odds.divisionCode ? ` in ${odds.divisionCode}` : ""}
            {odds.meRating != null ? ` · your rating ${odds.meRating}` : ""}
            {strength != null ? ` · ${strength > 0 ? "+" : ""}${strength} vs field avg` : ""}
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-primary transition group-hover:translate-x-0.5" />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <OddsStat
          label="Win"
          value={`${win}%`}
          icon={Trophy}
          accent="text-amber-600 dark:text-amber-400"
        />
        <OddsStat label="Top 3" value={`${top3}%`} icon={Swords} accent="text-primary" />
        <OddsStat
          label="Cash"
          value={`${cash}%`}
          icon={Users}
          accent="text-emerald-600 dark:text-emerald-400"
        />
      </div>
    </Link>
  );
}

function OddsStat({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: typeof Trophy;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className={cn("h-3 w-3", accent)} />
        {label}
      </div>
      <div className={cn("mt-0.5 text-lg font-bold tabular-nums", accent)}>{value}</div>
    </div>
  );
}
