import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy TD console path — the canonical home is Event Director → Tournaments. */
export const Route = createFileRoute("/_authenticated/td")({
  beforeLoad: () => {
    throw redirect({ to: "/director/tournaments" });
  },
});
