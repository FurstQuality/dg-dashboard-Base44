import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/play/compete/leagues")({
  beforeLoad: () => {
    throw redirect({ to: "/events" });
  },
});
