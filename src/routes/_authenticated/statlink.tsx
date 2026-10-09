import { createFileRoute, Outlet } from "@tanstack/react-router";

// /statlink is a canonical namespace. Bare /statlink resolves via
// statlink.index.tsx → /stats; children are individual redirect files.
export const Route = createFileRoute("/_authenticated/statlink")({
  component: () => <Outlet />,
});
