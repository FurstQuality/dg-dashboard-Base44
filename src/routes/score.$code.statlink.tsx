import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Sparkles,
  Target,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { claimGuestRound, getGuestStatlink } from "@/lib/guest-scoring.functions";
import { loadGuestToken, toParText } from "@/lib/guest-scoring";

export const Route = createFileRoute("/score/$code/statlink")({
  component: GuestStatlinkPage,
});

function GuestStatlinkPage() {
  const { code } = Route.useParams();
  const token = React.useMemo(() => loadGuestToken(code), [code]);
  const [claimed, setClaimed] = React.useState(false);

  const stats = useQuery({
    queryKey: ["guest-statlink", code],
    enabled: Boolean(token),
    queryFn: () => getGuestStatlink({ data: { token: token as string } }),
  });

  const claim = useMutation({
    mutationFn: (claimToken: string) => claimGuestRound({ data: { claim_token: claimToken } }),
    onSuccess: () => {
      setClaimed(true);
      toast.success("Round saved to your account.");
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "We couldn't claim that round."),
  });

  // Signed in and holding a claim token? Move the round across automatically.
  const claimToken = stats.data?.claim_token ?? null;
  React.useEffect(() => {
    if (!claimToken || claimed || claim.isPending) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!cancelled && data.user) claim.mutate(claimToken);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimToken, claimed]);

  if (!token) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Join a card with your event code to see your stats preview.{" "}
            <Link
              to="/score/$code"
              params={{ code }}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Join now
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (stats.isLoading || !stats.data) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const d = stats.data;
  const me = d.me;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4 pb-20">
      <Button asChild variant="ghost" size="sm">
        <Link to="/score/$code/card" params={{ code }}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to scoring
        </Link>
      </Button>

      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          {d.display_name}'s round at {d.event_name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {[d.round_label, d.course_name, d.layout_name, d.division_name]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant={d.verified ? "default" : "secondary"} className="gap-1">
          <ShieldCheck className="h-3 w-3" />
          {d.verified
            ? "Verified by two scorekeepers"
            : "Unverified — needs a second scorekeeper for a rating"}
        </Badge>
        {d.estimated_rating != null && (
          <Badge variant="outline" className="gap-1">
            <Target className="h-3 w-3" />
            Estimated round rating {d.estimated_rating}
          </Badge>
        )}
      </div>

      {me && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Your round</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border p-3">
                <p className="text-2xl font-semibold tabular-nums">{me.total || "–"}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-2xl font-semibold tabular-nums">{toParText(me.toPar)}</p>
                <p className="text-xs text-muted-foreground">To par</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-2xl font-semibold tabular-nums">
                  {me.holesScored}/{d.hole_count}
                </p>
                <p className="text-xs text-muted-foreground">Holes scored</p>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-1.5 text-center text-xs">
              {[
                ["Eagle+", me.split.eagle],
                ["Birdie", me.split.birdie],
                ["Par", me.split.par],
                ["Bogey", me.split.bogey],
                ["Double+", me.split.worse],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-md bg-muted/60 p-2">
                  <p className="text-base font-semibold tabular-nums">{value as number}</p>
                  <p className="text-muted-foreground">{label as string}</p>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="py-1 text-left font-medium">Hole</th>
                    {me.byHole.map((h) => (
                      <th key={h.hole} className="px-1 py-1 text-center font-medium">
                        {h.hole}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-xs text-muted-foreground">
                    <td className="py-1 text-left">Par</td>
                    {me.byHole.map((h) => (
                      <td key={h.hole} className="px-1 py-1 text-center tabular-nums">
                        {h.par}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-1 text-left font-medium">Score</td>
                    {me.byHole.map((h) => (
                      <td key={h.hole} className="px-1 py-1 text-center font-semibold tabular-nums">
                        {h.strokes}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Your card</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {d.card.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <span className="truncate">{p.name}</span>
              <span className="flex items-center gap-3 tabular-nums">
                <span className="text-muted-foreground">{p.holesScored} holes</span>
                <span className="font-semibold">{p.total || "–"}</span>
                <span className="w-8 text-right text-muted-foreground">
                  {p.holesScored ? toParText(p.toPar) : ""}
                </span>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {claimed ? (
        <Card className="border-primary/40">
          <CardContent className="flex items-start gap-3 py-5">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="space-y-2 text-sm">
              <p className="font-medium">This round is in your account.</p>
              <p className="text-muted-foreground">
                Your stats, ratings, and history now include this card.
              </p>
              <Button asChild size="sm">
                <Link to="/stats">Open DG Statboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="space-y-3 py-5">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              Keep these stats
            </p>
            <p className="text-sm text-muted-foreground">
              Create a free account and this round, every hole, and your rating move into your
              history automatically. You'll get DG Statboard trends, Ace, and your course book.
            </p>
            <Button asChild className="w-full sm:w-auto">
              <Link
                to="/auth"
                search={{ mode: "signup" as const, next: `/score/${code}/statlink` }}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Create my free account
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              Already have one?{" "}
              <Link
                to="/auth"
                search={{ next: `/score/${code}/statlink` }}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Sign in to claim it
              </Link>
            </p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
