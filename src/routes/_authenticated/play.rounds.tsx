import { createFileRoute, redirect } from "@tanstack/react-router";

// Rounds now live on the Play overview; keep the old path working.
export const Route = createFileRoute("/_authenticated/play/rounds")({
  beforeLoad: () => {
    throw redirect({ to: "/play" });
  },
});
