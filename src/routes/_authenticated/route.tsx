import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { AppTour } from "@/components/onboarding/app-tour";
import { waitForAuthSession } from "@/lib/auth-flow";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const session = await waitForAuthSession(3000);
    if (!session) throw redirect({ to: "/auth", search: { next: location.href } });
    return { user: session.user };
  },
  component: AuthenticatedLayout,
});

/** Named Play child pages keep the app chrome; only live scoring goes fullscreen. */
const PLAY_CHILD_PAGES = new Set([
  "new",
  "compete",
  "courses",
  "manage",
  "practice",
  "rounds",
  "schedule",
]);

function isScoringPath(pathname: string): boolean {
  const match = /^\/play\/([^/]+)/.exec(pathname);
  return Boolean(match && !PLAY_CHILD_PAGES.has(match[1]));
}

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Scoring and DGIM messaging run in dedicated fullscreen mode — no app chrome.
  const isFullscreenSurface = isScoringPath(pathname) || pathname.startsWith("/dgim");

  if (isFullscreenSurface) return <Outlet />;
  return (
    <AppShell>
      <Outlet />
      {/* First-visit walkthrough of every main section; reopenable from Settings. */}
      <AppTour />
    </AppShell>
  );
}
