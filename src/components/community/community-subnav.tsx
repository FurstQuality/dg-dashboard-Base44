import {
  Newspaper,
  Users,
  HeartHandshake,
  Store,
  Search,
} from "lucide-react";
import { HubTabs, type HubTab } from "@/components/hub-tabs";
import { useCommunityBadges } from "./use-community-badges";
import { SECTION_PATHS, matchesPaths } from "@/lib/section-nav";

type Tab = {
  to: string;
  label: string;
  icon: typeof Users;
  match: string[];
  exact?: boolean;
  /** CSS variable name (without --) for the category accent */
  accent?: string;
  description?: string;
  sub?: { to: string; label: string; match?: string[] }[];
};

const TABS: Tab[] = [
  {
    to: "/community",
    label: "Feed",
    icon: Newspaper,
    match: ["/community", "/home", "/feed"],
    exact: true,
    description: "Posts, rounds and aces from your friends and the scene.",
  },
  {
    to: "/people",
    label: "People",
    icon: Users,
    match: ["/people"],
    accent: "accent-clubs",
    description: "Players, directors, volunteers, and friends near you.",
  },
  {
    to: "/clubs",
    label: "Clubs",
    icon: HeartHandshake,
    match: ["/clubs"],
    accent: "accent-clubs",
    description: "Local clubs — join one, follow their nights, or start your own.",
  },
  {
    to: "/marketplace",
    label: "Marketplace",
    icon: Store,
    match: ["/marketplace"],
    accent: "accent-clubs",
    description: "Buy, sell, and trade discs with players near you.",
  },
  {
    to: "/lost-found",
    label: "Lost & Found",
    icon: Search,
    match: ["/lost-found"],
    accent: "accent-clubs",
    description: "Report a lost disc or post one you found.",
  },
];

export const COMMUNITY_PATHS = SECTION_PATHS.community;

export function isCommunityPath(pathname: string): boolean {
  return matchesPaths(pathname, COMMUNITY_PATHS);
}

export function CommunitySubnav() {
  const { friendRequests } = useCommunityBadges();

  const tabs: HubTab[] = TABS.map((t) => ({
    to: t.to,
    label: t.label,
    icon: t.icon,
    match: t.match,
    exact: t.exact,
    badge: t.to === "/friends" ? friendRequests : undefined,
    description: t.description,
    sub: t.sub,
  }));

  return <HubTabs tabs={tabs} label="Community" compact />;
}
