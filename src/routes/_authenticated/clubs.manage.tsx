import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy club manager path — the canonical home is Event Director → Clubs. */
export const Route = createFileRoute("/_authenticated/clubs/manage")({
  beforeLoad: () => {
    throw redirect({ to: "/director/clubs" });
  },
});
