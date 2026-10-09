import { Link } from "@tanstack/react-router";
import { Users, MapPin, Building2, Trophy, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FeedFilter } from "@/lib/feed";

type Copy = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  action?: { label: string; to: string };
};

const COPY: Partial<Record<FeedFilter, Copy>> = {
  following: {
    icon: Users,
    title: "Nobody you follow has posted yet",
    body: "Follow players and add friends to build a feed of the people you actually play with.",
    action: { label: "Find players", to: "/friends" },
  },
  local: {
    icon: MapPin,
    title: "Nothing posted near you yet",
    body: "Set your home state on your profile and check in at your local course to fill this up.",
    action: { label: "Update profile", to: "/settings/profile" },
  },
  clubs: {
    icon: Building2,
    title: "No club posts yet",
    body: "Join a club to see league chatter, doubles nights, and club results here.",
    action: { label: "Browse clubs", to: "/clubs" },
  },
  tournaments: {
    icon: Trophy,
    title: "No tournament posts yet",
    body: "Tournament recaps, results, and registration news land here as your crew competes.",
    action: { label: "Find events", to: "/events" },
  },
  saved: {
    icon: Bookmark,
    title: "Nothing saved yet",
    body: "Tap the bookmark on any post to keep course beta, form tips, and results for later.",
  },
};

export function FeedFilterEmpty({ filter }: { filter: FeedFilter }) {
  const copy = COPY[filter];
  if (!copy) return null;
  const Icon = copy.icon;
  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-center">
      <Icon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <h2 className="text-sm font-semibold text-foreground">{copy.title}</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{copy.body}</p>
      {copy.action ? (
        <Button asChild size="sm" className="mt-4">
          <Link to={copy.action.to}>{copy.action.label}</Link>
        </Button>
      ) : null}
    </div>
  );
}
