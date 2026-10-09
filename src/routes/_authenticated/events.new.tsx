import { createFileRoute, redirect } from "@tanstack/react-router";

// Creating events lives in Event Manager; old links land there.
export const Route = createFileRoute("/_authenticated/events/new")({
  beforeLoad: () => {
    throw redirect({ to: "/director/new", replace: true });
  },
});
