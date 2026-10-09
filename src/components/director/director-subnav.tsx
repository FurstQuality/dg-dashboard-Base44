import { Building2, CalendarRange, LayoutDashboard, Users } from "lucide-react";
import { HubTabs, type HubTab } from "@/components/hub-tabs";

/**
 * The one Event Director navigation. Child pages never repeat it; player
 * rosters, check-in and prep live inside each event.
 */
export const DIRECTOR_TABS: HubTab[] = [
  { to: "/director", label: "Dashboard", icon: LayoutDashboard, exact: true, description: "What you're running and what needs attention." },
  {
    to: "/director/tournaments",
    label: "Events",
    icon: CalendarRange,
    match: ["/director/tournaments", "/director/events", "/director/leagues", "/director/series", "/director/payouts", "/director/registrations", "/director/check-in", "/director/ops", "/director/kit", "/director/new", "/community/new", "/td"],
    description: "Every event you own, direct or help manage — tournaments, leagues and series.",
    sub: [
      { to: "/director/tournaments", label: "Tournaments", match: ["/director/tournaments", "/director/events"] },
      { to: "/director/leagues", label: "Leagues" },
      { to: "/director/series", label: "Series" },
    ],
  },
  { to: "/director/team", label: "Team", icon: Users, description: "Co-directors, staff and volunteers." },
  {
    to: "/director/clubs",
    label: "Organization",
    icon: Building2,
    match: ["/director/clubs", "/clubs/manage", "/director/profile"],
    description: "Clubs, host organizations and your organizer profile.",
    sub: [
      { to: "/director/clubs", label: "Clubs & organizations" },
      { to: "/director/profile", label: "Organizer profile" },
    ],
  },
];

export function DirectorSubnav() {
  return <HubTabs tabs={DIRECTOR_TABS} label="Event Director" compact />;
}
