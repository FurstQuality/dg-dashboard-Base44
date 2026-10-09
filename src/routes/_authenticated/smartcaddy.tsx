import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy URL — the caddy is now "Ace". Keep this redirect for old links. */
export const Route = createFileRoute("/_authenticated/smartcaddy")({
  beforeLoad: () => {
    throw redirect({ to: "/ace", replace: true });
  },
});
