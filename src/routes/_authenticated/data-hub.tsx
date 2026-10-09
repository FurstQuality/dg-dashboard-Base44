import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/data-hub")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/imports", search: { tab: "overview" } });
  },
  component: () => null,
});
