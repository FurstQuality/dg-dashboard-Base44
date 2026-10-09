import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/play/compete/tournaments")({
  beforeLoad: () => {
    throw redirect({ to: "/events" });
  },
});
