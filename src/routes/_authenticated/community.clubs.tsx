import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/community/clubs")({
  beforeLoad: () => {
    throw redirect({ to: "/clubs" });
  },
});
