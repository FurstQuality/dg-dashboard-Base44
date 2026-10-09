/**
 * Community dashboard — /community landing.
 */
import {
  Users,
  UserPlus,
  MessageCircle,
  Bell,
  Building2,
  Calendar,
  Search,
  Signal,
  Megaphone,
} from "lucide-react";
import type { DashboardDefinition, WidgetRegistry } from "@/components/dashboard/types";
import {
  FriendsPlayingBody,
  FriendRequestsBody,
  MessagesBody,
  TrackerUpdatesBody,
  ClubsBody,
  CommunityEventsBody,
  SuggestedPlayersBody,
  LookingToPlayBody,
  ClubAnnouncementsBody,
} from "./shared";

export const communityRegistry: WidgetRegistry = {
  friendsPlaying: {
    id: "friendsPlaying",
    title: "Friends playing",
    icon: Users,
    defaultSize: "md",
    href: "/community/friends",
    render: () => <FriendsPlayingBody />,
  },
  friendRequests: {
    id: "friendRequests",
    title: "Friend requests",
    icon: UserPlus,
    defaultSize: "md",
    href: "/community/friends",
    render: () => <FriendRequestsBody />,
  },
  messages: {
    id: "messages",
    title: "Messages",
    icon: MessageCircle,
    defaultSize: "md",
    href: "/dgim",
    render: () => <MessagesBody />,
  },
  trackerUpdates: {
    id: "trackerUpdates",
    title: "Tracker updates",
    icon: Bell,
    defaultSize: "md",
    href: "/community/trackers",
    render: () => <TrackerUpdatesBody />,
  },
  clubs: {
    id: "clubs",
    title: "Your clubs",
    icon: Building2,
    defaultSize: "md",
    href: "/clubs",
    render: () => <ClubsBody />,
  },
  communityEvents: {
    id: "communityEvents",
    title: "Community events",
    icon: Calendar,
    defaultSize: "md",
    href: "/community/events",
    render: () => <CommunityEventsBody />,
  },
  suggested: {
    id: "suggested",
    title: "Suggested players",
    icon: Search,
    defaultSize: "md",
    href: "/community/friends",
    render: () => <SuggestedPlayersBody />,
  },
  lookingToPlay: {
    id: "lookingToPlay",
    title: "Looking to play",
    icon: Signal,
    defaultSize: "md",
    render: () => <LookingToPlayBody />,
  },
  announcements: {
    id: "announcements",
    title: "Club announcements",
    icon: Megaphone,
    defaultSize: "md",
    href: "/clubs",
    render: () => <ClubAnnouncementsBody />,
  },
};

export const communityDashboard: DashboardDefinition = {
  key: "community",
  layoutVersion: 1,
  defaultOrder: [
    "friendsPlaying",
    "friendRequests",
    "messages",
    "trackerUpdates",
    "communityEvents",
    "clubs",
    "suggested",
    "lookingToPlay",
    "announcements",
  ],
  presets: [
    {
      key: "player",
      label: "Player",
      description: "Friends, messages, and events.",
      order: [
        "friendsPlaying",
        "friendRequests",
        "messages",
        "communityEvents",
        "trackerUpdates",
        "suggested",
      ],
      hidden: ["clubs", "lookingToPlay", "announcements"],
    },
    {
      key: "community",
      label: "Community player",
      description: "Clubs, community events, and looking-to-play.",
      order: [
        "clubs",
        "announcements",
        "communityEvents",
        "friendsPlaying",
        "lookingToPlay",
        "suggested",
        "messages",
      ],
      hidden: ["trackerUpdates", "friendRequests"],
    },
  ],
};
