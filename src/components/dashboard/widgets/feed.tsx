/**
 * Feed dashboard — the /home landing.
 *
 * Composer and Personal Feed are locked (cannot be hidden) so the central
 * social feed always remains the primary content area.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useMyProfile } from "@/lib/current-user";
import { PostComposer } from "@/components/post-composer";
import { PostCard, type FeedPost } from "@/components/post-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Users,
  Calendar,
  Cloud,
  Newspaper,
  Sparkles,
  Building2,
  MapPin,
  Bell,
  Target,
  Filter,
} from "lucide-react";
import { FeedFilterBar, type FeedFilter } from "@/components/home/feed-filter-bar";
import { EmptyFeedCta } from "@/components/home/empty-feed-cta";
import { DiscoveryFeed } from "@/components/home/discovery-feed";
import type { DashboardDefinition, WidgetRegistry } from "@/components/dashboard/types";
import {
  FriendsPlayingBody,
  UpcomingEventsBody,
  GoalsBody,
  WeatherBody,
  AroundTheSportBody,
  SuggestedPlayersBody,
  ClubsBody,
  NearbyCoursesBody,
  CommunityEventsBody,
  TrackerUpdatesBody,
} from "./shared";

const PAGE_SIZE = 20;

function ComposerBody() {
  const { user } = useSession();
  const { profile } = useMyProfile(user);
  return (
    <PostComposer
      profile={profile}
      onCreated={() => window.dispatchEvent(new Event("dgd:feed-refresh"))}
    />
  );
}

function PersonalFeedBody() {
  const { user } = useSession();
  const [filter, setFilter] = useState<FeedFilter>("for-you");
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchPage = useCallback(
    async (before: string | null): Promise<FeedPost[]> => {
      let q = supabase
        .from("posts")
        .select(
          "id, author_id, type, body, media, location, like_count, comment_count, created_at, course_name, round_id, score_data",
        )
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (before) q = q.lt("created_at", before);
      if (filter === "tournaments") q = q.eq("type", "tournament");
      if (filter === "clubs") q = q.not("club_id", "is", null);
      const { data } = await q;
      if (!data || data.length === 0) return [];
      const ids = [...new Set(data.map((p) => p.author_id))];
      const { data: authors } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", ids);
      const map = new Map((authors ?? []).map((a) => [a.id, a]));
      return data.map((p) => ({
        ...(p as FeedPost),
        media: p.media as FeedPost["media"],
        author: map.get(p.author_id) as FeedPost["author"],
      }));
    },
    [filter],
  );

  const reload = useCallback(async () => {
    setDone(false);
    setPosts(null);
    const page = await fetchPage(null);
    setPosts(page);
    if (page.length < PAGE_SIZE) setDone(true);
  }, [fetchPage]);

  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => {
    const handler = () => reload();
    window.addEventListener("dgd:feed-refresh", handler);
    return () => window.removeEventListener("dgd:feed-refresh", handler);
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (loadingMore || done || !posts || posts.length === 0) return;
    setLoadingMore(true);
    const last = posts[posts.length - 1];
    const page = await fetchPage(last.created_at);
    setPosts((prev) => [...(prev ?? []), ...page]);
    if (page.length < PAGE_SIZE) setDone(true);
    setLoadingMore(false);
  }, [loadingMore, done, posts, fetchPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  return (
    <div className="space-y-3">
      <FeedFilterBar value={filter} onChange={setFilter} />
      {posts === null ? (
        <>
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </>
      ) : posts.length === 0 ? (
        <>
          <EmptyFeedCta />
          <DiscoveryFeed currentUserId={user?.id ?? null} />
        </>
      ) : (
        <>
          {posts.map((p) => (
            <PostCard key={p.id} post={p} currentUserId={user?.id ?? null} onChange={reload} />
          ))}
          <div ref={sentinelRef} />
          {!done ? (
            <div className="flex justify-center py-3">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Load more
              </Button>
            </div>
          ) : (
            <div className="py-4 text-center text-xs text-muted-foreground">
              You're all caught up.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FeedFiltersBody() {
  return (
    <div className="text-xs text-muted-foreground">
      Filters live inside the feed. Use the tabs at the top of "Your feed" to switch between For
      you, Friends, Tournaments, and Clubs.
    </div>
  );
}

export const feedRegistry: WidgetRegistry = {
  composer: {
    id: "composer",
    title: "Share an update",
    icon: Sparkles,
    defaultSize: "full",
    locked: true,
    supportedSizes: ["full"],
    render: () => <ComposerBody />,
  },
  personalFeed: {
    id: "personalFeed",
    title: "Your feed",
    icon: Newspaper,
    defaultSize: "lg",
    locked: true,
    supportedSizes: ["lg", "full"],
    render: () => <PersonalFeedBody />,
  },
  feedFilters: {
    id: "feedFilters",
    title: "Feed filters",
    icon: Filter,
    defaultSize: "md",
    supportedSizes: ["md", "lg"],
    render: () => <FeedFiltersBody />,
  },
  friendsPlaying: {
    id: "friendsPlaying",
    title: "Friends playing",
    icon: Users,
    defaultSize: "md",
    href: "/community/friends",
    render: () => <FriendsPlayingBody />,
  },
  upcomingEvents: {
    id: "upcomingEvents",
    title: "Upcoming events",
    icon: Calendar,
    defaultSize: "md",
    href: "/schedule",
    render: () => <UpcomingEventsBody />,
  },
  goals: {
    id: "goals",
    title: "Daily goals",
    icon: Target,
    defaultSize: "md",
    render: () => <GoalsBody />,
  },
  weather: {
    id: "weather",
    title: "Weather",
    icon: Cloud,
    defaultSize: "sm",
    supportedSizes: ["sm", "md"],
    render: () => <WeatherBody />,
  },
  aroundTheSport: {
    id: "aroundTheSport",
    title: "Around the sport",
    icon: Newspaper,
    defaultSize: "md",
    supportedSizes: ["md", "lg"],
    render: () => <AroundTheSportBody />,
  },
  suggestedPlayers: {
    id: "suggestedPlayers",
    title: "Suggested players",
    icon: Users,
    defaultSize: "md",
    href: "/community/friends",
    render: () => <SuggestedPlayersBody />,
  },
  localClubs: {
    id: "localClubs",
    title: "Local clubs",
    icon: Building2,
    defaultSize: "md",
    href: "/clubs",
    render: () => <ClubsBody />,
  },
  nearbyCourses: {
    id: "nearbyCourses",
    title: "Nearby courses",
    icon: MapPin,
    defaultSize: "md",
    href: "/courses",
    render: () => <NearbyCoursesBody />,
  },
  communityEvents: {
    id: "communityEvents",
    title: "Community events",
    icon: Calendar,
    defaultSize: "md",
    href: "/community/events",
    render: () => <CommunityEventsBody />,
  },
  trackerAlerts: {
    id: "trackerAlerts",
    title: "Tracker alerts",
    icon: Bell,
    defaultSize: "md",
    href: "/community/trackers",
    render: () => <TrackerUpdatesBody />,
  },
};

export const feedDashboard: DashboardDefinition = {
  key: "feed",
  layoutVersion: 1,
  defaultOrder: [
    "composer",
    "personalFeed",
    "friendsPlaying",
    "upcomingEvents",
    "goals",
    "weather",
    "nearbyCourses",
    "suggestedPlayers",
    "communityEvents",
    "trackerAlerts",
    "localClubs",
    "aroundTheSport",
  ],
  defaultHidden: ["feedFilters"],
  defaultSizes: {
    composer: "full",
    personalFeed: "lg",
    friendsPlaying: "md",
    upcomingEvents: "md",
    goals: "md",
    weather: "sm",
    aroundTheSport: "lg",
  },
  presets: [
    {
      key: "player",
      label: "Player",
      description: "Feed-forward with friends, events, and goals.",
      order: [
        "composer",
        "personalFeed",
        "friendsPlaying",
        "upcomingEvents",
        "goals",
        "weather",
        "nearbyCourses",
        "suggestedPlayers",
        "aroundTheSport",
      ],
      hidden: ["feedFilters", "communityEvents", "trackerAlerts", "localClubs"],
    },
    {
      key: "community",
      label: "Community player",
      description: "Prioritize friends, clubs, and community events.",
      order: [
        "composer",
        "personalFeed",
        "friendsPlaying",
        "communityEvents",
        "localClubs",
        "suggestedPlayers",
        "trackerAlerts",
        "upcomingEvents",
        "weather",
      ],
      hidden: ["feedFilters", "aroundTheSport", "nearbyCourses", "goals"],
    },
    {
      key: "competitive",
      label: "Competitive",
      description: "Track events, tracker alerts, and your training loop.",
      order: [
        "composer",
        "personalFeed",
        "trackerAlerts",
        "upcomingEvents",
        "goals",
        "friendsPlaying",
        "aroundTheSport",
      ],
      hidden: [
        "feedFilters",
        "communityEvents",
        "localClubs",
        "suggestedPlayers",
        "nearbyCourses",
        "weather",
      ],
    },
  ],
};
