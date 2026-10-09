import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { QrCode, ArrowRight, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { normalizeCode } from "@/lib/guest-scoring";

export const Route = createFileRoute("/score/")({
  validateSearch: (search: Record<string, unknown>): { c?: string } => ({
    c: typeof search.c === "string" ? normalizeCode(search.c) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Disc Golf Scoring — Keep Score Online · DG Dashboard" },
      {
        name: "description",
        content:
          "Free disc golf scoring in your browser: track a card hole by hole, see live totals against par, and join an event with its code — no account or download needed.",
      },
      { property: "og:title", content: "Disc Golf Scoring — Keep Score Online" },
      {
        property: "og:description",
        content:
          "Keep score for your card hole by hole, watch totals against par, and join any event with its code. No download, no sign-up.",
      },
      { property: "og:url", content: "https://dgdashboard.app/score" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://dgdashboard.app/score" }],
  }),
  component: ScoreEntryPage,
});

function ScoreEntryPage() {
  const { c } = Route.useSearch();
  const navigate = useNavigate();
  const [code, setCode] = React.useState(c ?? "");

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = normalizeCode(code);
    if (clean.length < 4) return;
    void navigate({ to: "/score/$code", params: { code: clean } });
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-6 px-5 py-12">
      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <QrCode className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Disc golf scoring, right here</h1>
        <p className="text-sm text-muted-foreground">
          Keep score for your whole card hole by hole and see running totals against par as you
          play. Scanning a tournament event code? Enter it below — you don't need an account either
          way.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Event code</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={go} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">6-character code</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(normalizeCode(e.target.value))}
                placeholder="e.g. K7M4QP"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                className="text-center text-2xl font-semibold tracking-[0.3em]"
              />
            </div>
            <Button type="submit" className="w-full" disabled={normalizeCode(code).length < 4}>
              Find my event
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>
          <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
            <ScanLine className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Scanning the printed QR code with your phone camera opens this page with the code already
            filled in.
          </p>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">What the scorecard does</h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>Score every player on your card hole by hole, from a phone on the tee pad.</li>
          <li>See running totals and how each player stands against par as the round goes on.</li>
          <li>
            In a tournament or league, scores sync to the event so spectators can follow along.
          </li>
          <li>
            Create a free account whenever you want, and your rounds, ratings, and stats start
            building from there.
          </li>
        </ul>
      </section>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/auth" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
