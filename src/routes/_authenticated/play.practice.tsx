import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/play/practice")({
  beforeLoad: () => {
    throw redirect({ to: "/practice" });
  },
});
