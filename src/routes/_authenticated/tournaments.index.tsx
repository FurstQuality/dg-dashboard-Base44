import { createFileRoute, redirect } from "@tanstack/react-router";

// Consolidated into the unified Events Library.
export const Route = createFileRoute("/_authenticated/tournaments/")({
  beforeLoad: () => {
    throw redirect({ to: "/events" });
  },
});
