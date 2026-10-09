import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/marketplace/lost-found")({
  beforeLoad: () => {
    throw redirect({ to: "/lost-found" });
  },
});
