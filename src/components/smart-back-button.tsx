import { useRouterState, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Home / hub roots — the back button hides here because there is nowhere
 * meaningful to go "back" to within the app.
 */
const HOME_ROOTS = new Set<string>([
  "/",
  "/home",
  "/feed",
  "/play",
  "/community",
  "/stats",
  "/statlink",
  "/events",
  "/courses",
  "/ace",
  "/me",
  "/profile",
  "/notifications",
  "/achievements",
  "/admin",
  "/director",
  "/tracker",
  "/studio",
  "/settings",
  "/clubs",
  "/friends",
  "/arena",
  "/dgim",
  "/schedule",
  "/practice",
]);

/**
 * Canonical parent destination per section, longest prefix wins. Keeps every
 * child page anchored to the main page that owns it, so Back always walks
 * toward a hub instead of a random URL segment.
 */
const SECTION_PARENTS: Array<{ prefix: string; to: string; label: string }> = [
  { prefix: "/tracker/", to: "/tracker", label: "Tournament Tracker" },
  { prefix: "/director/", to: "/director", label: "Event Director" },
  { prefix: "/studio/", to: "/studio", label: "Creator Studio" },
  { prefix: "/settings/", to: "/settings", label: "Settings" },
  { prefix: "/community/", to: "/community", label: "Community" },
  { prefix: "/clubs/", to: "/clubs", label: "Clubs" },
  { prefix: "/courses/", to: "/courses", label: "Courses" },
  { prefix: "/events/", to: "/events", label: "Events" },
  { prefix: "/tournaments/", to: "/events", label: "Events" },
  { prefix: "/leagues/", to: "/events", label: "Events" },
  { prefix: "/course-book/", to: "/course-book", label: "Course Book" },
  { prefix: "/players/", to: "/community", label: "Community" },
  { prefix: "/tag/", to: "/home", label: "Feed" },
  { prefix: "/admin/", to: "/admin", label: "Admin" },
  { prefix: "/schedule/", to: "/schedule", label: "Schedule" },
  { prefix: "/me/", to: "/me", label: "Profile" },
  { prefix: "/play/", to: "/play", label: "Play" },
  { prefix: "/statlink/", to: "/statlink", label: "DG Statboard" },
  { prefix: "/stats/", to: "/stats", label: "DG Statboard" },
  { prefix: "/practice/", to: "/practice", label: "Practice" },
  { prefix: "/friends/", to: "/friends", label: "Friends" },
  { prefix: "/arena/", to: "/arena", label: "Arena" },
  { prefix: "/dgim/", to: "/dgim", label: "DGIM" },
  { prefix: "/feed/", to: "/home", label: "Feed" },
  { prefix: "/home/", to: "/home", label: "Feed" },
];

/** Standalone tools that belong to a hub even though the URL is top level. */
const TOOL_PARENTS: Record<string, { to: string; label: string }> = {
  "/game-plan": { to: "/stats", label: "DG Statboard" },
  "/compare": { to: "/stats", label: "DG Statboard" },
  "/what-if": { to: "/stats", label: "DG Statboard" },
  "/rating-impact": { to: "/stats", label: "DG Statboard" },
  "/rating-studio": { to: "/stats", label: "DG Statboard" },
  "/course-book": { to: "/stats", label: "DG Statboard" },
  "/insights": { to: "/stats", label: "DG Statboard" },
  "/season-planner": { to: "/stats", label: "DG Statboard" },
  "/leaderboards": { to: "/events", label: "Events" },
  "/challenges": { to: "/arena", label: "Arena" },
  "/action-items": { to: "/home", label: "Feed" },
  "/messages": { to: "/dgim", label: "DGIM" },
  "/weather": { to: "/play", label: "Play" },
  "/range": { to: "/practice", label: "Practice" },
  "/putting": { to: "/practice", label: "Practice" },
  "/compete": { to: "/play", label: "Play" },
  "/rounds": { to: "/play", label: "Play" },
  "/tournaments": { to: "/events", label: "Events" },
  "/leagues": { to: "/events", label: "Events" },
  "/td": { to: "/director", label: "Event Director" },
  "/billing": { to: "/settings", label: "Settings" },
  "/pricing": { to: "/settings", label: "Settings" },
  "/data-hub": { to: "/settings", label: "Settings" },
  "/import": { to: "/settings", label: "Settings" },
  "/pdga-kb": { to: "/settings", label: "Settings" },
  "/admin/platform": { to: "/admin", label: "Admin" },
  "/beta": { to: "/home", label: "Feed" },
};

function resolveParent(pathname: string): { to: string; label: string } {
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  const tool = TOOL_PARENTS[trimmed];
  if (tool) return tool;
  const section = SECTION_PARENTS.find((s) => trimmed.startsWith(s.prefix));
  if (section) return section;
  return { to: "/home", label: "Feed" };
}

/**
 * Single, app-wide back affordance. Rendered once by AppShell above every
 * page body so no route needs its own bespoke "Back to X" link.
 */
export function SmartBackButton({ className }: { className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (HOME_ROOTS.has(pathname.replace(/\/+$/, "") || "/")) return null;

  const { to, label } = resolveParent(pathname);
  return (
    <Button asChild variant="ghost" size="sm" className={className}>
      <Link to={to} aria-label={`Back to ${label}`}>
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back to {label}
      </Link>
    </Button>
  );
}
