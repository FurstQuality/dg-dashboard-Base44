import { createFileRoute, Link, useLoaderData } from "@tanstack/react-router";
import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, MessageCircle, Sparkles, Wind } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { askGuestCaddy, getGuestCard } from "@/lib/guest-scoring.functions";
import { loadGuestToken } from "@/lib/guest-scoring";

export const Route = createFileRoute("/score/$code/guide")({
  component: GuestGuidePage,
});

function GuestGuidePage() {
  const { code } = Route.useParams();
  const info = useLoaderData({ from: "/score/$code" });
  const token = React.useMemo(() => loadGuestToken(code), [code]);
  const [hole, setHole] = React.useState<number | null>(null);
  const [question, setQuestion] = React.useState("");
  const [thread, setThread] = React.useState<{ role: "you" | "caddy"; text: string }[]>([]);
  const [remaining, setRemaining] = React.useState<number | null>(null);

  const card = useQuery({
    queryKey: ["guest-card", code],
    enabled: Boolean(token),
    queryFn: () => getGuestCard({ data: { token: token as string } }),
  });

  React.useEffect(() => {
    if (card.data && remaining == null) setRemaining(card.data.ai_remaining);
  }, [card.data, remaining]);

  const ask = useMutation({
    mutationFn: (q: string) =>
      askGuestCaddy({
        data: { token: token as string, question: q, hole_number: hole ?? undefined },
      }),
    onSuccess: (res) => {
      setThread((prev) => [...prev, { role: "caddy", text: res.reply }]);
      setRemaining(res.remaining);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "The caddy couldn't answer that."),
  });

  const holes = card.data?.holes ?? [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (q.length < 3) return;
    setThread((prev) => [...prev, { role: "you", text: q }]);
    setQuestion("");
    ask.mutate(q);
  };

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4 pb-20">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/score/$code/card" params={{ code }}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to scoring
          </Link>
        </Button>
        {remaining != null && (
          <Badge variant="outline">{remaining} free caddy questions left</Badge>
        )}
      </div>

      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Course guide</h1>
        <p className="text-sm text-muted-foreground">
          {[info.course_name, info.layout_name].filter(Boolean).join(" · ") || "Hole by hole"}
        </p>
      </div>

      {!token ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Join the card first and the guide opens with your holes.{" "}
            <Link
              to="/score/$code"
              params={{ code }}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Join now
            </Link>
          </CardContent>
        </Card>
      ) : card.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {holes.map((h) => (
            <button
              key={h.number}
              type="button"
              onClick={() => setHole(hole === h.number ? null : h.number)}
              className={`w-full rounded-lg border p-3 text-left ${
                hole === h.number ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">
                  Hole {h.number}
                  {h.nickname ? ` · ${h.nickname}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  Par {h.par}
                  {h.distance_ft ? ` · ${h.distance_ft} ft` : ""}
                </span>
              </div>
              {(h.notes || h.caddy_notes) && (
                <p className="mt-1 text-xs text-muted-foreground">{h.caddy_notes || h.notes}</p>
              )}
              {hole === h.number && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-primary">
                  <Wind className="h-3.5 w-3.5" />
                  Ask the caddy below about this hole
                </p>
              )}
            </button>
          ))}
          {!holes.length && (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                This layout doesn't have hole details yet. The caddy can still talk through shot
                choices.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {token && info.allow_caddy && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Ask Ace
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {thread.map((m, i) => (
              <div
                key={i}
                className={`rounded-lg p-2.5 text-sm ${
                  m.role === "you" ? "bg-primary/10" : "bg-muted/60"
                }`}
              >
                <p className="mb-0.5 text-xs font-medium text-muted-foreground">
                  {m.role === "you" ? "You" : "Ace"}
                </p>
                {m.text}
              </div>
            ))}
            {ask.isPending && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking it through…
              </p>
            )}
            <form onSubmit={submit} className="flex items-center gap-2">
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={
                  hole ? `How should I play hole ${hole}?` : "Ask about a hole, wind, or disc choice"
                }
              />
              <Button type="submit" size="icon" disabled={ask.isPending || question.trim().length < 3}>
                <MessageCircle className="h-4 w-4" />
                <span className="sr-only">Ask</span>
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Free questions come with the card. Create an account for full Ace access.
            </p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
