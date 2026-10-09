import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Quests now live on the Achievements & Trophies page. Keep this path working
 * for old links and bookmarks.
 */
export const Route = createFileRoute("/_authenticated/challenges")({
  beforeLoad: () => {
    throw redirect({ to: "/achievements" });
  },
  component: () => null,
});
