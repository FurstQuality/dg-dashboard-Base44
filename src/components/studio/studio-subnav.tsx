import {
  LayoutDashboard,
  PenSquare,
  CalendarClock,
  BarChart3,
  BookmarkPlus,
  Lightbulb,
  Shield,
  Settings,
  Sparkles,
  Frame,
} from "lucide-react";
import { HubTabs, type HubTab } from "@/components/hub-tabs";

export const STUDIO_TABS: HubTab[] = [
  {
    to: "/studio",
    label: "Overview",
    icon: LayoutDashboard,
    exact: true,
    description: "See publishing status, recent reach, and what to work on next.",
  },
  {
    to: "/studio/composer",
    label: "Composer",
    icon: PenSquare,
    description: "Write, attach media, and publish posts to the home feed.",
  },
  {
    to: "/studio/calendar",
    label: "Calendar",
    icon: CalendarClock,
    description: "Schedule upcoming posts and review your publishing queue.",
  },
  {
    to: "/studio/analytics",
    label: "Analytics",
    icon: BarChart3,
    description: "Measure views, engagement, and follower growth over time.",
  },
  {
    to: "/studio/series",
    label: "Series",
    icon: BookmarkPlus,
    description: "Group recurring content into named series players can follow.",
  },
  {
    to: "/studio/ideas",
    label: "Ideas",
    icon: Lightbulb,
    description: "Park drafts and prompts so nothing gets lost between posts.",
  },
  {
    to: "/studio/overlays",
    label: "Overlay Lab",
    icon: Frame,
    description: "Build sponsor and contact frames for your photos and videos.",
  },
  {
    to: "/studio/ambassador",
    label: "Ambassador",
    icon: Shield,
    description: "Track ambassador status, requirements, and program perks.",
  },
  {
    to: "/studio/settings",
    label: "Profile",
    icon: Settings,
    description: "Update your creator profile, links, and publishing defaults.",
  },
];

/**
 * `approved` is false while a player is still applying: only the overview and
 * the application form are reachable, so the publishing tabs stay hidden.
 */
export function StudioSubnav({ approved = true }: { approved?: boolean }) {
  const tabs = approved
    ? STUDIO_TABS
    : STUDIO_TABS.filter((tab) => tab.to === "/studio" || tab.to === "/studio/settings");
  return (
    <>
      <div className="mb-3 min-w-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 shrink-0 text-primary" />
          <h1 className="truncate text-lg font-semibold">Creator Studio</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Create, schedule, and publish your disc golf content to the home feed.
        </p>
      </div>
      <HubTabs tabs={tabs} label="Creator Studio" compact />
    </>
  );
}
