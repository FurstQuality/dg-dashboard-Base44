import { Link } from "@tanstack/react-router";
import { Bookmark, LayoutDashboard, MapPin, type LucideIcon, UserSearch } from "lucide-react";
import { HeaderNavSlot, hubTabClass } from "@/components/hub-tabs";

/**
 * Tracker navigation. Three separate tools — events, players, and course
 * analytics — plus the overview and your crew list.
 */
export type TrackerSection = "overview" | "events" | "players" | "courses";

type SectionDef = {
  value: TrackerSection;
  label: string;
  icon: LucideIcon;
  to: "/tracker" | "/tracker/events" | "/tracker/players" | "/game-plan";
};

const SECTIONS: SectionDef[] = [
  { value: "overview", label: "Overview", icon: LayoutDashboard, to: "/tracker" },
  { value: "events", label: "Event Tracker", icon: Bookmark, to: "/tracker/events" },
  { value: "players", label: "Players & crews", icon: UserSearch, to: "/tracker/players" },
  { value: "courses", label: "Course Analytics", icon: MapPin, to: "/game-plan" },
];

export function TrackerSubnav({ active }: { active: TrackerSection }) {
  return (
    <HeaderNavSlot>
      <nav aria-label="Tracker sections" className="mb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = section.value === active;
            return (
              <Link
                key={section.value}
                to={section.to}
                aria-current={isActive ? "page" : undefined}
                className={hubTabClass(isActive)}
              >
                <Icon className="mr-1.5 inline h-3.5 w-3.5" />
                {section.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </HeaderNavSlot>
  );
}
