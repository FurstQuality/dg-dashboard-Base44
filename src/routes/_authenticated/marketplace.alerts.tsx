import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/marketplace/alerts")({
  beforeLoad: () => {
    throw redirect({ to: "/marketplace", search: { view: "alerts" } });
  },
});
