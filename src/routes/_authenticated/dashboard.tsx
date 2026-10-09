import { createFileRoute, redirect } from "@tanstack/react-router";

// The combined home dashboard was retired — every widget now lives on the
// section overview it belongs to. Old links land on the feed.
export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/home" });
  },
});
