/**
 * Live scoring for a PDGA event, one week (round) at a time.
 *
 * A weekly league is a single PDGA event with a round per week, so the round
 * picker reads as "Week 1 … Week 10" for leagues and "Round 1 …" for tournaments.
 * Scores come from the shared mirror, which refreshes itself while play is on.
 */
import { formatToPar as toPar } from "@/lib/score-display";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, RefreshCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getEventLiveScoreboard } from "@/lib/live-event-scores.functions";


export function LiveScoreboardCard({ eventRef }: { eventRef: string }) {
  const load = useServerFn(getEventLiveScoreboard);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["live-scoreboard", eventRef],
    queryFn: () => load({ data: { eventRef } }),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const [round, setRound] = useState<number | null>(null);
  const [division, setDivision] = useState<string>("");

  const rounds = data?.rounds ?? [];
  const divisions = data?.divisions ?? [];

  // Land on the newest week and the first division as soon as they're known.
  useEffect(() => {
    if (round == null && rounds.length) setRound(rounds[rounds.length - 1]);
    if (!division && divisions.length) setDivision(divisions[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds.length, divisions.length]);

  const roundLabel = (n: number) => (data?.weekly ? `Week ${n}` : `Round ${n}`);

  const rows = useMemo(() => {
    const list = (data?.rows ?? []).filter(
      (r) =>
        (round == null || r.round_number === round) &&
        (!division || (r.division ?? "").toUpperCase() === division),
    );
    return list.sort((a, b) => {
      const pa = a.place ?? 9999;
      const pb = b.place ?? 9999;
      if (pa !== pb) return pa - pb;
      return (a.player_name ?? "").localeCompare(b.player_name ?? "");
    });
  }, [data, round, division]);

  const liveUrl =
    round && division
      ? `https://www.pdga.com/live/event/${eventRef}/${division}/scores?round=${round}`
      : `https://www.pdga.com/live/event/${eventRef}`;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-base">Live scoring</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {rounds.length > 0 && (
            <Select value={round ? String(round) : ""} onValueChange={(v) => setRound(Number(v))}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue placeholder="Week" />
              </SelectTrigger>
              <SelectContent>
                {rounds.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {roundLabel(n)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {divisions.length > 1 && (
            <Select value={division} onValueChange={setDivision}>
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <SelectValue placeholder="Division" />
              </SelectTrigger>
              <SelectContent>
                {divisions.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" variant="ghost" className="h-8" asChild>
            <a href={liveUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              PDGA live
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No cards have been posted yet. Scores appear here as soon as the first group starts
            handing in holes.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">Player</th>
                  <th className="py-2 pr-3 font-medium">Rating</th>
                  <th className="py-2 pr-3 font-medium">{data?.weekly ? "Week" : "Round"}</th>
                  <th className="py-2 pr-3 font-medium">Total</th>
                  <th className="py-2 pr-3 font-medium">Thru</th>
                  <th className="py-2 font-medium">Card</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={`${r.pdga_number}-${r.round_number}`}
                    className="border-b border-border/60"
                  >
                    <td className="py-2 pr-3 tabular-nums">{r.place ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <span className="font-medium">{r.player_name ?? `#${r.pdga_number}`}</span>
                      {!r.round_started && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {r.tee_time ? `Tees ${r.tee_time}` : "Not started"}
                        </Badge>
                      )}
                      {r.completed && (
                        <Badge variant="secondary" className="ml-2 text-[10px]">
                          Final
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{r.current_rating ?? "—"}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {r.round_score ?? "—"}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({toPar(r.round_to_par)})
                      </span>
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {r.total ?? "—"}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({toPar(r.to_par)})
                      </span>
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{r.thru ?? 0}</td>
                    <td className="py-2 tabular-nums">{r.card_number ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data?.lastSyncedAt && (
          <p className="mt-3 text-xs text-muted-foreground">
            Updated {new Date(data.lastSyncedAt).toLocaleTimeString()} — refreshes itself while play
            is on.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
