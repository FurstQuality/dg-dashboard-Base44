import { createFileRoute, redirect } from "@tanstack/react-router";

// Rounds are now part of the Play overview; keep old links and bookmarks working.
export const Route = createFileRoute("/_authenticated/rounds")({
  beforeLoad: () => {
    throw redirect({ to: "/play" });
  },
});
