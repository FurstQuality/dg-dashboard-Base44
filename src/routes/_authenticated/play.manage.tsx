import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/play/manage")({
  beforeLoad: () => {
    throw redirect({ to: "/director/tournaments" });
  },
});
