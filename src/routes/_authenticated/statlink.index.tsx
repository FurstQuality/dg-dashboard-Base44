import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/statlink/")({
  beforeLoad: () => {
    throw redirect({ to: "/stats" });
  },
});
