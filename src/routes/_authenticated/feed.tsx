import { createFileRoute, redirect } from "@tanstack/react-router";

// Canonical: /feed → the feed is the Community home.
export const Route = createFileRoute("/_authenticated/feed")({
  beforeLoad: () => {
    throw redirect({ to: "/community", replace: true });
  },
});
