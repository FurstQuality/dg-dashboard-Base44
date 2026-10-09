import { createFileRoute } from "@tanstack/react-router";
import { SettingsPageTitle } from "@/components/settings/settings-page-title";
import { ThemeControls, ThemeActions } from "@/components/theme/theme-controls";

export const Route = createFileRoute("/_authenticated/settings/personalization")({
  head: () => ({
    meta: [
      { title: "Personalization · DG Dashboard" },
      {
        name: "description",
        content: "Tune theme, density, and typography across your DG Dashboard surfaces.",
      },
      { property: "og:title", content: "Personalization · DG Dashboard" },
      {
        property: "og:description",
        content: "Tune theme, density, and typography across your DG Dashboard surfaces.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PersonalizationSettings,
});

function PersonalizationSettings() {
  return (
    <div className="space-y-4">
      <SettingsPageTitle
        title="Look & feel"
        description="Set your theme, density, and text size across the app. These are the same controls as Personalize in your profile menu — changes show up in both places instantly."
      />
      <ThemeControls variant="page" />
      <ThemeActions variant="page" />
    </div>
  );
}
