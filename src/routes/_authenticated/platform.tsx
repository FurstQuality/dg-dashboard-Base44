import { createFileRoute, redirect } from "@tanstack/react-router";

// Platform configuration lives inside the Admin dashboard.
export const Route = createFileRoute("/_authenticated/platform")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/platform" });
  },
});
