import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/community/messages")({
  beforeLoad: () => {
    throw redirect({ to: "/dgim", search: { conv: undefined } });
  },
});
