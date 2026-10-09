import { createFileRoute, redirect } from "@tanstack/react-router";

/** Friends now live on the combined People page. */
export const Route = createFileRoute("/_authenticated/friends")({
  beforeLoad: () => {
    throw redirect({ to: "/people", search: { tab: "friends" } });
  },
});
