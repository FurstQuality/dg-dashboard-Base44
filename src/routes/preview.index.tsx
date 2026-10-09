import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Search, ArrowRight, Disc } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/preview/")({
  head: () => ({
    meta: [
      { title: "PDGA Player Search — Free Player Lookup · DG Dashboard" },
      {
        name: "description",
        content:
          "Free PDGA player search: enter any PDGA number to look up a player's rating, career highlights, and stats, then preview their DG Dashboard profile. No signup required.",
      },
      { property: "og:title", content: "PDGA Player Search — free player lookup" },
      {
        property: "og:description",
        content:
          "Search any PDGA number to look up ratings and career stats, then see the full DG Dashboard profile built from that data.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://dgdashboard.app/preview" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://dgdashboard.app/preview" }],
  }),
  component: PreviewSearch,
});

function PreviewSearch() {
  const [num, setNum] = useState("");
  const navigate = useNavigate();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = num.replace(/[^0-9]/g, "");
    if (!cleaned) return;
    navigate({ to: "/preview/$number", params: { number: cleaned } });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <Disc className="h-5 w-5" />
          </div>
          <span className="font-display text-xl font-semibold">DG Dashboard</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/auth">
            <Button variant="ghost">Sign in</Button>
          </Link>
          <Link to="/auth" search={{ mode: "signup" } as never}>
            <Button>Create account</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-16 pt-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Free preview — no signup needed
        </div>
        <h1 className="mt-5 font-display text-4xl font-bold leading-tight sm:text-5xl">
          PDGA Player Lookup — <span className="text-primary">search any PDGA number.</span>
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Enter a PDGA number to pull up that player's rating, career highlights, and where they
          stack up — then see the whole thing as a live DG Dashboard profile.
        </p>

        <form onSubmit={submit} className="mx-auto mt-8 flex max-w-md gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="e.g. 236190"
              value={num}
              onChange={(e) => setNum(e.target.value)}
              className="h-11 pl-9 text-base"
              autoFocus
              aria-label="PDGA number"
            />
          </div>
          <Button type="submit" size="lg" disabled={!num.trim()}>
            Preview <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          Don't know your PDGA number?{" "}
          <a
            className="underline underline-offset-2 hover:text-foreground"
            href="https://www.pdga.com/players"
            target="_blank"
            rel="noopener noreferrer"
          >
            Look it up on pdga.com
          </a>
          .
        </p>

        <div className="mt-12 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
          {[
            {
              title: "Career at a glance",
              body: "Rating, rounds used, and where you're headed next.",
            },
            { title: "Top rounds", body: "Your best-rated tournament rounds, pulled from PDGA." },
            { title: "Wins & podiums", body: "See your sanctioned wins tallied and highlighted." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-4">
              <div className="font-semibold">{f.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{f.body}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
