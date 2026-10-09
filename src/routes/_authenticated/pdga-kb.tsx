import { createFileRoute, redirect } from "@tanstack/react-router";

// PDGA course/player/event search is now surfaced from the Course Book directory.
export const Route = createFileRoute("/_authenticated/pdga-kb")({
  beforeLoad: () => {
    throw redirect({ to: "/course-book" });
  },
});
