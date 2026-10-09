import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/community/friends")({
  beforeLoad: () => {
    throw redirect({ to: "/people", search: { tab: "friends" } });
  },
});
