import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarCheck, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { hapticTap } from "@/lib/haptics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlayerPassButton } from "@/components/events/player-pass";
import { SelfCheckInButton } from "@/components/events/self-check-in";
import {
  getLeagueSignup,
  registerForLeague,
  withdrawFromLeague,
  type LeagueSignup,
} from "@/lib/checkin.functions";

/** Season sign-up, division, payment status, and per-night check-in for a league. */
export function LeagueSignupPanel({ leagueId }: { leagueId: string }) {
  const fetchSignup = useServerFn(getLeagueSignup);
  const register = useServerFn(registerForLeague);
  const withdraw = useServerFn(withdrawFromLeague);
  const queryClient = useQueryClient();
  const [divisionId, setDivisionId] = useState<string | undefined>(undefined);

  const key = ["league-signup", leagueId] as const;
  const { data, isLoading } = useQuery<LeagueSignup>({
    queryKey: key,
    queryFn: () => fetchSignup({ data: { leagueId } }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const joinMutation = useMutation({
    mutationFn: () =>
      register({ data: { leagueId, ...(divisionId ? { divisionId } : {}) } }),
    onSuccess: () => {
      hapticTap([10, 40, 18]);
      toast.success("You're on the league roster.");
      refresh();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "We couldn't add you to this league."),
  });

  const leaveMutation = useMutation({
    mutationFn: () => withdraw({ data: { leagueId } }),
    onSuccess: () => {
      toast.success("You're off the roster for this season.");
      refresh();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "We couldn't update your registration."),
  });

  if (isLoading) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (!data) return null;

  const registered = !!data.registration && data.registration.status !== "withdrawn";
  const nights = data.nights.slice(0, 6);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Your league status</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {registered
              ? "You're signed up — check in each night you show up to play."
              : "Sign up once for the season, then check in week to week."}
          </p>
          {registered ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <Badge>{data.registration!.status.replace(/_/g, " ")}</Badge>
              {data.registration!.divisionName ? (
                <Badge variant="secondary">{data.registration!.divisionName}</Badge>
              ) : null}
              <Badge variant={data.registration!.paymentStatus === "paid" ? "default" : "outline"}>
                {data.registration!.paymentStatus}
              </Badge>
              {data.entryFeeCents > 0 ? (
                <span className="text-muted-foreground">
                  Entry ${(data.entryFeeCents / 100).toFixed(2)}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!registered && data.divisions.length > 0 ? (
            <Select value={divisionId} onValueChange={setDivisionId}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Division" />
              </SelectTrigger>
              <SelectContent>
                {data.divisions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {registered ? (
            <>
              <PlayerPassButton />
              <Button
                variant="outline"
                onClick={() => leaveMutation.mutate()}
                disabled={leaveMutation.isPending}
              >
                Leave league
              </Button>
            </>
          ) : (
            <Button onClick={() => joinMutation.mutate()} disabled={joinMutation.isPending}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Join league
            </Button>
          )}
        </div>
      </div>

      {registered && nights.length > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CalendarCheck className="h-4 w-4 text-primary" /> League nights
          </div>
          {nights.map((n) => (
            <div
              key={n.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">{n.name}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(n.date).toLocaleDateString()}
                  {n.checkedInAt
                    ? ` · checked in ${new Date(n.checkedInAt).toLocaleTimeString()}`
                    : n.checkInOpen
                      ? " · check-in open"
                      : ` · ${n.checkInNote ?? "check-in closed"}`}
                </div>
              </div>
              <SelfCheckInButton
                size="sm"
                target={{ kind: "league_event", id: n.id }}
                registered
                alreadyCheckedIn={!!n.checkedInAt}
                onDone={refresh}
              />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
