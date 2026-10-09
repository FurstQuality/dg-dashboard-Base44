import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getFriendLiveCard } from "@/lib/live-friends.functions";
import { formatToPar } from "@/lib/live/friend-live";
import { liveKeys, LIVE_POLL, livePolling } from "@/lib/tracker-queries";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventRef: string | null;
  eventName?: string | null;
  pdgaNumber: string | null;
  playerName?: string | null;
};

function scoreTone(score: number, par: number) {
  const diff = score - par;
  if (diff <= -2) return "bg-amber-500/15 text-amber-500 border-amber-500/30";
  if (diff === -1) return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
  if (diff === 0) return "bg-muted text-foreground border-border";
  if (diff === 1) return "bg-orange-500/15 text-orange-500 border-orange-500/30";
  return "bg-destructive/15 text-destructive border-destructive/30";
}

/** Hole-by-hole card for one player at one event, refreshing while they play. */
export function FriendLiveCardSheet({
  open,
  onOpenChange,
  eventRef,
  eventName,
  pdgaNumber,
  playerName,
}: Props) {
  const load = useServerFn(getFriendLiveCard);
  const enabled = open && !!eventRef && !!pdgaNumber;

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: liveKeys.friendCard(eventRef ?? "", pdgaNumber ?? ""),
    queryFn: () => load({ data: { eventRef: eventRef!, pdgaNumber: pdgaNumber! } }),
    enabled,
    ...livePolling(LIVE_POLL.live, enabled),
  });

  const rounds = data?.rounds ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {playerName ?? `#${pdgaNumber ?? ""}`}
            {isFetching ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />
            ) : null}
          </SheetTitle>
          <SheetDescription>
            {eventName ? `${eventName} — hole by hole` : "Hole by hole"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Pulling their card…
            </div>
          ) : isError ? (
            <p className="py-8 text-sm text-destructive">
              {error instanceof Error ? error.message : "We couldn't load this card just now."}
            </p>
          ) : !rounds.length ? (
            <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
              No live card has been posted for this player yet. It appears as soon as their group
              tees off.
            </p>
          ) : (
            rounds.map((round) => {
              const holes = round.holeScores ?? [];
              const pars = round.holePars ?? [];
              return (
                <div key={round.roundNumber} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">Round {round.roundNumber}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      {round.division ? (
                        <Badge variant="outline" className="text-xs">
                          {round.division}
                        </Badge>
                      ) : null}
                      {round.cardNumber ? (
                        <Badge variant="outline" className="text-xs">
                          Card {round.cardNumber}
                        </Badge>
                      ) : null}
                      <Badge variant={round.completed ? "secondary" : "default"} className="text-xs">
                        {round.completed
                          ? "Finished"
                          : round.roundStarted
                            ? `Thru ${round.thru}`
                            : (round.teeTime ?? "Not started")}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Round</div>
                      <div className="font-semibold">{formatToPar(round.roundToPar)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Total</div>
                      <div className="font-semibold">{formatToPar(round.toPar)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Place</div>
                      <div className="font-semibold">
                        {round.place != null ? `#${round.place}` : "—"}
                      </div>
                    </div>
                  </div>

                  {holes.length ? (
                    <div className="mt-4 overflow-x-auto">
                      <div className="flex gap-1.5">
                        {holes.map((score, i) => {
                          const par = pars[i] ?? 3;
                          return (
                            <div key={i} className="w-9 shrink-0 text-center">
                              <div className="text-[11px] text-muted-foreground">{i + 1}</div>
                              <div
                                className={`mt-1 rounded-md border py-1 text-sm font-semibold ${
                                  score > 0 ? scoreTone(score, par) : "border-dashed text-muted-foreground"
                                }`}
                              >
                                {score > 0 ? score : "–"}
                              </div>
                              <div className="mt-1 text-[10px] text-muted-foreground">
                                {par > 0 ? `Par ${par}` : ""}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
