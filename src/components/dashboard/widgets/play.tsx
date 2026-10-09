/**
 * Play dashboard — /play landing.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Play,
  MapPin,
  Dumbbell,
  Users,
  Target,
  Trophy,
  Sparkles,
  Shield,
  Bell,
  Calendar,
} from "lucide-react";
import { useSession, timeAgo } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { activeRoundQueryOptions } from "@/lib/entities/rounds";
import type { DashboardDefinition, WidgetRegistry } from "@/components/dashboard/types";
import {
  FriendsPlayingBody,
  UpcomingEventsBody,
  NearbyCoursesBody,
  PracticeShortcutsBody,
  RecentRoundsBody,
  GoalsBody,
  RegisteredTournamentsBody,
  JoinedLeaguesBody,
} from "./shared";

function StartRoundBody() {
  const { user } = useSession();
  const { data: activeRound } = useQuery(activeRoundQueryOptions(user?.id));
  if (activeRound) {
    return (
      <Link to="/play/$roundId" params={{ roundId: activeRound.id }} className="block">
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">
            Round in progress
          </div>
          <div className="mt-1 text-base font-semibold">
            {activeRound.course_name ?? "Continue your card"}
          </div>
          <div className="text-xs text-muted-foreground">
            Started {timeAgo(activeRound.started_at)}
          </div>
        </div>
      </Link>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Pick a course, add players, and go.</p>
      <div className="grid grid-cols-2 gap-2">
        <Button asChild size="sm">
          <Link to="/play/pick-course">
            <Play className="mr-1 h-4 w-4" />
            Start a round
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/schedule">Plan for later</Link>
        </Button>
      </div>
    </div>
  );
}

function OrganizerToolsBody() {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Manage your hosted events and league schedules.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/events/new">Create event</Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/director/tournaments">TD Console</Link>
        </Button>
      </div>
    </div>
  );
}

export const playRegistry: WidgetRegistry = {
  startRound: {
    id: "startRound",
    title: "Start a round",
    icon: Play,
    defaultSize: "md",
    locked: true,
    render: () => <StartRoundBody />,
  },
  upNext: {
    id: "upNext",
    title: "Up next",
    subtitle: "Your schedule",
    icon: Calendar,
    defaultSize: "md",
    href: "/schedule",
    render: () => <UpcomingEventsBody />,
  },
  friendsPlaying: {
    id: "friendsPlaying",
    title: "Friends playing now",
    icon: Users,
    defaultSize: "md",
    href: "/community/friends",
    render: () => <FriendsPlayingBody />,
  },
  nearbyCourses: {
    id: "nearbyCourses",
    title: "Nearby courses",
    icon: MapPin,
    defaultSize: "md",
    href: "/courses",
    render: () => <NearbyCoursesBody />,
  },
  practice: {
    id: "practice",
    title: "Practice shortcuts",
    icon: Dumbbell,
    defaultSize: "md",
    href: "/practice",
    render: () => <PracticeShortcutsBody />,
  },
  recentRounds: {
    id: "recentRounds",
    title: "Recent rounds",
    icon: Target,
    defaultSize: "md",
    href: "/play",
    render: () => <RecentRoundsBody />,
  },
  practiceProgress: {
    id: "practiceProgress",
    title: "Practice progress",
    icon: Sparkles,
    defaultSize: "sm",
    href: "/range",
    render: () => (
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          Range distance, accuracy, and putting streaks.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to="/range">Open practice</Link>
        </Button>
      </div>
    ),
  },
  goals: {
    id: "goals",
    title: "Goals",
    icon: Target,
    defaultSize: "md",
    render: () => <GoalsBody />,
  },
  tournaments: {
    id: "tournaments",
    title: "Registered tournaments",
    icon: Trophy,
    defaultSize: "md",
    href: "/tournaments",
    render: () => <RegisteredTournamentsBody />,
  },
  leagues: {
    id: "leagues",
    title: "Joined leagues",
    icon: Users,
    defaultSize: "md",
    href: "/leagues",
    render: () => <JoinedLeaguesBody />,
  },
  organizer: {
    id: "organizer",
    title: "Organizer tools",
    icon: Shield,
    defaultSize: "md",
    href: "/director/tournaments",
    requiresAccess: (a) => a.isOrganizer,
    render: () => <OrganizerToolsBody />,
  },
};

export const playDashboard: DashboardDefinition = {
  key: "play",
  layoutVersion: 1,
  defaultOrder: [
    "startRound",
    "upNext",
    "friendsPlaying",
    "nearbyCourses",
    "recentRounds",
    "practice",
    "goals",
    "practiceProgress",
    "tournaments",
    "leagues",
    "organizer",
  ],
  presets: [
    {
      key: "player",
      label: "Player",
      description: "Rounds, courses, and friends first.",
      order: [
        "startRound",
        "upNext",
        "friendsPlaying",
        "nearbyCourses",
        "recentRounds",
        "practice",
        "goals",
      ],
      hidden: ["tournaments", "leagues", "practiceProgress", "organizer"],
    },
    {
      key: "competitive",
      label: "Competitive",
      description: "Tournaments, leagues, and structured practice.",
      order: [
        "startRound",
        "tournaments",
        "leagues",
        "upNext",
        "recentRounds",
        "practice",
        "practiceProgress",
        "goals",
      ],
      hidden: ["nearbyCourses", "friendsPlaying"],
    },
    {
      key: "td",
      label: "Tournament Director",
      description: "Organizer tools + registered/hosted events.",
      order: ["organizer", "tournaments", "leagues", "upNext", "startRound", "friendsPlaying"],
      hidden: ["nearbyCourses", "practice", "practiceProgress", "recentRounds", "goals"],
    },
  ],
};
