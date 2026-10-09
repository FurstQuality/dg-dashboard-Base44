import { createFileRoute, redirect } from "@tanstack/react-router";
import { RouteErrorBoundary } from "@/components/route-boundaries";

/**
 * Rating Impact was merged into the What-If Simulator — both tools projected
 * the same PDGA 12-month window. The old path now redirects so existing links
 * and bookmarks keep working.
 */
export const Route = createFileRoute("/_authenticated/rating-impact")({
  beforeLoad: () => {
    throw redirect({ to: "/stats", search: { tab: "goals" } });
  },
  errorComponent: RouteErrorBoundary,
});
