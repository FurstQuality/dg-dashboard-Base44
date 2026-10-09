/**
 * Club Manager dashboard — /clubs/manage landing overview widgets.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession, timeAgo } from "@/lib/current-user";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Users,
  Megaphone,
  Calendar,
  Trophy,
  ClipboardList,
  UserPlus,
  Link2,
} from "lucide-react";
import { ClubScrapePanel } from "@/components/clubs/club-scrape-panel";
import type { DashboardDefinition, WidgetRegistry } from "@/components/dashboard/types";

function useManagedClubs() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["club-mgr-clubs", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("club_members")
        .select("club_id, role, clubs!inner(id, name, slug)")
        .eq("user_id", user!.id)
        .in("role", ["owner", "admin"]);
      return (data ?? []) as Array<{
        club_id: string;
        role: string;
        clubs: { id: string; name: string; slug: string };
      }>;
    },
  });
}

function ClubsBody() {
  const { data, isLoading } = useManagedClubs();
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!data || data.length === 0)
    return <p className="text-sm text-muted-foreground">You don't manage any clubs yet.</p>;
  return (
    <ul className="space-y-1.5">
      {data.map((c) => (
        <li key={c.club_id}>
          <Link
            to="/clubs/$slug"
            params={{ slug: c.clubs.slug }}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm hover:border-primary/60"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{c.clubs.name}</div>
              <div className="text-xs capitalize text-muted-foreground">{c.role}</div>
            </div>
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ClubPostsBody() {
  const { data: clubs } = useManagedClubs();
  const ids = (clubs ?? []).map((c) => c.club_id);
  const { data, isLoading } = useQuery({
    queryKey: ["club-mgr-posts", ids],
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("posts")
        .select("id, body, created_at, club_id")
        .in("club_id", ids)
        .order("created_at", { ascending: false })
        .limit(4);
      return data ?? [];
    },
  });
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!data || data.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Nothing recent — share an update to keep your members in the loop.
      </p>
    );
  return (
    <ul className="space-y-1.5">
      {data.map((p) => (
        <li key={p.id} className="rounded-lg border border-border/60 px-3 py-2 text-sm">
          <div className="line-clamp-2">{p.body}</div>
          <div className="text-xs text-muted-foreground">{timeAgo(p.created_at)}</div>
        </li>
      ))}
    </ul>
  );
}

function MembersBody() {
  const { data: clubs } = useManagedClubs();
  const ids = (clubs ?? []).map((c) => c.club_id);
  const { data, isLoading } = useQuery({
    queryKey: ["club-mgr-members-count", ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("club_members")
        .select("club_id", { count: "exact", head: true })
        .in("club_id", ids);
      return count ?? 0;
    },
  });
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  return (
    <div>
      <div className="text-xs text-muted-foreground">Members across your clubs</div>
      <div className="font-display text-3xl font-semibold">{data ?? 0}</div>
    </div>
  );
}

function EventsBody() {
  const { data: clubs } = useManagedClubs();
  const ids = (clubs ?? []).map((c) => c.club_id);
  const { data, isLoading } = useQuery({
    queryKey: ["club-mgr-events", ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      // Community events are linked to people, not clubs, so upcoming club
      // events are the ones hosted by anyone in the clubs you manage.
      const { data: members } = await supabase
        .from("club_members")
        .select("user_id")
        .in("club_id", ids);
      const hostIds = Array.from(new Set((members ?? []).map((m) => m.user_id)));
      if (hostIds.length === 0) return [];
      const { data } = await supabase
        .from("community_events")
        .select("id, title, starts_at")
        .in("host_id", hostIds)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(4);
      return data ?? [];
    },
  });
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!data || data.length === 0)
    return (
      <div className="space-y-2 text-sm text-muted-foreground">
        No upcoming club events.{" "}
        <Button asChild size="sm" variant="outline" className="mt-1">
          <Link to="/director/new" search={{ group: "community" }}>Host one</Link>
        </Button>
      </div>
    );
  return (
    <ul className="space-y-1.5">
      {data.map((e) => (
        <li key={e.id}>
          <Link
            to="/community/$eventId"
            params={{ eventId: e.id }}
            className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm hover:border-primary/60"
          >
            <Calendar className="h-3.5 w-3.5 text-emerald-400" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{e.title}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(e.starts_at).toLocaleDateString()}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function LeaguesBody() {
  const { user } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["club-mgr-leagues", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("leagues")
        .select("id, name, slug, status")
        .eq("owner_id", user!.id)
        .in("status", ["draft", "active"])
        .limit(5);
      return data ?? [];
    },
  });
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!data || data.length === 0)
    return (
      <div className="space-y-2 text-sm text-muted-foreground">
        No active leagues.{" "}
        <Button asChild size="sm" variant="outline" className="mt-1">
          <Link to="/director/leagues/new">Start one</Link>
        </Button>
      </div>
    );
  return (
    <ul className="space-y-1.5">
      {data.map((l) => (
        <li key={l.id}>
          <Link
            to="/leagues/$slug"
            params={{ slug: l.slug }}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm hover:border-primary/60"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{l.name}</div>
              <div className="text-xs capitalize text-muted-foreground">{l.status}</div>
            </div>
            <Trophy className="h-3.5 w-3.5 text-amber-400" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function JoinRequestsBody() {
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      Review pending members and grant access to your clubs.
      <Button asChild size="sm" variant="outline" className="w-full mt-2">
        <Link to="/clubs">Open clubs</Link>
      </Button>
    </div>
  );
}

function CourseProjectsBody() {
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      Course drafts and edit requests submitted by members.
      <Button asChild size="sm" variant="outline" className="w-full mt-2">
        <Link to="/courses">Open courses</Link>
      </Button>
    </div>
  );
}

function AnnouncementsBody() {
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      Broadcast an update to every member of the clubs you manage.
      <Button asChild size="sm" className="w-full mt-2">
        <Link to="/clubs">Post announcement</Link>
      </Button>
    </div>
  );
}

export const clubRegistry: WidgetRegistry = {
  importClub: {
    id: "importClub",
    title: "Add a club from a link",
    icon: Link2,
    defaultSize: "md",
    render: () => <ClubScrapePanel />,
  },
  clubs: {
    id: "clubs",
    title: "Managed clubs",
    icon: Building2,
    defaultSize: "md",
    href: "/clubs",
    render: () => <ClubsBody />,
  },
  posts: {
    id: "posts",
    title: "Recent club posts",
    icon: Megaphone,
    defaultSize: "md",
    href: "/clubs",
    render: () => <ClubPostsBody />,
  },
  members: {
    id: "members",
    title: "Members",
    icon: Users,
    defaultSize: "sm",
    href: "/clubs",
    render: () => <MembersBody />,
  },
  events: {
    id: "events",
    title: "Upcoming club events",
    icon: Calendar,
    defaultSize: "md",
    href: "/community/events",
    render: () => <EventsBody />,
  },
  leagues: {
    id: "leagues",
    title: "Active leagues",
    icon: Trophy,
    defaultSize: "md",
    href: "/leagues",
    render: () => <LeaguesBody />,
  },
  courseProjects: {
    id: "courseProjects",
    title: "Course projects",
    icon: ClipboardList,
    defaultSize: "md",
    render: () => <CourseProjectsBody />,
  },
  announcements: {
    id: "announcements",
    title: "Announcements",
    icon: Megaphone,
    defaultSize: "md",
    render: () => <AnnouncementsBody />,
  },
  joinRequests: {
    id: "joinRequests",
    title: "Join requests",
    icon: UserPlus,
    defaultSize: "sm",
    render: () => <JoinRequestsBody />,
  },
};

export const clubDashboard: DashboardDefinition = {
  key: "club",
  layoutVersion: 1,
  defaultOrder: [
    "clubs",
    "importClub",
    "members",
    "posts",
    "events",
    "leagues",
    "announcements",
    "joinRequests",
    "courseProjects",
  ],
  requiresAccess: (a) => a.isClubManager || a.isSuperAdmin,
  accessDenied: {
    title: "You don't manage any clubs yet",
    description: "Create a club or ask an existing owner to promote you to admin.",
    actionLabel: "Browse clubs",
    actionHref: "/clubs",
  },
  presets: [
    {
      key: "club",
      label: "Club manager",
      description: "Members, posts, events, and leagues.",
      order: [
        "clubs",
        "importClub",
        "posts",
        "members",
        "events",
        "leagues",
        "announcements",
        "joinRequests",
        "courseProjects",
      ],
    },
  ],
};
