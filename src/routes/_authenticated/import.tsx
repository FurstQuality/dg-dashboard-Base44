import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/import")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/imports", search: { tab: "rounds" } });
  },
  component: () => null,
});
