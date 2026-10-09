/**
 * Shared widget bodies used across multiple dashboards.
 *
 * Each widget-body component is a lean summary that:
 *   - Uses existing entity queryOptions (shared cache).
 *   - Renders a compact empty state with a next action.
 *   - Never duplicates the destination page contents.
 */
import { formatToPar } from "@/lib/score-display";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useSession, timeAgo } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { FriendsPlayingNow } from "@/components/shared/friends-playing-now";
import { UpcomingScheduleWidget } from "@/components/home/upcoming-schedule-widget";
import { SuggestedCrewWidget } from "@/components/home/suggested-crew-widget";
import { DailyGoalsWidget } from "@/components/daily-goals-widget";
import { WeatherWidget } from "@/components/weather-widget";
import { DiscGolfNewsWidget } from "@/components/disc-golf-news";
import { ArrowRight, Users, MessageCircle, MapPin, Bell, Trophy, Calendar } from "lucide-react";
import { RoundSourcePill } from "@/components/round-source-pill";
import { RoundRatingPair } from "@/components/round-rating-pair";

function EmptyRow({
  label,
  actionLabel,
  actionHref,
}: {
  label: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border/70 px-3 py-2.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {actionHref && (
        <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
          <Link to={actionHref}>
            {actionLabel ?? "Open"} <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      )}
    </div>
  );
}

/* Friends playing */
export function FriendsPlayingBody() {
  const { user } = useSession();
  return <FriendsPlayingNow userId={user?.id ?? null} limit={4} variant="compact" />;
}

/* Upcoming schedule */
export function UpcomingEventsBody() {
  const { user } = useSession();
  return <UpcomingScheduleWidget userId={user?.id} />;
}

/* Suggested players */
export function SuggestedPlayersBody() {
  const { user } = useSession();
  return <SuggestedCrewWidget userId={user?.id} />;
}

/* Goals */
export function GoalsBody() {
  return <DailyGoalsWidget />;
}

/* Weather */
export function WeatherBody() {
  return <WeatherWidget />;
}

/* Around the sport */
export function AroundTheSportBody() {
  return <DiscGolfNewsWidget />;
}

/* Recent rounds — shared between Play / StatLink / Profile */
export function RecentRoundsBody() {
  const { user } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["dash-recent-rounds", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("external_rounds")
        .select(
          "id, source, played_on, course_name, score, to_par, round_rating, mock_pdga_rating, mock_pdga_source",
        )
        .eq("user_id", user!.id)
        .order("played_on", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!data || data.length === 0) {
    return (
      <EmptyRow
        label="Your scorecard's blank — tee it up to start filling in your rounds."
        actionLabel="Start a round"
        actionHref="/play/pick-course"
      />
    );
  }
  return (
    <ul className="space-y-1.5">
      {data.map((r) => (
        <li
          key={r.id}
          className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <RoundSourcePill source={r.source} compact />
              <div className="truncate font-medium">{r.course_name ?? "Round"}</div>
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date(r.played_on + "T12:00:00Z").toLocaleDateString()}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold tabular-nums">
              {r.score == null ? "—" : r.to_par == null ? `${r.score}` : `${r.score} (${formatToPar(r.to_par)})`}
            </div>
            <div className="text-[12px] text-muted-foreground tabular-nums">
              {r.score != null && r.to_par != null ? `Par ${r.score - r.to_par}` : "Par unknown"}
            </div>
            <RoundRatingPair
              compact
              source={r.source}
              publishedRating={r.round_rating}
              roundId={r.id}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* Nearby courses — very light: last-played courses */
export function NearbyCoursesBody() {
  const { user } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["dash-recent-courses", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("courses")
        .select("id, name, slug, city, state")
        .eq("moderation_status", "approved")
        .order("created_at", { ascending: false })
        .limit(4);
      return data ?? [];
    },
  });
  if (isLoading) return <Skeleton className="h-20 w-full" />;
  if (!data || data.length === 0) {
    return (
      <EmptyRow
        label="No approved courses in your area yet — browse the map or add one you've played."
        actionLabel="Browse courses"
        actionHref="/courses"
      />
    );
  }
  return (
    <ul className="space-y-1.5">
      {data.map((c) => (
        <li key={c.id}>
          <Link
            to="/courses/$courseId"
            params={{ courseId: c.id }}
            className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm hover:border-primary/60"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{c.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {[c.city, c.state].filter(Boolean).join(", ") || "—"}
              </div>
            </div>
            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* Practice shortcuts */
export function PracticeShortcutsBody() {
  const links = [
    { to: "/range" as const, label: "Digital driving range", desc: "Track distance & shape" },
    { to: "/putting" as const, label: "Putting green", desc: "Log putt sessions" },
    { to: "/practice" as const, label: "Practice drills", desc: "Structured coaching" },
  ];
  return (
    <ul className="space-y-1.5">
      {links.map((l) => (
        <li key={l.to}>
          <Link
            to={l.to}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm hover:border-primary/60"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{l.label}</div>
              <div className="truncate text-xs text-muted-foreground">{l.desc}</div>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* Registered tournaments */
export function RegisteredTournamentsBody() {
  const { user } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["dash-registered-tournaments", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("tournament_registrations")
        .select("tournament_id, tournaments!inner(id, name, slug, start_date, status)")
        .eq("user_id", user!.id)
        .in("status", ["confirmed", "waitlist", "checked_in"])
        .limit(5);
      return (data ?? []) as Array<{
        tournament_id: string;
        tournaments: { id: string; name: string; slug: string; start_date: string; status: string };
      }>;
    },
  });
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!data || data.length === 0) {
    return (
      <EmptyRow
        label="You're not registered for a tournament yet — browse events open in your area."
        actionLabel="Browse tournaments"
        actionHref="/tournaments"
      />
    );
  }
  return (
    <ul className="space-y-1.5">
      {data.map((r) => (
        <li key={r.tournament_id}>
          <Link
            to="/tournaments/$slug"
            params={{ slug: r.tournaments.slug }}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm hover:border-primary/60"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{r.tournaments.name}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(r.tournaments.start_date + "T12:00:00Z").toLocaleDateString()}
              </div>
            </div>
            <Trophy className="h-3.5 w-3.5 text-amber-400" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* Joined leagues */
export function JoinedLeaguesBody() {
  const { user } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["dash-joined-leagues", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("league_registrations")
        .select("league_id, leagues!inner(id, name, slug, status)")
        .eq("user_id", user!.id)
        .limit(5);
      return (data ?? []) as Array<{
        league_id: string;
        leagues: { id: string; name: string; slug: string; status: string };
      }>;
    },
  });
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!data || data.length === 0) {
    return (
      <EmptyRow
        label="You're not in a league yet — weekly reps are the fastest way to sharpen your rating."
        actionLabel="Find a league"
        actionHref="/leagues"
      />
    );
  }
  return (
    <ul className="space-y-1.5">
      {data.map((r) => (
        <li key={r.league_id}>
          <Link
            to="/leagues/$slug"
            params={{ slug: r.leagues.slug }}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm hover:border-primary/60"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{r.leagues.name}</div>
              <div className="text-xs text-muted-foreground capitalize">
                {r.leagues.status.replace("_", " ")}
              </div>
            </div>
            <Users className="h-3.5 w-3.5 text-purple-400" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* Friend requests */
export function FriendRequestsBody() {
  const { user } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["dash-friend-requests", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("friendships")
        .select("id, requester_id, status")
        .eq("addressee_id", user!.id)
        .eq("status", "pending")
        .limit(5);
      if (!data || data.length === 0) return [];
      const ids = data.map((r) => r.requester_id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return data.map((r) => ({ id: r.id, profile: map.get(r.requester_id) }));
    },
  });
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!data || data.length === 0) {
    return (
      <EmptyRow
        label="No pending friend requests — search for players you've played with to expand your circle."
        actionLabel="Find friends"
        actionHref="/community/friends"
      />
    );
  }
  return (
    <ul className="space-y-1.5">
      {data.map((r) => (
        <li
          key={r.id}
          className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2"
        >
          <Avatar className="h-7 w-7">
            <AvatarImage src={r.profile?.avatar_url ?? undefined} />
            <AvatarFallback>{(r.profile?.display_name ?? "?").charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 text-sm">
            <div className="truncate font-medium">
              {r.profile?.display_name ?? r.profile?.username ?? "New player"}
            </div>
          </div>
          <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
            <Link to="/friends">Review</Link>
          </Button>
        </li>
      ))}
    </ul>
  );
}

/* Messages */
export function MessagesBody() {
  const { user } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["dash-messages", user?.id],
    enabled: !!user?.id,
    staleTime: 15_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("conversation_members")
        .select("conversation_id, conversations!inner(id, title, last_message_at)")
        .eq("user_id", user!.id)
        .order("conversations(last_message_at)", { ascending: false })
        .limit(4);
      return (data ?? []) as Array<{
        conversation_id: string;
        conversations: { id: string; title: string | null; last_message_at: string | null };
      }>;
    },
  });
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!data || data.length === 0) {
    return (
      <EmptyRow
        label="Inbox is empty — start a thread with a teammate or crew member."
        actionLabel="Start a message"
        actionHref="/dgim"
      />
    );
  }
  return (
    <ul className="space-y-1.5">
      {data.map((c) => (
        <li key={c.conversation_id}>
          <Link
            to="/dgim"
            search={{ conv: undefined }}
            className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm hover:border-primary/60"
          >
            <MessageCircle className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {c.conversations.title ?? "Direct message"}
              </div>
              <div className="text-xs text-muted-foreground">
                {c.conversations.last_message_at ? timeAgo(c.conversations.last_message_at) : "New"}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* Tracker updates — pulled from notifications for stability across schemas */
export function TrackerUpdatesBody() {
  const { user } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["dash-tracker-updates", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, type, data, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(4);
      return data ?? [];
    },
  });
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!data || data.length === 0) {
    return (
      <EmptyRow
        label="No trackers running right now — pin a friend or a crew to watch their next event."
        actionLabel="Open tracker"
        actionHref="/community/trackers"
      />
    );
  }
  return (
    <ul className="space-y-1.5">
      {data.map((n) => {
        const payload = (n.data ?? {}) as { title?: string; message?: string };
        return (
          <li
            key={n.id}
            className="flex items-start gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
          >
            <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="truncate">{payload.title ?? payload.message ?? n.type}</div>
              <div className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* Clubs */
export function ClubsBody() {
  const { user } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["dash-clubs", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("club_members")
        .select("club_id, role, clubs!inner(id, slug, name, avatar_url)")
        .eq("user_id", user!.id)
        .limit(4);
      return (data ?? []) as Array<{
        club_id: string;
        role: string;
        clubs: { id: string; slug: string; name: string; avatar_url: string | null };
      }>;
    },
  });
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!data || data.length === 0) {
    return (
      <EmptyRow
        label="You're not in any clubs yet."
        actionLabel="Browse clubs"
        actionHref="/clubs"
      />
    );
  }
  return (
    <ul className="space-y-1.5">
      {data.map((c) => (
        <li key={c.club_id}>
          <Link
            to="/clubs/$slug"
            params={{ slug: c.clubs.slug }}
            className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm hover:border-primary/60"
          >
            <Avatar className="h-7 w-7">
              <AvatarImage src={c.clubs.avatar_url ?? undefined} />
              <AvatarFallback>{c.clubs.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{c.clubs.name}</div>
              <div className="text-xs capitalize text-muted-foreground">{c.role}</div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* Community events */
export function CommunityEventsBody() {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-community-events"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("community_events")
        .select("id, title, kind, starts_at, location")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(4);
      return data ?? [];
    },
  });
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!data || data.length === 0) {
    return (
      <EmptyRow
        label="No community rounds on the calendar — host one and the crew will fill in."
        actionLabel="Host a round"
        actionHref="/director/new?group=community"
      />
    );
  }
  return (
    <ul className="space-y-1.5">
      {data.map((e) => (
        <li key={e.id}>
          <Link
            to="/community/$eventId"
            params={{ eventId: e.id }}
            className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm hover:border-primary/60"
          >
            <Calendar className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{e.title}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(e.starts_at).toLocaleDateString()} · {e.location ?? "TBD"}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function LookingToPlayBody() {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Post that you're looking to play and let your crew jump in.
      </p>
      <Button asChild size="sm" className="w-full">
        <Link to="/friends">Find someone to play</Link>
      </Button>
    </div>
  );
}

export function ClubAnnouncementsBody() {
  const { user } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["dash-club-announcements", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from("club_members")
        .select("club_id")
        .eq("user_id", user!.id);
      const ids = (memberships ?? []).map((m) => m.club_id);
      if (ids.length === 0) return [];
      const { data } = await supabase
        .from("posts")
        .select("id, body, created_at, club_id")
        .in("club_id", ids)
        .order("created_at", { ascending: false })
        .limit(3);
      return data ?? [];
    },
  });
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!data || data.length === 0) {
    return (
      <EmptyRow
        label="Quiet week for your clubs — nothing new to announce."
        actionLabel="Open clubs"
        actionHref="/clubs"
      />
    );
  }
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
