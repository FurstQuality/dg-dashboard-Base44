import { createFileRoute, redirect } from "@tanstack/react-router";

/** Course Analytics lives at /game-plan; this keeps the Tracker-shaped URL working. */
export const Route = createFileRoute("/_authenticated/tracker/courses")({
  beforeLoad: () => {
    throw redirect({ to: "/game-plan" });
  },
});
