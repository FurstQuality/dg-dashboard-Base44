import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/me/")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", uid)
      .maybeSingle();
    const username = profile?.username?.trim();
    if (username) {
      // One profile page for members: the same page they'd see for anyone else.
      throw redirect({ to: "/players/$username", params: { username } });
    }
    // No username yet — send them to the editor to set one up.
    throw redirect({ to: "/me/edit" });
  },
  component: () => null,
});
