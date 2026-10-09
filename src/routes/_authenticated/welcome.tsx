/**
 * Welcome — the hands-on first run. Instead of telling a new player what the
 * app does, every station on this page is the real feature: join a nearby
 * club, find courses, track an event, add crew, build a bag, see your stats.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Backpack,
  CheckCircle2,
  Circle,
  Flag,
  Palette,
  Sparkles,
  Upload,
} from "lucide-react";
import { PageShell, PageHeader, ContentCard } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useSession } from "@/lib/current-user";
import { openAppTour } from "@/components/onboarding/app-tour";
import { WelcomeClubsCard } from "@/components/onboarding/welcome-clubs-card";
import { PlayCoursesCard } from "@/components/play/play-courses-card";
import { PlayNearbyEventsCard } from "@/components/play/play-nearby-events-card";
import { SuggestedCrewWidget } from "@/components/home/suggested-crew-widget";
import { getWelcomeProgress } from "@/lib/welcome.functions";

export const Route = createFileRoute("/_authenticated/welcome")({
  head: () => ({
    meta: [
      { title: "Welcome to DG Dashboard — try every feature" },
      {
        name: "description",
        content:
          "Take DG Dashboard for a spin: join your local club, find courses near you, track events, add your crew, build your bag, and see your stats.",
      },
      { property: "og:title", content: "Welcome to DG Dashboard" },
      {
        property: "og:description",
        content:
          "Join your local club, find nearby courses, track events, and see your disc golf stats come to life.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WelcomePage,
});

function WelcomePage() {
  const { user } = useSession();
  const fetchProgress = useServerFn(getWelcomeProgress);
  const progressQuery = useQuery({
    queryKey: ["welcome-progress", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: () => fetchProgress(),
  });

  const p = progressQuery.data;
  const steps = [
    { key: "club", label: "Joined a local club", done: (p?.clubs ?? 0) > 0 },
    {
      key: "rounds",
      label: "Brought in your rounds",
      done: (p?.rounds ?? 0) + (p?.importedRounds ?? 0) > 0,
    },
    { key: "crew", label: "Added someone to your crew", done: (p?.friends ?? 0) > 0 },
    { key: "event", label: "Tracked an event", done: (p?.trackedEvents ?? 0) > 0 },
    { key: "bag", label: "Put discs in your bag", done: (p?.bagDiscs ?? 0) > 0 },
    { key: "profile", label: "Filled in your throw profile", done: !!p?.hasThrowProfile },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <PageShell section="feed">
      <PageHeader
        title="Welcome — take it for a spin"
        description="Everything below is the real thing, not a preview. Try a few and your dashboard fills up with your disc golf life."
        primaryAction={
          <Button asChild>
            <Link to="/play">
              <Flag className="mr-1.5 h-4 w-4" />
              Start a round
            </Link>
          </Button>
        }
        secondaryAction={
          <Button variant="outline" onClick={() => openAppTour()}>
            <Sparkles className="mr-1.5 h-4 w-4" />
            Flip through the tour
          </Button>
        }
      />

      <ContentCard
        title={`Your first six moves — ${doneCount} of ${steps.length} done`}
        subtitle="Each one takes a few seconds and unlocks a part of the app."
      >
        <Progress value={pct} className="mb-4 h-2" />
        <ul className="grid gap-2 sm:grid-cols-2">
          {steps.map((step) => (
            <li key={step.key} className="flex items-center gap-2.5 text-sm">
              {step.done ? (
                <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-primary" aria-hidden />
              ) : (
                <Circle className="h-4.5 w-4.5 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className={step.done ? "text-muted-foreground line-through" : ""}>
                {step.label}
              </span>
            </li>
          ))}
        </ul>
      </ContentCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <WelcomeClubsCard userId={user?.id} />
        <PlayCoursesCard userId={user?.id} />
        <PlayNearbyEventsCard userId={user?.id} />
        <SuggestedCrewWidget userId={user?.id} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ContentCard
          title="See your numbers"
          subtitle="Bring in rounds from PDGA, UDisc, or Disc Golf Scene and DG Statboard builds your rating, scoring trends, and course history."
        >
          <p className="mb-3 text-sm text-muted-foreground">
            {p
              ? `${(p.rounds + p.importedRounds).toLocaleString()} rounds on your account so far.`
              : "Checking your rounds…"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/settings/imports">
                <Upload className="mr-1.5 h-4 w-4" />
                Sync my rounds
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/statlink">
                <BarChart3 className="mr-1.5 h-4 w-4" />
                Open DG Statboard
              </Link>
            </Button>
          </div>
        </ContentCard>

        <ContentCard
          title="Build your bag"
          subtitle="Add the discs you actually throw, then answer a short throw survey so recommendations match your power and shot shapes."
        >
          <p className="mb-3 text-sm text-muted-foreground">
            {p ? `${p.bagDiscs} discs in your bag right now.` : "Checking your bag…"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/me/bag">
                <Backpack className="mr-1.5 h-4 w-4" />
                Open My Bag
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/settings/bag">Throw profile</Link>
            </Button>
          </div>
        </ContentCard>

        <ContentCard
          title="Ask Ace anything"
          subtitle="Ace is your caddy. Ask what disc to throw, how to play a hole, or what your stats are telling you."
        >
          <Button asChild size="sm">
            <Link to="/ace">
              <Bot className="mr-1.5 h-4 w-4" />
              Talk to Ace
            </Link>
          </Button>
        </ContentCard>

        <ContentCard
          title="Make it yours"
          subtitle="Pick your colors, text size, and how much artwork you want. Overview pages can be rearranged card by card."
        >
          <Button asChild size="sm" variant="outline">
            <Link to="/settings/personalization">
              <Palette className="mr-1.5 h-4 w-4" />
              Personalize
            </Link>
          </Button>
        </ContentCard>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Done exploring? Your feed is where everything lands.
        </p>
        <Button asChild>
          <Link to="/home">
            Go to my feed
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </PageShell>
  );
}
