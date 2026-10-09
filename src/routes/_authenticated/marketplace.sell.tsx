import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/marketplace/sell")({
  beforeLoad: () => {
    throw redirect({ to: "/marketplace", search: { view: "sell" } });
  },
});
