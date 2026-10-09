import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DIRECTOR_POLL, directorKeys } from "@/lib/director-queries";
import { ArrowRight, MonitorSmartphone, QrCode } from "lucide-react";
import { ContentCard } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingSkeleton } from "@/components/shell";
import {
  getCheckInBoard,
  getCheckInStations,
  type CheckInBoard,
  type CheckInStation,
} from "@/lib/checkin.functions";

export type CheckInWidgetProps = {
  /** Show only this tournament's desk. */
  tournamentId?: string;
  /** Show only nights belonging to this league. */
  leagueId?: string;
  /** Hide the card frame when the parent already provides a heading. */
  bare?: boolean;
};

/**
 * Snapshot of the check-in desk: the event night happening soonest, how many
 * players are through the table, and a jump straight into scanning. Scope it to
 * one event with `tournamentId` or `leagueId`.
 */
export function CheckInWidget({ tournamentId, leagueId, bare }: CheckInWidgetProps = {}) {
  const fetchStations = useServerFn(getCheckInStations);
  const fetchBoard = useServerFn(getCheckInBoard);

  const stationsQuery = useQuery<CheckInStation[]>({
    queryKey: directorKeys.checkinStations(),
    queryFn: () => fetchStations(),
    staleTime: DIRECTOR_POLL.stations,
  });

  const station = useMemo(() => {
    let list = stationsQuery.data ?? [];
    if (tournamentId) list = list.filter((s) => s.kind === "tournament" && s.id === tournamentId);
    if (leagueId) list = list.filter((s) => s.leagueId === leagueId);
    return list.find((s) => s.checkInOpen) ?? list[0] ?? null;
  }, [stationsQuery.data, tournamentId, leagueId]);

  const boardQuery = useQuery<CheckInBoard>({
    queryKey: directorKeys.checkinBoard(station?.kind, station?.id),
    queryFn: () => fetchBoard({ data: { kind: station!.kind, id: station!.id } }),
    enabled: !!station,
    staleTime: DIRECTOR_POLL.live,
  });

  if (stationsQuery.isPending) return <LoadingSkeleton variant="card" count={1} />;

  // Nothing scheduled yet, or no night close enough to open the desk for.
  if (!station)
    return bare ? (
      <div className="rounded-xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">
        The check-in desk opens once a date is set and the event is within a few days.
      </div>
    ) : null;

  const totals = boardQuery.data?.totals;
  const pct =
    totals && totals.expected > 0 ? Math.round((totals.checkedIn / totals.expected) * 100) : 0;

  const body = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">{station.name}</div>
          <div className="text-xs text-muted-foreground">
            {station.subtitle} · {new Date(station.date).toLocaleDateString()}
          </div>
        </div>
        <Badge variant={station.checkInOpen ? "default" : "outline"}>
          {station.checkInOpen ? "Open" : "Closed"}
        </Badge>
      </div>

      {totals ? (
        <>
          <Progress value={pct} />
          <div className="flex flex-wrap gap-4 text-sm">
            <span>
              <strong>{totals.checkedIn}</strong>/{totals.expected} checked in
            </span>
            <span className="text-muted-foreground">{totals.remaining} to go</span>
            {totals.unpaid > 0 ? (
              <span className="text-muted-foreground">{totals.unpaid} unpaid</span>
            ) : null}
          </div>
        </>
      ) : (
        <Skeleton className="h-10 w-full rounded-md" />
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild size="sm">
          <Link to="/director/check-in" search={{ kind: station.kind, id: station.id }}>
            <QrCode className="mr-1.5 h-4 w-4" /> Check-in desk
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/director/kiosk">
            <MonitorSmartphone className="mr-1.5 h-4 w-4" /> Kiosk mode
          </Link>
        </Button>
      </div>
    </div>
  );

  if (bare)
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3">
          <div className="text-sm font-semibold">Check-in desk</div>
          <div className="text-xs text-muted-foreground">
            Scan passes, mark fees paid, and watch the roster fill in.
          </div>
        </div>
        {body}
      </div>
    );

  return (
    <ContentCard
      title="Check-in desk"
      subtitle="Scan passes, mark fees paid, and watch the roster fill in."
    >
      {body}
    </ContentCard>
  );
}
