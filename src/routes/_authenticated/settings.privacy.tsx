import { createFileRoute } from "@tanstack/react-router";
import { ProfileVisibilityPanel } from "@/components/profile/profile-visibility-panel";

export const Route = createFileRoute("/_authenticated/settings/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Settings · DG Dashboard" },
      {
        name: "description",
        content: "Control who can see your profile, calendar, rounds, and stats.",
      },
      { property: "og:title", content: "Privacy Settings · DG Dashboard" },
      {
        property: "og:description",
        content: "Control who can see your profile, calendar, rounds, and stats.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacySettings,
});

function PrivacySettings() {
  return <ProfileVisibilityPanel />;
}
