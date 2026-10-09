import { createFileRoute, redirect } from "@tanstack/react-router";

// Platform configuration now lives on its own top-level page.
export const Route = createFileRoute("/_authenticated/settings/platform")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/platform" });
  },
});
