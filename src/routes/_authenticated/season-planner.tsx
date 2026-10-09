import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/season-planner")({
  beforeLoad: () => {
    throw redirect({ to: "/game-plan" });
  },
});
