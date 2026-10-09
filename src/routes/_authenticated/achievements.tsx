import { createFileRoute, Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { ProgressHub } from "@/components/progress/progress-hub";
import { useMyProfile, useSession } from "@/lib/current-user";

/**
 * Your own trophies, badges, quests and rankings. Other players' trophies live
 * on their profile at /players/$username?tab=achievements; this page is the
 * signed-in shortcut to the same hub.
 */
export const Route = createFileRoute("/_authenticated/achievements")({
  component: AchievementsPage,
  head: () => ({
    meta: [
      { title: "Achievements & Trophies · Badges, quests and rankings · DG Dashboard" },
      {
        name: "description",
        content:
          "Track your level and XP, work through daily and seasonal quests, collect badges, and see where you land on the community leaderboards.",
      },
      {
        property: "og:title",
        content: "Achievements & Trophies · Badges, quests and rankings · DG Dashboard",
      },
      {
        property: "og:description",
        content: "Your level, badges, quest rotation, Trophy Shelf and leaderboard standing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function AchievementsPage() {
  const { user, loading } = useSession();
  const { profile } = useMyProfile(user);
  const username = profile?.username?.trim();

  return (
    <PageShell>
      <PageHeader
        title="Achievements & Trophies"
        description="Your level and XP, the current quest rotation, every badge you've earned, and how you stack up in the community."
        secondaryAction={
          username ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/players/$username" params={{ username }} search={{ tab: "achievements" }}>
                View public profile
              </Link>
            </Button>
          ) : null
        }
      />

      {loading || (user && !profile) ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : username ? (
        <ProgressHub username={username} displayName={profile?.display_name ?? null} />
      ) : (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm font-semibold">Pick a username to start collecting</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Badges, quests and leaderboards are tied to your player page. Add a username and your
            trophies show up here.
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link to="/me/edit">Set up your profile</Link>
          </Button>
        </div>
      )}
    </PageShell>
  );
}
