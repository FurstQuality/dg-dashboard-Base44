import { createFileRoute, redirect } from "@tanstack/react-router";

/** My events & calendar now lives on the combined Events page. */
export const Route = createFileRoute("/_authenticated/schedule")({
  beforeLoad: () => {
    throw redirect({ to: "/events", search: { hub: "mine" } });
  },
});
