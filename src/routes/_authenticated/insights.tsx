import { createFileRoute, redirect } from "@tanstack/react-router";

// Insights hub has been merged into StatLink. Every "all player tools" entry
// now lives on the main /stats page, so redirect legacy links.
export const Route = createFileRoute("/_authenticated/insights")({
  beforeLoad: () => {
    throw redirect({ to: "/stats" });
  },
});
