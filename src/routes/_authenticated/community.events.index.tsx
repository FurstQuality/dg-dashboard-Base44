import { createFileRoute, redirect } from "@tanstack/react-router";

/** Community outreach & growth events now live on the combined Events page. */
export const Route = createFileRoute("/_authenticated/community/events/")({
  beforeLoad: () => {
    throw redirect({ to: "/events", search: { hub: "community" } });
  },
});
