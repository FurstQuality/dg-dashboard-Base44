import { createFileRoute, redirect } from "@tanstack/react-router";

/** The round-type step was removed: starting a round now begins at course
 *  selection, zoomed to the player's own area. Old links land there too.
 *  Only the non-default filters are passed — the course directory fills the
 *  rest from its own schema, so this stays correct if those defaults change. */
export const Route = createFileRoute("/_authenticated/play/new")({
  beforeLoad: () => {
    throw redirect({ to: "/courses", search: { sort: "near", locate: "1" } });
  },
});
