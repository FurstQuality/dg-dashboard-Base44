import { LayoutDashboard, Dumbbell } from "lucide-react";
import { HubTabs, type HubTab } from "@/components/hub-tabs";

export const PLAY_TABS: HubTab[] = [
  {
    to: "/play",
    label: "Overview",
    icon: LayoutDashboard,
    match: ["/play"],
    description: "Start a round, resume active cards, and see friend activity.",
  },
  {
    to: "/practice",
    label: "Practice",
    icon: Dumbbell,
    match: ["/practice", "/range", "/putting"],
    description: "Run putting and field work sessions, then log the results.",
  },
];

/**
 * Sticky secondary navigation for the entire Play section. Mirrors the mental
 * map from the Play home so users always see where they are inside Play.
 */
export function PlaySubnav() {
  return <HubTabs tabs={PLAY_TABS} label="Play" compact />;
}
