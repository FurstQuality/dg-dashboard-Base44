import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Back-compatibility for the retired /statlink/* addresses. One catch-all keeps
 * old bookmarks and shared links working without a file per path.
 */
const LEGACY: Record<string, string> = {
  coach: "/game-plan",
  compare: "/compare",
  courses: "/course-book",
  ratings: "/rating-studio",
  rounds: "/rounds",
  scoring: "/stats",
  overview: "/stats",
};

export const Route = createFileRoute("/_authenticated/statlink/$")({
  beforeLoad: ({ params }) => {
    const rest = (params as { _splat?: string })._splat ?? "";
    const first = rest.split("/")[0] ?? "";
    throw redirect({ to: LEGACY[first] ?? "/stats", replace: true });
  },
});
