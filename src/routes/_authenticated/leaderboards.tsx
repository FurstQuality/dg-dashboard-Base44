import { createFileRoute, redirect } from "@tanstack/react-router";

// Consolidated into the unified Events Library.
export const Route = createFileRoute("/_authenticated/leaderboards")({
  beforeLoad: () => {
    throw redirect({ to: "/events" });
  },
});
