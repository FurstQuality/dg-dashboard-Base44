import { createFileRoute, redirect } from "@tanstack/react-router";

// /tournaments/new is a natural guess: send it to the guided setup wizard
// instead of letting the detail page look for a tournament named "new".
export const Route = createFileRoute("/_authenticated/tournaments/new")({
  beforeLoad: () => {
    throw redirect({ to: "/director/tournaments/new" });
  },
});
