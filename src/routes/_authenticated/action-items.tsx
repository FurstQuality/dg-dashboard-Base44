import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/action-items")({
  beforeLoad: () => {
    throw redirect({ to: "/game-plan" });
  },
});
