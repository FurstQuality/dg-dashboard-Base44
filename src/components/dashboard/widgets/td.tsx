/**
 * Tournament Director dashboard — /td landing overview widgets.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Trophy,
  ClipboardList,
  Users,
  Calendar,
  MessageCircle,
  Radio,
  DollarSign,
  FileText,
  CheckCircle2,
} from "lucide-react";
import type { DashboardDefinition, WidgetRegistry } from "@/components/dashboard/types";

const LIVE_STATUSES = new Set(["registration_open", "registration_closed", "in_progress"]);

function fmtDate(iso: string | null) {
  if (!iso) return "TBD";
  return new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

type Tourney = {
  id: string;
  name: string;
  slug: string;
  status: string;
  start_date: string;
  end_date: string;
  pdga_sanctioned: boolean;
};
type League = {
  id: string;
  name: string;
  slug: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
};

function useHostedTournaments() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["td-tournaments-full", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("tournaments")
        .select("id, name, slug, status, start_date, end_date, pdga_sanctioned")
        .eq("owner_id", user!.id)
        .order("start_date", { ascending: false });
      const list = (data ?? []) as Tourney[];
      const ids = list.map((t) => t.id);
      const regsById = new Map<string, number>();
      if (ids.length) {
        const { data: regs } = await supabase
          .from("tournament_registrations")
          .select("tournament_id")
          .in("tournament_id", ids);
        for (const r of regs ?? []) {
          const tid = (r as { tournament_id: string }).tournament_id;
          regsById.set(tid, (regsById.get(tid) ?? 0) + 1);
        }
      }
      return list.map((t) => ({ ...t, regs: regsById.get(t.id) ?? 0 }));
    },
  });
}

function useHostedLeagues() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["td-leagues-full", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("leagues")
        .select("id, name, slug, status, start_date, end_date")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false });
      const list = (data ?? []) as League[];
      const ids = list.map((l) => l.id);
      const memsById = new Map<string, number>();
      if (ids.length) {
        const { data: mems } = await supabase
          .from("league_registrations")
          .select("league_id")
          .in("league_id", ids);
        for (const r of mems ?? []) {
          const lid = (r as { league_id: string }).league_id;
          memsById.set(lid, (memsById.get(lid) ?? 0) + 1);
        }
      }
      return list.map((l) => ({ ...l, members: memsById.get(l.id) ?? 0 }));
    },
  });
}

function EventRow({ t }: { t: Tourney & { regs?: number } }) {
  return (
    <li>
      <Link
        to="/tournaments/$slug"
        params={{ slug: t.slug }}
        className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm hover:border-primary/60"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {t.pdga_sanctioned && (
              <Badge variant="secondary" className="text-[10px] uppercase">
                PDGA
              </Badge>
            )}
            <div className="truncate font-medium">{t.name}</div>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {fmtDate(t.start_date)} – {fmtDate(t.end_date)} · {t.regs ?? 0} registered
          </div>
        </div>
      </Link>
    </li>
  );
}

function HostedEventsBody() {
  const { data, isLoading } = useHostedTournaments();
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  const list = (data ?? []).slice(0, 5);
  if (list.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          You haven't hosted anything yet — spin up your first tournament.
        </p>
        <Button asChild size="sm">
          <Link to="/director/tournaments/new">Create an event</Link>
        </Button>
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {list.map((t) => (
        <EventRow key={t.id} t={t} />
      ))}
    </ul>
  );
}

function LiveNowBody() {
  const { data, isLoading } = useHostedTournaments();
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  const live = (data ?? []).filter((t) => LIVE_STATUSES.has(t.status));
  if (live.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No events live right now. Open a tournament to start scoring or share the leaderboard.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {live.map((t) => (
        <li key={t.id} className="rounded-lg border border-primary/40 bg-primary/5 p-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-[10px] uppercase tracking-wide text-primary">Live</span>
            {t.pdga_sanctioned && (
              <Badge variant="secondary" className="text-[10px] uppercase">
                PDGA
              </Badge>
            )}
          </div>
          <div className="mt-1 truncate font-medium">{t.name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {fmtDate(t.start_date)} – {fmtDate(t.end_date)} · {t.regs ?? 0} registered
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/tournaments/$slug" params={{ slug: t.slug }}>
                Open
              </Link>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function UpcomingBody() {
  const { data, isLoading } = useHostedTournaments();
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  const now = new Date();
  const upcoming = (data ?? [])
    .filter((t) => t.status === "published" && new Date(t.start_date) >= now)
    .slice(0, 6);
  if (upcoming.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing on deck — publish a draft to open registration and players will show up here.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {upcoming.map((t) => (
        <EventRow key={t.id} t={t} />
      ))}
    </ul>
  );
}

function DraftsBody() {
  const { data, isLoading } = useHostedTournaments();
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  const drafts = (data ?? []).filter((t) => t.status === "draft").slice(0, 6);
  if (drafts.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          No drafts saved — sketch a schedule and we'll hold it until you're ready to publish.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to="/director/tournaments/new">Start a draft</Link>
        </Button>
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {drafts.map((t) => (
        <EventRow key={t.id} t={t} />
      ))}
    </ul>
  );
}

function CompletedBody() {
  const { data, isLoading } = useHostedTournaments();
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  const past = (data ?? []).filter((t) => t.status === "completed").slice(0, 5);
  if (past.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No wrapped events yet — final leaderboards will land here once your first event closes out.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {past.map((t) => (
        <EventRow key={t.id} t={t} />
      ))}
    </ul>
  );
}

function LeaguesBody() {
  const { data, isLoading } = useHostedLeagues();
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  const list = (data ?? []).slice(0, 6);
  if (list.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          No leagues running yet — spin one up to keep the crew showing up weekly.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to="/director/leagues/new">Create a weekly league</Link>
        </Button>
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {list.map((l) => (
        <li key={l.id}>
          <Link
            to="/leagues/$slug"
            params={{ slug: l.slug }}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm hover:border-primary/60"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{l.name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {fmtDate(l.start_date)} – {fmtDate(l.end_date)} · {l.members ?? 0} members
              </div>
            </div>
            <Badge variant="outline" className="uppercase text-[10px]">
              {l.status}
            </Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RegistrationsBody() {
  const { user } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["td-registrations", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: tourneys } = await supabase
        .from("tournaments")
        .select("id, name")
        .eq("owner_id", user!.id);
      const ids = (tourneys ?? []).map((t) => t.id);
      if (ids.length === 0) return { total: 0, today: 0 };
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: total } = await supabase
        .from("tournament_registrations")
        .select("id", { count: "exact", head: true })
        .in("tournament_id", ids);
      const { count: today_c } = await supabase
        .from("tournament_registrations")
        .select("id", { count: "exact", head: true })
        .in("tournament_id", ids)
        .gte("created_at", today.toISOString());
      return { total: total ?? 0, today: today_c ?? 0 };
    },
  });
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-lg border border-border/60 p-3">
        <div className="text-xs text-muted-foreground">Total registrations</div>
        <div className="font-display text-2xl font-semibold">{data?.total ?? 0}</div>
      </div>
      <div className="rounded-lg border border-border/60 p-3">
        <div className="text-xs text-muted-foreground">New today</div>
        <div className="font-display text-2xl font-semibold">{data?.today ?? 0}</div>
      </div>
    </div>
  );
}

function TaskChecklistBody() {
  const { user } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["td-checklist", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: tourneys } = await supabase
        .from("tournaments")
        .select("id")
        .eq("owner_id", user!.id)
        .limit(20);
      const ids = (tourneys ?? []).map((t) => t.id);
      if (ids.length === 0) return [];
      const { data } = await supabase
        .from("tournament_checklist_items")
        .select("id, label, done, tournament_id")
        .in("tournament_id", ids)
        .eq("done", false)
        .limit(5);
      return data ?? [];
    },
  });
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        Nothing outstanding. All checklist items are complete.
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {data.map((t) => (
        <li key={t.id} className="rounded-lg border border-border/60 px-3 py-2 text-sm">
          {t.label}
        </li>
      ))}
    </ul>
  );
}

function PaymentsBody() {
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      Configure Stripe or Paddle to accept online entry fees and manage payouts.
      <Button asChild size="sm" variant="outline" className="w-full mt-2">
        <Link to="/director/tournaments">Open payments</Link>
      </Button>
    </div>
  );
}

function StaffBody() {
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      Add co-TDs, scorekeepers, and volunteers so everyone can help run event day.
      <Button asChild size="sm" variant="outline" className="w-full mt-2">
        <Link to="/director/tournaments">Manage staff</Link>
      </Button>
    </div>
  );
}

function LiveRoundsBody() {
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      Watch live scoring as your event runs.
      <Button asChild size="sm" variant="outline" className="w-full mt-2">
        <Link to="/director/tournaments">Open live scoring</Link>
      </Button>
    </div>
  );
}

function InboxBody() {
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      Messages from your registered players in one place.
      <Button asChild size="sm" variant="outline" className="w-full mt-2">
        <Link to="/dgim" search={{ conv: undefined }}>
          Open inbox
        </Link>
      </Button>
    </div>
  );
}

export const tdRegistry: WidgetRegistry = {
  liveNow: {
    id: "liveNow",
    title: "Live now",
    icon: Radio,
    defaultSize: "lg",
    supportedSizes: ["md", "lg", "full"],
    href: "/leaderboards",
    render: () => <LiveNowBody />,
  },
  hostedEvents: {
    id: "hostedEvents",
    title: "Hosted events",
    icon: Trophy,
    defaultSize: "md",
    href: "/director/tournaments",
    render: () => <HostedEventsBody />,
  },
  upcoming: {
    id: "upcoming",
    title: "Upcoming",
    icon: Calendar,
    defaultSize: "md",
    render: () => <UpcomingBody />,
  },
  drafts: {
    id: "drafts",
    title: "Drafts",
    icon: FileText,
    defaultSize: "md",
    render: () => <DraftsBody />,
  },
  registrations: {
    id: "registrations",
    title: "Registrations",
    icon: Users,
    defaultSize: "md",
    href: "/director/tournaments",
    render: () => <RegistrationsBody />,
  },
  checklist: {
    id: "checklist",
    title: "Task checklist",
    icon: ClipboardList,
    defaultSize: "md",
    href: "/director/tournaments",
    render: () => <TaskChecklistBody />,
  },
  leagues: {
    id: "leagues",
    title: "Your leagues",
    icon: Users,
    defaultSize: "md",
    href: "/leagues",
    render: () => <LeaguesBody />,
  },
  completed: {
    id: "completed",
    title: "Completed",
    icon: Trophy,
    defaultSize: "md",
    render: () => <CompletedBody />,
  },
  staff: {
    id: "staff",
    title: "Staff roster",
    icon: Users,
    defaultSize: "sm",
    render: () => <StaffBody />,
  },
  payments: {
    id: "payments",
    title: "Payments snapshot",
    icon: DollarSign,
    defaultSize: "sm",
    render: () => <PaymentsBody />,
  },
  inbox: {
    id: "inbox",
    title: "Messages inbox",
    icon: MessageCircle,
    defaultSize: "sm",
    href: "/dgim",
    render: () => <InboxBody />,
  },
  liveRounds: {
    id: "liveRounds",
    title: "Live rounds",
    icon: Radio,
    defaultSize: "sm",
    render: () => <LiveRoundsBody />,
  },
};

export const tdDashboard: DashboardDefinition = {
  key: "td",
  layoutVersion: 2,
  defaultOrder: [
    "liveNow",
    "hostedEvents",
    "upcoming",
    "drafts",
    "registrations",
    "checklist",
    "leagues",
    "completed",
    "inbox",
    "staff",
    "payments",
    "liveRounds",
  ],
  requiresAccess: (a) => a.isOrganizer || a.isSuperAdmin,
  accessDenied: {
    title: "You need organizer access",
    description: "Create your first tournament to unlock the TD console.",
    actionLabel: "Create event",
    actionHref: "/events/new",
  },
  presets: [
    {
      key: "td",
      label: "Tournament Director",
      description: "Live events, registrations, tasks, drafts.",
      order: [
        "liveNow",
        "hostedEvents",
        "upcoming",
        "registrations",
        "checklist",
        "drafts",
        "leagues",
        "completed",
        "inbox",
        "staff",
        "payments",
      ],
    },
    {
      key: "league-manager",
      label: "League Manager",
      description: "Weekly leagues, registrations, and messaging.",
      order: [
        "leagues",
        "registrations",
        "upcoming",
        "checklist",
        "hostedEvents",
        "inbox",
        "liveNow",
        "drafts",
        "completed",
        "staff",
        "payments",
        "liveRounds",
      ],
    },
  ],
};
