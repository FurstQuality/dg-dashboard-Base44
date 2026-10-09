import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Loader2,
  Minus,
  Plus,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { finishGuestCard, getGuestCard, saveGuestScores } from "@/lib/guest-scoring.functions";
import {
  clearPendingEntries,
  loadGuestToken,
  loadPendingEntries,
  savePendingEntries,
  scoreLabel,
  toParText,
  type GuestScoreEntry,
} from "@/lib/guest-scoring";

export const Route = createFileRoute("/score/$code/card")({
  component: GuestCardPage,
});

function GuestCardPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const token = React.useMemo(() => loadGuestToken(code), [code]);

  React.useEffect(() => {
    if (!token) void navigate({ to: "/score/$code", params: { code } });
  }, [token, code, navigate]);

  const card = useQuery({
    queryKey: ["guest-card", code],
    enabled: Boolean(token),
    queryFn: () => getGuestCard({ data: { token: token as string } }),
  });

  const [scores, setScores] = React.useState<Map<string, number>>(new Map());
  const [pending, setPending] = React.useState<GuestScoreEntry[]>(() => loadPendingEntries(code));
  const [hole, setHole] = React.useState(1);
  const [offline, setOffline] = React.useState(false);

  // Seed local scores from the server, then replay anything not yet sent.
  React.useEffect(() => {
    if (!card.data) return;
    const next = new Map<string, number>();
    for (const e of card.data.entries) {
      if (e.strokes != null) next.set(`${e.round_player_id}|${e.hole_number}`, e.strokes);
    }
    for (const e of loadPendingEntries(code)) {
      if (e.strokes != null) next.set(`${e.round_player_id}|${e.hole_number}`, e.strokes);
    }
    setScores(next);
    const firstUnscored = card.data.holes.find((h) =>
      card.data!.players.some((p) => !next.has(`${p.id}|${h.number}`)),
    );
    setHole(firstUnscored?.number ?? card.data.holes[0]?.number ?? 1);
  }, [card.data, code]);

  const save = useMutation({
    mutationFn: (entries: GuestScoreEntry[]) =>
      saveGuestScores({ data: { token: token as string, entries } }),
    onSuccess: (_res, entries) => {
      setOffline(false);
      setPending((prev) => {
        const sent = new Set(entries.map((e) => `${e.round_player_id}|${e.hole_number}`));
        const rest = prev.filter((e) => !sent.has(`${e.round_player_id}|${e.hole_number}`));
        rest.length ? savePendingEntries(code, rest) : clearPendingEntries(code);
        return rest;
      });
    },
    onError: () => setOffline(true),
  });

  const flush = React.useCallback(
    (queue: GuestScoreEntry[]) => {
      if (!queue.length || !token) return;
      save.mutate(queue);
    },
    [save, token],
  );

  // Retry the queue when signal comes back.
  React.useEffect(() => {
    if (!pending.length) return;
    const t = window.setTimeout(() => flush(pending), 4000);
    const onOnline = () => flush(pending);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("online", onOnline);
    };
  }, [pending, flush]);

  const setStroke = (playerId: string, holeNumber: number, strokes: number) => {
    const clamped = Math.max(1, Math.min(30, strokes));
    setScores((prev) => new Map(prev).set(`${playerId}|${holeNumber}`, clamped));
    const entry: GuestScoreEntry = {
      round_player_id: playerId,
      hole_number: holeNumber,
      strokes: clamped,
    };
    setPending((prev) => {
      const rest = prev.filter(
        (e) => !(e.round_player_id === playerId && e.hole_number === holeNumber),
      );
      const next = [...rest, entry];
      savePendingEntries(code, next);
      return next;
    });
    flush([entry]);
  };

  const finish = useMutation({
    mutationFn: () => finishGuestCard({ data: { token: token as string } }),
    onSuccess: (res) => {
      if (res.verified) toast.success("Card submitted and verified. This round counts for a rating.");
      else
        toast.success(
          "Card submitted. It needs a second scorekeeper's matching card to earn a rating.",
        );
      void navigate({ to: "/score/$code/statlink", params: { code } });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "We couldn't submit that card."),
  });

  if (!token) return null;
  if (card.isLoading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (card.isError || !card.data) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">We couldn't load your card</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Your scoring session may have expired. Rejoin with the event code.</p>
            <Button asChild size="sm">
              <Link to="/score/$code" params={{ code }}>
                Rejoin
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const data = card.data;
  const holes = data.holes;
  const current = holes.find((h) => h.number === hole) ?? holes[0];
  const holeIndex = current ? holes.findIndex((h) => h.number === current.number) : 0;
  const conflictHere = data.conflicts.some((c) => c.hole_number === current?.number);

  const totals = data.players.map((p) => {
    let strokes = 0;
    let par = 0;
    let scored = 0;
    for (const h of holes) {
      const v = scores.get(`${p.id}|${h.number}`);
      if (v == null) continue;
      strokes += v;
      par += h.par;
      scored += 1;
    }
    return { ...p, strokes, toPar: strokes - par, scored };
  });

  const allScored = data.players.every((p) => holes.every((h) => scores.has(`${p.id}|${h.number}`)));

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4 pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={data.scores_verified ? "default" : "secondary"} className="gap-1">
          {data.scores_verified ? (
            <ShieldCheck className="h-3 w-3" />
          ) : (
            <AlertTriangle className="h-3 w-3" />
          )}
          {data.scores_verified
            ? "Verified card"
            : `${data.scorekeeper_count} scorekeeper${data.scorekeeper_count === 1 ? "" : "s"} — needs 2 to rate`}
        </Badge>
        {pending.length > 0 && (
          <Badge variant="outline" className="gap-1">
            {offline ? <CloudOff className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
            {offline ? `${pending.length} holes waiting for signal` : "Saving…"}
          </Badge>
        )}
        {data.allow_caddy && (
          <Button asChild variant="outline" size="sm" className="ml-auto">
            <Link to="/score/$code/guide" params={{ code }}>
              <BookOpen className="mr-1.5 h-3.5 w-3.5" />
              Caddy guide
            </Link>
          </Button>
        )}
      </div>

      {current && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div>
              <CardTitle className="text-base">
                Hole {current.number}
                {current.nickname ? ` · ${current.nickname}` : ""}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Par {current.par}
                {current.distance_ft ? ` · ${current.distance_ft} ft` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                disabled={holeIndex <= 0}
                onClick={() => setHole(holes[holeIndex - 1]!.number)}
                aria-label="Previous hole"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                disabled={holeIndex >= holes.length - 1}
                onClick={() => setHole(holes[holeIndex + 1]!.number)}
                aria-label="Next hole"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {conflictHere && (
              <p className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Scorekeepers disagree on this hole. Settle it on the card and re-enter the agreed
                score.
              </p>
            )}
            {data.players.map((p) => {
              const value = scores.get(`${p.id}|${current.number}`);
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {p.name}
                      {p.is_me && <span className="ml-1.5 text-xs text-primary">you</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {value != null ? scoreLabel(value, current.par) : "No score yet"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setStroke(p.id, current.number, (value ?? current.par) - 1)}
                      aria-label={`One less stroke for ${p.name}`}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-9 text-center text-lg font-semibold tabular-nums">
                      {value ?? "–"}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setStroke(p.id, current.number, (value ?? current.par - 1) + 1)}
                      aria-label={`One more stroke for ${p.name}`}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Card totals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {totals.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-sm">
              <span className="truncate">{t.name}</span>
              <span className="flex items-center gap-3 tabular-nums">
                <span className="text-muted-foreground">
                  {t.scored}/{holes.length}
                </span>
                <span className="font-semibold">{t.strokes || "–"}</span>
                <span className="w-8 text-right text-muted-foreground">
                  {t.scored ? toParText(t.toPar) : ""}
                </span>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          variant="outline"
          onClick={() => navigate({ to: "/score/$code/statlink", params: { code } })}
        >
          <Trophy className="mr-2 h-4 w-4" />
          My stats preview
        </Button>
        <Button disabled={finish.isPending} onClick={() => finish.mutate()}>
          {finish.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-2 h-4 w-4" />
          )}
          {allScored ? "Submit card" : "Submit what's scored"}
        </Button>
      </div>
    </main>
  );
}
