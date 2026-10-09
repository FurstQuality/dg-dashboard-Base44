import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * What-If Simulator merged into StatLink → Goals & Target. Projections from
 * simulated rounds now sit beside the target you are chasing, so this route
 * only forwards legacy links to the combined tracker.
 */
export const Route = createFileRoute("/_authenticated/what-if")({
  beforeLoad: () => {
    throw redirect({ to: "/stats", search: { tab: "goals" } });
  },
});
