import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Disc, Users, Trophy, Target, MapPin, Camera, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeEntryCard } from "@/components/scoring/code-entry-card";
import { InstallAppCard } from "@/components/install-app-card";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { waitForAuthSession, consumePostLoginPath } from "@/lib/auth-flow";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DG Dashboard · The disc golf community app" },
      {
        name: "description",
        content:
          "Follow players and clubs, share rounds and aces, build courses, and run PDGA-style tournaments — all in one disc golf super-app.",
      },
      { property: "og:title", content: "DG Dashboard · The disc golf community app" },
      {
        property: "og:description",
        content:
          "The disc golf app that chains it all together: feeds, clubs, courses, scoring, leagues, and tournament tools in one place.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://dgdashboard.app/" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: "https://dgdashboard.app/og-image.jpg" },
      { name: "twitter:image", content: "https://dgdashboard.app/og-image.jpg" },
    ],
    links: [{ rel: "canonical", href: "https://dgdashboard.app/" }],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let done = false;
    const go = (target?: string) => {
      if (done) return;
      done = true;
      const dest = target ?? consumePostLoginPath() ?? "/play";
      navigate({ to: dest as string, replace: true } as never);
    };

    // If we arrived here from an OAuth redirect (tokens in URL hash / ?code=)
    // or via a fresh session hydration, wait for the client to persist it
    // before showing the marketing landing. Otherwise mobile users perceive
    // being "kicked back to the sign in page" during the brief hash-parse gap.
    const hasAuthArtifacts =
      typeof window !== "undefined" &&
      /access_token=|refresh_token=|[?&#]code=|token_hash=|[?&#]error=/.test(
        window.location.hash + window.location.search,
      );

    if (hasAuthArtifacts) {
      void waitForAuthSession(8000).then((session) => {
        if (session) go();
        else setChecking(false);
      });
    } else {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) go();
        else setChecking(false);
      });
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        session &&
        (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")
      ) {
        go();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  if (checking) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <Disc className="h-5 w-5" />
          </div>
          <span className="font-display text-xl font-semibold">DG Dashboard</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/score">
            <Button variant="ghost">Score an event</Button>
          </Link>
          <Link to="/auth">
            <Button variant="ghost">Sign in</Button>
          </Link>
          <Link to="/auth" search={{ mode: "signup" } as never}>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              Create account
            </Button>
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-10 lg:grid-cols-2 lg:gap-16 lg:pt-20">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Built for players, clubs, and tournament directors
          </div>
          <h1 className="mt-5 font-display text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            The disc golf app that <span className="text-primary">chains it all together.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-muted-foreground">
            A social feed for your rounds and aces. A place to follow your local club. And the same
            account carries you into scoring, tournaments, and leagues as they roll out.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/preview">
              <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">
                Preview with my PDGA #
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/auth" search={{ mode: "signup" } as never}>
              <Button size="lg" variant="outline">
                Create account
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="lg" variant="ghost">
                I already have an account
              </Button>
            </Link>
          </div>
          <div className="mt-6 text-xs text-muted-foreground">
            Free preview — no signup required. Google sign-in supported.
          </div>
          <div className="mt-6 max-w-md space-y-3">
            <InstallAppCard />
            <CodeEntryCard />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            {
              icon: Camera,
              title: "Share rounds & aces",
              body: "Post scorecards, photos, and clips from your local course.",
            },
            {
              icon: Users,
              title: "Follow your club",
              body: "Stay in the loop on weekly leagues and course workdays.",
            },
            {
              icon: MapPin,
              title: "Course builder",
              body: "Map holes, tees, and baskets — coming next.",
            },
            {
              icon: Target,
              title: "Live scoring",
              body: "Score solo or with your card, synced across devices.",
            },
            {
              icon: Trophy,
              title: "Tournaments",
              body: "Run PDGA-style events with divisions, pools, payouts.",
            },
            {
              icon: Disc,
              title: "One profile",
              body: "Your bag, PDGA rating, and history in one place.",
            },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="rounded-xl border border-border bg-card p-4">
                <Icon className="h-5 w-5 text-primary" />
                <div className="mt-3 font-semibold">{f.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{f.body}</div>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} DG Dashboard · Built by disc golfers, for disc golfers.
        </div>
      </footer>
    </div>
  );
}
