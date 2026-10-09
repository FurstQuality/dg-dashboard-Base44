import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/community/achievements")({
  beforeLoad: () => {
    throw redirect({ to: "/achievements" });
  },
  component: () => null,
});
