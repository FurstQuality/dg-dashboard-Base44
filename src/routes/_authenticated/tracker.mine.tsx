import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Crews and tracked players are the same tool, so this old path forwards to the
 * combined page instead of showing half the picture.
 */
export const Route = createFileRoute("/_authenticated/tracker/mine")({
  beforeLoad: () => {
    throw redirect({ to: "/tracker/players", replace: true });
  },
});
