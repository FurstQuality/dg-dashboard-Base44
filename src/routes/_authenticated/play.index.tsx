import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/lib/current-user";
import { DailyGoalsWidget } from "@/components/daily-goals-widget";
import { PlayRoundsPanel } from "@/components/play/play-rounds-panel";
import { StartRoundCta } from "@/components/play/start-round-cta";
import { LeagueScheduleCard } from "@/components/play/league-schedule-card";
import { PageShell, PageHeader } from "@/components/shell";
import { NowPlay } from "@/components/now/now-play";
import { HappeningNowChips } from "@/components/play/happening-now-chips";
import { PlayActivitySummary } from "@/components/play/play-activity-summary";
import { PlayArenaCard } from "@/components/play/play-arena-card";
import { StickyPlayAction } from "@/components/play/sticky-play-action";

export const Route = createFileRoute("/_authenticated/play/")({
  head: () => ({
    meta: [
      { title: "Play · DG Dashboard" },
      {
        name: "description",
        content:
          "Your DG Dashboard home — resume your round, see who's playing, find today's leagues and get out on the course.",
      },
      { property: "og:title", content: "Play · DG Dashboard" },
      {
        property: "og:description",
        content: "What you can play, who you can play with, and what's happening right now.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlayHome,
});

/**
 * Play is the app's home. Order follows "what needs me now": live round and
 * today's plans first, then people playing, then leagues, then games and goals.
 * Personal stats sit last — they help after a round, not before one.
 */
function PlayHome() {
  const { user } = useSession();

  return (
    <PageShell section="play">
      <PageHeader title="Play" description="Get out and play — your round, your crew and what's on today." />

      {/* Start or resume a round, then what's next on your calendar */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch [&>*]:min-w-0 [&>*]:lg:flex-1">
        <StartRoundCta />
        <NowPlay />
      </div>

      <HappeningNowChips />

      {/* Fixed priority: play together and today's leagues, then Arena, goals and your play. */}
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        <div id="play-together" className="scroll-mt-24 lg:col-span-2">
          <PlayRoundsPanel />
        </div>
        <LeagueScheduleCard />
        <div className="grid gap-3">
          <PlayArenaCard userId={user?.id} />
          <DailyGoalsWidget />
          <PlayActivitySummary userId={user?.id} />
        </div>
      </div>

      <StickyPlayAction />
    </PageShell>
  );
}
