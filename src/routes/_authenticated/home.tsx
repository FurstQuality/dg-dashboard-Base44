import { createFileRoute, redirect } from "@tanstack/react-router";

// The Social Feed now lives at /community; old links keep working.
export const Route = createFileRoute("/_authenticated/home")({
  beforeLoad: () => {
    throw redirect({ to: "/community", replace: true });
  },
});
