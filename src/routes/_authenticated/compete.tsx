import { createFileRoute, redirect } from "@tanstack/react-router";

// Replaced by the unified /events library.
export const Route = createFileRoute("/_authenticated/compete")({
  beforeLoad: () => {
    throw redirect({ to: "/events" });
  },
});
