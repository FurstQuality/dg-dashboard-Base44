import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/community/trackers")({
  beforeLoad: () => {
    throw redirect({ to: "/tracker" });
  },
});
