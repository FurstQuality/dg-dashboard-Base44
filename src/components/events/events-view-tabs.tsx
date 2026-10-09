import { Link } from "@tanstack/react-router";
import { CalendarDays, Compass, HeartHandshake, Layers } from "lucide-react";

export type EventsView = "browse" | "mine" | "community" | "series";

const VIEWS: { key: EventsView; label: string; short: string; icon: typeof Compass }[] = [
  { key: "browse", label: "Discover", short: "Discover", icon: Compass },
  { key: "mine", label: "My Events", short: "Mine", icon: CalendarDays },
  { key: "community", label: "Community", short: "Community", icon: HeartHandshake },
  { key: "series", label: "Series", short: "Series", icon: Layers },
];

/**
 * One switcher shared by every Events view so tournaments, leagues, your own
 * calendar, and community outreach all live on a single page. Sized to fit any
 * screen width, so it never needs to scroll sideways.
 */
export function EventsViewTabs({ current }: { current: EventsView }) {
  return (
    <div
      className="grid w-full grid-cols-4 items-center gap-1 rounded-control border border-border bg-card p-1"
      role="tablist"
      aria-label="Events views"
    >
      {VIEWS.map((v) => {
        const on = v.key === current;
        const Icon = v.icon;
        return (
          <Link
            key={v.key}
            to={v.key === "series" ? "/series" : "/events"}
            search={v.key === "series" ? undefined : ({ hub: v.key } as never)}
            role="tab"
            aria-selected={on}
            title={v.label}
            className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-control px-2 py-1.5 text-xs font-semibold transition sm:text-sm ${
              on
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate sm:hidden">{v.short}</span>
            <span className="hidden truncate sm:inline">{v.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
