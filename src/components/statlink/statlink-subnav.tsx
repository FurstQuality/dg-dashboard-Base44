import { TrendingUp, Target, MapPin, Swords, type LucideIcon } from "lucide-react";

import { HeaderNavSlot, HubCardGrid, HubNavCard } from "@/components/hub-tabs";

/**
 * DG Statboard section navigation. Uses the same large nav cards as every other
 * hub (Play, Community, Event Director, Tracker) so navigation is uniform.
 * The Face-Off & Lookup tool sits in the same grid so players never leave the
 * ratings context to reach a related planning tool. What-If simulation now
 * lives inside Goals & Target rather than as its own destination.
 */

export function StatlinkSubnav({
  active,
  onChange,
  activeTool,
}: {
  active?: string;
  onChange?: (v: string) => void;
  activeTool?: "compare" | "what-if";
}) {
  // Primary sections stay in front: the four views that answer "how am I
  // playing?". Everything else is a deep dive behind "See more".
  const sections = [
    {
      value: "overview",
      label: "Performance",
      icon: TrendingUp,
      description: "Ratings, round history, and scoring — all on one page.",
    },
    {
      value: "courses",
      label: "Course Book",
      icon: MapPin,
      description: "How you score at each course and layout you have played.",
    },
  ] as const;

  const deepSections = [
    {
      value: "goals",
      label: "Goals & Target",
      icon: Target,
      description: "Set a target rating, then simulate rounds to project where you land.",
    },
  ] as const;

  const tools = [
    {
      to: "/compare",
      key: "compare",
      label: "PDGA Player Stat Search",
      icon: Swords,
      description: "Look up any PDGA player and compare head-to-head.",
    },
  ] as const;

  const renderSection = (s: {
    value: string;
    label: string;
    description: string;
    icon: LucideIcon;
  }) =>
    onChange ? (
      <HubNavCard
        key={s.value}
        icon={s.icon}
        label={s.label}
        description={s.description}
        compact
        themePath={`/stats/${s.value}`}
        active={active === s.value}
        onClick={() => onChange(s.value)}
      />
    ) : (
      <HubNavCard
        key={s.value}
        to="/stats"
        search={{ tab: s.value }}
        icon={s.icon}
        label={s.label}
        description={s.description}
        compact
        themePath={`/stats/${s.value}`}
        active={false}
      />
    );

  return (
    <HeaderNavSlot>
      <nav aria-label="DG Statboard sections" className="mb-4">
        <HubCardGrid className="grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-4">
          {sections.map((s) => renderSection(s))}
          {deepSections.map((s) => renderSection(s))}
          {tools.map((t) => (
            <HubNavCard
              key={t.to}
              to={t.to}
              icon={t.icon}
              label={t.label}
              description={t.description}
              compact
              active={activeTool === t.key}
            />
          ))}
        </HubCardGrid>
      </nav>
    </HeaderNavSlot>
  );
}
