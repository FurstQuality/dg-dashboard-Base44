import { useRouterState } from "@tanstack/react-router";
import { Mascot, type MascotName, type MascotPose } from "@/components/mascot";

/** Map top-level route → mascot persona + pose + tagline. */
const ROUTE_MASCOTS: Array<{
  test: (p: string) => boolean;
  name: MascotName;
  pose: MascotPose;
  title: string;
  tagline: string;
}> = [
  {
    test: (p) => p.startsWith("/home"),
    name: "scout",
    pose: "action",
    title: "The Feed",
    tagline: "See what your circle is playing today.",
  },

  {
    test: (p) => p.startsWith("/friends"),
    name: "mulley-glow",
    pose: "action",
    title: "Friends",
    tagline: "Requests, suggestions, and your card.",
  },
  {
    test: (p) => p.startsWith("/messages"),
    name: "mulley",
    pose: "default",
    title: "Messages",
    tagline: "Plan the next round with your crew.",
  },
  {
    test: (p) => p.startsWith("/notifications"),
    name: "putt-bot",
    pose: "action",
    title: "Alerts",
    tagline: "Everything that pinged you.",
  },
  {
    test: (p) => p.startsWith("/courses"),
    name: "hyzer",
    pose: "default",
    title: "Courses",
    tagline: "Build, review, and tour the chains.",
  },
  {
    test: (p) => p.startsWith("/rounds") || p.startsWith("/play"),
    name: "ace",
    pose: "action",
    title: "Rounds",
    tagline: "Score sharp. Get rated.",
  },
  {
    test: (p) => p.startsWith("/ace"),
    name: "ace",
    pose: "default",
    title: "Ace",
    tagline: "Disc picks, lines, and rules from Ace.",
  },
  {
    test: (p) => p.startsWith("/stats"),
    name: "putt-bot",
    pose: "default",
    title: "Stats",
    tagline: "Your rating, forecast, and targets.",
  },
  {
    test: (p) => p.startsWith("/tournaments") || p.startsWith("/director"),
    name: "hyzer",
    pose: "action",
    title: "Events",
    tagline: "PDGA-style tournaments and leagues.",
  },
  {
    test: (p) => p.startsWith("/leagues"),
    name: "hyzer",
    pose: "default",
    title: "Leagues",
    tagline: "Weekly play, cumulative points.",
  },
  {
    test: (p) => p.startsWith("/community"),
    name: "scout",
    pose: "action",
    title: "Community",
    tagline: "Group rounds, cleanups, and outreach.",
  },
  {
    test: (p) => p.startsWith("/challenges"),
    name: "scramble-fox",
    pose: "action",
    title: "Achievements & Quests",
    tagline: "XP, badges, quests, rankings, and your Trophy Shelf.",
  },
  {
    test: (p) => p.startsWith("/achievements"),
    name: "scramble-fox",
    pose: "default",
    title: "Achievements",
    tagline: "Trophies from every corner of your game.",
  },
  {
    test: (p) => p.startsWith("/leaderboards"),
    name: "putt-bot",
    pose: "action",
    title: "Leaderboards",
    tagline: "Where you stand.",
  },
  {
    test: (p) =>
      p.startsWith("/game-plan") ||
      p.startsWith("/action-items") ||
      p.startsWith("/season-planner"),
    name: "safe-mode-sam",
    pose: "default",
    title: "Game Plan",
    tagline: "Odds, targets, and prep for every event.",
  },
  {
    test: (p) => p.startsWith("/data-hub"),
    name: "safe-mode-sam",
    pose: "action",
    title: "Data Hub",
    tagline: "Bring the real world into DG Dashboard.",
  },

  {
    test: (p) => p.startsWith("/clubs"),
    name: "scout",
    pose: "default",
    title: "Clubs",
    tagline: "Your local disc golf home.",
  },
  {
    test: (p) => p.startsWith("/admin"),
    name: "safe-mode-sam",
    pose: "action",
    title: "Moderation",
    tagline: "Keep the courses honest.",
  },
  {
    test: (p) => p.startsWith("/me/bag"),
    name: "ace",
    pose: "default",
    title: "My Bag",
    tagline: "Every mold, every plastic.",
  },
  {
    test: (p) => p.startsWith("/me"),
    name: "ace",
    pose: "default",
    title: "My Profile",
    tagline: "You, the player card.",
  },
];

const FALLBACK = {
  name: "scout" as MascotName,
  pose: "default" as MascotPose,
  title: "DG Dashboard",
  tagline: "Welcome to the chains.",
};

export function PageMascot() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hit = ROUTE_MASCOTS.find((r) => r.test(pathname)) ?? FALLBACK;
  return (
    <div className="mb-3 flex items-center gap-2 overflow-hidden rounded-lg border border-black/30 bg-gradient-to-r from-primary/10 via-secondary/5 to-accent/10 px-2 py-1.5 shadow-[0_2px_0_0_rgba(0,0,0,0.35)]">
      <div className="relative grid h-10 w-10 shrink-0 place-items-center">
        <Mascot
          name={hit.name}
          pose={hit.pose}
          size={40}
          className="max-h-full max-w-full drop-shadow-[0_2px_0_rgba(0,0,0,0.35)]"
        />
      </div>
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <div className="font-graphic text-sm leading-none tracking-wide text-primary sm:text-base">
          {hit.title}
        </div>
        <div className="truncate text-xs text-muted-foreground">{hit.tagline}</div>
      </div>
    </div>
  );
}
