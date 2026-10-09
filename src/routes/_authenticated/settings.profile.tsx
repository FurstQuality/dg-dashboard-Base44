import { createFileRoute, Link } from "@tanstack/react-router";
import { SettingsPageTitle } from "@/components/settings/settings-page-title";
import { Button } from "@/components/ui/button";
import { CreatorCta } from "@/components/creator/creator-cta";
import { ProfileEditor } from "@/components/profile/profile-editor";

export const Route = createFileRoute("/_authenticated/settings/profile")({
  head: () => ({
    meta: [
      { title: "Profile Settings · DG Dashboard" },
      {
        name: "description",
        content: "Update your player details, linked PDGA and UDisc profiles, and home course.",
      },
      { property: "og:title", content: "Profile Settings · DG Dashboard" },
      {
        property: "og:description",
        content: "Update your player details, linked PDGA and UDisc profiles, and home course.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfileSettings,
});

function ProfileSettings() {
  return (
    <div className="space-y-4">
      <SettingsPageTitle title="Profile" description="Your identity, home course, and linked PDGA details." />

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-2 text-lg font-semibold">Player profile</div>
        <p className="text-sm text-muted-foreground">
          Edit everything right here — photos, identity, home turf, and aces. Saves sync everywhere:
          feed, DG Statboard, tournament rosters, and your public share page.
        </p>
        <div className="mt-4">
          <ProfileEditor showStats={false} afterSave="stay" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/me/bag">Manage your bag</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/me">View player profile</Link>
          </Button>
        </div>
      </div>


      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-2 text-lg font-semibold">Content creator & ambassador</div>
        <p className="text-sm text-muted-foreground">
          Post disc golf content, cover events, or represent a course or club. Apply once — we'll
          review and unlock the Creator Studio when you're in.
        </p>
        <div className="mt-4">
          <CreatorCta />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-2 text-lg font-semibold">Account & sign-in</div>
        <p className="text-sm text-muted-foreground">
          Change your password, update your email, or sign out of every device.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/reset-password">Change password</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
