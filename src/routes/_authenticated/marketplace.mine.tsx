import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/marketplace/mine")({
  beforeLoad: () => {
    throw redirect({ to: "/marketplace", search: { view: "mine" } });
  },
});
