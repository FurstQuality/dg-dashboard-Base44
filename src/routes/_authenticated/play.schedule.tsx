import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/play/schedule")({
  beforeLoad: () => {
    throw redirect({ to: "/schedule" });
  },
});
