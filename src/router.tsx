import { QueryClient } from "@tanstack/react-query";
import { createRouter, ErrorComponent as DefaultErrorComponent } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function DefaultNotFound() {
  return (
    <div style={{ padding: 24, textAlign: "center", color: "#e5e7eb" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Page not found</h1>
      <p style={{ marginTop: 8, opacity: 0.75 }}>
        The page you're looking for doesn't exist or was moved.
      </p>
      <a href="/" style={{ marginTop: 16, display: "inline-block", color: "#22d3ee" }}>
        Go home
      </a>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Reasonable default freshness. Live surfaces (scoring, trackers,
        // notifications) opt into staleTime: 0 explicitly at the query site
        // instead of paying that cost app-wide.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Warm the route chunk + loader data as soon as a link is hovered/focused,
    // and reuse that work for a short window instead of refetching on click.
    defaultPreload: "intent",
    defaultPreloadDelay: 60,
    defaultPreloadStaleTime: 10_000,
    defaultErrorComponent: DefaultErrorComponent,
    defaultNotFoundComponent: DefaultNotFound,
  });

  // NOTE: We do NOT blanket-invalidate on every route change. Router loaders
  // + Query's normal staleTime handle cross-page freshness. Mutations should
  // invalidate the specific keys they affect.

  return router;
};
