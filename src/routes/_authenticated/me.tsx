import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { useMyProfile, useSession, initials } from "@/lib/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageShell } from "@/components/shell";

export const Route = createFileRoute("/_authenticated/me")({
  component: MeLayout,
  head: () => ({
    meta: [
      { title: "My profile · DG Dashboard" },
      {
        name: "description",
        content: "Your DG Dashboard profile, bag, and personalization settings.",
      },
      { property: "og:title", content: "My Profile · DG Dashboard" },
      {
        property: "og:description",
        content: "Manage your disc golf profile and bag on DG Dashboard.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

const TABS: Array<{ to: string; label: string; exact?: boolean }> = [
  { to: "/me/bag", label: "My Bag" },
];


function MeLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useSession();
  const { profile } = useMyProfile(user);

  return (
    <PageShell section="profile">
      <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-background p-4 sm:p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <Avatar className="h-24 w-24">
            {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} /> : null}
            <AvatarFallback className="text-2xl">{initials(profile?.display_name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h1 className="font-display text-2xl font-bold sm:text-3xl">
              {profile?.display_name ?? "Your Profile"}
            </h1>
            <div className="text-sm text-muted-foreground">@{profile?.username ?? "…"}</div>
            {profile?.bio ? (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{profile.bio}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
          {TABS.map((t) => {
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={
                  "rounded-full border px-4 py-1.5 text-sm transition " +
                  (active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground")
                }
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <Outlet />
      </div>
    </PageShell>
  );
}
