import { createFileRoute, redirect } from "@tanstack/react-router";

// /leagues/new is a natural guess: send it to the guided setup wizard instead
// of letting the detail page look for a league named "new".
export const Route = createFileRoute("/_authenticated/leagues/new")({
  beforeLoad: () => {
    throw redirect({ to: "/director/leagues/new" });
  },
});
