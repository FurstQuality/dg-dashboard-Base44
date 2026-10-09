import { Sparkles, Users, MapPin, Building2, Trophy, Bookmark } from "lucide-react";
import type { FeedFilter } from "@/lib/feed";

export type { FeedFilter };

const TABS: {
  value: FeedFilter;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "for-you", label: "For You", icon: Sparkles },
  { value: "following", label: "Following", icon: Users },
  { value: "local", label: "Local", icon: MapPin },
  { value: "clubs", label: "Clubs", icon: Building2 },
  { value: "tournaments", label: "Events", icon: Trophy },
  { value: "saved", label: "Saved", icon: Bookmark },
];

export function FeedFilterBar({
  value,
  onChange,
}: {
  value: FeedFilter;
  onChange: (v: FeedFilter) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Feed filters"
      className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-card p-1 sm:grid-cols-6"
    >
      {TABS.map((t) => {
        const Icon = t.icon;
        const active = value === t.value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            title={t.label}
            className={
              "inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-xl px-1.5 text-xs font-semibold transition " +
              (active
                ? "bg-primary/15 text-primary shadow-inner"
                : "text-muted-foreground hover:bg-muted hover:text-foreground")
            }
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
