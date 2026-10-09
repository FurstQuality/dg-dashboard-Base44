import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/shell/page-shell";
import { RatingsPanel } from "@/components/ratings-panel";
import { ProfileEditor } from "@/components/profile/profile-editor";

/**
 * Editing lives on the player's own profile page, so viewing and editing are
 * the same surface. This route only exists for older links: it forwards to the
 * profile's Edit tab, and still shows the editor for a brand-new account that
 * hasn't picked a username yet.
 */
export const Route = createFileRoute("/_authenticated/me/edit")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", uid)
      .maybeSingle();
    const username = profile?.username?.trim();
    if (username) {
      throw redirect({
        to: "/players/$username",
        params: { username },
        search: { tab: "edit" },
      });
    }
  },
  component: EditProfile,
  head: () => ({
    meta: [
      { title: "Set up your profile · DG Dashboard" },
      {
        name: "description",
        content: "Set your player details, home course, PDGA number, and cover art.",
      },
      { property: "og:title", content: "Set up your profile · DG Dashboard" },
      {
        property: "og:description",
        content: "Set your player details, home course, PDGA number, and cover art.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

function EditProfile() {
  return (
    <PageShell>
      <RatingsPanel />
      <ProfileEditor afterSave="profile" />
    </PageShell>
  );
}
